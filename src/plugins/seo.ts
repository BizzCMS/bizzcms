// BizzCMS plugin: SEO (modelled on Yoast SEO; our own code and wording).
// - Admin › SEO (/admin/seo): General settings, Indexing (robots.txt, llms.txt, hide site), Redirects, Check.
// - Editor: SEO panel with SEO / Social / Advanced tabs, Google preview, Auto-fill and live checks
//   (src/seo-editor.ts); fields in src/seo-fields.ts.
// - Website helpers: seoRedirect (before rendering), seoHead (title, description, canonical, robots,
//   social tags, structured data graph), seoSitemap (index + one sitemap per type), seoRobots, seoLlms.
// Settings live in bizz_settings ('seo.settings'), redirects in bizz_redirects; both in the site's D1.
import { definePlugin, PluginServiceClass as PluginService } from 'bizzcms-core'

export const SEO_PLUGIN_ID = 'seo'

export const seoPlugin = definePlugin({
  id: SEO_PLUGIN_ID,
  name: 'SEO',
  version: '1.0.0',
  description: 'Search engine optimisation like Yoast SEO: SEO panel with Google preview and checks in the editor, one-click Auto-fill, title formats, sitemaps, robots.txt, structured data for Google and redirects.',
  author: { name: 'BizzCMS', url: 'https://bizzcms.com' },
  capabilities: [],
  menu: [{ label: 'SEO', path: '/admin/seo', icon: 'search', order: 80 }]
})

// ---------- settings ----------

export interface SeoSettings {
  siteName: string; tagline: string; defaultDescription: string; defaultImage: string
  orgType: 'Organization' | 'Person'; orgName: string; orgLogo: string; sameAs: string
  hideFromSearch: boolean; robotsExtra: string; llmsText: string
}
const DEFAULTS: SeoSettings = { siteName: '', tagline: '', defaultDescription: '', defaultImage: '', orgType: 'Organization', orgName: '', orgLogo: '', sameAs: '', hideFromSearch: false, robotsExtra: '', llmsText: '' }

async function ensureTables(db: D1Database) {
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS bizz_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS bizz_redirects (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT NOT NULL UNIQUE, target TEXT NOT NULL, status INTEGER NOT NULL DEFAULT 301, hits INTEGER NOT NULL DEFAULT 0, last_hit INTEGER, note TEXT, created_at INTEGER NOT NULL)'),
    db.prepare('CREATE TABLE IF NOT EXISTS bizz_not_found (path TEXT PRIMARY KEY, hits INTEGER NOT NULL DEFAULT 0, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL, referrer TEXT)')
  ])
}

let settingsCache: { at: number; value: SeoSettings } | null = null
export async function seoSettings(db: D1Database): Promise<SeoSettings> {
  if (settingsCache && Date.now() - settingsCache.at < 30_000) return settingsCache.value
  let value = { ...DEFAULTS }
  try {
    await ensureTables(db)
    const row = await db.prepare("SELECT value FROM bizz_settings WHERE key = 'seo.settings'").first<{ value: string }>()
    if (row) value = { ...DEFAULTS, ...JSON.parse(row.value) }
  } catch { /* defaults */ }
  settingsCache = { at: Date.now(), value }
  return value
}

