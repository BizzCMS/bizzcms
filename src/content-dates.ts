// Content lists (Admin › Content): a Created column next to Updated, and sorting by either across all pages.
// The engine always sorts by "last updated", so every save moved an item to the top. Now lists sort by
// Created (newest first) unless the editor picks Updated; ?sort=created|updated&dir=desc|asc.
// "Created" is the earlier of created_at and published_at, so imported posts show their original date even
// when the import itself set created_at.
//   env:    cms.fetch(request, envForContentSort(envForSection(env, request, path), request, path), ctx)
//   route:  const dates = await contentDatesRoute(request, path, db, signedIn); if (dates) return dates
//   page:   CONTENT_DATES_SCRIPT on /admin/content (applyBranding)

const LIST_SQL = /FROM documents WHERE tenant_id = \? AND type_id = \? AND is_current_draft = 1/
const ENGINE_ORDER = 'ORDER BY updated_at DESC LIMIT ? OFFSET ?'
const CREATED = 'MIN(created_at, COALESCE(published_at, created_at))'

export function contentSort(url: URL): { sort: 'created' | 'updated'; dir: 'desc' | 'asc' } {
  return { sort: url.searchParams.get('sort') === 'updated' ? 'updated' : 'created', dir: url.searchParams.get('dir') === 'asc' ? 'asc' : 'desc' }
}

/** The list query of /admin/content sorted by the chosen column. */
export function envForContentSort<E>(env: E, request: Request, path: string): E {
  if (path !== '/admin/content' || request.method !== 'GET') return env
  const { sort, dir } = contentSort(new URL(request.url))
  if (sort === 'updated' && dir === 'desc') return env
  const order = `ORDER BY ${sort === 'created' ? CREATED : 'updated_at'} ${dir.toUpperCase()}, id ${dir.toUpperCase()} LIMIT ? OFFSET ?`
  const db = (env as unknown as { DB: D1Database }).DB
  const sorted = new Proxy(db, {
    get(target, prop) {
      if (prop === 'prepare') return (sql: string) => target.prepare(LIST_SQL.test(sql) && sql.includes(ENGINE_ORDER) ? sql.replace(ENGINE_ORDER, order) : sql)
      const value = Reflect.get(target, prop, target)
      return typeof value === 'function' ? value.bind(target) : value
    }
  })
  return { ...(env as object), DB: sorted } as E
}

/** GET /admin/bizz/content/dates?ids=a,b → { id: created (seconds) } for the Created column. */
export async function contentDatesRoute(request: Request, path: string, db: D1Database, signedIn: () => Promise<boolean>): Promise<Response | null> {
  if (path !== '/admin/bizz/content/dates') return null
  if (!(await signedIn())) return Response.json({ error: 'Sign in required' }, { status: 401 })
  const ids = (new URL(request.url).searchParams.get('ids') ?? '').split(',').filter(Boolean).slice(0, 200)
  if (!ids.length) return Response.json({})
  // List rows carry the root id or a version id; answer for both.
  const marks = ids.map(() => '?').join(',')
  const { results } = await db.prepare(`SELECT id, root_id, ${CREATED} AS created FROM documents WHERE id IN (${marks}) OR (root_id IN (${marks}) AND is_current_draft = 1)`).bind(...ids, ...ids).all<{ id: string; root_id: string; created: number }>()
  const out: Record<string, number> = {}
  for (const r of results) { if (ids.includes(r.id)) out[r.id] = Number(r.created); if (ids.includes(r.root_id) && !(r.root_id in out)) out[r.root_id] = Number(r.created) }
  return Response.json(out, { headers: { 'cache-control': 'no-store' } })
}

// Adds the column and turns the Created/Updated headers into whole-list sorting (links), keeping the other
// query parameters (model, section, status, search). Plain ES5, checked with node --check.
export const CONTENT_DATES_SCRIPT = `<script>(function(){
var table=document.querySelector('#content-list table')||document.querySelector('table');if(!table)return;
var head=table.querySelector('thead tr');var dateBtn=table.querySelector('thead [data-column="formattedDate"]');if(!head||!dateBtn)return;
var dateTh=dateBtn.closest('th');var idx=[].indexOf.call(head.children,dateTh);
var url=new URL(location.href),sort=url.searchParams.get('sort')==='updated'?'updated':'created',dir=url.searchParams.get('dir')==='asc'?'asc':'desc';
function link(col){var u=new URL(location.href);u.searchParams.set('sort',col);u.searchParams.set('dir',col===sort&&dir==='desc'?'asc':'desc');u.searchParams.delete('page');return u.pathname+u.search}
function arrow(col){return col===sort?(dir==='desc'?' \\u2193':' \\u2191'):''}
var th=dateTh.cloneNode(false);th.innerHTML='<a class="bizz-sort-link flex items-center gap-x-2 hover:text-zinc-700 dark:hover:text-zinc-300" style="text-transform:none" href="'+link('created')+'" title="Sort the whole list by date created">Created'+arrow('created')+'</a>';
head.insertBefore(th,dateTh);
dateTh.innerHTML='<a class="bizz-sort-link flex items-center gap-x-2 hover:text-zinc-700 dark:hover:text-zinc-300" style="text-transform:none" href="'+link('updated')+'" title="Sort the whole list by last update">Updated'+arrow('updated')+'</a>';
var rows=[].slice.call(table.querySelectorAll('tbody tr')),ids=[];
rows.forEach(function(tr){var cb=tr.querySelector('input.row-checkbox');var cells=tr.children;var ref=cells[idx];var td=document.createElement('td');td.className=ref?ref.className:'px-4 py-4 text-sm';td.setAttribute('data-created','');if(ref)tr.insertBefore(td,ref);else tr.appendChild(td);if(cb)ids.push(cb.value);td.setAttribute('data-id',cb?cb.value:'')});
if(!ids.length)return;
fetch('/admin/bizz/content/dates?ids='+encodeURIComponent(ids.join(',')),{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(map){
  table.querySelectorAll('td[data-created]').forEach(function(td){var t=map[td.getAttribute('data-id')];if(!t)return;var d=new Date(t*1000);
    td.textContent=d.toLocaleDateString();td.title=d.toLocaleString()})}).catch(function(){})
})();</script>`
