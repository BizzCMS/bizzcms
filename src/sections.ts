// Posts list divided by section (Blog | News) in the admin, so staff with thousands of posts open the
// part they work on. Upstream's content list can only filter by collection, status and title, so for
// /admin/content?model=posts&section=blog|news this request's database handle adds one condition to
// the list and count queries (nothing else is touched; every other request gets the real database).
// The page then gets All / Blog / News tabs with counts, page links keep the section, and "New post"
// from the News tab opens the editor with Section = News (TAXONOMY_SCRIPT reads ?section=).

export const SECTIONS = ['blog', 'news'] as const
type Section = (typeof SECTIONS)[number]
const LABEL: Record<Section, string> = { blog: 'Blog', news: 'News' }
// Posts without a section count as blog (older posts and sites that never used sections).
const SECTION_SQL = `COALESCE(NULLIF(json_extract(data, '$.section'), ''), 'blog')`

function sectionOf(request: Request, path: string): Section | null {
  if (path !== '/admin/content' || request.method !== 'GET') return null
  const url = new URL(request.url)
  const s = url.searchParams.get('section')
  return url.searchParams.get('model') === 'posts' && (SECTIONS as readonly string[]).includes(s ?? '') ? (s as Section) : null
}

/** The env to hand to upstream for this request: a database that filters the posts list by section. */
export function envForSection<E>(env: E, request: Request, path: string): E {
  const section = sectionOf(request, path)
  if (!section) return env
  const db = (env as unknown as { DB: D1Database }).DB
  const marker = 'AND type_id = ? AND is_current_draft = 1'
  const filtered = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') {
        return (sql: string) => target.prepare(/FROM documents WHERE tenant_id = \? AND type_id = \? AND is_current_draft = 1/.test(sql)
          ? sql.replace(marker, `${marker} AND ${SECTION_SQL} = '${section}'`) : sql)
      }
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  return { ...(env as object), DB: filtered } as E
}

/** Adds the All / Blog / News tabs to the posts list and keeps the section in its links. */
export async function withSectionTabs(response: Response, request: Request, path: string, db: D1Database): Promise<Response> {
  if (path !== '/admin/content' || request.method !== 'GET' || !response.headers.get('content-type')?.includes('text/html')) return response
  const url = new URL(request.url)
  if (url.searchParams.get('model') !== 'posts') return response
  const current = sectionOf(request, path)
  const { results } = await db.prepare(`SELECT ${SECTION_SQL} AS section, COUNT(*) AS n FROM documents WHERE tenant_id = 'default' AND type_id = 'posts' AND is_current_draft = 1 AND deleted_at IS NULL GROUP BY 1`)
    .all<{ section: string; n: number }>().catch(() => ({ results: [] as { section: string; n: number }[] }))
  const count = (s?: Section) => results.filter(r => !s || r.section === s).reduce((a, r) => a + r.n, 0)
  const fmt = (n: number) => n.toLocaleString('en-GB')
  const href = (s?: Section) => { const u = new URL(url); u.searchParams.delete('page'); if (s) u.searchParams.set('section', s); else u.searchParams.delete('section'); return u.pathname + u.search }
  const tab = (s: Section | undefined, label: string) => `<a href="${href(s).replace(/&/g, '&amp;')}" class="bizz-section-tab${(s ?? null) === current ? ' is-on' : ''}"${(s ?? null) === current ? ' aria-current="page"' : ''}>${label} <span>${fmt(count(s))}</span></a>`
  const tabs = `<nav class="bizz-section-tabs" aria-label="Posts by section">${tab(undefined, 'All posts')}${SECTIONS.map(s => tab(s, LABEL[s])).join('')}</nav>`
  const keep = (v: string | null) => (current && v && v.startsWith('/admin/content?') && !/[?&]section=/.test(v) && /[?&]model=posts/.test(v) ? `${v}&section=${current}` : v)
  return new HTMLRewriter()
    .on('#content-list', { element(el) { el.before(tabs, { html: true }) } })
    .on('a[href^="/admin/content?"]', { element(el) { const v = keep(el.getAttribute('href')); if (v) el.setAttribute('href', v) } })
    .on('option[value^="/admin/content?"]', { element(el) { const v = keep(el.getAttribute('value')); if (v) el.setAttribute('value', v) } })
    .on('a[href="/admin/content/new?collection=posts"]', { element(el) { if (current) el.setAttribute('href', `/admin/content/new?collection=posts&section=${current}`) } })
    .transform(response)
}

/** Post counts per section for the sidebar (served with GET /admin/bizz/taxonomy?sections=1). */
export async function sectionCounts(db: D1Database): Promise<Record<string, number>> {
  const { results } = await db.prepare(`SELECT ${SECTION_SQL} AS section, COUNT(*) AS n FROM documents WHERE tenant_id = 'default' AND type_id = 'posts' AND is_current_draft = 1 AND deleted_at IS NULL GROUP BY 1`)
    .all<{ section: string; n: number }>().catch(() => ({ results: [] as { section: string; n: number }[] }))
  return Object.fromEntries(results.map(r => [r.section, r.n]))
}

