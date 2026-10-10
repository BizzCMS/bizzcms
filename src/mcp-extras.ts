// BizzCMS additions to the MCP server (POST /mcp), on top of the engine's tools:
// - Publish date: create_<collection> and publish_<collection> take an optional `publishedAt` (ISO 8601
//   date or date-time, or unix seconds; not in the future). It is checked, taken out before the engine
//   sees the call, and written to published_at once the call succeeded. On create without publish it goes
//   on the draft, and the first publish keeps it (src/publish-date.ts). A date alone means 12:00 UTC.
// - Unique slugs: create_<collection> with a slug that an existing item of that collection already uses
//   is refused, so an agent cannot make a second "gradnja" category or post.
// - upload_media: puts an image from an https link (or base64) into the media library, in the site's own
//   folder, and returns the /files/... path for featuredImage. Only for callers that may write (the tool is
//   listed when at least one create_ tool is). Safe fetch: https only, no IP addresses or internal host
//   names, at most 3 redirects (each checked), JPEG/PNG/WebP/GIF/AVIF only, 10 MB at most. The link is
//   never stored or echoed (Flux links carry a key in the query string); only `source` text is kept.
// - Successful writes answer with the CONTENT_CHANGED header, so edgeCached() renews the edge cache.
//   if (path === '/mcp' && request.method === 'POST') return mcpWithExtras(request, db, upstream, { mediaFolder: 'marko' })
import { CONTENT_CHANGED } from './edge-cache'

export const PUBLISH_DATE_ARG = 'publishedAt'
export type McpExtrasOptions = { mediaFolder?: string }
const WRITE = /^(create|update|publish|delete)_/
const DATED = /^(create|publish)_/
const MAX_BYTES = 10 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }
const DATE_DESCRIPTION = 'Optional publish date, for example 2016-03-15 or 2016-03-15T09:30:00Z (ISO 8601), or unix seconds. Not in the future. A date alone means 12:00 UTC. Leave it out to publish now (a re-publish keeps the original date).'
const UPLOAD_TOOL = {
  name: 'upload_media',
  description: 'Add an image to the media library and get its /files/... path (use it as featuredImage). Give an https image link or base64 data. JPEG, PNG, WebP, GIF or AVIF, up to 10 MB. The link itself is not stored.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', description: 'https link to the image. Not stored.' },
      base64: { type: 'string', description: 'Image bytes as base64 (instead of url).' },
      mimeType: { type: 'string', description: 'With base64: image/jpeg, image/png, image/webp, image/gif or image/avif.' },
      filename: { type: 'string', description: 'Name for the library, e.g. gradnja-kuce.jpg (ASCII).' },
      alt: { type: 'string', description: 'Alt text in the site language.' },
      caption: { type: 'string', description: 'Optional caption.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags, e.g. the category slug.' },
      source: { type: 'string', description: 'Where it comes from and the licence, e.g. "Unsplash, Ana Horvat, Unsplash License" or "AI (Flux)". Kept in the library.' }
    }
  }
}

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: unknown; arguments?: Record<string, unknown> } }
type Upstream = (r: Request) => Promise<Response>

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

/** Why a link may not be fetched, or null when it may. */
export function unsafeImageUrl(raw: string): string | null {
  let u: URL
  try { u = new URL(raw) } catch { return 'not a valid link' }
  if (u.protocol !== 'https:') return 'only https links'
  if (u.username || u.password) return 'no user name or password in the link'
  if (u.port && u.port !== '443') return 'only the standard https port'
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(':') || host.startsWith('[')) return 'no IP addresses, use a host name'
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) return 'no internal host names'
  return null
}

const rpcError = (id: unknown, code: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, error: { code, message } }), { headers: { 'content-type': 'application/json' } })
const rpcText = (id: unknown, value: unknown, isError = false, changed = false) => {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (changed) headers.set(CONTENT_CHANGED, '1')
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: id ?? null, result: { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) } }), { headers })
}

