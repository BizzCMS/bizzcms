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
// It is the "Security" plugin of the admin (id abuse-guard): a card under Plugins, a sidebar entry and Admin ›
// Security with the log of every refused or blocked attempt (table bizz_abuse_log, newest 5000 kept) and the list
// of switched-off accounts with an Unblock button. The protection itself is always on.
//
// Wire it in the site's fetch handler around the site's own routes (and register abuseGuardPlugin in
// plugins.register, abuseGuardAdminRoute among the admin routes, before the engine):
//   setAbuseGuard({ signIn: /^\/(account|companies)\/login\/?$/, private: /^\/(account|companies)(\/|$)/, texts, notify })
//   return withAbuseGuard(request, env.DB, req => cms.fetch(req, env, ctx), () => handle(request, env, ctx))
import { definePlugin, PluginServiceClass as PluginService } from 'bizzcms-core'
import { currentUser, html, portalPage, readForm, signedInCookie, type Cms, type User } from '../site-accounts'
import { schemaOnce } from '../schema-once'
import { sessionUser } from '../session'

export const ABUSE_GUARD_PLUGIN_ID = 'abuse-guard'

export const abuseGuardPlugin = definePlugin({
  id: ABUSE_GUARD_PLUGIN_ID,
  name: 'Security',
  version: '1.0.0',
  description: 'Refuses script and markup in visitor forms and switches off the account that sent it. Log of every attempt and a list of blocked accounts to switch back on. Always on.',
  author: { name: 'BizzCMS', url: 'https://bizzcms.com' },
  capabilities: [],
  menu: [{ label: 'Security', path: '/admin/abuse-guard', icon: 'lock', order: 86 }]
})

