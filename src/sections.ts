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
