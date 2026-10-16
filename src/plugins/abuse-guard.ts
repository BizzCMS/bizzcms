// Abuse guard: script and markup are never accepted from visitors.
//
// Every POST outside Admin is checked before the site handles it. A form value with HTML tags that run or load
// something, inline event handlers or script URLs is refused, and a signed-in account that sent it is blocked
// at once: is_active = 0, all its sessions removed, cookies cleared, and the site is told (settings.notify, e.g.
// an e-mail to the team). A blocked account cannot use an old session or sign in again (the engine's sign-in
// does not look at is_active); Admin › Users switches it back on. Admin accounts are never blocked (the input is
// still refused). Pages escape everything anyway: this stops the attempt and the attacker, it is not what keeps
// pages safe.
//
// Wire it in the site's fetch handler around the site's own routes:
//   setAbuseGuard({ signIn: /^\/(account|companies)\/login\/?$/, private: /^\/(account|companies)(\/|$)/, texts, notify })
//   return withAbuseGuard(request, env.DB, req => cms.fetch(req, env, ctx), () => handle(request, env, ctx))
import { currentUser, html, portalPage, readForm, signedInCookie, type Cms, type User } from '../site-accounts'

// Real markup only (tags that run or load something, inline handlers, script URLs), so ordinary text such as
// "<3", "2 < 3", "<b>" or "bonus=5" never trips it.
const MARKUP = /<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|svg|math|img|image|video|audio|source|style|link|meta|base|form|input|button|textarea|select|body|html|head|template|details|marquee|isindex)\b|\bon(error|load|click|dblclick|mouse\w*|pointer\w*|focus\w*|blur|key\w*|submit|change|input|toggle|animation\w*|transition\w*|begin|end|unload|beforeunload|wheel|drag\w*|drop|copy|cut|paste|contextmenu|show|scroll|resize|message|hashchange|popstate)\s*=|(java|vb|live)script\s*:|data\s*:\s*text\/html|expression\s*\(|&#(x0*(3c|6a)|0*(60|106));?/i

export const hasMarkup = (value: string) => MARKUP.test(value)

export interface AbuseEvent { email: string; path: string; field: string; value: string; ip: string }
export interface AbuseGuardSettings {
  /** Paths never checked (Admin, the engine's API and auth routes, files). */
  skip: RegExp
  /** The site's sign-in form paths: a blocked e-mail is refused there. */
  signIn: RegExp
  /** Signed-in areas: an old session of a blocked account is signed out there. */
  private: RegExp
  texts: { blockedTitle: string; blockedBody: string; refusedTitle: string; refusedBody: string }
  /** Told about every blocked account (e.g. an e-mail to the team). */
  notify?: (e: AbuseEvent) => Promise<unknown>
}

let settings: AbuseGuardSettings = {
  skip: /^\/(admin|api|auth|files)(\/|$)/,
  signIn: /^\/[a-z0-9-]+\/(login|prijava)\/?$/,
  private: /^\/(account)(\/|$)/,
  texts: {
    blockedTitle: 'Account blocked',
    blockedBody: 'This account has been blocked after an attempt to enter content that is not allowed. If you think this is a mistake, please contact us.',
    refusedTitle: 'Not allowed',
    refusedBody: 'Fields may not contain HTML or scripts. Go back and enter plain text.'
  }
}

export function setAbuseGuard(s: Partial<AbuseGuardSettings>): void {
  settings = { ...settings, ...s, texts: { ...settings.texts, ...s.texts } }
}

const page = (title: string, body: string, status: number) => html(portalPage(title, `<h1>${title}</h1><p>${body}</p>`), status)
const blockedPage = () => page(settings.texts.blockedTitle, settings.texts.blockedBody, 403)
const refusedPage = () => page(settings.texts.refusedTitle, settings.texts.refusedBody, 400)

async function isBlocked(db: D1Database, id: string): Promise<boolean> {
  return (await db.prepare('SELECT is_active FROM auth_user WHERE id = ?').bind(id).first<{ is_active: number }>())?.is_active === 0
}

async function signedOut(request: Request, cms: Cms, res: Response): Promise<Response> {
  const out = new Response(res.body, res)
  const logout = await cms(new Request(new URL('/auth/logout', request.url), { method: 'POST', headers: { cookie: request.headers.get('cookie') ?? '' } })).catch(() => null)
  for (const c of logout?.headers.getSetCookie?.() ?? []) out.headers.append('set-cookie', c)
  out.headers.append('set-cookie', signedInCookie(false))
  out.headers.set('cache-control', 'no-store, private')
  return out
}

async function block(db: D1Database, user: User, request: Request, field: string, value: string): Promise<boolean> {
  const role = (await db.prepare('SELECT role FROM auth_user WHERE id = ?').bind(user.id).first<{ role: string }>())?.role
  if (role === 'admin') return false
  await db.batch([
    db.prepare('UPDATE auth_user SET is_active = 0, updated_at = ? WHERE id = ?').bind(Date.now(), user.id),
    db.prepare('DELETE FROM auth_session WHERE user_id = ?').bind(user.id)
  ])
  const path = new URL(request.url).pathname
  console.warn(`abuse-guard: blocked ${user.email} for markup in "${field}" on ${path}`)
  await settings.notify?.({ email: user.email, path, field, value: value.slice(0, 300), ip: request.headers.get('cf-connecting-ip') ?? '' }).catch(() => undefined)
  return true
}

export async function withAbuseGuard(request: Request, db: D1Database, cms: Cms, run: () => Promise<Response>): Promise<Response> {
  const url = new URL(request.url)
  if (settings.skip.test(url.pathname)) return run()
  const post = request.method === 'POST'
  const cookie = request.headers.get('cookie')
  if (!post && !(cookie && settings.private.test(url.pathname))) return run()

  if (post) {
    const form = await readForm(request.clone()).catch(() => null)
    if (form) {
      if (settings.signIn.test(url.pathname)) {
        const email = String(form.get('email') ?? '').trim().toLowerCase()
        const row = email ? await db.prepare('SELECT is_active FROM auth_user WHERE lower(email) = ?').bind(email).first<{ is_active: number }>() : null
        if (row?.is_active === 0) return blockedPage()
      }
      for (const [field, value] of form.entries()) {
        if (typeof value !== 'string' || !hasMarkup(value)) continue
        const user = cookie ? await currentUser(request, cms) : null
        if (!user) return refusedPage()
        return await block(db, user, request, field, value) ? signedOut(request, cms, blockedPage()) : refusedPage()
      }
    }
  }
  if (cookie) {
    const user = await currentUser(request, cms)
    if (user && await isBlocked(db, user.id)) return signedOut(request, cms, blockedPage())
  }
  return run()
}
