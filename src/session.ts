// "Who is signed in?" for the admin routes, asked once per request.
// Several routes need it ("is this a signed-in person?", "is this an administrator?") and each used to send its own
// internal /auth/me request to the engine, one after the other, on every admin page load. The answer is kept per
// incoming Request (a WeakMap, gone with the request), so a request that needs it in several places pays once.
// It is never shared between requests: signing out, a revoked session or a changed role is seen on the very next request.

type Fetcher = (request: Request) => Promise<Response>

/** The signed-in person as the engine's /auth/me describes them (role is 'admin', 'editor', ...). */
export interface SessionUser { id?: string; email?: string; role?: string; [key: string]: unknown }
export interface SessionInfo { ok: boolean; user: SessionUser | null }

/** Request headers that can identify the caller; the default is the session cookie only. */
export type SessionHeaders = readonly ('cookie' | 'authorization' | 'x-api-key')[]
const COOKIE_ONLY: SessionHeaders = ['cookie']

const memo = new WeakMap<Request, Map<string, Promise<SessionInfo>>>()

/** /auth/me for this request, asked at most once per request and set of forwarded headers.
 *  `ok` is whether the engine accepted the credentials; `user` is the person (null when signed out). */
export function sessionInfo(request: Request, fetcher: Fetcher, forward: SessionHeaders = COOKIE_ONLY): Promise<SessionInfo> {
  const headers = new Headers()
  for (const h of forward) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }
  // Nothing that could identify the caller: signed out, no engine call.
  if (![...headers.keys()].length) return Promise.resolve({ ok: false, user: null })
  const key = forward.map(h => headers.get(h) ?? '').join('\n')
  let byKey = memo.get(request)
  if (!byKey) { byKey = new Map(); memo.set(request, byKey) }
  let known = byKey.get(key)
  if (!known) {
    const asked = (async (): Promise<SessionInfo> => {
      const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers }))
      if (!res.ok) return { ok: false, user: null }
      const body = await res.json().catch(() => null) as { user?: SessionUser } | null
      return { ok: true, user: body?.user ?? null }
    })()
    known = asked
    byKey.set(key, known)
    // A failed call is not remembered, so a later check in the same request can try again.
    asked.catch(() => { if (byKey!.get(key) === asked) byKey!.delete(key) })
  }
  return known
}

/** The signed-in person, or null. */
export async function sessionUser(request: Request, fetcher: Fetcher, forward?: SessionHeaders): Promise<SessionUser | null> {
  return (await sessionInfo(request, fetcher, forward)).user
}

/** True when the engine accepts the caller's credentials (same test as the old `/auth/me` response `.ok`). */
export async function isSignedIn(request: Request, fetcher: Fetcher, forward?: SessionHeaders): Promise<boolean> {
  return (await sessionInfo(request, fetcher, forward)).ok
}

/** True when the signed-in person is an administrator. */
export async function isAdminSession(request: Request, fetcher: Fetcher, forward?: SessionHeaders): Promise<boolean> {
  return (await sessionInfo(request, fetcher, forward)).user?.role === 'admin'
}
