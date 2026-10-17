// Site accounts for visitors (CMS users with the "viewer" role), shared by any public area a site builds:
// the Directory plugin's company portal, a members' area, and so on. Each area is an "audience" with
// its own base URL and wording; the account itself is the same, so one login can use several areas.
// Never grants admin. Wording and URL words default to English; a site sets its own with
// configureAccounts({ text, paths, page }).

export type Cms = (request: Request) => Promise<Response>
export interface User { id: string; email: string; firstName?: string }
export interface Audience {
  base: string // e.g. '/companies'
  loginTitle: string
  registerTitle: string
  registerIntro: string
}

export const ACCOUNT_TEXT = {
  forbidden: 'Forbidden',
  tooManyAttempts: 'Too many attempts. Please try again in a minute.',
  wrongLogin: 'Wrong e-mail or password.',
  enterName: 'Please enter your first and last name.',
  passwordShort: 'The password must have at least 8 characters.',
  acceptTerms: 'Please accept the terms of use.',
  accountExists: 'An account with this e-mail already exists. Please sign in.',
  registrationClosed: 'Registration is not open at the moment.',
  registrationFailed: 'Registration failed. Please check your details.',
  loginHeading: 'Sign in',
  email: 'E-mail',
  password: 'Password',
  signIn: 'Sign in',
  noAccount: 'No account yet?',
  registerLink: 'Register',
  registerHeading: 'Open an account',
  firstName: 'First name',
  lastName: 'Last name',
  passwordHint: 'Password (at least 8 characters)',
  terms: 'I accept the terms of use and the processing of my data.',
  createAccount: 'Open account',
  haveAccount: 'Already have an account?',
  signInLink: 'Sign in',
  // Password recovery
  forgotLink: 'Forgot your password?',
  forgotHeading: 'Forgotten password',
  forgotIntro: 'Enter the e-mail address of your account and we will send you a link to set a new password.',
  forgotSend: 'Send the link',
  forgotSent: 'If an account with this e-mail exists, we have sent a link to set a new password. The link is valid for one hour.',
  enterEmail: 'Please enter a valid e-mail address.',
  resetHeading: 'Set a new password',
  newPassword: 'New password (at least 8 characters)',
  confirmPassword: 'Repeat the new password',
  passwordsDiffer: 'The passwords do not match.',
  savePassword: 'Save the password',
  resetInvalid: 'This link is not valid any more. Request a new one.',
  backToLogin: '← Sign in',
  passwordChanged: 'Your new password is saved.',
  withGoogle: 'Continue with Google',
  or: 'or',
  googleFailed: 'Google sign-in is not available right now. Please use your e-mail and password.',
  // Photo galleries
  pickPhoto: 'Choose at least one photo.',
  tooManyPhotos: (max: number) => `At most ${max} photos.`,
  tooBig: (name: string) => `"${name}" is larger than 8 MB.`,
  notImage: (name: string) => `"${name}" is not a JPG, PNG or WebP image.`,
  coverBadge: 'Cover',
  setCover: 'Set as cover',
  removeConfirm: 'Remove this photo?',
  remove: 'Remove',
  addPhotos: (max: number) => `Add photos (JPG, PNG or WebP, up to 8 MB, at most ${max})`,
  upload: 'Upload'
}
export type AccountText = typeof ACCOUNT_TEXT

/** URL words and codes: path segments, query parameters and the notice codes shown after an action. */
export const ACCOUNT_PATHS = {
  login: 'login', register: 'register', logout: 'logout', forgot: 'forgot-password', reset: 'new-password',
  next: 'next', terms: 'terms', notice: 'notice', registered: 'registered', passwordChanged: 'password',
  photos: 'photos', photoRemove: 'remove', photoCover: 'cover',
  noticeSaved: 'saved', noticePhotos: 'photos', noticeRemoved: 'removed', noticeCover: 'cover'
}
export type AccountPaths = typeof ACCOUNT_PATHS