function jsonResponse(res: Response, body: unknown, changed: boolean): Response {
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  headers.set('content-type', 'application/json')
  if (changed) headers.set(CONTENT_CHANGED, '1')
  return new Response(JSON.stringify(body), { status: res.status, headers })
}

function authHeaders(request: Request): Headers {
  const h = new Headers()
  for (const k of ['authorization', 'x-api-key', 'cookie']) { const v = request.headers.get(k); if (v) h.set(k, v) }
  return h
}

/** The engine's tool list for this caller (authenticated, with its access), or null. */
async function toolsFor(request: Request, upstream: Upstream): Promise<string[] | null> {
  const headers = authHeaders(request); headers.set('content-type', 'application/json')
  const res = await upstream(new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', id: 0, method: 'tools/list' }) }))
  const json = await res.json().catch(() => null) as { result?: { tools?: { name: string }[] } } | null
  return json?.result?.tools?.map(t => t.name) ?? null
}

async function readLimited(res: Response): Promise<Uint8Array | string> {
  const declared = Number(res.headers.get('content-length') ?? '0')
  if (declared > MAX_BYTES) return 'the image is larger than 10 MB'
  if (!res.body) return 'empty answer'
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES) { await reader.cancel().catch(() => null); return 'the image is larger than 10 MB' }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let at = 0
  for (const c of chunks) { out.set(c, at); at += c.byteLength }
  return out
}

/** Image bytes and type from a link, or an error message. Never puts the link in the message. */
async function fetchImage(raw: string): Promise<{ bytes: Uint8Array; type: string } | string> {
  let url = raw
  for (let hop = 0; hop <= 3; hop++) {
    const bad = unsafeImageUrl(url)
    if (bad) return `link refused: ${bad}`
    let res: Response
    try { res = await fetch(url, { redirect: 'manual', headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' } }) } catch { return 'the image could not be downloaded' }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get('location')
      if (!next) return 'redirect without a target'
      url = new URL(next, url).toString()
      continue
    }
    if (!res.ok) return `the image could not be downloaded (HTTP ${res.status})`
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!IMAGE_TYPES[type]) return `not a supported image (${type || 'unknown type'}); use JPEG, PNG, WebP, GIF or AVIF`
    const bytes = await readLimited(res)
    return typeof bytes === 'string' ? bytes : { bytes, type }
  }
  return 'too many redirects'
}

function fromBase64(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''))
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch { return null }
}

const asciiName = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9.-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80)

