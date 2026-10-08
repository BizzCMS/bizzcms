// No technical error ever reaches a visitor, and every error is kept for us.
// - safeHandle(): wraps a site's whole request handler. A thrown error, or any 5xx response from the CMS
//   engine (which sometimes puts the raw error text in the body), becomes a friendly page (HTML) or a
//   plain {"error":"Something went wrong","reference":"…"} (API), with a short reference code.
// - The real error (message, stack or the engine's response body) goes to the console (Cloudflare logs)
//   and to the bizz_error_log table: Admin › Settings › Error log (/admin/settings/errors), 30 days.
// Sites can give the friendly page their own design with setErrorPage().

import { ensureSiteIndexes } from './db-indexes'

type Ctx = { waitUntil(p: Promise<unknown>): void }
type Fetcher = (request: Request) => Promise<Response>

let errorPage: ((reference: string, request: Request) => string) | null = null
/** The site's own design for the friendly error page (full HTML document). */
export function setErrorPage(render: (reference: string, request: Request) => string) { errorPage = render }

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const newReference = () => Math.random().toString(36).slice(2, 8).toUpperCase()

async function ensureTable(db: D1Database) {
  await db.prepare('CREATE TABLE IF NOT EXISTS bizz_error_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER NOT NULL, reference TEXT NOT NULL, method TEXT, path TEXT, status INTEGER, message TEXT, detail TEXT, user_agent TEXT)').run()
}

function record(db: D1Database, ctx: Ctx | undefined, request: Request, reference: string, status: number, message: string, detail: string) {
  const url = new URL(request.url)
  console.error(`[BizzCMS error ${reference}] ${request.method} ${url.pathname} → ${status}: ${message}\n${detail}`)
  const now = Date.now()
  const job = ensureTable(db)
    .then(() => db.prepare('INSERT INTO bizz_error_log (at, reference, method, path, status, message, detail, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(now, reference, request.method, (url.pathname + url.search).slice(0, 500), status, message.slice(0, 500), detail.slice(0, 4000), (request.headers.get('user-agent') ?? '').slice(0, 300)).run())
    .then(() => (Math.random() < 0.05 ? db.prepare('DELETE FROM bizz_error_log WHERE at < ?').bind(now - 30 * 86400_000).run() : null))
    .catch(e => console.error('[BizzCMS] could not store the error', e))
  if (ctx) ctx.waitUntil(job)
}

function friendly(request: Request, reference: string, status: number): Response {
  const path = new URL(request.url).pathname
  const wantsJson = path.startsWith('/api') || path === '/mcp' || (request.headers.get('accept') ?? '').includes('application/json') && !(request.headers.get('accept') ?? '').includes('text/html')
  const headers = { 'cache-control': 'no-store', 'x-bizz-error-ref': reference }
  if (wantsJson) return Response.json({ error: 'Something went wrong', reference }, { status, headers })
  const admin = /^\/(admin|auth)(\/|$)/.test(path)
  const body = !admin && errorPage ? errorPage(reference, request) : `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Something went wrong</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f5f4;color:#172e30;font:16px/1.6 system-ui,-apple-system,'Segoe UI',sans-serif}main{max-width:460px;margin:24px;padding:36px;border-radius:18px;background:#fff;box-shadow:0 18px 50px rgba(16,47,49,.1)}h1{margin:0 0 8px;font-size:24px}p{margin:0 0 14px;color:#4b5f5c}code{padding:2px 6px;border-radius:6px;background:#eef2f1}a{color:#086568;font-weight:600}</style></head>
<body><main><h1>Something went wrong</h1><p>Sorry, this page could not be loaded. Please try again in a moment.</p><p>If it keeps happening, mention reference <code>${esc(reference)}</code>.</p><p><a href="${admin ? '/admin' : '/'}">${admin ? 'Back to the dashboard' : 'Go to the home page'}</a></p></main></body></html>`
  return new Response(body, { status, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } })
}

/** Runs a site's request handler so that errors become a friendly page and an entry in the error log. */
export async function safeHandle(request: Request, db: D1Database, ctx: Ctx | undefined, handler: () => Promise<Response>): Promise<Response> {
  // The lookup indexes the site's queries need (src/db-indexes.ts), once per isolate, off the request's path.
  ctx?.waitUntil(ensureSiteIndexes(db))
  let response: Response
  try {
    response = await handler()
  } catch (error) {
    const reference = newReference()
    const err = error instanceof Error ? error : new Error(String(error))
    record(db, ctx, request, reference, 500, err.message || err.name, err.stack ?? '')
    return friendly(request, reference, 500)
  }
  if (response.status < 500 || response.headers.get('x-bizz-error-ref')) return response
  // A 5xx from the CMS engine: keep its body for us, show the visitor the friendly version.
  const reference = newReference()
  const detail = await response.clone().text().catch(() => '')
  let message = `HTTP ${response.status}`
  try { const j = JSON.parse(detail) as { error?: string; message?: string; details?: string }; message = [j.error, j.details ?? j.message].filter(Boolean).join(': ') || message } catch { /* not JSON */ }
  record(db, ctx, request, reference, response.status, message, detail.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 4000))
  return friendly(request, reference, response.status)
}

