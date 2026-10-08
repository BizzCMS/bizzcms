// Dashboard: Media Files count and size. Upstream still reads its old `media` table, which new installs
// no longer fill (uploads are `media_asset` documents), so the dashboard showed 0 files and "0 B" with a
// full Media library. Correct the two numbers in upstream's own HTML fragments from the documents table.
export async function withMediaUsage(response: Response, path: string, db: D1Database): Promise<Response> {
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

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`
}