// Sidebar: Blog and News (and any collection a site pins, e.g. Portfolio) under Workspace, right after
// Content, with counts. Rendered by the server into every admin page (src/branding.ts), so the sidebar is
// complete on the first paint and nothing jumps.
// Counts: primeSidebarCounts(db, kv) once per admin request (src/index.ts). They are kept in KV
// (CACHE_KV, key below) and in the Worker for 15 seconds, so the sidebar never waits on a COUNT query;
// clearSidebarCounts(kv) after any content save or delete makes the next page count again.
// News only shows when the site has news posts; Blog when it has any posts; a pinned collection always.
export interface PinnedCollection { name: string; label: string; icon?: string }
let pinned: PinnedCollection[] = []
/** Collections a site shows as their own sidebar entries (after Blog / News), e.g. [{ name: 'portfolio', label: 'Portfolio' }]. */
export function setSidebarCollections(list: PinnedCollection[]) { pinned = list }

const COUNTS_KEY = 'bizz:sidebar-counts:v1'
let sidebarCounts: { at: number; counts: Record<string, number> } | null = null

async function countAll(db: D1Database): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const [k, n] of Object.entries(await sectionCounts(db))) counts[`section:${k}`] = n
  if (pinned.length) {
    const { results } = await db.prepare(`SELECT type_id, COUNT(*) AS n FROM documents WHERE tenant_id = 'default' AND is_current_draft = 1 AND deleted_at IS NULL AND type_id IN (${pinned.map(() => '?').join(',')}) GROUP BY type_id`)
      .bind(...pinned.map(c => c.name)).all<{ type_id: string; n: number }>().catch(() => ({ results: [] as { type_id: string; n: number }[] }))
    for (const r of results) counts[`collection:${r.type_id}`] = r.n
  }
  return counts
}

export async function primeSidebarCounts(db: D1Database, kv?: KVNamespace): Promise<void> {
  if (sidebarCounts && Date.now() - sidebarCounts.at < 15_000) return
  try {
    const cached = kv ? await kv.get<Record<string, number>>(COUNTS_KEY, 'json').catch(() => null) : null
    if (cached) { sidebarCounts = { at: Date.now(), counts: cached }; return }
    const counts = await countAll(db)
    sidebarCounts = { at: Date.now(), counts }
    if (kv) await kv.put(COUNTS_KEY, JSON.stringify(counts), { expirationTtl: 86400 }).catch(() => null)
  } catch { /* keep the last counts */ }
}

/** Forget the counts (call after content is created, saved or deleted). */
export async function clearSidebarCounts(kv?: KVNamespace): Promise<void> {
  sidebarCounts = null
  if (kv) await kv.delete(COUNTS_KEY).catch(() => null)
}

const NAV_ICON: Record<string, string> = {
  blog: '<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6 3 20l1.4-4.4Z"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8Z"/>',
  collection: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
}
// The sidebar's own classes for an inactive entry (same as Collections, Users, …).
const NAV_LINK = 'flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm/5 font-medium text-zinc-950 hover:bg-zinc-950/5 dark:text-white dark:hover:bg-white/5'
const NAV_ICON_SPAN = 'shrink-0 fill-zinc-500 dark:fill-zinc-400'
const escAttr = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** The Blog / News / pinned entries (HTML) to place after the sidebar's Content link; '' when there are none. */
export function sidebarSectionsHtml(): string {
  const counts = sidebarCounts?.counts ?? {}
  const fmt = (n: number) => n.toLocaleString('en-GB')
  const entry = (key: string, href: string, label: string, icon: string, n: number) => `<a href="${href}" class="${NAV_LINK}" data-bizz-section="${escAttr(key)}"><span class="${NAV_ICON_SPAN}"><svg class="h-5 w-5 bizz-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg></span><span class="truncate">${escAttr(label)}</span><span class="bizz-nav-count">${fmt(n)}</span></a>`
  const posts = SECTIONS.reduce((a, s) => a + (counts[`section:${s}`] ?? 0), 0)
  const items = [
    ...(posts ? SECTIONS.filter(s => s !== 'news' || (counts['section:news'] ?? 0) > 0).map(s => entry(s, `/admin/content?model=posts&amp;section=${s}`, LABEL[s], NAV_ICON[s], counts[`section:${s}`] ?? 0)) : []),
    ...pinned.map(c => entry(`c-${c.name}`, `/admin/content?model=${encodeURIComponent(c.name)}`, c.label, c.icon ?? NAV_ICON.collection, counts[`collection:${c.name}`] ?? 0))
  ]
  if (!items.length) return ''
  // Runs while the page is still loading (before the first paint): marks the current entry (Blog / News on
  // their posts list, a pinned collection on its list) and Content as not current there.
  const active = `<script>(function(){var q=new URLSearchParams(location.search),m=q.get('model'),s=q.get('section'),key=null;if(location.pathname!=='/admin/content'||!m)return;if(m==='posts'&&s)key=s.replace(/[^a-z]/g,'');else if(m!=='posts')key='c-'+m.replace(/[^a-z0-9_-]/gi,'');if(!key)return;var p=document.currentScript.parentNode,a=p.querySelector('[data-bizz-section="'+key+'"]'),c=p.querySelector('a[href="/admin/content"][class*="gap-3"]');if(!a||!c)return;var ai=a.querySelector('span'),ci=c.querySelector('span');a.className=c.className;a.setAttribute('data-current','true');a.setAttribute('aria-current','page');if(ai&&ci){var t=ai.className;ai.className=ci.className;ci.className=t}c.className=${JSON.stringify(NAV_LINK)};c.removeAttribute('data-current');c.removeAttribute('aria-current')})()</script>`
  return items.join('') + active
}
