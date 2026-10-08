// Edge cache for public pages: Cloudflare keeps each public page for a few minutes, so visitors and
// crawlers are served without rebuilding the page from the database.
// - Only GET/HEAD for public addresses (never /admin, /auth, /api, /files, /mcp), never for signed-in
//   people (a session cookie skips the cache), only 200 responses that set no cookies.
// - Every save in the admin (any POST/PUT/PATCH/DELETE under /admin) bumps a content version kept in KV;
//   the version is part of the cache key, so all cached pages are replaced at once, worldwide.
// - Browsers and crawlers get an ETag and Last-Modified; a repeat request with If-None-Match or
//   If-Modified-Since gets an empty 304 "not modified".
// - The numbers live in Admin › Settings › Cache (bizz_settings 'cache.settings'): on/off, minutes for
//   pages, minutes for sitemaps, feeds and robots.txt; "Clear the cache now" bumps the version.

type Ctx = { waitUntil(p: Promise<unknown>): void }
type Fetcher = (request: Request) => Promise<Response>

export interface CacheSettings { enabled: boolean; pageMinutes: number; feedMinutes: number }
const DEFAULTS: CacheSettings = { enabled: true, pageMinutes: 5, feedMinutes: 60 }
const VERSION_KEY = 'bizz:content-version'
const SKIP = /^\/(admin|auth|api|files|mcp|cdn-cgi)(\/|$)/
const SESSION_COOKIE = /(^|;\s*)(better-auth\.session_token|__Secure-better-auth\.session_token|auth_token|session)=/i
const FEEDLIKE = /^\/(sitemap[^/]*\.xml|robots\.txt|llms\.txt|feed\/?|rss(\.xml|\/)?|(blog|news)\/feed\/?)$/

let settingsCache: { at: number; value: CacheSettings } | null = null
export async function cacheSettings(db: D1Database): Promise<CacheSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.value
  let value = { ...DEFAULTS }
  try {
    await db.prepare('CREATE TABLE IF NOT EXISTS bizz_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run()
    const row = await db.prepare("SELECT value FROM bizz_settings WHERE key = 'cache.settings'").first<{ value: string }>()
    if (row) value = { ...DEFAULTS, ...JSON.parse(row.value) }
  } catch { /* defaults */ }
  settingsCache = { at: Date.now(), value }
  return value
}

let versionCache: { at: number; value: string } | null = null
async function contentVersion(kv?: KVNamespace): Promise<string> {
  if (versionCache && Date.now() - versionCache.at < 10_000) return versionCache.value
  let value = '0'
  if (kv) {
    value = (await kv.get(VERSION_KEY).catch(() => null)) ?? ''
    if (!value) { value = String(Date.now()); await kv.put(VERSION_KEY, value).catch(() => null) }
  }
  versionCache = { at: Date.now(), value }
  return value
}

/** Replace every cached page (called after admin saves, and by "Clear the cache now"). */
export async function bumpContentVersion(kv?: KVNamespace): Promise<void> {
  const value = String(Date.now())
  versionCache = { at: Date.now(), value }
  if (kv) await kv.put(VERSION_KEY, value).catch(() => null)
}

async function etagOf(body: ArrayBuffer): Promise<string> {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-1', body))
  return `W/"${[...hash.slice(0, 10)].map(b => b.toString(16).padStart(2, '0')).join('')}"`
}

function notModified(request: Request, etag: string | null, lastModified: string | null): boolean {
  const inm = request.headers.get('if-none-match')
  if (inm && etag) return inm.split(',').some(t => t.trim() === etag)
  const ims = request.headers.get('if-modified-since')
  if (ims && lastModified) { const a = Date.parse(ims), b = Date.parse(lastModified); return !Number.isNaN(a) && !Number.isNaN(b) && b <= a }
  return false
}

function toClient(request: Request, response: Response, hit: boolean): Response {
  const etag = response.headers.get('etag'), lastModified = response.headers.get('last-modified')
  const headers = new Headers(response.headers)
  // Browsers check back every time (cheap 304 thanks to the ETag); the edge keeps the page.
  headers.set('cache-control', 'public, no-cache')
  headers.set('x-bizz-cache', hit ? 'HIT' : 'MISS')
  if (notModified(request, etag, lastModified)) return new Response(null, { status: 304, headers })
  return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers })
}

/** Runs a site's handler behind the edge cache. Wrap it inside safeHandle(). */
export async function edgeCached(request: Request, db: D1Database, kv: KVNamespace | undefined, ctx: Ctx, handler: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url)
  // Saves in the admin: let them through, then replace every cached page.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const res = await handler()
    // Score batches (SEO › Check) change nothing public: no cache flush for them.
    if (url.pathname.startsWith('/admin') && url.pathname !== '/admin/bizz/seo/score-batch' && res.status < 400) ctx.waitUntil(bumpContentVersion(kv))
    return res
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname.endsWith('.localhost')
  if (SKIP.test(url.pathname) || SESSION_COOKIE.test(request.headers.get('cookie') ?? '') || url.searchParams.has('nocache')) return handler()
  const s = await cacheSettings(db)
  const minutes = FEEDLIKE.test(url.pathname) ? s.feedMinutes : s.pageMinutes
  if (!s.enabled || !(minutes > 0) || typeof caches === 'undefined') return handler()
  const version = await contentVersion(kv)
  const keyUrl = new URL(url); keyUrl.searchParams.set('__bizz_v', version)
  const key = new Request(keyUrl.toString(), { method: 'GET' })
  const cache = (caches as unknown as { default: Cache }).default
  const hit = await cache.match(key).catch(() => undefined)
  if (hit) return toClient(request, hit, true)
  const res = await handler()
  const type = res.headers.get('content-type') ?? ''
  if (res.status !== 200 || res.headers.has('set-cookie') || !/text\/html|xml|text\/plain|rss/.test(type)) return res
  const body = await res.arrayBuffer()
  const headers = new Headers(res.headers)
  headers.set('etag', await etagOf(body))
  headers.set('last-modified', new Date(Number(version) || Date.now()).toUTCString())
  headers.set('cache-control', `public, max-age=${Math.round(minutes * 60)}`)
  const stored = new Response(body, { status: 200, headers })
  if (!local || url.searchParams.has('bizz-cache-test')) ctx.waitUntil(cache.put(key, stored.clone()).catch(() => null))
  return toClient(request, stored, false)
}

