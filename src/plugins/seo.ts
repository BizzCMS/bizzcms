// BizzCMS plugin: SEO (modelled on Yoast SEO; our own code and wording).
// - Admin › SEO (/admin/seo): General settings, Indexing (robots.txt, llms.txt, hide site), Redirects, Check.
// - Editor: SEO panel with SEO / Social / Advanced tabs, Google preview, Auto-fill and live checks
//   (src/seo-editor.ts); fields in src/seo-fields.ts.
// - Website helpers: seoRedirect (before rendering), seoHead (title, description, canonical, robots,
//   social tags, structured data graph), seoSitemap (index + one sitemap per type), seoRobots, seoLlms,
//   IndexNow (seoIndexNowKey serves the key file, seoIndexNowChanged pings after admin saves).
// Settings live in bizz_settings ('seo.settings'), redirects in bizz_redirects; both in the site's D1.
import { aiDiscoveryTab } from './ai-discovery'
import { aiRobotsBlock, contentSignal, AI_BOTS, AI_BOTS_VERSION, type AiPolicy } from './ai-crawlers'
import { definePlugin, PluginServiceClass as PluginService } from 'bizzcms-core'
import { SEO_ANALYSE_CORE } from '../seo-editor'

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
  /** X (Twitter) username without @, for twitter:site and twitter:creator. */
  xHandle: string
  hideFromSearch: boolean; robotsExtra: string; llmsText: string
  /** Sitemap parts switched off (pages, posts, categories, tags, other, or a collection name). */
  sitemapOff: string[]
  /** RSS feed: on/off, number of posts, full text (true) or summary only. */
  feedEnabled: boolean; feedItems: number; feedFullText: boolean
  /** IndexNow (Bing, Yandex, Seznam, Naver…): tell search engines at once when an address changes. */
  indexNowEnabled: boolean; indexNowKey: string
  /** AI crawlers by purpose (robots.txt): search answers, assistants a person asked, model training. */
  aiSearch: boolean; aiAgents: boolean; aiTraining: boolean
}
const DEFAULTS: SeoSettings = { siteName: '', tagline: '', defaultDescription: '', defaultImage: '', orgType: 'Organization', orgName: '', orgLogo: '', sameAs: '', xHandle: '', hideFromSearch: false, robotsExtra: '', llmsText: '', sitemapOff: [], feedEnabled: true, feedItems: 20, feedFullText: true, indexNowEnabled: true, indexNowKey: '', aiSearch: true, aiAgents: true, aiTraining: false }

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
  /** A person's name and profile page. Leave it out when the organisation wrote the post: the schema then names the organisation. Never invent one. */
  author?: { name: string; url?: string }
  /** Schema type for posts: Article (default), BlogPosting or NewsArticle. */
  articleType?: 'Article' | 'BlogPosting' | 'NewsArticle'
  /** The post's categories (articleSection). */
  sections?: string[]
  /** The post's visible tags (keywords). Only tags shown on the page, never the focus keyphrase. */
  tags?: string[]
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
export function socialTags(head: SeoHead, data: Record<string, unknown> | undefined, siteName: string, feed = true): string {
  const e = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
  const t = str(data?.socialTitle) || head.shortTitle
  const desc = str(data?.socialDescription) || head.description || ''
  return [
    `<meta property="og:site_name" content="${e(siteName)}">`, `<meta property="og:type" content="${head.ogType}">`,
    `<meta property="og:title" content="${e(t)}">`, desc ? `<meta property="og:description" content="${e(desc)}">` : '',
    `<meta property="og:url" content="${e(head.canonical)}">`, head.image ? `<meta property="og:image" content="${e(head.image)}">` : '',
    `<meta name="twitter:card" content="${head.image ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${e(t)}">`,
    desc ? `<meta name="twitter:description" content="${e(desc)}">` : '', head.image ? `<meta name="twitter:image" content="${e(head.image)}">` : '',
    // The site's X account (SEO › General); the settings are already loaded by the caller's seoSettings().
    ...(settingsCache?.value.xHandle ? [`<meta name="twitter:site" content="@${e(settingsCache.value.xHandle)}">`, `<meta name="twitter:creator" content="@${e(settingsCache.value.xHandle)}">`] : []),
    feed && publicRoutes?.posts ? `<link rel="alternate" type="application/rss+xml" title="${e(siteName)}" href="${e(new URL('/feed/', head.canonical).href)}">` : ''
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
    graph.push({ '@type': input.articleType ?? 'Article', '@id': `${page.canonical}#article`, headline: input.title.slice(0, 110), mainEntityOfPage: { '@id': pageId },
      ...(page.description ? { description: page.description } : {}), ...(page.image ? { image: [page.image] } : {}),
      ...(iso(input.publishedAt) ? { datePublished: iso(input.publishedAt) } : {}), ...(iso(input.modifiedAt ?? input.publishedAt) ? { dateModified: iso(input.modifiedAt ?? input.publishedAt) } : {}),
      ...(input.author?.name ? { author: { '@type': 'Person', name: input.author.name, ...(input.author.url ? { url: abs(o, input.author.url) } : {}) } } : orgName ? { author: { '@id': orgId } } : {}),
      ...(input.sections?.filter(Boolean).length ? { articleSection: input.sections.filter(Boolean).length === 1 ? input.sections.filter(Boolean)[0] : input.sections.filter(Boolean) } : {}),
      // "keywords" = the post's visible tags only (a topic hint for AI assistants and other engines; Google
      // ignores it). The focus and related keyphrases stay editor-only, so competitors don't see what you target.
      ...(input.tags?.filter(Boolean).length ? { keywords: [...new Set(input.tags.map(t => t.trim()).filter(Boolean))].slice(0, 15).join(', ') } : {}),
      ...(orgName ? { publisher: { '@id': orgId } } : {}) })
  }
  if (input.breadcrumbs?.length) {
    graph.push({ '@type': 'BreadcrumbList', '@id': `${page.canonical}#breadcrumb`, itemListElement: input.breadcrumbs.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: abs(o, b.path) })) })
  }
  if (input.extraGraph) graph.push(...(input.extraGraph as Record<string, unknown>[]))
  return { '@context': 'https://schema.org', '@graph': graph }
}

