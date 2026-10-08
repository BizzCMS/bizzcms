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

// Sidebar: Blog and News under Workspace, right after Content, with counts. Built in the browser by
// cloning the sidebar's own Collections link, so they look exactly like the other entries (desktop and
// mobile sidebar). News only shows when the site has news posts; Blog when it has any posts.
export const SIDEBAR_SECTIONS_SCRIPT = `<script>(function(){
var ICON={blog:'<path d="M12 20h9"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.4 18.6 3 20l1.4-4.4Z"/>',news:'<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-4 0v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8"/><path d="M15 18h-5"/><path d="M10 6h8v4h-8Z"/>'};
var LABEL={blog:'Blog',news:'News'};
var qs=new URLSearchParams(location.search),cur=location.pathname==='/admin/content'&&qs.get('model')==='posts'?qs.get('section'):null;
var KEY='bizz:section-counts';
function render(counts){var total=Object.keys(counts).reduce(function(a,k){return a+counts[k]},0);if(!total)return;
  document.querySelectorAll('nav a[href="/admin/content"]').forEach(function(content){
    var nav=content.closest('nav'),tpl=nav&&nav.querySelector('a[href="/admin/collections"]');if(!tpl)return;
    var done=nav.querySelectorAll('[data-bizz-section]');
    if(done.length){done.forEach(function(a){var b=a.querySelector('.bizz-nav-count');if(b)b.textContent=(counts[a.getAttribute('data-bizz-section')]||0).toLocaleString('en-GB')});return}
    var after=content;['blog','news'].forEach(function(s){if(s==='news'&&!counts.news)return;
      var a=tpl.cloneNode(true);a.setAttribute('href','/admin/content?model=posts&section='+s);a.setAttribute('data-bizz-section',s);a.removeAttribute('data-current');a.removeAttribute('aria-current');
      var svg=a.querySelector('svg');if(svg)svg.innerHTML=ICON[s];var t=a.querySelector('.truncate')||a.lastElementChild;if(t)t.textContent=LABEL[s];
      var b=document.createElement('span');b.className='bizz-nav-count';b.textContent=(counts[s]||0).toLocaleString('en-GB');a.appendChild(b);
      if(cur===s){a.className=content.className;a.setAttribute('data-current','true');a.setAttribute('aria-current','page');var ic=a.querySelector('span');var cic=content.querySelector('span');if(ic&&cic)ic.className=cic.className;
        content.className=tpl.className;content.removeAttribute('data-current');var ci=content.querySelector('span');var ti=tpl.querySelector('span');if(ci&&ti)ci.className=ti.className}
      after.after(a);after=a});
  });
}
// Draw straight away from the last known counts (no jump while the sidebar loads), then refresh them.
var cached=null;try{cached=JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){}
function start(){if(cached)render(cached);
fetch('/admin/bizz/taxonomy?sections=1',{credentials:'same-origin'}).then(function(r){return r.ok?r.json():null}).catch(function(){return null}).then(function(d){
  if(!d||!d.sections)return;try{localStorage.setItem(KEY,JSON.stringify(d.sections))}catch(e){}render(d.sections)});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();</script>`