async function uploadMedia(rpc: Rpc, request: Request, db: D1Database, upstream: Upstream, opts: McpExtrasOptions): Promise<Response> {
  const id = rpc.id
  const args = (rpc.params?.arguments ?? {}) as Record<string, unknown>
  const tools = await toolsFor(request, upstream)
  if (!tools) return rpcError(id, -32001, 'Unauthorized: provide a valid API key via Authorization: Bearer sk_...')
  if (!tools.some(t => t.startsWith('create_'))) return rpcText(id, 'Permission denied: no collection has MCP write access on this site', true)

  let image: { bytes: Uint8Array; type: string } | string
  if (typeof args.url === 'string' && args.url) image = await fetchImage(args.url)
  else if (typeof args.base64 === 'string' && args.base64) {
    const type = String(args.mimeType ?? '').toLowerCase()
    const bytes = fromBase64(args.base64)
    image = !IMAGE_TYPES[type] ? 'mimeType must be image/jpeg, image/png, image/webp, image/gif or image/avif' : !bytes ? 'base64 is not valid' : bytes.byteLength > MAX_BYTES ? 'the image is larger than 10 MB' : { bytes, type }
  } else image = 'give url or base64'
  if (typeof image === 'string') return rpcText(id, image, true)

  const ext = IMAGE_TYPES[image.type]
  const base = asciiName(typeof args.filename === 'string' && args.filename ? args.filename.replace(/\.[A-Za-z0-9]+$/, '') : 'image') || 'image'
  const form = new FormData()
  form.append('file', new File([image.bytes], `${base}.${ext}`, { type: image.type }))
  form.append('folder', (opts.mediaFolder || 'uploads').replace(/[^a-z0-9/_-]/gi, ''))
  const res = await upstream(new Request(new URL('/api/media/upload', request.url), { method: 'POST', headers: authHeaders(request), body: form }))
  const json = await res.json().catch(() => null) as { success?: boolean; file?: { id: string; r2_key: string; width?: number | null; height?: number | null; size?: number }; error?: string } | null
  if (!res.ok || !json?.success || !json.file) return rpcText(id, `Upload failed${json?.error ? `: ${json.error}` : ''}`, true)

  const alt = typeof args.alt === 'string' ? args.alt.slice(0, 300) : ''
  const source = typeof args.source === 'string' ? args.source.replace(/https?:\/\/\S+/g, m => m.split('?')[0]).slice(0, 300) : ''
  const caption = [typeof args.caption === 'string' ? args.caption.slice(0, 300) : '', source ? `Izvor: ${source}` : ''].filter(Boolean).join(' · ')
  const tags = Array.isArray(args.tags) ? args.tags.filter((t): t is string => typeof t === 'string').map(t => t.slice(0, 60)).slice(0, 12) : []
  await db.prepare("UPDATE documents SET data = json_set(data, '$.alt', ?, '$.caption', ?, '$.tags', json(?), '$.source', ?) WHERE root_id = ? AND type_id = 'media_asset'")
    .bind(alt, caption, JSON.stringify(tags), source, json.file.id).run()
  return rpcText(id, { id: json.file.id, path: `/files/${json.file.r2_key}`, mimeType: image.type, size: json.file.size ?? image.bytes.byteLength, width: json.file.width ?? null, height: json.file.height ?? null, alt, source }, false, true)
}

export async function mcpWithExtras(request: Request, db: D1Database, upstream: Upstream, opts: McpExtrasOptions = {}): Promise<Response> {
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
  if (name === UPLOAD_TOOL.name) return uploadMedia(rpc, request, db, upstream, opts)

  let date: number | null = null
  const args = rpc.params?.arguments
  if (name && args && typeof args === 'object' && PUBLISH_DATE_ARG in args) {
    const raw = args[PUBLISH_DATE_ARG]
    delete args[PUBLISH_DATE_ARG]
    if (DATED.test(name) && raw !== null && raw !== undefined && raw !== '') {
      const parsed = parsePublishDate(raw)
      if (typeof parsed === 'string') return rpcError(rpc.id, -32602, parsed)
      date = parsed
    }
  }

  // One slug per collection: refuse a create that would duplicate one (deleted items do not count).
  if (name.startsWith('create_') && args && typeof args === 'object') {
    const data = (args.data ?? {}) as Record<string, unknown>
    const slug = typeof args.slug === 'string' && args.slug ? args.slug : typeof data.slug === 'string' ? data.slug : ''
    if (slug) {
      const taken = await db.prepare("SELECT root_id FROM documents WHERE type_id = ? AND slug = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1").bind(name.slice(7), slug).first<{ root_id: string }>()
      if (taken) return rpcText(rpc.id, `Slug "${slug}" is already used by ${name.slice(7)} ${taken.root_id}; pick another slug or update that item`, true)
    }
  }

  const res = await forward(JSON.stringify(rpc))
  if (!res.ok) return res

  if (rpc.method === 'tools/list') {
    const json = await res.json().catch(() => null) as { result?: { tools?: { name: string; inputSchema?: { properties?: Record<string, unknown> } }[] } } | null
    const tools = json?.result?.tools
    if (!tools) return jsonResponse(res, json, false)
    for (const tool of tools) {
      if (DATED.test(tool.name) && tool.inputSchema?.properties) tool.inputSchema.properties[PUBLISH_DATE_ARG] = { type: 'string', description: DATE_DESCRIPTION }
    }
    if (tools.some(t => t.name.startsWith('create_'))) tools.push(UPLOAD_TOOL as typeof tools[number])
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