/** A message the site's mailer sends (`html` optional). Returns false when it could not be sent. */
export interface AccountMail { to: string; subject: string; text: string; html?: string }
/** The account e-mails a site can word and design itself; `link` is absolute. */
export interface AccountEmails {
  passwordReset: (a: Audience, link: string, name?: string) => Omit<AccountMail, 'to'>
  welcome?: (a: Audience, origin: string, name?: string) => Omit<AccountMail, 'to'>
}
const DEFAULT_EMAILS: AccountEmails = {
  passwordReset: (_a, link, name) => ({ subject: 'Set a new password',
    text: `Hello${name ? ` ${name}` : ''},\n\nopen this link to set a new password (valid for one hour):\n${link}\n\nIf you did not ask for it, ignore this e-mail; your password stays the same.` })
}

let text: AccountText = ACCOUNT_TEXT
let paths: AccountPaths = ACCOUNT_PATHS
let pageShell: (title: string, body: string) => string =
  (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${esc(title)}</title></head><body><main class="wrap portal">${body}</main></body></html>`
let mailer: ((m: AccountMail) => Promise<boolean>) | undefined
let emails: AccountEmails = DEFAULT_EMAILS
let returnPaths: RegExp | undefined
let onRegistered: ((a: Audience, user: { email: string; firstName: string; lastName: string }, origin: string) => Promise<void>) | undefined

/**
 * The site's wording, URL words and page shell (its layout, noindex) for account pages; its mailer and account
 * e-mails (without a mailer there is no password recovery); and an optional hook after each sign-up.
 */
export function configureAccounts(opts: {
  text?: Partial<AccountText>; paths?: Partial<AccountPaths>; page?: (title: string, body: string) => string
  mail?: (m: AccountMail) => Promise<boolean>; emails?: Partial<AccountEmails>
  registered?: (a: Audience, user: { email: string; firstName: string; lastName: string }, origin: string) => Promise<void>
  /** Other site paths an account page may return to after sign-in or sign-up (e.g. a company profile). */
  returnPaths?: RegExp
}) {
  if (opts.text) text = { ...ACCOUNT_TEXT, ...opts.text }
  if (opts.paths) paths = { ...ACCOUNT_PATHS, ...opts.paths }
  if (opts.page) pageShell = opts.page
  if (opts.mail) mailer = opts.mail
  if (opts.emails) emails = { ...DEFAULT_EMAILS, ...opts.emails }
  if (opts.registered) onRegistered = opts.registered
  if (opts.returnPaths) returnPaths = opts.returnPaths
}
/** Sends through the site's mailer (false when none is configured). */
export async function sendAccountMail(m: AccountMail): Promise<boolean> {
  return mailer ? mailer(m).catch(() => false) : false
}
export const accountPaths = () => paths
/** One of the account wording texts (for areas that build their own account forms). */
export const accountText = (key: keyof AccountText): string => String(text[key])

export function esc(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
export function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } })
}

// Form bodies that are missing or malformed are treated as empty forms instead of failing the request.
export async function readForm(request: Request): Promise<FormData> {
  try { return await request.formData() } catch { return new FormData() }
}

export function portalPage(title: string, body: string): string {
  return pageShell(title, body)
}

// Same-origin check for every form post (session cookies are also SameSite=Strict).
export function crossOrigin(request: Request, url: URL): Response | null {
  const origin = request.headers.get('origin')
  return request.method === 'POST' && origin && origin !== url.origin
    ? html(portalPage(text.forbidden, `<h1>${esc(text.forbidden)}</h1>`), 403) : null
}

// Internal calls to the CMS auth carry the visitor's IP so its rate limits still apply per visitor.
function forwardHeaders(request: Request, extra: Record<string, string> = {}): Headers {
  const h = new Headers(extra)
  for (const k of ['cf-connecting-ip', 'x-forwarded-for', 'x-real-ip', 'user-agent']) {
    const v = request.headers.get(k)
    if (v) h.set(k, v)
  }
  return h
}

// One request asks several times who is signed in (abuse guard, onboarding, the page itself): the answer is shared
// for that request object only, so a slow session check costs one wait, not one per caller.
const userChecks = new WeakMap<Request, Promise<User | null>>()

// Requests whose session check got no answer in time (or a server error): "signed out" there is a guess, not a fact.
const checksUnanswered = new WeakSet<Request>()
/** True when currentUser() returned null only because the session check timed out (the visitor may be signed in). */
export const sessionUnknown = (request: Request): boolean => checksUnanswered.has(request)

const SESSION_COOKIES = /(^|;\s*)(__Secure-better-auth\.session_token|better-auth\.session_token|auth_token)=[^;]/

export async function currentUser(request: Request, cms: Cms): Promise<User | null> {
  const cookie = request.headers.get('cookie')
  // Only a session cookie can make a visitor signed in; analytics or consent cookies alone never ask the CMS (that
  // check is the slowest part of a page, up to seconds on a fresh server instance).
  if (!cookie || !SESSION_COOKIES.test(cookie)) return null
  let user = userChecks.get(request)
  if (!user) { user = checkUser(request, cms, cookie); userChecks.set(request, user) }
  return user
}

async function checkUser(request: Request, cms: Cms, cookie: string): Promise<User | null> {
  // Never let a slow session check hang the page: after 4 s the visitor is treated as signed out (and it is logged,
  // with the cookie names only, so the cause can be found).
  const started = Date.now()
  const timeout = new Promise<null>(resolve => setTimeout(() => resolve(null), 4000))
  const res = await Promise.race([cms(new Request(new URL('/auth/me', request.url), { headers: forwardHeaders(request, { cookie }) })), timeout])
  const ms = Date.now() - started
  if (!res || res.status >= 500) checksUnanswered.add(request)
  if (!res || ms > 1500) console.warn(`site-accounts: /auth/me ${res ? `took ${ms} ms (status ${res.status})` : 'timed out after 4 s'}; cookies: ${cookie.split(';').map(c => c.split('=')[0].trim()).join(', ')}`)
  if (!res || !res.ok) return null
  const body = await res.json().catch(() => null) as { user?: { id?: string; email?: string; first_name?: string } } | null
  if (!body?.user?.id || !body.user.email) return null
  return { id: body.user.id, email: body.user.email.toLowerCase(), firstName: body.user.first_name }
}

/** Not secret: only tells the site's pages (which are cached for everyone) to load the visitor's account menu. */
export const SIGNED_IN_COOKIE = 'signed_in'
export const signedInCookie = (on: boolean) =>
  on ? `${SIGNED_IN_COOKIE}=1; Path=/; Max-Age=2592000; SameSite=Lax; Secure` : `${SIGNED_IN_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax; Secure`
function withCookies(target: string, from: Response, signedIn = true): Response {
  const headers = new Headers({ location: target })
  for (const c of from.headers.getSetCookie?.() ?? []) headers.append('set-cookie', c)
  headers.append('set-cookie', signedInCookie(signedIn))
  return new Response(null, { status: 303, headers })
}

// Only paths inside the audience's area are accepted as a post-login target.
function nextPath(a: Audience, value: unknown): string {
  const next = String(value ?? '')
  if (returnPaths && next.startsWith('/') && !next.startsWith('//') && returnPaths.test(next)) return next
  const base = a.base.replace(/[/-]/g, c => `\\${c}`)
  return new RegExp(`^${base}(\\/[A-Za-z0-9/_-]*)?$`).test(next) ? next : a.base
}

export function loginRedirect(a: Audience, url: URL, path: string): Response {
  return Response.redirect(`${url.origin}${a.base}/${paths.login}?${paths.next}=${encodeURIComponent(path)}`, 303)
}

async function signIn(request: Request, url: URL, cms: Cms, email: string, password: string): Promise<Response> {
  return cms(new Request(`${url.origin}/auth/login`, {
    method: 'POST', headers: forwardHeaders(request, { 'content-type': 'application/json', origin: url.origin }),
    body: JSON.stringify({ email, password })
  }))
}

// Handles <base>/<login>, <base>/<register>, <base>/<forgot>, <base>/<reset>, <base>/google and POST <base>/<logout>;
// null for other paths. `db` enables password recovery (with a mailer); `google` shows "Sign in with Google"
// (the CMS needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET).
export async function accountRoute(a: Audience, request: Request, url: URL, path: string, cms: Cms,
  opts: { db?: D1Database; google?: boolean; notices?: Record<string, string> } = {}): Promise<Response | null> {
  const post = request.method === 'POST'
  const google = !!opts.google
  const forgot = !!opts.db && !!mailer
  // Already signed in: no sign-in or sign-up form, straight on to where the visitor was going (or the area).
  if (!post && (path === `${a.base}/${paths.login}` || path === `${a.base}/${paths.register}`) && request.headers.get('cookie')
    && await currentUser(request, cms)) {
    return Response.redirect(`${url.origin}${nextPath(a, url.searchParams.get(paths.next))}`, 303)
  }
  if (path === `${a.base}/${paths.login}`) {
    const code = url.searchParams.get(paths.notice) ?? ''
    const notice = code === paths.passwordChanged ? text.passwordChanged : opts.notices?.[code]
    if (!post) return html(loginPage(a, undefined, '', nextPath(a, url.searchParams.get(paths.next)), google, forgot, notice))
    const form = await readForm(request)
    const email = String(form.get('email') ?? '').trim()
    const res = await signIn(request, url, cms, email, String(form.get('password') ?? ''))
    if (!res.ok) {
      const error = res.status === 429 ? text.tooManyAttempts : text.wrongLogin
      return html(loginPage(a, error, email, nextPath(a, form.get(paths.next)), google, forgot), res.status === 429 ? 429 : 401)
    }
    const body = await res.clone().json().catch(() => ({})) as { twoFactorRequired?: boolean }
    return withCookies(body.twoFactorRequired ? '/auth/two-factor' : nextPath(a, form.get(paths.next)), res)
  }
  if (path === `${a.base}/${paths.register}`) {
    if (!post) return html(registerPage(a, undefined, { [paths.next]: url.searchParams.get(paths.next) ?? '' }, google))
    const form = await readForm(request)
    const v = { firstName: String(form.get('firstName') ?? '').trim(), lastName: String(form.get('lastName') ?? '').trim(), email: String(form.get('email') ?? '').trim(), [paths.next]: String(form.get(paths.next) ?? '') }
    const password = String(form.get('password') ?? '')
    if (!v.firstName || !v.lastName) return html(registerPage(a, text.enterName, v, google), 400)
    if (password.length < 8) return html(registerPage(a, text.passwordShort, v, google), 400)
    if (form.get(paths.terms) !== '1') return html(registerPage(a, text.acceptTerms, v, google), 400)
    const created = await createAccount(request, url, cms, { firstName: v.firstName, lastName: v.lastName, email: v.email, password })
    if ('error' in created) return html(registerPage(a, created.error, v, google), created.status)
    const user = { firstName: v.firstName, lastName: v.lastName, email: v.email.toLowerCase() }
    if (onRegistered) await onRegistered(a, user, url.origin).catch(e => console.error('site-accounts: registered hook', e))
    if (emails.welcome) await sendAccountMail({ to: user.email, ...emails.welcome(a, url.origin, v.firstName) })
    if (!created.session) return Response.redirect(`${url.origin}${a.base}/${paths.login}`, 303)
    const back = v[paths.next] ? nextPath(a, v[paths.next]) : a.base
    return withCookies(back === a.base ? `${a.base}?${paths.notice}=${paths.registered}` : back, created.session)
  }
  if (path === `${a.base}/google` && google) {
    // The CMS (Better Auth) starts the Google sign-in: it answers with Google's address and sets a state cookie.
    // Google returns to the CMS (/auth/callback/google), which opens the session and sends the visitor back here.
    const next = nextPath(a, url.searchParams.get(paths.next))
    const res = await cms(new Request(`${url.origin}/auth/sign-in/social`, {
      method: 'POST', headers: forwardHeaders(request, { 'content-type': 'application/json', origin: url.origin }),
      body: JSON.stringify({ provider: 'google', callbackURL: `${url.origin}${next}`, errorCallbackURL: `${url.origin}${a.base}/${paths.login}`,
        newUserCallbackURL: `${url.origin}${a.base}?${paths.notice}=${paths.registered}` })
    }))
    const body = await res.clone().json().catch(() => ({})) as { url?: string }
    if (!res.ok || !body.url) return html(loginPage(a, text.googleFailed, '', next, google, forgot), 502)
    const headers = new Headers({ location: body.url })
    for (const c of res.headers.getSetCookie?.() ?? []) headers.append('set-cookie', c)
    return new Response(null, { status: 302, headers })
  }
  if (path === `${a.base}/${paths.forgot}` && forgot) {
    if (!post) return html(forgotPage(a))
    const form = await readForm(request)
    const email = String(form.get('email') ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return html(forgotPage(a, text.enterEmail, email), 400)
    await requestReset(opts.db!, a, url, email)
    return html(forgotPage(a, undefined, email, true))
  }
  if (path === `${a.base}/${paths.reset}` && opts.db) {
    const token = String(url.searchParams.get('token') ?? '')
    const user = /^[a-f0-9]{64}$/.test(token) ? await resetUser(opts.db, token) : null
    if (!user) return html(resetPage(a, token, text.resetInvalid, true), 400)
    if (!post) return html(resetPage(a, token))
    const form = await readForm(request)
    const password = String(form.get('password') ?? '')
    if (password.length < 8) return html(resetPage(a, token, text.passwordShort), 400)
    if (password !== String(form.get('confirm') ?? '')) return html(resetPage(a, token, text.passwordsDiffer), 400)
    await setPassword(opts.db, user.id, password)
    const session = await signIn(request, url, cms, user.email, password)
    if (!session.ok) return Response.redirect(`${url.origin}${a.base}/${paths.login}?${paths.notice}=${paths.passwordChanged}`, 303)
    return withCookies(`${a.base}?${paths.notice}=${paths.passwordChanged}`, session)
  }
  if (path === `${a.base}/${paths.logout}` && post) {
    const res = await cms(new Request(`${url.origin}/auth/logout`, { headers: forwardHeaders(request, { cookie: request.headers.get('cookie') ?? '' }) }))
    const out = withCookies(a.base, res, false)
    // Also expire every session cookie here: the CMS clears only "better-auth.session_token", while on https the
    // session lives in "__Secure-better-auth.session_token" (a leftover one kept visitors signed in after Odjava).
    out.headers.append('set-cookie', 'auth_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')
    out.headers.append('set-cookie', '__Secure-better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax')
    out.headers.append('set-cookie', 'better-auth.session_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax')
    return out
  }
  return null
}

/**
 * Opens an account through the CMS (role "viewer") and signs it in. Used by sign-up and by flows that create the
 * account themselves (e.g. a company activating an invitation). `session` carries the session cookies.
 */
export async function createAccount(request: Request, url: URL, cms: Cms, v: { firstName: string; lastName: string; email: string; password: string }):
  Promise<{ session?: Response } | { error: string; status: number }> {
  const res = await cms(new Request(`${url.origin}/auth/register`, {
    method: 'POST', headers: forwardHeaders(request, { 'content-type': 'application/json', origin: url.origin }),
    body: JSON.stringify({ firstName: v.firstName, lastName: v.lastName, email: v.email.toLowerCase(), password: v.password })
  }))
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string }
    const error = /already exists/i.test(body.error ?? '') ? text.accountExists
      : /disabled/i.test(body.error ?? '') ? text.registrationClosed
      : res.status === 429 ? text.tooManyAttempts
      : text.registrationFailed
    return { error, status: res.status === 429 ? 429 : 400 }
  }
  // Registration only issues a legacy token; sign in to get the session /auth/me accepts.
  const session = await signIn(request, url, cms, v.email.toLowerCase(), v.password)
  return session.ok ? { session } : {}
}
/** Signs in with e-mail and password; the response carries the session cookies when `ok` (use with redirectWithSession). */
export const signInSession = (request: Request, url: URL, cms: Cms, email: string, password: string) => signIn(request, url, cms, email, password)

/** True when the e-mail and password sign in (used to confirm the current password before a change). */
export async function verifyPassword(request: Request, url: URL, cms: Cms, email: string, password: string): Promise<boolean> {
  return !!password && (await signIn(request, url, cms, email, password)).ok
}

/** Redirect to `target` carrying the session cookies of `session` (from createAccount). */
export const redirectWithSession = (target: string, session: Response) => withCookies(target, session)

// ---------------------------------------------------------------- password recovery
// The token is kept in the CMS's own columns (auth_user.password_reset_token/_expires) and is valid for an hour.
// The new password is stored for the e-mail sign-in in the CMS's older PBKDF2 format, which the CMS accepts and
// re-hashes to its current format at the next sign-in.

const hex = (bytes: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(bytes)).map(b => b.toString(16).padStart(2, '0')).join('')
const RESET_MS = 60 * 60 * 1000

async function requestReset(db: D1Database, a: Audience, url: URL, email: string): Promise<void> {
  const user = await db.prepare(`SELECT id, email, first_name, password_reset_expires FROM auth_user WHERE lower(email) = ? AND is_active = 1`)
    .bind(email).first<{ id: string; email: string; first_name: string | null; password_reset_expires: number | null }>()
  if (!user) return
  // At most one e-mail every 5 minutes per account.
  if (user.password_reset_expires && user.password_reset_expires > Date.now() + RESET_MS - 5 * 60 * 1000) return
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  await db.prepare(`UPDATE auth_user SET password_reset_token = ?, password_reset_expires = ?, updated_at = ? WHERE id = ?`)
    .bind(token, Date.now() + RESET_MS, Date.now(), user.id).run()
  const link = `${url.origin}${a.base}/${paths.reset}?token=${token}`
  await sendAccountMail({ to: user.email, ...emails.passwordReset(a, link, user.first_name || undefined) })
}

async function resetUser(db: D1Database, token: string): Promise<{ id: string; email: string } | null> {
  const user = await db.prepare(`SELECT id, email, password_reset_expires FROM auth_user WHERE password_reset_token = ? AND is_active = 1`)
    .bind(token).first<{ id: string; email: string; password_reset_expires: number | null }>()
  return user && (user.password_reset_expires ?? 0) > Date.now() ? { id: user.id, email: user.email } : null
}

/** Sets an account's e-mail sign-in password (adds one to an account opened with Google). */
export async function setPassword(db: D1Database, userId: string, password: string): Promise<void> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iterations = 100000
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, key, 256)
  const hash = `pbkdf2:${iterations}:${hex(salt)}:${hex(bits)}`
  const now = Math.floor(Date.now() / 1000)
  const updated = await db.prepare(`UPDATE auth_account SET password = ?, updated_at = ? WHERE user_id = ? AND provider_id = 'credential'`).bind(hash, now, userId).run()
  if (!updated.meta.changes) await db.prepare(`INSERT INTO auth_account (id, user_id, account_id, provider_id, password, created_at, updated_at) VALUES (?, ?, ?, 'credential', ?, ?, ?)`)
    .bind(crypto.randomUUID(), userId, userId, hash, now, now).run()
  await db.prepare(`UPDATE auth_user SET password_reset_token = NULL, password_reset_expires = NULL, failed_login_count = 0, locked_until = NULL, updated_at = ? WHERE id = ?`)
    .bind(Date.now(), userId).run()
}

// ---------------------------------------------------------------- pages

const GOOGLE_ICON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>'
const googleButton = (a: Audience, next: string) => `<a class="btn ghost google" href="${a.base}/google?${paths.next}=${encodeURIComponent(next)}">${GOOGLE_ICON}${esc(text.withGoogle)}</a><p class="or"><span>${esc(text.or)}</span></p>`

function loginPage(a: Audience, error?: string, email = '', next = a.base, google = false, forgot = false, notice?: string): string {
  return portalPage(a.loginTitle, `<div class="auth box"><h1>${esc(text.loginHeading)}</h1>${notice ? `<p class="notice">${esc(notice)}</p>` : ''}${error ? `<p class="err">${esc(error)}</p>` : ''}
    ${google ? googleButton(a, next) : ''}
    <form method="post" action="${a.base}/${paths.login}" class="stack"><input type="hidden" name="${paths.next}" value="${esc(next)}">
      <label>${esc(text.email)}<input name="email" type="email" autocomplete="email" required value="${esc(email)}"></label>
      <label>${esc(text.password)}<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">${esc(text.signIn)}</button></form>
    ${forgot ? `<p class="muted"><a href="${a.base}/${paths.forgot}">${esc(text.forgotLink)}</a></p>` : ''}
    <p class="muted">${esc(text.noAccount)} <a href="${a.base}/${paths.register}${next !== a.base ? `?${paths.next}=${encodeURIComponent(next)}` : ''}">${esc(text.registerLink)}</a></p></div>`)
}

function registerPage(a: Audience, error?: string, v: Record<string, string> = {}, google = false): string {
  return portalPage(a.registerTitle, `<div class="auth box"><h1>${esc(text.registerHeading)}</h1>
    <p class="muted">${esc(a.registerIntro)}</p>${error ? `<p class="err">${esc(error)}</p>` : ''}
    ${google ? googleButton(a, nextPath(a, v[paths.next])) : ''}
    <form method="post" action="${a.base}/${paths.register}" class="stack">${v[paths.next] ? `<input type="hidden" name="${paths.next}" value="${esc(v[paths.next])}">` : ''}
      <div class="two"><label>${esc(text.firstName)}<input name="firstName" autocomplete="given-name" required maxlength="80" value="${esc(v.firstName ?? '')}"></label>
      <label>${esc(text.lastName)}<input name="lastName" autocomplete="family-name" required maxlength="80" value="${esc(v.lastName ?? '')}"></label></div>
      <label>${esc(text.email)}<input name="email" type="email" autocomplete="email" required maxlength="200" value="${esc(v.email ?? '')}"></label>
      <label>${esc(text.passwordHint)}<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
      <label class="check"><input type="checkbox" name="${paths.terms}" value="1" required>${esc(text.terms)}</label>
      <button type="submit">${esc(text.createAccount)}</button></form>
    <p class="muted">${esc(text.haveAccount)} <a href="${a.base}/${paths.login}">${esc(text.signInLink)}</a></p></div>`)
}

function forgotPage(a: Audience, error?: string, email = '', sent = false): string {
  return portalPage(text.forgotHeading, `<div class="auth box"><h1>${esc(text.forgotHeading)}</h1>
    ${sent ? `<p class="notice">${esc(text.forgotSent)}</p>` : `<p class="muted">${esc(text.forgotIntro)}</p>${error ? `<p class="err">${esc(error)}</p>` : ''}
    <form method="post" action="${a.base}/${paths.forgot}" class="stack">
      <label>${esc(text.email)}<input name="email" type="email" autocomplete="email" required maxlength="200" value="${esc(email)}"></label>
      <button type="submit">${esc(text.forgotSend)}</button></form>`}
    <p class="muted"><a href="${a.base}/${paths.login}">${esc(text.backToLogin)}</a></p></div>`)
}

function resetPage(a: Audience, token: string, error?: string, invalid = false): string {
  return portalPage(text.resetHeading, `<div class="auth box"><h1>${esc(text.resetHeading)}</h1>${error ? `<p class="err">${esc(error)}</p>` : ''}
    ${invalid ? `<p><a class="btn" href="${a.base}/${paths.forgot}">${esc(text.forgotSend)}</a></p>` : `<form method="post" action="${a.base}/${paths.reset}?token=${esc(token)}" class="stack">
      <label>${esc(text.newPassword)}<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
      <label>${esc(text.confirmPassword)}<input name="confirm" type="password" autocomplete="new-password" required minlength="8"></label>
      <button type="submit">${esc(text.savePassword)}</button></form>`}
    <p class="muted"><a href="${a.base}/${paths.login}">${esc(text.backToLogin)}</a></p></div>`)
}

// ---------------------------------------------------------------- photos

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

function imageType(bytes: Uint8Array): { ext: string; type: string } | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { ext: 'png', type: 'image/png' }
  if (String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return { ext: 'webp', type: 'image/webp' }
  return null
}

/**
 * Gallery actions for visitor-owned content: upload (action undefined), remove (paths.photoRemove) or set
 * the cover (paths.photoCover). Files are content-checked, stored under `prefix` in R2/S3 and served from
 * /files/. Only files under `prefix` are ever deleted. Returns the notice code to show, or an error.
 */
export async function galleryAction(opts: {
  form: FormData; action?: string; bucket: R2Bucket; prefix: string; gallery: string[]; cover: string; max: number
  save: (data: { gallery?: string[]; coverImage?: string }) => Promise<void>
}): Promise<{ notice: string } | { error: string }> {
  const { form, gallery } = opts
  if (opts.action === paths.photoRemove || opts.action === paths.photoCover) {
    const target = String(form.get('url') ?? '')
    if (!gallery.includes(target) && target !== opts.cover) return { notice: paths.noticeSaved }
    if (opts.action === paths.photoCover) {
      await opts.save({ coverImage: target })
      return { notice: paths.noticeCover }
    }
    const rest = gallery.filter(u => u !== target)
    await opts.save({ gallery: rest, coverImage: opts.cover === target ? rest[0] ?? '' : opts.cover })
    if (target.startsWith(`/files/${opts.prefix}`)) await opts.bucket.delete(target.slice('/files/'.length))
    return { notice: paths.noticeRemoved }
  }
  const files = form.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0)
  if (!files.length) return { error: text.pickPhoto }
  if (gallery.length + files.length > opts.max) return { error: text.tooManyPhotos(opts.max) }
  const checked: { bytes: Uint8Array; ext: string; type: string }[] = []
  for (const file of files) {
    if (file.size > MAX_PHOTO_BYTES) return { error: text.tooBig(file.name) }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const kind = imageType(bytes)
    if (!kind) return { error: text.notImage(file.name) }
    checked.push({ bytes, ...kind })
  }
  const added: string[] = []
  for (const f of checked) {
    const key = `${opts.prefix}${crypto.randomUUID()}.${f.ext}`
    await opts.bucket.put(key, f.bytes, { httpMetadata: { contentType: f.type } })
    added.push(`/files/${key}`)
  }
  const next = [...gallery, ...added]
  await opts.save({ gallery: next, coverImage: opts.cover || next[0] })
  return { notice: paths.noticePhotos }
}

/** Photo grid with "set as cover" / "remove", plus the upload form; `base` is the item's own URL. */
export function galleryEditor(base: string, gallery: string[], cover: string | undefined, max: number): string {
  return `<div class="pgrid">${gallery.map(u => `<figure class="${u === cover ? 'is-cover' : ''}"><img src="${esc(u)}" alt="" loading="lazy">
      <figcaption>${u === cover ? `<span class="pill premium">${esc(text.coverBadge)}</span>` : `<form method="post" action="${base}/${paths.photos}/${paths.photoCover}"><input type="hidden" name="url" value="${esc(u)}"><button class="link" type="submit">${esc(text.setCover)}</button></form>`}
      <form method="post" action="${base}/${paths.photos}/${paths.photoRemove}" onsubmit="return confirm(${esc(JSON.stringify(text.removeConfirm))})"><input type="hidden" name="url" value="${esc(u)}"><button class="link danger" type="submit">${esc(text.remove)}</button></form></figcaption></figure>`).join('')}</div>
    <form method="post" action="${base}/${paths.photos}" enctype="multipart/form-data" class="upload">
      <label>${esc(text.addPhotos(max))}<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required></label>
      <button type="submit">${esc(text.upload)}</button></form>`
}