// ---------- robots.txt, llms.txt, sitemaps ----------

/** The site's AI crawler policy from the SEO settings. */
export function aiPolicyOf(s: SeoSettings): AiPolicy { return { search: s.aiSearch !== false, agents: s.aiAgents !== false, training: s.aiTraining === true } }

export async function seoRobots(url: URL, db: D1Database, siteRules: string[] = []): Promise<Response> {
  const s = await seoSettings(db)
  const lines = s.hideFromSearch
    ? ['User-agent: *', 'Disallow: /']
    : [...aiRobotsBlock(aiPolicyOf(s)), 'User-agent: *', contentSignal(aiPolicyOf(s)), 'Allow: /', 'Disallow: /admin', 'Disallow: /auth', 'Disallow: /api/', ...siteRules, ...s.robotsExtra.split('\n').map(l => l.trim()).filter(Boolean), `Sitemap: ${url.origin}/sitemap.xml`, `# AI assistants: ${url.origin}/llms.txt`]
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
  /** Other collections with public pages, by collection name, e.g. { portfolio: (d, slug) => `/portfolio/${slug}/` }. */
  collections?: Record<string, (data: Record<string, unknown>, slug: string) => string | null>
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
  // Extra collections a site describes (e.g. portfolio): their own URL rule.
  const own = r?.collections?.[type]
  return own ? own(data, slug) : null
}

const PUBLISHED = `tenant_id = 'default' AND is_published = 1 AND (deleted_at IS NULL OR deleted_at = '')`

/** /sitemap.xml (index) and /sitemap-<type>.xml; null for other paths. Leaves out noindex items and items with a canonical elsewhere. */
/** The sitemap parts a site offers (for the Indexing tab and the sitemap index). */
/** Sections that have published posts (blog, news, …), cached for a minute per Worker. */
let sectionCache: { at: number; list: string[] } | null = null
export async function postSections(db: D1Database): Promise<string[]> {
  if (sectionCache && Date.now() - sectionCache.at < 60_000) return sectionCache.list
  const { results } = await db.prepare(`SELECT DISTINCT COALESCE(NULLIF(json_extract(data, '$.section'), ''), 'blog') AS s FROM documents WHERE type_id = 'posts' AND ${PUBLISHED}`).all<{ s: string }>().catch(() => ({ results: [] as { s: string }[] }))
  const list = results.map(r => r.s).filter(x => /^[a-z0-9-]+$/.test(x)).sort((a, b) => (a === 'blog' ? -1 : b === 'blog' ? 1 : a.localeCompare(b)))
  sectionCache = { at: Date.now(), list: list.length ? list : ['blog'] }
  return sectionCache.list
}

/** The sitemap parts a site offers (for the Indexing tab and the sitemap index). Posts come per section
 *  (Blog posts, News posts) so each can be switched on or off. */
export function sitemapParts(routes: SitemapRoutes | null = publicRoutes, sections: string[] = ['blog']): { key: string; label: string; section?: string }[] {
  if (!routes) return []
  const cap = (k: string) => k.charAt(0).toUpperCase() + k.slice(1).replace(/[-_]/g, ' ')
  return [
    ...(routes.pages ? [{ key: 'pages', label: 'Pages' }] : []),
    ...(routes.posts ? sections.map(sec => ({ key: sec, label: `${cap(sec)} posts`, section: sec })) : []),
    ...(['categories', 'tags'] as const).filter(t => routes[t]).map(t => ({ key: t as string, label: cap(t) })),
    ...Object.keys(routes.collections ?? {}).map(k => ({ key: k, label: cap(k) })),
    ...(routes.extra?.length ? [{ key: 'other', label: `Pages built into the site, not in Content (${routes.extra.slice(0, 4).join(', ')}${routes.extra.length > 4 ? ', …' : ''})` }] : [])
  ]
}

