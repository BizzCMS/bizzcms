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
  login: 'login', register: 'register', logout: 'logout',
  next: 'next', terms: 'terms', notice: 'notice', registered: 'registered',
  photos: 'photos', photoRemove: 'remove', photoCover: 'cover',
  noticeSaved: 'saved', noticePhotos: 'photos', noticeRemoved: 'removed', noticeCover: 'cover'
}
export type AccountPaths = typeof ACCOUNT_PATHS

let text: AccountText = ACCOUNT_TEXT
let paths: AccountPaths = ACCOUNT_PATHS
let pageShell: (title: string, body: string) => string =
  (title, body) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,follow"><title>${esc(title)}</title></head><body><main class="wrap portal">${body}</main></body></html>`

/** The site's wording, URL words and page shell (its layout, noindex) for account pages. */
export function configureAccounts(opts: { text?: Partial<AccountText>; paths?: Partial<AccountPaths>; page?: (title: string, body: string) => string }) {
  if (opts.text) text = { ...ACCOUNT_TEXT, ...opts.text }
  if (opts.paths) paths = { ...ACCOUNT_PATHS, ...opts.paths }
  if (opts.page) pageShell = opts.page
}
export const accountPaths = () => paths

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

export async function currentUser(request: Request, cms: Cms): Promise<User | null> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  const res = await cms(new Request(new URL('/auth/me', request.url), { headers: forwardHeaders(request, { cookie }) }))
  if (!res.ok) return null
  const body = await res.json().catch(() => null) as { user?: { id?: string; email?: string; first_name?: string } } | null
  if (!body?.user?.id || !body.user.email) return null
  return { id: body.user.id, email: body.user.email.toLowerCase(), firstName: body.user.first_name }
}

function withCookies(target: string, from: Response): Response {
  const headers = new Headers({ location: target })
  for (const c of from.headers.getSetCookie?.() ?? []) headers.append('set-cookie', c)
  return new Response(null, { status: 303, headers })
}

// Only paths inside the audience's area are accepted as a post-login target.
function nextPath(a: Audience, value: unknown): string {
  const next = String(value ?? '')
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

// Handles <base>/<login>, <base>/<register> and POST <base>/<logout>; null for other paths.
export async function accountRoute(a: Audience, request: Request, url: URL, path: string, cms: Cms): Promise<Response | null> {
  const post = request.method === 'POST'
  if (path === `${a.base}/${paths.login}`) {
    if (!post) return html(loginPage(a, undefined, '', nextPath(a, url.searchParams.get(paths.next))))
    const form = await readForm(request)
    const email = String(form.get('email') ?? '').trim()
    const res = await signIn(request, url, cms, email, String(form.get('password') ?? ''))
    if (!res.ok) {
      const error = res.status === 429 ? text.tooManyAttempts : text.wrongLogin
      return html(loginPage(a, error, email, nextPath(a, form.get(paths.next))), res.status === 429 ? 429 : 401)
    }
    const body = await res.clone().json().catch(() => ({})) as { twoFactorRequired?: boolean }
    return withCookies(body.twoFactorRequired ? '/auth/two-factor' : nextPath(a, form.get(paths.next)), res)
  }
  if (path === `${a.base}/${paths.register}`) {
    if (!post) return html(registerPage(a))
    const form = await readForm(request)
    const v = { firstName: String(form.get('firstName') ?? '').trim(), lastName: String(form.get('lastName') ?? '').trim(), email: String(form.get('email') ?? '').trim() }
    const password = String(form.get('password') ?? '')
    if (!v.firstName || !v.lastName) return html(registerPage(a, text.enterName, v), 400)
    if (password.length < 8) return html(registerPage(a, text.passwordShort, v), 400)
    if (form.get(paths.terms) !== '1') return html(registerPage(a, text.acceptTerms, v), 400)
    const res = await cms(new Request(`${url.origin}/auth/register`, {
      method: 'POST', headers: forwardHeaders(request, { 'content-type': 'application/json', origin: url.origin }),
      body: JSON.stringify({ ...v, email: v.email.toLowerCase(), password })
    }))
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string }
      const error = /already exists/i.test(body.error ?? '') ? text.accountExists
        : /disabled/i.test(body.error ?? '') ? text.registrationClosed
        : res.status === 429 ? text.tooManyAttempts
        : text.registrationFailed
      return html(registerPage(a, error, v), res.status === 429 ? 429 : 400)
    }
    // Registration only issues a legacy token; sign in to get the session /auth/me accepts.
    const session = await signIn(request, url, cms, v.email.toLowerCase(), password)
    if (!session.ok) return Response.redirect(`${url.origin}${a.base}/${paths.login}`, 303)
    return withCookies(`${a.base}?${paths.notice}=${paths.registered}`, session)
  }
  if (path === `${a.base}/${paths.logout}` && post) {
    const res = await cms(new Request(`${url.origin}/auth/logout`, { headers: forwardHeaders(request, { cookie: request.headers.get('cookie') ?? '' }) }))
    const out = withCookies(a.base, res)
    // Also expire the session cookie here in case the CMS did not.
    out.headers.append('set-cookie', 'auth_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict')
    return out
  }
  return null
}

function loginPage(a: Audience, error?: string, email = '', next = a.base): string {
  return portalPage(a.loginTitle, `<div class="auth box"><h1>${esc(text.loginHeading)}</h1>${error ? `<p class="err">${esc(error)}</p>` : ''}
    <form method="post" action="${a.base}/${paths.login}" class="stack"><input type="hidden" name="${paths.next}" value="${esc(next)}">
      <label>${esc(text.email)}<input name="email" type="email" autocomplete="email" required value="${esc(email)}"></label>
      <label>${esc(text.password)}<input name="password" type="password" autocomplete="current-password" required></label>
      <button type="submit">${esc(text.signIn)}</button></form>
    <p class="muted">${esc(text.noAccount)} <a href="${a.base}/${paths.register}">${esc(text.registerLink)}</a></p></div>`)
}

function registerPage(a: Audience, error?: string, v: Record<string, string> = {}): string {
  return portalPage(a.registerTitle, `<div class="auth box"><h1>${esc(text.registerHeading)}</h1>
    <p class="muted">${esc(a.registerIntro)}</p>${error ? `<p class="err">${esc(error)}</p>` : ''}
    <form method="post" action="${a.base}/${paths.register}" class="stack">
      <div class="two"><label>${esc(text.firstName)}<input name="firstName" autocomplete="given-name" required maxlength="80" value="${esc(v.firstName ?? '')}"></label>
      <label>${esc(text.lastName)}<input name="lastName" autocomplete="family-name" required maxlength="80" value="${esc(v.lastName ?? '')}"></label></div>
      <label>${esc(text.email)}<input name="email" type="email" autocomplete="email" required maxlength="200" value="${esc(v.email ?? '')}"></label>
      <label>${esc(text.passwordHint)}<input name="password" type="password" autocomplete="new-password" required minlength="8"></label>
      <label class="check"><input type="checkbox" name="${paths.terms}" value="1" required>${esc(text.terms)}</label>
      <button type="submit">${esc(text.createAccount)}</button></form>
    <p class="muted">${esc(text.haveAccount)} <a href="${a.base}/${paths.login}">${esc(text.signInLink)}</a></p></div>`)
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
