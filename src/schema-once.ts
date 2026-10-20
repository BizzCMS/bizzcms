// Table setup ("CREATE TABLE IF NOT EXISTS", plugin rows) runs once, not on every request (2026-10-20). Before, several
// helpers re-ran their DDL on every request or every 15–30 s on every isolate: D1 write locks, slower requests, and the
// hang risk when many isolates start together.
//
// - Always: a step that succeeded is remembered in the isolate, so it runs at most once per isolate.
// - With `configureSchemaOnce({ kv, deployId })` called at the start of each request (site index.ts; deployId from the
//   Cloudflare version metadata binding CF_VERSION_METADATA.id): a step that succeeded once for this deploy is
//   remembered in KV (`bizz:schema:<name>:<deployId>`), so new isolates skip it too.
// - A failing step is not remembered and runs again next time. No shared pending promise is kept between requests
//   (a request cancelled mid-step would leave it pending forever).
let kv: KVNamespace | undefined
let deployId = ''
const done = new Set<string>()

export function configureSchemaOnce(opts: { kv?: KVNamespace; deployId?: string | null }): void {
  kv = opts.kv
  deployId = opts.deployId ?? ''
}

export async function schemaOnce(name: string, run: () => Promise<unknown>): Promise<void> {
  if (done.has(name)) return
  const key = deployId ? `bizz:schema:${name}:${deployId}` : ''
  if (kv && key) {
    try { if ((await kv.get(key)) === '1') { done.add(name); return } } catch { /* KV unavailable: run the step */ }
  }
  await run()
  done.add(name)
  if (kv && key) await kv.put(key, '1', { expirationTtl: 60 * 60 * 24 * 120 }).catch(() => {})
}