export async function seoSitemap(url: URL, db: D1Database, routes: SitemapRoutes): Promise<Response | null> {
  // Names other systems use (Yoast/WordPress), which crawlers and sitemap checkers try: the real index.
  if (/^\/(sitemap_index|sitemap-index|wp-sitemap|sitemap\.xml\.gz|sitemap1)\.xml$|^\/sitemap\.xml\.gz$/.test(url.pathname)) return Response.redirect(new URL('/sitemap.xml', url).href, 301)
  const m = url.pathname.match(/^\/sitemap(?:-([a-z0-9_-]+))?\.xml$/)
  if (!m) return null
  const xml = (body: string) => new Response(XML_HEAD + body, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
  const s = await seoSettings(db)
  // Only the parts this site offers and the owner left switched on (SEO › Indexing).
  const parts = sitemapParts(routes, await postSections(db))
  // "posts" switched off by an older version counts as every post section off.
  const enabled = parts.filter(p => !s.sitemapOff.includes(p.key) && !(p.section && s.sitemapOff.includes('posts'))).map(p => p.key)
  const sectionOf = new Map(parts.filter(p => p.section).map(p => [p.key, p.section!]))
  // /sitemap-posts.xml (older versions listed it): all posts of the enabled sections.
  const legacyPosts = m[1] === 'posts' && !!routes.posts && parts.some(p => p.section && enabled.includes(p.key))
  if (m[1] && !enabled.includes(m[1]) && !legacyPosts) return null
  if (!m[1]) {
    const parts = enabled.map(t => `<sitemap><loc>${xesc(`${url.origin}/sitemap-${t}.xml`)}</loc></sitemap>`)
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
      const type = m[1]
      const section = sectionOf.get(type)
      const route = section || legacyPosts ? routes.posts : type === 'pages' || type === 'categories' ? routes[type] : routes.collections?.[type]
      if (route) {
        const { results } = await db.prepare(`SELECT slug, data, COALESCE(updated_at, published_at) AS t FROM documents WHERE type_id = ? AND ${PUBLISHED}${section ? ` AND COALESCE(NULLIF(json_extract(data, '$.section'), ''), 'blog') = ?` : ''} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT 50000`)
          .bind(...(section ? ['posts', section] : [legacyPosts ? 'posts' : type])).all<{ slug: string; data: string; t: number }>()
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

// ---------- IndexNow ----------
// IndexNow (indexnow.org) tells Bing, Yandex, Seznam, Naver and other engines about a new, changed or
// removed address right away, instead of waiting for the next crawl. The site proves ownership with a
// key file at /<key>.txt. After every successful admin save the public addresses of the items changed in
// the last minute are sent; SEO › Indexing has "Send all addresses now" and the last results.

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow'
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/i
interface IndexNowLog { at: number; count: number; status: number; sample: string; trigger: string }

/** The key (generated and saved on first use). The owner can paste an existing key in SEO › Indexing. */
async function indexNowKey(db: D1Database): Promise<string> {
  const s = await seoSettings(db)
  if (/^[a-zA-Z0-9-]{8,128}$/.test(s.indexNowKey)) return s.indexNowKey
  const key = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('')
  await saveSettings(db, { ...s, indexNowKey: key })
  return key
}

/** /<key>.txt answers with the key (IndexNow ownership check); null for every other path. */
export async function seoIndexNowKey(url: URL, db: D1Database): Promise<Response | null> {
  if (!/^\/[a-zA-Z0-9-]{8,128}\.txt$/.test(url.pathname)) return null
  const s = await seoSettings(db)
  if (!s.indexNowEnabled || !s.indexNowKey || url.pathname !== `/${s.indexNowKey}.txt`) return null
  return new Response(s.indexNowKey, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } })
}

async function indexNowLog(db: D1Database): Promise<IndexNowLog[]> {
  try { const r = await db.prepare("SELECT value FROM bizz_settings WHERE key = 'seo.indexnow.log'").first<{ value: string }>(); return r ? JSON.parse(r.value) : [] } catch { return [] }
}

/** Sends addresses of this host (at most 10,000 per request) and keeps the last 30 results. Nothing is
 *  sent from a local address, while IndexNow is off, or while the site is hidden from search engines. */
export async function indexNowSubmit(db: D1Database, origin: string, urls: string[], trigger: string): Promise<{ count: number; status: number }> {
  const s = await seoSettings(db)
  const host = new URL(origin).hostname
  const list = [...new Set(urls)].filter(u => { try { return new URL(u).hostname === host } catch { return false } })
  if (!s.indexNowEnabled || s.hideFromSearch || !list.length || LOCAL_HOST.test(host)) return { count: 0, status: 0 }
  const key = await indexNowKey(db)
  let status = 0
  for (let i = 0; i < list.length; i += 10_000) {
    const r = await fetch(INDEXNOW_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${origin}/${key}.txt`, urlList: list.slice(i, i + 10_000) }) }).catch(() => null)
    status = r?.status ?? 599
  }
  const log = [{ at: Date.now(), count: list.length, status, sample: list[0], trigger }, ...(await indexNowLog(db))].slice(0, 30)
  await ensureTables(db)
  await db.prepare("INSERT INTO bizz_settings (key, value, updated_at) VALUES ('seo.indexnow.log', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(JSON.stringify(log), Date.now()).run()
  return { count: list.length, status }
}

const indexNowSent = new Map<string, number>()
let updatedIndex = false

/** After a successful admin save (any POST/PUT/DELETE under /admin): the public addresses of the items
 *  changed in the last minute, published or just unpublished/deleted (engines then drop them). Call it
 *  in ctx.waitUntil so the editor never waits for it. */
export async function seoIndexNowChanged(request: Request, status: number, db: D1Database): Promise<void> {
  if (request.method === 'GET' || request.method === 'HEAD' || status >= 400) return
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/admin') || LOCAL_HOST.test(url.hostname)) return
  const s = await seoSettings(db)
  if (!s.indexNowEnabled || s.hideFromSearch) return
  // An index on updated_at keeps this a short range read instead of a scan of every document (once per isolate).
  if (!updatedIndex) { await db.prepare('CREATE INDEX IF NOT EXISTS idx_documents_updated_at ON documents(updated_at)').run().catch(() => null); updatedIndex = true }
  const since = Math.floor(Date.now() / 1000) - 60
  const { results } = await db.prepare(`SELECT type_id, slug, data, updated_at FROM documents INDEXED BY idx_documents_updated_at
    WHERE updated_at >= ? AND tenant_id = 'default' AND type_id <> 'media_asset' ORDER BY updated_at DESC LIMIT 200`).bind(since).all<{ type_id: string; slug: string; data: string; updated_at: number }>()
  const urls: string[] = []
  for (const r of results) {
    let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data) } catch { /* empty */ }
    if (d.noindex === true || d.noindex === 'true') continue
    const p = publicPath(r.type_id, d, r.slug ?? ''); if (!p) continue
    const u = abs(url.origin, p)
    if (!u || indexNowSent.get(u) === r.updated_at) continue
    indexNowSent.set(u, r.updated_at); urls.push(u)
  }
  if (indexNowSent.size > 2000) indexNowSent.clear()
  if (urls.length) await indexNowSubmit(db, url.origin, urls, 'save')
}

/** Every address in the sitemap (all enabled parts). */
async function sitemapUrls(origin: string, db: D1Database): Promise<string[]> {
  if (!publicRoutes) return []
  const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&'))
  const index = await seoSitemap(new URL('/sitemap.xml', origin), db, publicRoutes)
  const out: string[] = []
  for (const part of index ? locs(await index.text()) : []) {
    const r = await seoSitemap(new URL(part), db, publicRoutes)
    if (r) out.push(...locs(await r.text()))
  }
  return out
}

// ---------- RSS feed ----------

const rfc822 = (t: number) => new Date(t > 1e11 ? t : t * 1000).toUTCString().replace('GMT', '+0000')
const cdata = (v: string) => `<![CDATA[${v.split(']]>').join(']]]]><![CDATA[>')}]]>`
const absolutise = (html: string, origin: string) => html.replace(/\s(src|href)="\/(?!\/)/g, ` $1="${origin}/`)

/** RSS 2.0 feeds: /feed/ (all posts) and /<section>/feed/ (blog, news). Featured image first (with the
 *  webfeedsFeaturedVisual class readers such as Feedly use) plus media:content, categories and tags,
 *  author, and the full text in content:encoded. Null for other paths or when the feed is switched off. */
export async function seoFeed(url: URL, db: D1Database, routes: SitemapRoutes | null = publicRoutes): Promise<Response | null> {
  const m = url.pathname.match(/^\/(?:(blog|news)\/)?(?:feed|rss)(?:\/|\.xml)?$/)
  if (!m || !routes?.posts) return null
  const s = await seoSettings(db)
  if (!s.feedEnabled || s.hideFromSearch) return null
  const section = m[1] ?? ''
  const site = s.siteName || url.hostname
  const where = `type_id = 'posts' AND ${PUBLISHED}${section ? ` AND COALESCE(NULLIF(json_extract(data, '$.section'), ''), 'blog') = ?` : ''}`
  const limit = Math.min(Math.max(Number(s.feedItems) || 20, 5), 100)
  const [{ results }, cats] = await Promise.all([
    db.prepare(`SELECT title, slug, data, published_at, updated_at FROM documents WHERE ${where} ORDER BY COALESCE(published_at, updated_at) DESC LIMIT ?`).bind(...(section ? [section, limit] : [limit])).all<{ title: string; slug: string; data: string; published_at: number | null; updated_at: number }>(),
    db.prepare(`SELECT root_id, title FROM documents WHERE type_id = 'categories' AND is_current_draft = 1 AND (deleted_at IS NULL OR deleted_at = '')`).all<{ root_id: string; title: string }>()
  ])
  const catName = new Map(cats.results.map(c => [c.root_id, c.title]))
  const selfUrl = `${url.origin}${url.pathname}`
  const listUrl = `${url.origin}/${section ? section + '/' : ''}`
  const title = section ? `${site} ${section === 'news' ? 'News' : 'Blog'}` : site
  const logo = s.orgLogo || s.defaultImage
  const items = results.map(r => {
    let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data) } catch { /* empty */ }
    const path = routes.posts!(d, r.slug); if (!path) return ''
    const link = abs(url.origin, path)
    const img = str(d.featuredImage) ? abs(url.origin, str(d.featuredImage)) : ''
    const alt = str(d.featuredImageAlt) || r.title
    const imgHtml = img ? `<img src="${xesc(img)}" alt="${xesc(alt)}" class="webfeedsFeaturedVisual" style="display:block;margin-bottom:5px;clear:both;max-width:100%;" />` : ''
    const content = absolutise(str(d.content) || str(d.body), url.origin)
    const summary = str(d.excerpt) || content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300)
    const footer = `<p>The post <a href="${xesc(link)}">${xesc(r.title)}</a> appeared first on <a href="${xesc(url.origin)}">${xesc(site)}</a>.</p>`
    const terms = [...(Array.isArray(d.categories) ? d.categories.map(id => catName.get(String(id))).filter(Boolean) : []), ...(Array.isArray(d.tags) ? d.tags.map(String) : [])] as string[]
    return `<item>
<title>${cdata(r.title)}</title>
<link>${xesc(link)}</link>
<dc:creator>${cdata(str(d.authorName) || s.orgName || site)}</dc:creator>
<pubDate>${rfc822(r.published_at ?? r.updated_at)}</pubDate>
${[...new Set(terms)].map(t => `<category>${cdata(t)}</category>`).join('\n')}
<guid isPermaLink="true">${xesc(link)}</guid>
<description>${cdata(`${imgHtml}<p>${xesc(summary)}</p>\n${footer}`)}</description>
${s.feedFullText ? `<content:encoded>${cdata(`${imgHtml}${content}\n${footer}`)}</content:encoded>` : ''}
${img ? `<media:content url="${xesc(img)}" medium="image"><media:description type="plain">${cdata(alt)}</media:description></media:content>` : ''}
</item>`
  }).filter(Boolean).join('\n')
  const newest = results[0] ? rfc822(results[0].published_at ?? results[0].updated_at) : new Date().toUTCString()
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:sy="http://purl.org/rss/1.0/modules/syndication/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${xesc(title)}</title>
<atom:link href="${xesc(selfUrl)}" rel="self" type="application/rss+xml" />
<link>${xesc(listUrl)}</link>
<description>${xesc(s.tagline || s.defaultDescription || site)}</description>
<lastBuildDate>${newest}</lastBuildDate>
<language>en</language>
<sy:updatePeriod>hourly</sy:updatePeriod>
<sy:updateFrequency>1</sy:updateFrequency>
${logo ? `<image><url>${xesc(abs(url.origin, logo))}</url><title>${xesc(title)}</title><link>${xesc(listUrl)}</link></image>` : ''}
${items}
</channel>
</rss>
`
  return new Response(body, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=900' } })
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
  // "Calculate missing scores" (SEO › Check): pages of 40 items by id for the browser to analyse, and the
  // scores it sends back. Updates go by primary key and leave updated_at alone (no IndexNow, no new date).
  if (path === '/admin/bizz/seo/score-batch') {
    if ((await me(request, fetcher))?.role !== 'admin') return Response.json({ error: 'Only administrators' }, { status: 403 })
    if (request.method === 'POST') {
      const origin = request.headers.get('origin'); if (origin && origin !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 })
      const body = await request.json().catch(() => null) as { scores?: { id: string; seo: number; read: number }[] } | null
      const list = (body?.scores ?? []).filter(x => typeof x.id === 'string' && Number.isFinite(x.seo) && Number.isFinite(x.read)).slice(0, 100)
      if (list.length) await db.batch(list.map(x => db.prepare(`UPDATE documents SET data = json_set(data, '$.seoScore', ?, '$.readabilityScore', ?) WHERE id = ? AND is_current_draft = 1`)
        .bind(Math.max(0, Math.min(100, Math.round(x.seo))), Math.max(0, Math.min(100, Math.round(x.read))), x.id)))
      return Response.json({ saved: list.length })
    }
    const after = new URL(request.url).searchParams.get('after') ?? ''
    const { results } = await db.prepare(`SELECT id, root_id, type_id, slug, title, data FROM documents WHERE id > ? AND is_current_draft = 1 AND tenant_id = 'default'
      AND type_id IN ('posts', 'pages', 'categories') AND (deleted_at IS NULL OR deleted_at = '') ORDER BY id LIMIT 40`).bind(after).all<{ id: string; root_id: string; type_id: string; slug: string; title: string; data: string }>()
    const items = results.map(r => { let d: Record<string, unknown> = {}; try { d = JSON.parse(r.data) } catch { /* empty */ } return { id: r.id, root: r.root_id, col: r.type_id, slug: r.slug ?? '', title: r.title ?? '', data: d, scored: d.seoScore !== undefined && d.seoScore !== null && d.seoScore !== '' } })
    return Response.json({ items, next: results.length === 40 ? results[results.length - 1].id : null }, { headers: { 'cache-control': 'no-store' } })
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
    const used = results.filter(r => r.root_id !== root?.root_id).map(r => ({ phrase: String(r.k).toLowerCase().trim(), title: r.title, root: r.root_id }))
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
      // Each tab saves only its own fields.
      const g = (k: string) => String(f.get(k) ?? '').trim()
      tab = String(f.get('tab') ?? 'general') === 'indexing' ? 'indexing' : 'general'
      const next = { ...(await seoSettings(db)) }
      if (tab === 'general') Object.assign(next, { siteName: g('siteName'), tagline: g('tagline'), defaultDescription: g('defaultDescription'), defaultImage: g('defaultImage'), orgType: g('orgType') === 'Person' ? 'Person' : 'Organization', orgName: g('orgName'), orgLogo: g('orgLogo'), sameAs: g('sameAs'), xHandle: g('xHandle').replace(/^https?:\/\/(www\.)?(x|twitter)\.com\//i, '').replace(/^@/, '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 15) })
      else Object.assign(next, {
        hideFromSearch: f.get('hideFromSearch') === 'on', robotsExtra: g('robotsExtra'), llmsText: g('llmsText'),
        sitemapOff: g('sitemap_parts').split(',').filter(k => k && f.get(`sitemap_${k}`) !== 'on'),
        feedEnabled: f.get('feedEnabled') === 'on', feedItems: Math.min(Math.max(Number(g('feedItems')) || 20, 5), 100), feedFullText: g('feedFullText') !== 'summary',
        aiSearch: f.get('aiSearch') === 'on', aiAgents: f.get('aiAgents') === 'on', aiTraining: f.get('aiTraining') === 'on',
        indexNowEnabled: f.get('indexNowEnabled') === 'on', indexNowKey: /^[a-zA-Z0-9-]{8,128}$/.test(g('indexNowKey')) ? g('indexNowKey') : next.indexNowKey
      })
      await saveSettings(db, next)
    } else if (action === 'indexnow-all') {
      const r = await indexNowSubmit(db, url.origin, await sitemapUrls(url.origin, db), 'all')
      return Response.redirect(new URL(`/admin/seo?tab=indexing&indexnow=${r.count}-${r.status}#indexnow`, url).toString(), 303)
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

  const tab = ['general', 'indexing', 'redirects', 'check', 'ai'].includes(url.searchParams.get('tab') ?? '') ? url.searchParams.get('tab')! : 'general'
  const s = await seoSettings(db)
  const body = await adminPage(tab, s, db, url, isAdmin)
  const base = await fetcher(new Request(new URL('/admin/dashboard', url), { headers: request.headers }))
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  return new HTMLRewriter()
    .on('main > div.grow', { element: el => { el.setInnerContent(body, { html: true }) } })
    .on('title', { element: el => { el.setInnerContent('SEO - BizzCMS') } })
    .transform(new Response(base.body, base))
}

async function indexNowFieldset(db: D1Database, s: SeoSettings, url: URL, ro: string): Promise<string> {
  const key = s.indexNowEnabled ? await indexNowKey(db) : s.indexNowKey
  const log = await indexNowLog(db)
  const sent = url.searchParams.get('indexnow')
  const [n, st] = (sent ?? '').split('-').map(Number)
  const ok = (code: number) => code === 200 || code === 202
  const answer = (code: number) => ok(code) ? 'Accepted' : code === 403 ? 'Key not valid (403)' : code === 422 ? 'Rejected (422: address or key)' : code === 429 ? 'Too many requests (429)' : `Answer ${code}`
  const result = sent ? `<p class="bizz-api-saved">${n ? `${n} addresses sent: ${answer(st)}.` : 'Nothing sent (IndexNow off, site hidden from search engines, or a local address).'}</p>` : ''
  const local = LOCAL_HOST.test(url.hostname) ? ' This is a local address: nothing is sent from here, only from the live site.' : ''
  const rows = log.slice(0, 10).map(l => `<tr><td>${new Date(l.at).toISOString().slice(0, 16).replace('T', ' ')}</td><td>${l.trigger === 'all' ? 'All addresses' : 'Saved'}</td><td>${l.count}</td><td>${answer(l.status)}</td><td><code>${e(l.sample)}</code></td></tr>`).join('')
  return `<fieldset class="bizz-seo-group" id="indexnow"><legend>IndexNow</legend>${result}
    <label class="bizz-seo-check"><input type="checkbox" name="indexNowEnabled"${s.indexNowEnabled ? ' checked' : ''}${ro}><span><strong>Tell search engines about changes right away</strong><small>When you publish, change, unpublish or delete something, its address goes to Bing, Yandex, Seznam, Naver and the other IndexNow engines within seconds. Google doesn't use IndexNow; it reads your sitemap.</small></span></label>
    <label class="bizz-seo-field"><span>IndexNow key</span><input type="text" name="indexNowKey" value="${e(key)}"${ro}><small>Created for you; the key file is at <a href="/${e(key)}.txt" target="_blank">/${e(key)}.txt</a>. Already have a key, for example from Bing Webmaster Tools? Paste it here.${local}</small></label>
    ${rows ? `<table class="bizz-seo-table"><thead><tr><th>When (UTC)</th><th>What</th><th>Addresses</th><th>Result</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table>` : '<small>Nothing sent yet.</small>'}</fieldset>`
}

async function adminPage(tab: string, s: SeoSettings, db: D1Database, url: URL, isAdmin: boolean): Promise<string> {
  const parts = sitemapParts(publicRoutes, await postSections(db))
  // The admin's standard tab bar (same markup as Settings, styled by admin.css [data-bizz-tabs]).
  const icon = (d: string) => `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const TAB_ICONS: Record<string, string> = {
    general: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    indexing: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
    redirects: '<path d="M4 12h12"/><path d="m12 6 6 6-6 6"/><path d="M20 4v16"/>',
    check: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    ai: '<path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/>'
  }
  const tabClass = (on: boolean) => `flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline ${on ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'}`
  const tabs = [['general', 'General'], ['indexing', 'Indexing'], ['redirects', 'Redirects'], ['check', 'Check'], ['ai', 'AI Discovery']]
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
      ${field('sameAs', 'Social profiles', 'One address per line: Facebook, LinkedIn, X, YouTube, GitHub…', 'textarea')}
      ${field('xHandle', 'X (Twitter) username', 'For example ingeniumwebcom (with or without @). Shown as the site and author when a page is shared on X.')}` : `
      <label class="bizz-seo-check"><input type="checkbox" name="hideFromSearch"${s.hideFromSearch ? ' checked' : ''}${ro}><span><strong>Hide the whole site from search engines</strong><small>For staging or unfinished sites. robots.txt then blocks everything and every page gets noindex.</small></span></label>
      <fieldset class="bizz-seo-group"><legend>AI crawlers</legend>
        <label class="bizz-seo-check"><input type="checkbox" name="aiSearch"${s.aiSearch !== false ? ' checked' : ''}${ro}><span><strong>AI search</strong><small>Let AI search engines index the site so answers can cite and link it (${AI_BOTS.filter(b => b.purpose === 'search').map(b => b.ua).join(', ')}). Recommended.</small></span></label>
        <label class="bizz-seo-check"><input type="checkbox" name="aiAgents"${s.aiAgents !== false ? ' checked' : ''}${ro}><span><strong>AI assistants</strong><small>Let an assistant open a page when a person asks about it (${AI_BOTS.filter(b => b.purpose === 'agents').map(b => b.ua).join(', ')}). Recommended. These fetchers often ignore robots.txt anyway.</small></span></label>
        <label class="bizz-seo-check"><input type="checkbox" name="aiTraining"${s.aiTraining === true ? ' checked' : ''}${ro}><span><strong>AI training</strong><small>Let crawlers collect the content to train AI models (${AI_BOTS.filter(b => b.purpose === 'training').map(b => b.ua).join(', ')}). Off by default. Blocking Google-Extended does not remove the site from Google's AI Overviews.</small></span></label>
        <small>Written into <a href="/robots.txt" target="_blank" rel="noopener">robots.txt</a> as a marked block plus a Content-Signal line (list version ${AI_BOTS_VERSION}). robots.txt is a request, not a lock; operators apply changes within about a day. Your Cloudflare AI bot settings can also block crawlers before they reach the site.</small></fieldset>
      ${field('robotsExtra', 'Extra robots.txt lines', 'Added to the default rules, e.g. "Disallow: /private/". Sitemap and llms.txt lines are added automatically.', 'textarea')}
      ${field('llmsText', 'llms.txt (instructions for AI assistants)', 'Plain text or Markdown at /llms.txt. Empty = the site\'s built-in text, if it has one.', 'textarea')}
      ${parts.length ? `<fieldset class="bizz-seo-group"><legend>Include in sitemap</legend><input type="hidden" name="sitemap_parts" value="${e(parts.map(p => p.key).join(','))}">
        ${parts.map(p => `<label class="bizz-seo-check"><input type="checkbox" name="sitemap_${e(p.key)}"${s.sitemapOff.includes(p.key) || (p.section && s.sitemapOff.includes('posts')) ? '' : ' checked'}${ro}><span>${e(p.label)}</span></label>`).join('')}
        <small>Unticked parts are left out of /sitemap.xml. The pages themselves stay online.</small></fieldset>` : ''}
      ${publicRoutes?.posts ? `<fieldset class="bizz-seo-group"><legend>RSS feed</legend>
        <label class="bizz-seo-check"><input type="checkbox" name="feedEnabled"${s.feedEnabled ? ' checked' : ''}${ro}><span><strong>Publish an RSS feed</strong><small>At <a href="/feed/" target="_blank">/feed/</a> (all posts) and per section, e.g. <a href="/blog/feed/" target="_blank">/blog/feed/</a>. News readers, Feedly and aggregators use it.</small></span></label>
        <label class="bizz-seo-field"><span>Posts in the feed</span><input type="number" name="feedItems" min="5" max="100" value="${s.feedItems}"${ro}></label>
        <label class="bizz-seo-field"><span>Each post shows</span><select name="feedFullText"${ro}><option value="full"${s.feedFullText ? ' selected' : ''}>Full text (with featured image)</option><option value="summary"${s.feedFullText ? '' : ' selected'}>Summary only (with featured image)</option></select></label></fieldset>` : ''}
      ${await indexNowFieldset(db, s, url, ro)}
      <p class="bizz-seo-note">Sitemap: <a href="/sitemap.xml" target="_blank">/sitemap.xml</a> · Robots: <a href="/robots.txt" target="_blank">/robots.txt</a> · <a href="/llms.txt" target="_blank">/llms.txt</a>${publicRoutes?.posts && s.feedEnabled ? ' · Feed: <a href="/feed/" target="_blank">/feed/</a>' : ''}</p>`
    content = `<form method="post" class="bizz-seo-form"><input type="hidden" name="action" value="settings"><input type="hidden" name="tab" value="${tab}">
      ${inner}${isAdmin ? '<div><button type="submit" class="bg-zinc-950">Save changes</button></div>' : '<p class="bizz-seo-note">Only administrators can change these settings.</p>'}</form>
      ${tab === 'indexing' && isAdmin && s.indexNowEnabled && !s.hideFromSearch ? `<form method="post" class="bizz-seo-inline"><input type="hidden" name="action" value="indexnow-all"><button type="submit" onclick="return confirm('Send every address in the sitemap to IndexNow now?')">Send all addresses to IndexNow now</button><small class="bizz-seo-note">Once after going live or after big changes. New and changed items are sent automatically when you save.</small></form>` : ''}`
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
  } else if (tab === 'ai') {
    content = aiDiscoveryTab({ policy: aiPolicyOf(s), hideFromSearch: s.hideFromSearch, orgName: s.orgName, orgLogo: s.orgLogo, sameAs: s.sameAs, defaultImage: s.defaultImage, defaultDescription: s.defaultDescription, llmsText: s.llmsText, indexNowEnabled: s.indexNowEnabled })
  } else {
    content = await checkTab(db)
  }
  return `<div class="bizz-seo-page"><div class="mb-8"><h1 class="text-2xl/8 font-semibold text-zinc-950 dark:text-white sm:text-xl/8">SEO</h1><p class="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">How your website appears in Google and when it is shared. Each page and post also has its own SEO panel in the editor.</p></div>
    <div class="border-b border-zinc-950/5 dark:border-white/10 bizz-seo-tabbar-page"><nav class="flex overflow-x-auto" role="tablist" aria-label="SEO sections" data-bizz-tabs>${tabs}</nav></div>${saved}${content}</div>`
}

// Scores are worked out in the browser (the same analysis as the editor), so imported or old items get their
// dots without opening each one.
function scorePanel(unscored: number, total: number): string {
  return `<div class="bizz-seo-group" style="margin-bottom:16px"><p class="bizz-seo-note" style="margin:0 0 8px">${unscored ? `<strong>${unscored} of ${total}</strong> items have no SEO score yet (scores are saved when an item is saved in the editor).` : `All ${total} items have a score.`}</p>
    <div class="bizz-seo-inline"><button type="button" data-score-all data-mode="missing"${unscored ? '' : ' disabled'}>Calculate missing scores</button><button type="button" data-score-all data-mode="all" class="bizz-seo-mini">Recalculate all</button><small data-score-progress class="bizz-seo-note"></small></div></div>
  <script>${SEO_ANALYSE_CORE}(function(){var out=document.querySelector('[data-score-progress]');
  document.querySelectorAll('[data-score-all]').forEach(function(btn){btn.addEventListener('click',function(){
    var all=btn.getAttribute('data-mode')==='all',done=0,after='',ctx=null;document.querySelectorAll('[data-score-all]').forEach(function(b){b.disabled=true});
    function stop(msg){out.textContent=msg;document.querySelectorAll('[data-score-all]').forEach(function(b){b.disabled=false})}
    function step(){fetch('/admin/bizz/seo/score-batch?after='+encodeURIComponent(after),{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){
      var scores=[];(j.items||[]).forEach(function(it){if(!all&&it.scored)return;var data=it.data||{};
        var val=function(n){if(n==='slug')return it.slug||'';if(n==='title')return String(data.title||it.title||'').trim();var v=data[n];return v==null?'':String(v).trim()};
        var d=new DOMParser().parseFromString('<div>'+(val('content')||val('body')||val('description'))+'</div>','text/html').body.firstChild;
        var c={siteName:ctx.siteName,tagline:ctx.tagline,origin:ctx.origin,used:(ctx.used||[]).filter(function(u){return u.root!==it.root})};
        var res=BizzSeo.analyse(val,d,it.col,c,data.noindex===true||data.noindex==='true');scores.push({id:it.id,seo:res.seo,read:res.read})});
      var save=scores.length?fetch('/admin/bizz/seo/score-batch',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({scores:scores})}):Promise.resolve();
      return save.then(function(){done+=scores.length;out.textContent=done+' scored…';if(j.next){after=j.next;setTimeout(step,200)}else stop(done+' items scored. Reload the page to see the dots.')})
    }).catch(function(){stop('Stopped after '+done+'. Press the button again to continue.')})}
    fetch('/admin/bizz/seo/context',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(c){ctx=c;step()}).catch(function(){stop('Could not start. Try again.')})
  })})})();</script>`
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
    // Saved from the editor form as text, from the bulk scorer as a number.
    const score = d.seoScore !== undefined && d.seoScore !== null && d.seoScore !== '' && Number.isFinite(Number(d.seoScore)) ? Number(d.seoScore) : null
    return { r, issues, score, key: d.keyContent === true }
  }).filter(x => x.issues.length || (x.score !== null && x.score < 45))
    .sort((a, b) => Number(b.key) - Number(a.key) || b.issues.length - a.issues.length)
  const dot = (n: number | null) => `<span class="bizz-seo-dot ${n === null ? 'is-none' : n >= 70 ? 'is-good' : n >= 45 ? 'is-ok' : 'is-bad'}" title="${n === null ? 'Not analysed yet: open and save it once' : `SEO score ${n}`}"></span>`
  const label: Record<string, string> = { posts: 'Post', pages: 'Page', categories: 'Category' }
  const unscored = items.filter(x => x.d.seoScore === undefined || x.d.seoScore === null || x.d.seoScore === '').length
  return `${scorePanel(unscored, items.length)}<p class="bizz-seo-note">${rows.length ? `${rows.length} of ${items.length} items need attention. Key content first.` : `All ${items.length} items look good.`} Open an item and use <strong>Auto-fill SEO</strong> in its SEO panel to fix most of these in one click.</p>
    <table class="bizz-seo-table"><thead><tr><th></th><th>Title</th><th>Type</th><th>To fix</th></tr></thead><tbody>
    ${rows.slice(0, 500).map(x => `<tr><td>${dot(x.score)}</td><td><a href="/admin/content/${e(x.r.id)}/edit">${e(x.r.title || '(no title)')}</a>${x.key ? ' <span class="bizz-seo-key">Key</span>' : ''}</td><td>${label[x.r.type_id] ?? x.r.type_id}</td><td>${x.issues.map(i => `<span class="bizz-seo-issue">${e(i)}</span>`).join('')}</td></tr>`).join('')}
    </tbody></table>`
}
