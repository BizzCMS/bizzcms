// MCP guard: nothing is ever deleted through the MCP endpoint. The engine's MCP plugin gives a writable
// collection create, update, publish AND delete tools together; content here is archived, never deleted.
// Wrap the /mcp request: delete_* calls are refused and delete_* tools are left out of tools/list, so an AI
// client never sees them. Account and ownership fields are kept out of reach with mcpPlugin({ redactFields }).
// It sits in FRONT of mcpWithExtras, so the tool list it filters already holds upload_media and the date arguments:
//
//   if (path === '/mcp' && request.method === 'POST') return mcpGuard(request, req => mcpWithExtras(req, db, upstream))

// The engine looks a tool up by its exact name; the wider match here (case, spaces) is only for safety.
const BLOCKED = /^\s*delete[_\s-]/i

type Rpc = { jsonrpc?: string; id?: unknown; method?: string; params?: { name?: string } }
const refuse = (id: unknown) => ({ jsonrpc: '2.0', id: id ?? null, error: { code: -32601, message: 'Deleting is not allowed through MCP. Archive the item in the admin instead.' } })

export async function mcpGuard(request: Request, cms: (req: Request) => Promise<Response>): Promise<Response> {
  if (request.method !== 'POST') return cms(request)
  const body = await request.clone().json().catch(() => null) as Rpc | Rpc[] | null
  if (!body) return cms(request)
  const calls = Array.isArray(body) ? body : [body]
  const blocked = calls.filter(c => c?.method === 'tools/call' && BLOCKED.test(String(c.params?.name ?? '')))
  // A batch with a delete in it is refused as a whole (simpler than splitting it, and no client needs to).
  if (blocked.length) return Response.json(Array.isArray(body) ? calls.map(c => refuse(c?.id)) : refuse(body.id))
  const res = await cms(request)
  if (!calls.some(c => c?.method === 'tools/list') || !res.headers.get('content-type')?.includes('json')) return res
  const out = await res.json().catch(() => null) as { result?: { tools?: { name: string }[] } } | { result?: { tools?: { name: string }[] } }[] | null
  if (!out) return res
  for (const r of Array.isArray(out) ? out : [out]) if (r?.result?.tools) r.result.tools = r.result.tools.filter(t => !BLOCKED.test(t.name))
  const headers = new Headers(res.headers)
  headers.delete('content-length')
  return new Response(JSON.stringify(out), { status: res.status, headers })
}