// Real markup only (tags that run or load something, inline handlers, script URLs), so ordinary text such as
// "<3", "2 < 3", "<b>" or "bonus=5" never trips it.
const MARKUP = /<\s*\/?\s*(script|iframe|frame|frameset|object|embed|applet|svg|math|img|image|video|audio|source|style|link|meta|base|form|input|button|textarea|select|body|html|head|template|details|marquee|isindex)\b|\bon(error|load|click|dblclick|mouse\w*|pointer\w*|focus\w*|blur|key\w*|submit|change|input|toggle|animation\w*|transition\w*|begin|end|unload|beforeunload|wheel|drag\w*|drop|copy|cut|paste|contextmenu|show|scroll|resize|message|hashchange|popstate)\s*=|(java|vb|live)script\s*:|data\s*:\s*text\/html|expression\s*\(|&#(x0*(3c|6a)|0*(60|106));?/i

export const hasMarkup = (value: string) => MARKUP.test(value)

export interface AbuseEvent { email: string; path: string; field: string; value: string; ip: string }
export interface AbuseGuardSettings {
  /** Paths never checked (Admin, the engine's API, auth and MCP routes, files). */
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
  skip: /^\/(admin|api|auth|files|mcp)(\/|$)/,
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

// ---------- log ----------

const KEEP_LOG_ROWS = 5000
let logReady = false

async function ensureLog(db: D1Database) {
  if (logReady) return
  await schemaOnce('bizz_abuse_log', () => db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS bizz_abuse_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, email TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL DEFAULT '', field TEXT NOT NULL DEFAULT '', ip TEXT NOT NULL DEFAULT '', value TEXT NOT NULL DEFAULT '', action TEXT NOT NULL)`),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_bizz_abuse_log_email ON bizz_abuse_log (email)')
  ]))
  logReady = true
}

/** One row per refused or blocked attempt (signed-out ones too). Never lets a logging problem change the answer. */
async function record(db: D1Database, action: 'refused' | 'blocked', email: string, request: Request, field: string, value: string): Promise<void> {
  try {
    await ensureLog(db)
    await db.batch([
      db.prepare('INSERT INTO bizz_abuse_log (at, email, path, field, ip, value, action) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(Date.now(), email, new URL(request.url).pathname.slice(0, 300), field.slice(0, 100), (request.headers.get('cf-connecting-ip') ?? '').slice(0, 64), value.slice(0, 300), action),
      // A flood of attempts cannot fill the database: only the newest rows stay.
      db.prepare('DELETE FROM bizz_abuse_log WHERE id <= (SELECT MAX(id) FROM bizz_abuse_log) - ?').bind(KEEP_LOG_ROWS)
    ])
  } catch (error) { console.error('abuse-guard log', error) }
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
        if (!user) { await record(db, 'refused', '', request, field, value); return refusedPage() }
        const blocked = await block(db, user, request, field, value)
        await record(db, blocked ? 'blocked' : 'refused', user.email, request, field, value)
        return blocked ? signedOut(request, cms, blockedPage()) : refusedPage()
      }
    }
  }
  if (cookie) {
    const user = await currentUser(request, cms)
    if (user && await isBlocked(db, user.id)) return signedOut(request, cms, blockedPage())
  }
  return run()
}

// ---------- admin: Admin › Security ----------

const PAGE_SIZE = 25
const e = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const when = (ms: number) => new Date(ms).toISOString().slice(0, 16).replace('T', ' ')

let pluginEnsured = false
/** Installs and activates the plugin record once, so it shows under Plugins and in the sidebar (like the SEO plugin). */
async function ensureAbuseGuardPlugin(db: D1Database, force = false) {
  if (pluginEnsured && !force) return
  try {
    const install = async () => {
      const svc = new PluginService(db)
      if (!(await svc.getPlugin(ABUSE_GUARD_PLUGIN_ID))) {
        await svc.ensurePlugin(ABUSE_GUARD_PLUGIN_ID, { displayName: 'Security', version: '1.0.0', description: abuseGuardPlugin.description, author: 'BizzCMS' })
        await svc.activatePlugin(ABUSE_GUARD_PLUGIN_ID).catch(() => null)
      }
    }
    // Once per deploy (src/schema-once.ts); force (the Install button) checks again.
    await (force ? install() : schemaOnce('plugin_abuse_guard', install))
    pluginEnsured = true
  } catch { /* try again on a later request */ }
}

async function me(request: Request, fetcher: Cms): Promise<{ role?: string } | null> {
  // Asked once per request (src/session.ts).
  return sessionUser(request, fetcher)
}

type LogRow = { at: number; email: string; path: string; field: string; ip: string; value: string; action: string }
const badge = (action: string) => `<span class="bizz-seo-mini" style="${action === 'blocked' ? 'color:#c0392b !important;border-color:#f1c5bd;background:#fff5f3' : ''}">${e(action)}</span>`

async function logTab(db: D1Database, url: URL): Promise<string> {
  const total = (await db.prepare('SELECT COUNT(*) AS n FROM bizz_abuse_log').first<{ n: number }>())?.n ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const page = Math.min(pages, Math.max(1, Number(url.searchParams.get('page')) || 1))
  const { results } = await db.prepare('SELECT at, email, path, field, ip, value, action FROM bizz_abuse_log ORDER BY id DESC LIMIT ? OFFSET ?')
    .bind(PAGE_SIZE, (page - 1) * PAGE_SIZE).all<LogRow>()
  const link = (p: number, label: string) => `<a class="bizz-seo-mini" href="/admin/abuse-guard?tab=log&amp;page=${p}">${label}</a>`
  const rows = results.map(r => `<tr><td>${when(r.at)}</td><td>${r.email ? e(r.email) : '<em>signed out</em>'}</td><td><code>${e(r.path)}</code></td><td><code>${e(r.field)}</code></td><td>${e(r.ip) || '-'}</td><td><code>${e(r.value)}</code></td><td>${badge(r.action)}</td></tr>`).join('')
  return `<p class="bizz-seo-note">Every refused or blocked attempt, newest first (the latest ${KEEP_LOG_ROWS} are kept). "refused": the input was turned down. "blocked": the signed-in account was also switched off.</p>
    <table class="bizz-seo-table"><thead><tr><th>When (UTC)</th><th>Account</th><th>Page</th><th>Field</th><th>IP</th><th>First 300 characters</th><th>Action</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="bizz-seo-empty">No attempts so far.</td></tr>'}</tbody></table>
    <p class="bizz-seo-note">${total} attempt${total === 1 ? '' : 's'} - page ${page} of ${pages} ${page > 1 ? link(page - 1, 'Newer') : ''} ${page < pages ? link(page + 1, 'Older') : ''}</p>`
}

async function blockedTab(db: D1Database): Promise<string> {
  // The newest log row of each switched-off account (matched by e-mail); accounts switched off by hand have none.
  const { results } = await db.prepare(`SELECT u.id, u.email, l.at, l.path, l.field, l.ip, l.value
    FROM auth_user u LEFT JOIN bizz_abuse_log l ON l.id = (SELECT MAX(id) FROM bizz_abuse_log WHERE email <> '' AND lower(email) = lower(u.email))
    WHERE u.is_active = 0 ORDER BY u.updated_at DESC LIMIT 200`).all<{ id: string; email: string; at: number | null; path: string | null; field: string | null; ip: string | null; value: string | null }>()
  const rows = results.map(r => `<tr><td>${e(r.email)}</td><td>${r.at ? when(r.at) : '-'}</td><td>${r.path ? `<code>${e(r.path)}</code>` : '-'}</td><td>${r.field ? `<code>${e(r.field)}</code>` : '-'}</td><td>${e(r.ip) || '-'}</td><td>${r.value ? `<code>${e(r.value)}</code>` : '-'}</td>
    <td class="bizz-seo-actions"><form method="post" action="/admin/abuse-guard/unblock"><input type="hidden" name="id" value="${e(r.id)}"><button type="submit" class="bizz-seo-mini" onclick="return confirm('Switch this account back on?')">Unblock</button></form></td></tr>`).join('')
  return `<p class="bizz-seo-note">Accounts that are switched off (blocked by the guard, or switched off by hand in Users). Unblock switches the account back on; the person signs in again with their password.</p>
    <table class="bizz-seo-table"><thead><tr><th>Account</th><th>Last attempt (UTC)</th><th>Page</th><th>Field</th><th>IP</th><th>First 300 characters</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="bizz-seo-empty">No blocked accounts.</td></tr>'}</tbody></table>`
}

/** Admin › Security (/admin/abuse-guard, administrators only) and the Unblock button; null when the path is not ours. */
export async function abuseGuardAdminRoute(request: Request, path: string, db: D1Database, fetcher: Cms): Promise<Response | null> {
  if (path.startsWith('/admin')) await ensureAbuseGuardPlugin(db)
  if (path === `/admin/plugins/${ABUSE_GUARD_PLUGIN_ID}` && request.method === 'GET') return Response.redirect(new URL('/admin/abuse-guard', request.url).toString(), 302)
  if (path !== '/admin/abuse-guard' && path !== '/admin/abuse-guard/unblock') return null
  const url = new URL(request.url)
  const user = await me(request, fetcher)
  if (!user) return Response.redirect(new URL('/auth/login?redirect=/admin/abuse-guard', url).toString(), 302)
  if (user.role !== 'admin') return new Response('Only administrators can open Security.', { status: 403 })
  await ensureLog(db)

  if (path === '/admin/abuse-guard/unblock') {
    if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 })
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
    const id = String((await request.formData().catch(() => new FormData())).get('id') ?? '')
    if (id) await db.prepare('UPDATE auth_user SET is_active = 1, updated_at = ? WHERE id = ? AND is_active = 0').bind(Date.now(), id).run()
    return Response.redirect(new URL('/admin/abuse-guard?tab=blocked&unblocked=1', url).toString(), 303)
  }

  const tab = url.searchParams.get('tab') === 'blocked' ? 'blocked' : 'log'
  // Same tab bar as Admin › SEO (admin.css styles [data-bizz-tabs]).
  const tabClass = (on: boolean) => `flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline ${on ? 'border-zinc-950 dark:border-white text-zinc-950 dark:text-white' : 'border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'}`
  const tabs = [['log', 'Log'], ['blocked', 'Blocked accounts']]
    .map(([k, l]) => `<a href="/admin/abuse-guard?tab=${k}" data-tab="${k}" class="${tabClass(k === tab)}"${k === tab ? ' aria-current="page"' : ''}><span>${l}</span></a>`).join('')
  const saved = url.searchParams.has('unblocked') ? '<p class="bizz-api-saved">Account switched back on.</p>' : ''
  const body = `<div class="bizz-seo-page"><div class="mb-8"><h1 class="text-2xl/8 font-semibold text-zinc-950 dark:text-white sm:text-xl/8">Security</h1><p class="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">Script or markup in a visitor form is refused and the signed-in account that sent it is blocked at once. This protection is always on.</p></div>
    <div class="border-b border-zinc-950/5 dark:border-white/10 bizz-seo-tabbar-page"><nav class="flex overflow-x-auto" role="tablist" aria-label="Security sections" data-bizz-tabs>${tabs}</nav></div>${saved}${tab === 'log' ? await logTab(db, url) : await blockedTab(db)}</div>`
  const base = await fetcher(new Request(new URL('/admin/dashboard', url), { headers: request.headers }))
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  return new HTMLRewriter()
    .on('main > div.grow', { element: el => { el.setInnerContent(body, { html: true }) } })
    .on('title', { element: el => { el.setInnerContent('Security - BizzCMS') } })
    .transform(new Response(base.body, base))
}
