// Calls SonicJS so that its work always finishes, even when the visitor goes away mid-request.
// SonicJS keeps some start-up state per Worker isolate as one shared promise (for example its cache of
// the documents table columns, filled during start-up). If the request that starts it is cancelled
// (tab closed, link clicked again, a timeout), Cloudflare drops that request's I/O, the promise never
// settles, and every later admin, sign-in and API request on that isolate waits for it until it is
// cancelled after about 20 seconds. waitUntil keeps the request alive until SonicJS is done, so the
// shared promise always settles.
export function finishUpstream<T>(ctx: ExecutionContext, work: Promise<T> | T): Promise<T> {
  const p = Promise.resolve(work)
  ctx.waitUntil(p.then(() => undefined, () => undefined))
  return p
}