// ---------------- Admin › Settings › Cache

const TAB_OFF = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
const TAB_ON = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-zinc-950 dark:border-white text-zinc-950 dark:text-white'
const TAB_ICON = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/></svg>'

/** Adds the Cache tab to the settings tab bar. */
export function withCacheTab(response: Response, path: string): Response {
  if (!path.startsWith('/admin/settings') || !response.headers.get('content-type')?.includes('text/html')) return response
  let added = false
  return new HTMLRewriter()
    .on('nav[role="tablist"]', { element: el => { if (added) return; added = true; el.append(`<a href="/admin/settings/cache" data-tab="cache" class="${path === '/admin/settings/cache' ? TAB_ON : TAB_OFF}"${path === '/admin/settings/cache' ? ' aria-current="page"' : ''}>${TAB_ICON}<span>Cache</span></a>`, { html: true }) } })
    .transform(response)
}

async function me(request: Request, fetcher: Fetcher): Promise<{ role?: string } | null> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers: { cookie } }))
  if (!res.ok) return null
  return ((await res.json().catch(() => null)) as { user?: { role?: string } } | null)?.user ?? null
}

/** GET/POST /admin/settings/cache (administrators), drawn in the settings layout. */
export async function cacheSettingsPage(request: Request, path: string, db: D1Database, kv: KVNamespace | undefined, fetcher: Fetcher): Promise<Response | null> {
  if (path !== '/admin/settings/cache') return null
  const url = new URL(request.url)
  const user = await me(request, fetcher)
  if (!user) return Response.redirect(new URL('/auth/login?redirect=/admin/settings/cache', url).toString(), 302)
  if (user.role !== 'admin') return new Response('Only administrators can change the cache.', { status: 403 })
  if (request.method === 'POST') {
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
    const f = await request.formData()
    if (f.get('action') === 'clear') { await bumpContentVersion(kv); return Response.redirect(new URL('/admin/settings/cache?cleared=1', url).toString(), 303) }
    const num = (k: string, d: number, max: number) => { const n = Number(f.get(k)); return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : d }
    const value: CacheSettings = { enabled: f.get('enabled') === 'on', pageMinutes: num('pageMinutes', DEFAULTS.pageMinutes, 1440), feedMinutes: num('feedMinutes', DEFAULTS.feedMinutes, 1440) }
    await db.prepare("INSERT INTO bizz_settings (key, value, updated_at) VALUES ('cache.settings', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").bind(JSON.stringify(value), Date.now()).run()
    settingsCache = null
    await bumpContentVersion(kv)
    return Response.redirect(new URL('/admin/settings/cache?saved=1', url).toString(), 303)
  }
  const s = await cacheSettings(db)
  const body = `<div class="space-y-6 bizz-api-settings">
    <div><h3 class="text-lg/7 font-semibold text-zinc-950 dark:text-white">Cache</h3>
    <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">Cloudflare keeps public pages for a few minutes, so visitors and search engines are served fast without rebuilding every page. Every save in the admin replaces all cached pages at once, so your changes show right away. Signed-in people always see fresh pages.</p></div>
    ${url.searchParams.has('saved') ? '<p class="bizz-api-saved">Saved. The cache was cleared.</p>' : ''}${url.searchParams.has('cleared') ? '<p class="bizz-api-saved">Cache cleared.</p>' : ''}
    <form method="post" class="bizz-seo-form">
      <label class="bizz-seo-check"><input type="checkbox" name="enabled"${s.enabled ? ' checked' : ''}><span><strong>Cache public pages</strong><small>Pages, posts, lists and the home page. Never the admin, sign-in, API or files.</small></span></label>
      <label class="bizz-seo-field"><span>Keep pages for (minutes)</span><input type="number" name="pageMinutes" min="0" max="1440" step="1" value="${s.pageMinutes}"><small>0 = no caching for pages. 5 is a good default.</small></label>
      <label class="bizz-seo-field"><span>Keep sitemaps, feeds, robots.txt and llms.txt for (minutes)</span><input type="number" name="feedMinutes" min="0" max="1440" step="1" value="${s.feedMinutes}"><small>They change less often. 60 is a good default.</small></label>
      <div><button type="submit" class="bg-zinc-950">Save changes</button></div>
    </form>
    <form method="post"><input type="hidden" name="action" value="clear"><button type="submit" class="bizz-seo-mini">Clear the cache now</button></form>
  </div>`
  const base = await fetcher(new Request(new URL('/admin/settings/general', url), { headers: request.headers }))
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  return new HTMLRewriter()
    .on('#settings-content', { element: el => { el.setInnerContent(body, { html: true }) } })
    .on('nav[role="tablist"] a[href="/admin/settings/general"]', { element: el => { el.setAttribute('class', TAB_OFF); el.removeAttribute('aria-current') } })
    .on('title', { element: el => { el.setInnerContent('Cache - BizzCMS') } })
    .transform(new Response(base.body, base))
}