async function saveSettings(db: D1Database, s: SeoSettings) {
  await ensureTables(db)
  await db.prepare("INSERT INTO bizz_settings (key, value, updated_at) VALUES ('seo.settings', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(s), Date.now()).run()
  settingsCache = null
}

// ---------- redirects ----------

export interface RedirectRow { source: string; target: string; status?: number; note?: string }
interface Redirect { id: number; source: string; target: string; status: number; hits: number; last_hit: number | null; note: string | null }

const normalise = (p: string) => {
  let path = p.trim()
  try { if (/^https?:\/\//i.test(path)) path = new URL(path).pathname + new URL(path).search } catch { /* keep */ }
  if (!path.startsWith('/')) path = '/' + path
  return path.length > 1 ? path.replace(/\/+$/, '') : path
}

let redirectCache: { at: number; exact: Map<string, Redirect>; prefix: Redirect[] } | null = null

async function loadRedirects(db: D1Database) {
  if (redirectCache && Date.now() - redirectCache.at < 60_000) return redirectCache
  const exact = new Map<string, Redirect>(); const prefix: Redirect[] = []
  try {
    await ensureTables(db)
    const { results } = await db.prepare('SELECT id, source, target, status, hits, last_hit, note FROM bizz_redirects').all<Redirect>()
    for (const r of results) {
      if (r.source.endsWith('*')) prefix.push(r)
      else exact.set(r.source.toLowerCase(), r)
    }
    prefix.sort((a, b) => b.source.length - a.source.length)
  } catch { /* none */ }
  redirectCache = { at: Date.now(), exact, prefix }
  return redirectCache
}

/** Adds or updates redirects (for imports). Sources are site paths (old URLs); a trailing * matches a prefix. */
export async function addRedirects(db: D1Database, rows: RedirectRow[]): Promise<number> {
  await ensureTables(db)
  const now = Date.now()
  const stmts = rows.filter(r => r.source && r.target).map(r => db.prepare(
    'INSERT INTO bizz_redirects (source, target, status, note, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(source) DO UPDATE SET target = excluded.target, status = excluded.status, note = COALESCE(excluded.note, bizz_redirects.note)'
  ).bind(r.source.endsWith('*') ? normalise(r.source.slice(0, -1)) + '*' : normalise(r.source), r.target.trim(), r.status === 302 || r.status === 307 || r.status === 308 ? r.status : 301, r.note ?? null, now))
  for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100))
  // Addresses that now redirect are no longer "not found".
  const sources = rows.filter(r => r.source && !r.source.endsWith('*')).map(r => normalise(r.source))
  for (let i = 0; i < sources.length; i += 90) await db.prepare(`DELETE FROM bizz_not_found WHERE path IN (${sources.slice(i, i + 90).map(() => '?').join(',')})`).bind(...sources.slice(i, i + 90)).run().catch(() => null)
  redirectCache = null
  return stmts.length
}

/** Records an address that ended in "page not found" (Admin › SEO › Redirects lists them). Call it where the
 *  site returns its 404 page; it never delays the response. Assets, admin and API paths are not recorded. */
export function seoNotFound(request: Request, db: D1Database, ctx?: { waitUntil(p: Promise<unknown>): void }): void {
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  const path = normalise(url.pathname).slice(0, 300)
  if (/^\/(admin|auth|api|files|mcp|cdn-cgi)(\/|$)/.test(path) || /\.[a-z0-9]{2,5}$/i.test(path)) return
  let ref = ''; try { const r = new URL(request.headers.get('referer') ?? ''); ref = r.host === url.host ? r.pathname : r.host } catch { /* none */ }
  const now = Date.now()
  const done = ensureTables(db).then(() => db.prepare('INSERT INTO bizz_not_found (path, hits, first_seen, last_seen, referrer) VALUES (?, 1, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET hits = hits + 1, last_seen = excluded.last_seen, referrer = COALESCE(NULLIF(excluded.referrer, \'\'), bizz_not_found.referrer)')
    .bind(path, now, now, ref.slice(0, 200)).run()).catch(() => null)
  if (ctx) ctx.waitUntil(done)
}

/** Answers a GET/HEAD for an old URL with its redirect; null when there is none. Run before rendering pages. */
export async function seoRedirect(request: Request, db: D1Database, ctx?: { waitUntil(p: Promise<unknown>): void }): Promise<Response | null> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return null
  const url = new URL(request.url)
  if (/^\/(admin|auth|api|files|mcp)(\/|$)/.test(url.pathname)) return null
  const { exact, prefix } = await loadRedirects(db)
  if (!exact.size && !prefix.length) return null
  const path = normalise(url.pathname)
  let hit = exact.get((path + url.search).toLowerCase()) ?? exact.get(path.toLowerCase())
  let target = hit?.target
  if (!hit) {
    const p = prefix.find(r => path.toLowerCase().startsWith(r.source.slice(0, -1).toLowerCase()))
    if (p) { hit = p; target = p.target.includes('*') ? p.target.replace('*', path.slice(p.source.length - 1).replace(/^\//, '')) : p.target }
  }
  if (!hit || !target) return null
  const dest = new URL(target, url)
  if (dest.href === url.href) return null
  const done = db.prepare('UPDATE bizz_redirects SET hits = hits + 1, last_hit = ? WHERE id = ?').bind(Date.now(), hit.id).run().catch(() => null)
  if (ctx) ctx.waitUntil(done)
  return new Response(null, { status: hit.status, headers: { location: dest.href, 'cache-control': 'public, max-age=3600' } })
}

// ---------- website head, structured data ----------

export interface SeoInput {
  origin: string
  path: string
  kind: 'home' | 'page' | 'post' | 'category' | 'list'
  title: string
  data?: Record<string, unknown>
  excerpt?: string
  image?: string
  publishedAt?: number | null
  modifiedAt?: number | null
  author?: { name: string; url?: string }
  breadcrumbs?: { name: string; path: string }[]
  extraGraph?: unknown[]
}

export interface SeoHead {
  /** Full <title>: "Brand - tagline" on the home page, "Title | Brand" elsewhere. */
  title: string
  /** Title without the site name, for og:title. */
  shortTitle: string
  description?: string
  canonical: string
  image?: string
  index: boolean
  follow: boolean
  robots: string
  ogType: 'website' | 'article'
  jsonLd: unknown
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const abs = (origin: string, u: string) => { try { return u ? new URL(u, origin).href : '' } catch { return '' } }

/** Everything a page's <head> needs, from the item's SEO fields, its content and the SEO settings. */
export function seoHead(input: SeoInput, settings: SeoSettings): SeoHead {
  const d = input.data ?? {}
  const site = settings.siteName || new URL(input.origin).hostname
  const seoTitle = str(d.seoTitle) || input.title
  const title = input.kind === 'home'
    ? (str(d.seoTitle) || (settings.tagline ? `${site} - ${settings.tagline}` : site))
    : (seoTitle.toLowerCase().endsWith(site.toLowerCase()) ? seoTitle : `${seoTitle} | ${site}`)
  const description = str(d.seoDescription) || input.excerpt?.trim() || settings.defaultDescription || undefined
  const canonical = abs(input.origin, str(d.canonical)) || abs(input.origin, input.path)
  const image = abs(input.origin, str(d.seoImage) || input.image || settings.defaultImage) || undefined
  const index = !settings.hideFromSearch && d.noindex !== true && d.noindex !== 'true'
  const follow = d.nofollow !== true && d.nofollow !== 'true'
  const robots = `${index ? 'index' : 'noindex'},${follow ? 'follow' : 'nofollow'}${index ? ',max-image-preview:large' : ''}`
  return { title, shortTitle: str(d.socialTitle) || seoTitle, description, canonical, image, index, follow, robots, ogType: input.kind === 'post' ? 'article' : 'website', jsonLd: seoGraph(input, settings, { title: seoTitle, description, canonical, image }) }
}

/** Social tags (Open Graph and X) for sites that print their own head. */
export function socialTags(head: SeoHead, data: Record<string, unknown> | undefined, siteName: string): string {
  const e = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
  const t = str(data?.socialTitle) || head.shortTitle
  const desc = str(data?.socialDescription) || head.description || ''
  return [
    `<meta property="og:site_name" content="${e(siteName)}">`, `<meta property="og:type" content="${head.ogType}">`,
    `<meta property="og:title" content="${e(t)}">`, desc ? `<meta property="og:description" content="${e(desc)}">` : '',
    `<meta property="og:url" content="${e(head.canonical)}">`, head.image ? `<meta property="og:image" content="${e(head.image)}">` : '',
    `<meta name="twitter:card" content="${head.image ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${e(t)}">`,
    desc ? `<meta name="twitter:description" content="${e(desc)}">` : '', head.image ? `<meta name="twitter:image" content="${e(head.image)}">` : ''
  ].filter(Boolean).join('')
}

function seoGraph(input: SeoInput, s: SeoSettings, page: { title: string; description?: string; canonical: string; image?: string }) {
  const o = input.origin
  const orgId = `${o}/#${s.orgType === 'Person' ? 'person' : 'organization'}`
  const graph: Record<string, unknown>[] = []
  // The organisation (or person) is only described once it is set in SEO › General.
  const orgName = s.orgName
  if (orgName) {
    graph.push({ '@type': s.orgType, '@id': orgId, name: orgName, url: `${o}/`,
      ...(s.orgLogo ? { [s.orgType === 'Person' ? 'image' : 'logo']: abs(o, s.orgLogo) } : {}),
      ...(s.sameAs.trim() ? { sameAs: s.sameAs.split(/\s+/).filter(u => /^https?:\/\//.test(u)) } : {}) })
  }
  graph.push({ '@type': 'WebSite', '@id': `${o}/#website`, url: `${o}/`, name: s.siteName || orgName || new URL(o).hostname, ...(orgName ? { publisher: { '@id': orgId } } : {}) })
  const pageId = `${page.canonical}#webpage`
  graph.push({ '@type': input.kind === 'category' || input.kind === 'list' ? 'CollectionPage' : 'WebPage', '@id': pageId, url: page.canonical, name: page.title,
    ...(page.description ? { description: page.description } : {}), isPartOf: { '@id': `${o}/#website` },
    ...(page.image ? { primaryImageOfPage: { '@type': 'ImageObject', url: page.image } } : {}),
    ...(input.breadcrumbs?.length ? { breadcrumb: { '@id': `${page.canonical}#breadcrumb` } } : {}) })
  if (input.kind === 'post') {
    const iso = (t?: number | null) => (t ? new Date(t > 1e11 ? t : t * 1000).toISOString() : undefined)
    graph.push({ '@type': 'Article', '@id': `${page.canonical}#article`, headline: input.title.slice(0, 110), mainEntityOfPage: { '@id': pageId },
      ...(page.description ? { description: page.description } : {}), ...(page.image ? { image: [page.image] } : {}),
      ...(iso(input.publishedAt) ? { datePublished: iso(input.publishedAt) } : {}), ...(iso(input.modifiedAt ?? input.publishedAt) ? { dateModified: iso(input.modifiedAt ?? input.publishedAt) } : {}),
      ...(input.author?.name ? { author: { '@type': 'Person', name: input.author.name, ...(input.author.url ? { url: abs(o, input.author.url) } : {}) } } : orgName ? { author: { '@id': orgId } } : {}),
      // No "keywords": search engines ignore it and it shows competitors the keyphrases you target.
      // The focus and related keyphrases stay editor-only (SEO analysis).
      ...(orgName ? { publisher: { '@id': orgId } } : {}) })
  }
  if (input.breadcrumbs?.length) {
    graph.push({ '@type': 'BreadcrumbList', '@id': `${page.canonical}#breadcrumb`, itemListElement: input.breadcrumbs.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: abs(o, b.path) })) })
  }
  if (input.extraGraph) graph.push(...(input.extraGraph as Record<string, unknown>[]))
  return { '@context': 'https://schema.org', '@graph': graph }
}

// ---------- robots.txt, llms.txt, sitemaps ----------

export async function seoRobots(url: URL, db: D1Database, siteRules: string[] = []): Promise<Response> {
  const s = await seoSettings(db)
  const lines = s.hideFromSearch
    ? ['User-agent: *', 'Disallow: /']
    : ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /auth', 'Disallow: /api/', ...siteRules, ...s.robotsExtra.split('\n').map(l => l.trim()).filter(Boolean), `Sitemap: ${url.origin}/sitemap.xml`, `# AI assistants: ${url.origin}/llms.txt`]
  return new Response(lines.join('\n') + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}

/** llms.txt from the SEO settings, or null so the site can serve its own. */
export async function seoLlms(db: D1Database): Promise<Response | null> {
  const s = await seoSettings(db)
  if (!s.llmsText.trim()) return null
  return new Response(s.llmsText.trim() + '\n', { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}

export interface SitemapRoutes {
  /** URL path of a page, post or category document; null to leave it out. */
  pages?: (data: Record<string, unknown>, slug: string) => string | null
  posts?: (data: Record<string, unknown>, slug: string) => string | null
  categories?: (data: Record<string, unknown>, slug: string) => string | null
  tags?: (tag: string, section: string) => string | null
  /** Extra fixed URLs (paths), e.g. /brand. */
  extra?: string[]
}

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n'
const xesc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]!))
// Public URL rules of this site (the same object as for the sitemaps), used by the admin's
// "View on site" eye in the Content list and the editor. Sites call setPublicRoutes(SITEMAP_ROUTES) once.
let publicRoutes: SitemapRoutes | null = null
export function setPublicRoutes(routes: SitemapRoutes) { publicRoutes = routes }

/** Public path of a document, or null when the site has no page for it. */
export function publicPath(type: string, data: Record<string, unknown>, slug: string): string | null {
  const r = publicRoutes
  if (type === 'pages') return r?.pages ? r.pages(data, slug) : (typeof data.path === 'string' && data.path ? (data.path.startsWith('/') ? data.path : '/' + data.path) : `/${slug}`)
  if (type === 'posts') return r?.posts ? r.posts(data, slug) : `/blog/${encodeURIComponent(slug)}`
  if (type === 'categories') return r?.categories ? r.categories(data, slug) : null
  return null
}

const PUBLISHED = `tenant_id = 'default' AND is_published = 1 AND (deleted_at IS NULL OR deleted_at = '')`

/** /sitemap.xml (index) and /sitemap-<type>.xml; null for other paths. Leaves out noindex items and items with a canonical elsewhere. */
export async function seoSitemap(url: URL, db: D1Database, routes: SitemapRoutes): Promise<Response | null> {
  const m = url.pathname.match(/^\/sitemap(?:-(pages|posts|categories|tags|other))?\.xml$/)
  if (!m) return null
  const xml = (body: string) => new Response(XML_HEAD + body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
  const s = await seoSettings(db)
  const types = (['pages', 'posts', 'categories', 'tags'] as const).filter(t => routes[t])
  if (!m[1]) {
    const parts = [...types, ...(routes.extra?.length ? ['other'] : [])].map(t => `<sitemap><loc>${xesc(`${url.origin}/sitemap-${t}.xml`)}</loc></sitemap>`)
    return xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${s.hideFromSearch ? '' : parts.join('\n')}\n</sitemapindex>\n`)
  }
  const day = (t: number) => new Date(t > 1e11 ? t : t * 1000).toISOString().slice(0, 10)
  const urls: { loc: string; lastmod?: string }[] = []
  if (!s.hideFromSearch) {
    if (m[1] === 'other') for (const p of routes.extra ?? []) urls.push({ loc: abs(url.origin, p) })
    else if (m[1] === 'tags' && routes.tags) {
      const { results } = await db.prepare(`SELECT MIN(j.value) AS tag, COALESCE(json_extract(d.data, '$.section'), 'blog') AS section, MAX(COALESCE(d.published_at, d.updated_at)) AS t
        FROM documents d, json_each(CASE WHEN json_valid(d.data) AND json_type(d.data, '$.tags') = 'array' THEN json_extract(d.data, '$.tags') ELSE '[]' END) j
        WHERE d.type_id = 'posts' AND d.tenant_id = 'default' AND d.is_published = 1 AND (d.deleted_at IS NULL OR d.deleted_at = '') AND j.type = 'text'
        GROUP BY lower(trim(j.value)), section ORDER BY tag LIMIT 50000`).all<{ tag: string; section: string; t: number }>()
      for (const r of results) { const p = routes.tags(r.tag, r.section || 'blog'); if (p) urls.push({ loc: abs(url.origin, p), lastmod: r.t ? day(r.t) : undefined }) }
    } else {
      const type = m[1] as 'pages' | 'posts' | 'categories'
      const route = routes[type]
      if (route) {
        const { results } = await db.prepare(`SELECT slug, data, COALESCE(updated_at, published_at) AS t FROM documents WHERE type_id = ? AND ${PUBLISHED} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 50000`).bind(type).all<{ slug: string; data: string; t: number }>()
        for (const r of results) {
          let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data) } catch { /* empty */ }
          if (d.noindex === true || d.noindex === 'true' || str(d.canonical)) continue
          const p = route(d, r.slug); if (p) urls.push({ loc: abs(url.origin, p), lastmod: r.t ? day(Number(r.t)) : undefined })
        }
      }
    }
  }
  const seen = new Set<string>()
  const body = urls.filter(u => u.loc && !seen.has(u.loc) && seen.add(u.loc)).map(u => `<url><loc>${xesc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')
  return xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`)
}

// ---------- admin ----------

type Fetcher = (request: Request) => Promise<Response>
const e = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

async function me(request: Request, fetcher: Fetcher): Promise<{ role?: string } | null> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers: { cookie } }))
  if (!res.ok) return null
  return ((await res.json().catch(() => null)) as { user?: { role?: string } } | null)?.user ?? null
}

let pluginEnsured = false
/** Installs and activates the SEO plugin record once, so it shows under Plugins and in the sidebar. */
async function ensureSeoPlugin(db: D1Database) {
  if (pluginEnsured) return
  try {
    const svc = new PluginService(db)
    const existing = await svc.getPlugin(SEO_PLUGIN_ID)
    if (!existing) {
      await svc.ensurePlugin(SEO_PLUGIN_ID, { displayName: 'SEO', version: '1.0.0', description: seoPlugin.description, author: 'BizzCMS' })
      await svc.activatePlugin(SEO_PLUGIN_ID).catch(() => null)
    }
    pluginEnsured = true
  } catch { /* try again on a later request */ }
}

/** Admin routes of the SEO plugin; null when the path is not ours. */
export async function seoAdminRoute(request: Request, path: string, db: D1Database, fetcher: Fetcher): Promise<Response | null> {
  if (path.startsWith('/admin')) await ensureSeoPlugin(db)
  if (path === `/admin/plugins/${SEO_PLUGIN_ID}` && request.method === 'GET') return Response.redirect(new URL('/admin/seo', request.url).toString(), 302)
  if (path === '/admin/plugins/install' && request.method === 'POST') {
    const body = await request.clone().json().catch(() => null) as { name?: string; id?: string } | null
    if (body?.name !== SEO_PLUGIN_ID && body?.id !== SEO_PLUGIN_ID) return null
    if ((await me(request, fetcher))?.role !== 'admin') return Response.json({ error: 'Access denied' }, { status: 403 })
    pluginEnsured = false; await ensureSeoPlugin(db)
    return Response.json({ success: true })
  }
  if (path === '/admin/bizz/seo/context' || path === '/admin/bizz/seo/scores' || path === '/admin/bizz/seo/urls') {
    if (!(await me(request, fetcher))) return Response.json({ error: 'Sign in required' }, { status: 401 })
    const url = new URL(request.url)
    if (path === '/admin/bizz/seo/urls') {
      // Public addresses of published items (list rows and the editor carry a root or a version id).
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200)
      if (!ids.length) return Response.json({})
      const marks = ids.map(() => '?').join(',')
      const { results: map } = await db.prepare(`SELECT id, root_id FROM documents WHERE id IN (${marks}) OR root_id IN (${marks})`).bind(...ids, ...ids).all<{ id: string; root_id: string }>()
      const roots = [...new Set(map.map(m => m.root_id))]
      if (!roots.length) return Response.json({})
      const { results } = await db.prepare(`SELECT root_id, type_id, slug, data FROM documents WHERE is_published = 1 AND (deleted_at IS NULL OR deleted_at = '') AND root_id IN (${roots.map(() => '?').join(',')})`)
        .bind(...roots).all<{ root_id: string; type_id: string; slug: string; data: string }>()
      const byRoot: Record<string, string> = {}
      for (const r of results) { let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data) } catch { /* empty */ } const p = publicPath(r.type_id, d, r.slug ?? ''); if (p) byRoot[r.root_id] = new URL(p, url.origin).href }
      const out: Record<string, string> = {}
      for (const m of map) { const u = byRoot[m.root_id]; if (!u) continue; if (ids.includes(m.id)) out[m.id] = u; if (ids.includes(m.root_id)) out[m.root_id] = u }
      return Response.json(out, { headers: { 'cache-control': 'no-store' } })
    }
    if (path === '/admin/bizz/seo/scores') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200)
      if (!ids.length) return Response.json({})
      // List links carry either the root id or a version id; answer for both.
      const marks = ids.map(() => '?').join(',')
      const { results } = await db.prepare(`SELECT id, root_id, json_extract(data, '$.seoScore') AS seo, json_extract(data, '$.readabilityScore') AS read
        FROM documents WHERE is_current_draft = 1 AND (root_id IN (${marks}) OR root_id IN (SELECT root_id FROM documents WHERE id IN (${marks})))`).bind(...ids, ...ids).all<{ id: string; root_id: string; seo: number | null; read: number | null }>()
      const out: Record<string, { seo: number | null; read: number | null }> = {}
      for (const r of results) { out[r.root_id] = { seo: r.seo, read: r.read }; out[r.id] = out[r.root_id] }
      const idRoots = await db.prepare(`SELECT id, root_id FROM documents WHERE id IN (${marks})`).bind(...ids).all<{ id: string; root_id: string }>()
      for (const r of idRoots.results) if (out[r.root_id]) out[r.id] = out[r.root_id]
      return Response.json(out, { headers: { 'cache-control': 'no-store' } })
    }
    const id = url.searchParams.get('id') ?? ''
    const s = await seoSettings(db)
    const root = id ? await db.prepare('SELECT root_id FROM documents WHERE id = ?').bind(id).first<{ root_id: string }>() : null
    const { results } = await db.prepare(`SELECT root_id, title, json_extract(data, '$.focusKeyphrase') AS k FROM documents
      WHERE type_id IN ('posts', 'pages', 'categories') AND tenant_id = 'default' AND is_current_draft = 1 AND deleted_at IS NULL AND json_extract(data, '$.focusKeyphrase') <> ''`).all<{ root_id: string; title: string; k: string }>()
    const used = results.filter(r => r.root_id !== root?.root_id).map(r => ({ phrase: String(r.k).toLowerCase().trim(), title: r.title }))
    return Response.json({ siteName: s.siteName || url.hostname, tagline: s.tagline, origin: url.origin, used }, { headers: { 'cache-control': 'no-store' } })
  }
  if (path !== '/admin/seo') return null

  const url = new URL(request.url)
  const user = await me(request, fetcher)
  if (!user) return Response.redirect(new URL('/auth/login?redirect=/admin/seo', url).toString(), 302)
  const isAdmin = user.role === 'admin'
  if (request.method === 'POST') {
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
    if (!isAdmin) return new Response('Only administrators can change SEO settings.', { status: 403 })
    const f = await request.formData()
    const action = String(f.get('action') ?? '')
    let tab = 'general'
    if (action === 'settings') {
      const g = (k: string) => String(f.get(k) ?? '').trim()
      await saveSettings(db, { siteName: g('siteName'), tagline: g('tagline'), defaultDescription: g('defaultDescription'), defaultImage: g('defaultImage'), orgType: g('orgType') === 'Person' ? 'Person' : 'Organization', orgName: g('orgName'), orgLogo: g('orgLogo'), sameAs: g('sameAs'), hideFromSearch: f.get('hideFromSearch') === 'on', robotsExtra: g('robotsExtra'), llmsText: g('llmsText') })
      tab = String(f.get('tab') ?? 'general')
    } else if (action === 'add-redirect' || action === 'import-redirects') {
      tab = 'redirects'
      const lines = action === 'add-redirect' ? [`${f.get('source')},${f.get('target')},${f.get('status')}`] : String(f.get('csv') ?? '').split(/\r?\n/)
      const rows = lines.map(l => l.split(/[,;\t]/).map(x => x.trim())).filter(([a, b]) => a && b).map(([source, target, status]) => ({ source, target, status: Number(status) || 301 }))
      await addRedirects(db, rows)
    } else if (action === 'dismiss-404') {
      tab = 'redirects'
      await ensureTables(db); await db.prepare('DELETE FROM bizz_not_found WHERE path = ?').bind(String(f.get('path') ?? '')).run()
    } else if (action === 'delete-redirect') {
      tab = 'redirects'
      await ensureTables(db); await db.prepare('DELETE FROM bizz_redirects WHERE id = ?').bind(Number(f.get('id'))).run(); redirectCache = null
    }
    return Response.redirect(new URL(`/admin/seo?tab=${tab}&saved=1`, url).toString(), 303)
  }

  const tab = ['general', 'indexing', 'redirects', 'check'].includes(url.searchParams.get('tab') ?? '') ? url.searchParams.get('tab')! : 'general'
  const s = await seoSettings(db)
  const body = await adminPage(tab, s, db, url, isAdmin)
  const base = await fetcher(new Request(new URL('/admin/dashboard', url), { headers: request.headers }))
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  return new HTMLRewriter()
    .on('main > div.grow', { element: el => { el.setInnerContent(body, { html: true }) } })
    .on('title', { element: el => { el.setInnerContent('SEO - BizzCMS') } })
    .transform(new Response(base.body, base))
}

async function adminPage(tab: string, s: SeoSettings, db: D1Database, url: URL, isAdmin: boolean): Promise<string> {
  // The admin's standard tab bar (same markup as Settings, styled by admin.css [data-bizz-tabs]).
  const icon = (d: string) => `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const TAB_ICONS: Record<string, string> = {
    general: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    indexing: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    redirects: '<path d="M4 12h12"/><path d="m12 6 6 6-6 6"/><path d="M20 4v16"/>',
    check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'
  }
  const tabClass = (on: boolean) => `flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline ${on ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'}`
  const tabs = [['general', 'General'], ['indexing', 'Indexing'], ['redirects', 'Redirects'], ['check', 'Check']]
    .map(([k, l]) => `<a href="/admin/seo?tab=${k}" data-tab="${k}" class="${tabClass(k === tab)}"${k === tab ? ' aria-current="page"' : ''}>${icon(TAB_ICONS[k])}<span>${l}</span></a>`).join('')
  const saved = url.searchParams.has('saved') ? '<p class="bizz-api-saved">Saved.</p>' : ''
  const ro = isAdmin ? '' : ' disabled'
  const field = (name: keyof SeoSettings, label: string, help: string, kind: 'text' | 'textarea' = 'text') => `<label class="bizz-seo-field"><span>${label}</span>${kind === 'textarea'
    ? `<textarea name="${name}" rows="4"${ro}>${e(s[name])}</textarea>` : `<input type="text" name="${name}" value="${e(s[name])}"${ro}>`}<small>${help}</small></label>`
  let content = ''
  if (tab === 'general' || tab === 'indexing') {
    const inner = tab === 'general' ? `
      ${field('siteName', 'Site name', 'Added to every title: "Title | Site name".')}
      ${field('tagline', 'Home page tagline', 'Home page title becomes "Site name - tagline".')}
      ${field('defaultDescription', 'Default meta description', 'Used when a page has no description of its own.', 'textarea')}
      ${field('defaultImage', 'Default social image', 'Address of an image (1200 × 630) for pages without their own, e.g. /img/share.png.')}
      <label class="bizz-seo-field"><span>This website represents</span><select name="orgType"${ro}><option value="Organization"${s.orgType === 'Organization' ? ' selected' : ''}>A company or organisation</option><option value="Person"${s.orgType === 'Person' ? ' selected' : ''}>A person</option></select><small>Tells Google who is behind the site.</small></label>
      ${field('orgName', 'Name', 'Company or person name.')}
      ${field('orgLogo', 'Logo or photo', 'Address of the logo (or photo for a person).')}
      ${field('sameAs', 'Social profiles', 'One address per line: Facebook, LinkedIn, X, YouTube, GitHub…', 'textarea')}` : `
      <label class="bizz-seo-check"><input type="checkbox" name="hideFromSearch"${s.hideFromSearch ? ' checked' : ''}${ro}><span><strong>Hide the whole site from search engines</strong><small>For staging or unfinished sites. robots.txt then blocks everything and every page gets noindex.</small></span></label>
      ${field('robotsExtra', 'Extra robots.txt lines', 'Added to the default rules, e.g. "Disallow: /private/". Sitemap and llms.txt lines are added automatically.', 'textarea')}
      ${field('llmsText', 'llms.txt (instructions for AI assistants)', 'Plain text or Markdown at /llms.txt. Empty = the site\'s built-in text, if it has one.', 'textarea')}
      <p class="bizz-seo-note">Sitemap: <a href="/sitemap.xml" target="_blank">/sitemap.xml</a> · Robots: <a href="/robots.txt" target="_blank">/robots.txt</a> · <a href="/llms.txt" target="_blank">/llms.txt</a></p>`
    content = `<form method="post" class="bizz-seo-form"><input type="hidden" name="action" value="settings"><input type="hidden" name="tab" value="${tab}">
      ${tab === 'general' ? hiddenOf(s, ['hideFromSearch', 'robotsExtra', 'llmsText']) : hiddenOf(s, ['siteName', 'tagline', 'defaultDescription', 'defaultImage', 'orgType', 'orgName', 'orgLogo', 'sameAs'])}
      ${inner}${isAdmin ? '<div><button type="submit" class="bg-zinc-950">Save changes</button></div>' : '<p class="bizz-seo-note">Only administrators can change these settings.</p>'}</form>`
  } else if (tab === 'redirects') {
    await ensureTables(db)
    const q = (url.searchParams.get('q') ?? '').trim()
    const { results } = await db.prepare(`SELECT id, source, target, status, hits, last_hit FROM bizz_redirects ${q ? 'WHERE source LIKE ? OR target LIKE ?' : ''} ORDER BY created_at DESC LIMIT 200`)
      .bind(...(q ? [`%${q}%`, `%${q}%`] : [])).all<Redirect>()
    const total = (await db.prepare('SELECT COUNT(*) AS n FROM bizz_redirects').first<{ n: number }>())?.n ?? 0
    const { results: missing } = await db.prepare('SELECT path, hits, last_seen, referrer FROM bizz_not_found WHERE last_seen > ? ORDER BY hits DESC, last_seen DESC LIMIT 50')
      .bind(Date.now() - 90 * 86400_000).all<{ path: string; hits: number; last_seen: number; referrer: string | null }>()
    const notFound = `<h3 class="bizz-seo-subhead">Not found (last 90 days)</h3>
      <p class="bizz-seo-note">${missing.length ? 'Addresses visitors or search engines asked for that ended on "page not found". Redirect them to the right page, or dismiss them.' : 'No "page not found" visits recorded. 👍'}</p>
      ${missing.length ? `<table class="bizz-seo-table"><thead><tr><th>Address</th><th>Hits</th><th>Last seen</th><th>Came from</th><th></th></tr></thead><tbody>
      ${missing.map(m => `<tr><td><code>${e(m.path)}</code></td><td>${m.hits}</td><td>${new Date(m.last_seen).toISOString().slice(0, 10)}</td><td>${e(m.referrer || '')}</td><td class="bizz-seo-actions">${isAdmin ? `<a class="bizz-seo-mini" href="/admin/seo?tab=redirects&amp;source=${encodeURIComponent(m.path)}#add">Redirect…</a><form method="post"><input type="hidden" name="action" value="dismiss-404"><input type="hidden" name="path" value="${e(m.path)}"><button type="submit" class="bizz-seo-danger">Dismiss</button></form>` : ''}</td></tr>`).join('')}
      </tbody></table>` : ''}`
    content = `${notFound}<h3 class="bizz-seo-subhead" id="add">Redirects</h3>${isAdmin ? `<form method="post" class="bizz-seo-inline"><input type="hidden" name="action" value="add-redirect">
        <input type="text" name="source" placeholder="Old URL, e.g. /blog/post/old-slug/123/" value="${e(url.searchParams.get('source') ?? '')}" required><input type="text" name="target" placeholder="New URL, e.g. /blog/new-slug/" required>
        <select name="status"><option value="301">301 permanent</option><option value="302">302 temporary</option></select><button type="submit" class="bg-zinc-950">Add redirect</button></form>` : ''}
      <form method="get" class="bizz-seo-inline"><input type="hidden" name="tab" value="redirects"><input type="search" name="q" value="${e(q)}" placeholder="Search ${total} redirects…"><button type="submit">Search</button></form>
      <table class="bizz-seo-table"><thead><tr><th>Old URL</th><th>New URL</th><th>Type</th><th>Hits</th><th></th></tr></thead><tbody>
      ${results.map(r => `<tr><td><code>${e(r.source)}</code></td><td><a href="${e(r.target)}" target="_blank">${e(r.target)}</a></td><td>${r.status}</td><td>${r.hits}</td><td>${isAdmin ? `<form method="post"><input type="hidden" name="action" value="delete-redirect"><input type="hidden" name="id" value="${r.id}"><button type="submit" class="bizz-seo-danger" onclick="return confirm('Delete this redirect?')">Delete</button></form>` : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="bizz-seo-empty">No redirects yet.</td></tr>'}
      </tbody></table>
      ${isAdmin ? `<form method="post" class="bizz-seo-form"><input type="hidden" name="action" value="import-redirects"><label class="bizz-seo-field"><span>Import redirects</span><textarea name="csv" rows="5" placeholder="/old-url/,/new-url/,301"></textarea><small>One per line: old URL, new URL, optional 301 or 302. An old URL ending in * matches everything that starts with it.</small></label><div><button type="submit" class="bg-zinc-950">Import</button></div></form>` : ''}`
  } else {
    content = await checkTab(db)
  }
  return `<div class="bizz-seo-page"><div class="mb-8"><h1 class="text-2xl/8 font-semibold text-zinc-950 dark:text-white sm:text-xl/8">SEO</h1><p class="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">How your website appears in Google and when it is shared. Each page and post also has its own SEO panel in the editor.</p></div>
    <div class="border-b border-zinc-950/5 dark:border-white/10 bizz-seo-tabbar-page"><nav class="flex overflow-x-auto" role="tablist" aria-label="SEO sections" data-bizz-tabs>${tabs}</nav></div>${saved}${content}</div>`
}

function hiddenOf(s: SeoSettings, keys: (keyof SeoSettings)[]) {
  return keys.map(k => k === 'hideFromSearch' ? (s.hideFromSearch ? '<input type="hidden" name="hideFromSearch" value="on">' : '') : `<input type="hidden" name="${k}" value="${e(s[k])}">`).join('')
}

async function checkTab(db: D1Database): Promise<string> {
  const { results } = await db.prepare(`SELECT id, type_id, title, data FROM documents WHERE type_id IN ('posts', 'pages', 'categories') AND tenant_id = 'default' AND is_current_draft = 1 AND deleted_at IS NULL ORDER BY updated_at DESC LIMIT 3000`)
    .all<{ id: string; type_id: string; title: string; data: string }>()
  const titles = new Map<string, number>()
  const items = results.map(r => { let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data) } catch { /* empty */ } const t = (str(d.seoTitle) || r.title || '').toLowerCase(); titles.set(t, (titles.get(t) ?? 0) + 1); return { ...r, d } })
  const rows = items.map(r => {
    const d = r.d, issues: string[] = []
    const desc = str(d.seoDescription) || str(d.excerpt)
    if (!str(d.focusKeyphrase)) issues.push('No focus keyphrase')
    if (!desc) issues.push('No meta description'); else if (desc.length > 160) issues.push('Description too long')
    const t = str(d.seoTitle) || r.title || ''
    if (t.length > 60) issues.push('Title too long'); else if (t.length < 20) issues.push('Title short')
    if ((titles.get(t.toLowerCase()) ?? 0) > 1) issues.push('Duplicate title')
    if (r.type_id === 'posts') {
      if (!str(d.featuredImage)) issues.push('No featured image')
      else if (!str(d.featuredImageAlt)) issues.push('Featured image has no description')
      if (!Array.isArray(d.categories) || !d.categories.length) issues.push('No category')
    }
    if (/<img(?![^>]*\balt=["'][^"']+["'])[^>]*>/i.test(String(d.content ?? d.body ?? ''))) issues.push('Image without alt text')
    if (d.noindex === true) issues.push('Hidden from search (noindex)')
    const score = typeof d.seoScore === 'number' ? d.seoScore : null
    return { r, issues, score, key: d.keyContent === true }
  }).filter(x => x.issues.length || (x.score !== null && x.score < 45))
    .sort((a, b) => Number(b.key) - Number(a.key) || b.issues.length - a.issues.length)
  const dot = (n: number | null) => `<span class="bizz-seo-dot ${n === null ? 'is-none' : n >= 70 ? 'is-good' : n >= 45 ? 'is-ok' : 'is-bad'}" title="${n === null ? 'Not analysed yet: open and save it once' : `SEO score ${n}`}"></span>`
  const label: Record<string, string> = { posts: 'Post', pages: 'Page', categories: 'Category' }
  return `<p class="bizz-seo-note">${rows.length ? `${rows.length} of ${items.length} items need attention. Key content first.` : `All ${items.length} items look good.`} Open an item and use <strong>Auto-fill SEO</strong> in its SEO panel to fix most of these in one click.</p>
    <table class="bizz-seo-table"><thead><tr><th></th><th>Title</th><th>Type</th><th>To fix</th></tr></thead><tbody>
    ${rows.slice(0, 500).map(x => `<tr><td>${dot(x.score)}</td><td><a href="/admin/content/${e(x.r.id)}/edit">${e(x.r.title || '(no title)')}</a>${x.key ? ' <span class="bizz-seo-key">Key</span>' : ''}</td><td>${label[x.r.type_id] ?? x.r.type_id}</td><td>${x.issues.map(i => `<span class="bizz-seo-issue">${e(i)}</span>`).join('')}</td></tr>`).join('')}
    </tbody></table>`
}