// ---------------- Admin › Settings › Error log

const TAB_OFF = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'
const TAB_ON = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-zinc-950 dark:border-white text-zinc-950 dark:text-white'
const TAB_ICON = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>'

/** Adds the Error log tab to the settings tab bar (after the last tab). */
export function withErrorsTab(response: Response, path: string): Response {
  if (!path.startsWith('/admin/settings') || !response.headers.get('content-type')?.includes('text/html')) return response
  let added = false
  return new HTMLRewriter()
    .on('nav[role="tablist"]', { element: el => { if (added) return; added = true; el.append(`<a href="/admin/settings/errors" data-tab="errors" class="${path === '/admin/settings/errors' ? TAB_ON : TAB_OFF}"${path === '/admin/settings/errors' ? ' aria-current="page"' : ''}>${TAB_ICON}<span>Error log</span></a>`, { html: true }) } })
    .transform(response)
}

async function me(request: Request, fetcher: Fetcher): Promise<{ role?: string } | null> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers: { cookie } }))
  if (!res.ok) return null
  return ((await res.json().catch(() => null)) as { user?: { role?: string } } | null)?.user ?? null
}

/** GET/POST /admin/settings/errors: the error log (administrators only), drawn in the settings layout. */
export async function errorLogPage(request: Request, path: string, db: D1Database, fetcher: Fetcher): Promise<Response | null> {
  if (path !== '/admin/settings/errors') return null
  const url = new URL(request.url)
  const user = await me(request, fetcher)
  if (!user) return Response.redirect(new URL('/auth/login?redirect=/admin/settings/errors', url).toString(), 302)
  if (user.role !== 'admin') return new Response('Only administrators can see the error log.', { status: 403 })
  await ensureTable(db)
  if (request.method === 'POST') {
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
    await db.prepare('DELETE FROM bizz_error_log').run()
    return Response.redirect(new URL('/admin/settings/errors?cleared=1', url).toString(), 303)
  }
  const ref = (url.searchParams.get('ref') ?? '').trim().toUpperCase()
  const { results } = await db.prepare(`SELECT at, reference, method, path, status, message, detail FROM bizz_error_log ${ref ? 'WHERE reference = ?' : ''} ORDER BY at DESC LIMIT 200`)
    .bind(...(ref ? [ref] : [])).all<{ at: number; reference: string; method: string; path: string; status: number; message: string; detail: string }>()
  const rows = results.map(r => `<tr><td>${new Date(r.at).toISOString().replace('T', ' ').slice(0, 19)}</td><td><code>${esc(r.reference)}</code></td><td>${esc(r.method)} <code>${esc(r.path)}</code></td><td>${r.status}</td><td><details><summary>${esc(r.message || '(no message)')}</summary><pre class="bizz-error-detail">${esc(r.detail)}</pre></details></td></tr>`).join('')
  const body = `<div class="space-y-6 bizz-api-settings">
    <div><h3 class="text-lg/7 font-semibold text-zinc-950 dark:text-white">Error log</h3>
    <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">Errors from the last 30 days. Visitors only see a friendly page with a reference code; the details are here. Times are UTC.</p></div>
    ${url.searchParams.has('cleared') ? '<p class="bizz-api-saved">Cleared.</p>' : ''}
    <form method="get" class="bizz-seo-inline"><input type="search" name="ref" value="${esc(ref)}" placeholder="Find a reference code, e.g. K3F9QX"><button type="submit">Find</button></form>
    ${results.length ? `<table class="bizz-seo-table"><thead><tr><th>Time</th><th>Reference</th><th>Request</th><th>Status</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>
    <form method="post" onsubmit="return confirm('Remove every entry from the error log?')"><button type="submit" class="bizz-seo-danger">Clear the log</button></form>` : `<p class="bizz-seo-note">${ref ? 'No error with that reference.' : 'No errors recorded. 👍'}</p>`}
  </div>`
  const base = await fetcher(new Request(new URL('/admin/settings/general', url), { headers: request.headers }))
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  return new HTMLRewriter()
    .on('#settings-content', { element: el => { el.setInnerContent(body, { html: true }) } })
    .on('nav[role="tablist"] a[href="/admin/settings/general"]', { element: el => { el.setAttribute('class', TAB_OFF); el.removeAttribute('aria-current') } })
    .on('title', { element: el => { el.setInnerContent('Error log - BizzCMS') } })
    .transform(new Response(base.body, base))
}
