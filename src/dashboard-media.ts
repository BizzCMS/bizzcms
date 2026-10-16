// Dashboard: Media Files count and size. Upstream still reads its old `media` table, which new installs
// no longer fill (uploads are `media_asset` documents), so the dashboard showed 0 files and "0 B" with a
// full Media library. Correct the two numbers in upstream's own HTML fragments from the documents table.
export async function withMediaUsage(response: Response, path: string, db: D1Database, url?: URL): Promise<Response> {
  if (path === '/admin/media' && url) return withMediaPager(response, url, db)
  if (path !== '/admin/dashboard/stats' && path !== '/admin/dashboard/storage') return response
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/html')) return response
  const row = await db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(q_media_size), 0) AS size FROM documents WHERE type_id = 'media_asset' AND is_current_draft = 1 AND deleted_at IS NULL`)
    .first<{ n: number; size: number }>().catch(() => null)
  if (!row) return response
  let html = await response.text()
  if (path === '/admin/dashboard/stats') {
    html = html.replace(/(Media Files<\/dt>[\s\S]*?text-2xl font-semibold[^"]*">\s*)\d+/, `$1${row.n}`)
  } else {
    html = html.replace(/(Media Files[\s\S]*?<dd[^>]*>)[^<]*?( \/ )/, `$1${formatBytes(row.size)}$2`)
  }
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(html, { status: response.status, headers })
}

// Media library pager. Upstream shows only "Previous · Page N · Next", never the total, and hides the whole pager on the
// last page (no way back). Replace it with: "Showing 49–72 of 1,234", first/previous, page numbers around the current
// one, next/last. Same filters (folder, type, search) and page size (24) as upstream's list.
const MEDIA_PAGE = 24
async function withMediaPager(response: Response, url: URL, db: D1Database): Promise<Response> {
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/html')) return response
  const folder = url.searchParams.get('folder') || 'all', type = url.searchParams.get('type') || 'all', search = (url.searchParams.get('search') ?? '').trim()
  const where = ["type_id = 'media_asset' AND tenant_id = 'default' AND is_current_draft = 1 AND deleted_at IS NULL"]
  const binds: unknown[] = []
  if (folder !== 'all') { where.push('q_media_folder = ?'); binds.push(folder) }
  if (type === 'images') where.push("q_media_mime LIKE 'image/%'")
  else if (type === 'videos') where.push("q_media_mime LIKE 'video/%'")
  else if (type === 'documents') where.push("q_media_mime IN ('application/pdf', 'text/plain', 'application/msword')")
  if (search) {
    where.push("(json_extract(data, '$.filename') LIKE ? OR json_extract(data, '$.originalName') LIKE ? OR json_extract(data, '$.alt') LIKE ?)")
    binds.push(`%${search}%`, `%${search}%`, `%${search}%`)
  }
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE ${where.join(' AND ')}`).bind(...binds).first<{ n: number }>().catch(() => null)
  if (!row) return response
  const total = row.n, pages = Math.max(1, Math.ceil(total / MEDIA_PAGE))
  const page = Math.min(pages, Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1))
  const href = (p: number) => { const u = new URL(url); u.searchParams.set('page', String(p)); return `${u.pathname}?${u.searchParams}`.replace(/&/g, '&amp;') }
  const btn = 'rounded-lg bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-semibold text-zinc-950 dark:text-white ring-1 ring-inset ring-zinc-950/10 dark:ring-white/10 hover:bg-zinc-50 dark:hover:bg-zinc-700'
  const on = 'rounded-lg bg-zinc-950 dark:bg-white px-3 py-2 text-sm font-semibold text-white dark:text-zinc-950'
  const off = 'rounded-lg px-3 py-2 text-sm font-semibold text-zinc-400 dark:text-zinc-600 ring-1 ring-inset ring-zinc-950/5 dark:ring-white/5'
  const link = (p: number, label: string, title: string, enabled: boolean) => enabled ? `<a href="${href(p)}" class="${btn}" title="${title}" aria-label="${title}">${label}</a>` : `<span class="${off}" aria-hidden="true">${label}</span>`
  const numbers: string[] = []
  let last = 0
  for (let p = 1; p <= pages; p++) {
    if (p !== 1 && p !== pages && Math.abs(p - page) > 2) continue
    if (last && p - last > 1) numbers.push('<span class="px-1 py-2 text-sm text-zinc-500">…</span>')
    numbers.push(p === page ? `<span class="${on}" aria-current="page">${p}</span>` : `<a href="${href(p)}" class="${btn}">${p}</a>`)
    last = p
  }
  const from = total ? (page - 1) * MEDIA_PAGE + 1 : 0, to = Math.min(total, page * MEDIA_PAGE)
  const fmt = (n: number) => n.toLocaleString('en-GB')
  const pager = `<!-- Pagination --><div class="mt-6 flex flex-wrap items-center justify-between gap-3 bizz-media-pager">
    <p class="text-sm text-zinc-500 dark:text-zinc-400">Showing <strong class="text-zinc-950 dark:text-white">${fmt(from)}–${fmt(to)}</strong> of <strong class="text-zinc-950 dark:text-white">${fmt(total)}</strong> files</p>
    ${pages > 1 ? `<nav class="flex flex-wrap items-center gap-2" aria-label="Pages">${link(1, '«', 'First page', page > 1)}${link(page - 1, '‹', 'Previous page', page > 1)}${numbers.join('')}${link(page + 1, '›', 'Next page', page < pages)}${link(pages, '»', 'Last page', page < pages)}</nav>` : ''}</div>`
  const html = await response.text()
  // Upstream's block: the comment and, when it shows one, its pager (two divs: wrapper and button row).
  const replaced = html.replace(/<!-- Pagination -->\s*(?:<div class="mt-6 flex justify-center">\s*<div class="flex space-x-2">[\s\S]*?<\/div>\s*<\/div>)?/, pager)
  if (replaced === html) return new Response(html, response)
  const headers = new Headers(response.headers)
  headers.delete('content-length')
  return new Response(replaced, { status: response.status, headers })
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`
}
