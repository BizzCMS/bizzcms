// MCP: an optional publish date on create_<type> and publish_<type>, and a cache renewal after MCP writes.
// - tools/list: create_* and publish_* list a `publishedAt` argument.
// - tools/call: `publishedAt` (ISO 8601 date or date-time, or unix seconds) is checked (valid, not in the
//   future), taken out before the engine sees the call, and written to published_at once the call succeeded.
//   On create without publish it goes on the draft, and the first publish keeps it (src/publish-date.ts).
//   A date without a time is taken as 12:00 UTC, so it shows the same day in every time zone.
//   Without the argument nothing changes: a first publish gets now, a re-publish keeps its date.
// - Successful create/update/publish/delete calls answer with the CONTENT_CHANGED header, so edgeCached()
//   renews the edge cache (sitemaps and feeds included), as a save in the admin does.
//   if (path === '/mcp' && request.method === 'POST') return mcpWithPublishDate(request, db, upstream)
import { CONTENT_CHANGED } from './edge-cache'

export const PUBLISH_DATE_ARG = 'publishedAt'
const WRITE = /^(create|update|publish|delete)_/
const DATED = /^(create|publish)_/
const DESCRIPTION = 'Optional publish date, for example 2016-03-15 or 2016-03-15T09:30:00Z (ISO 8601), or unix seconds. Not in the future. A date alone means 12:00 UTC. Leave it out to publish now (a re-publish keeps the original date).'

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: unknown; arguments?: Record<string, unknown> } }

/** Unix seconds for a publish date, or an error message. */
export function parsePublishDate(value: unknown, now = Date.now()): number | string {
  let ms = NaN
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()))) {
    const n = Number(value)
    if (Number.isInteger(n) && n > 0 && n < 1e11) ms = n * 1000
  } else if (typeof value === 'string') {
    const s = value.trim()
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
    if (m) {
      ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12)
      const d = new Date(ms)
      if (d.getUTCFullYear() !== Number(m[1]) || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) ms = NaN
    } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s)) {
      ms = Date.parse(s)
    }
  }
  if (!Number.isFinite(ms)) return `${PUBLISH_DATE_ARG} must be an ISO 8601 date (2016-03-15), a date-time with time zone (2016-03-15T09:30:00Z) or unix seconds`
  if (ms > now + 60_000) return `${PUBLISH_DATE_ARG} cannot be in the future`
  return Math.floor(ms / 1000)
}

function jsonResponse(res: Response, body: unknown, changed: boolean): Response {
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  if (changed) headers.set(CONTENT_CHANGED, '1')
  return new Response(JSON.stringify(body), { status: res.status, headers })
}

export async function mcpWithPublishDate(request: Request, db: D1Database, upstream: (r: Request) => Promise<Response>): Promise<Response> {
  const text = await request.text()
  const forward = (body: string) => {
    const headers = new Headers(request.headers)
    headers.delete('content-length')
    return upstream(new Request(request.url, { method: 'POST', headers, body }))
  }
  let rpc: Rpc
  try { rpc = JSON.parse(text) } catch { return forward(text) }
  if (!rpc || typeof rpc !== 'object' || Array.isArray(rpc)) return forward(text)

  const name = rpc.method === 'tools/call' && typeof rpc.params?.name === 'string' ? rpc.params.name : ''
  let date: number | null = null
  const args = rpc.params?.arguments
  if (name && args && typeof args === 'object' && PUBLISH_DATE_ARG in args) {
    const raw = args[PUBLISH_DATE_ARG]
    delete args[PUBLISH_DATE_ARG]
    if (DATED.test(name) && raw !== null && raw !== undefined && raw !== '') {
      const parsed = parsePublishDate(raw)
      if (typeof parsed === 'string') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: rpc.id ?? null, error: { code: -32602, message: parsed } }), { headers: { 'content-type': 'application/json' } })
      }
      date = parsed
    }
  }

  const res = await forward(JSON.stringify(rpc))
  if (!res.ok) return res

  if (rpc.method === 'tools/list') {
    const json = await res.json().catch(() => null) as { result?: { tools?: { name: string; inputSchema?: { properties?: Record<string, unknown> } }[] } } | null
    if (!json?.result?.tools) return jsonResponse(res, json, false)
    for (const tool of json.result.tools) {
      if (DATED.test(tool.name) && tool.inputSchema?.properties) tool.inputSchema.properties[PUBLISH_DATE_ARG] = { type: 'string', description: DESCRIPTION }
    }
    return jsonResponse(res, json, false)
  }

  if (!name || !WRITE.test(name)) return res
  const json = await res.json().catch(() => null) as { result?: { isError?: boolean; content?: { type: string; text: string }[] } } | null
  if (!json?.result || json.result.isError) return jsonResponse(res, json, false)
  if (date !== null) {
    const content = json.result.content?.[0]
    let doc: { id?: string; rootId?: string; publishedAt?: number | null } | null = null
    try { doc = content ? JSON.parse(content.text) : null } catch { doc = null }
    if (doc?.rootId && doc.id) {
      // The returned version, plus every version that was already published (keeps "first published" consistent).
      await db.prepare('UPDATE documents SET published_at = ? WHERE root_id = ? AND (id = ? OR published_at IS NOT NULL)').bind(date, doc.rootId, doc.id).run()
      doc.publishedAt = date
      if (content) content.text = JSON.stringify(doc, null, 2)
    }
  }
  return jsonResponse(res, json, true)
}
