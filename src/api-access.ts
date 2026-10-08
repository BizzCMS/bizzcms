// API access setting (Settings › API). Closed by default: every /api route needs a signed-in
// user or an API key (Plugins › API Keys). When the owner opens it, upstream's behaviour applies:
// published content, the collection list and the API description are readable by anyone.
// Health checks stay open either way (they reveal nothing).
// Stored in our own bizz_settings table; upstream's settings are left untouched.

type Fetcher = (request: Request) => Promise<Response>

const OPEN_ALWAYS = new Set(['/api/health', '/api/system/health'])
let cache: { open: boolean; at: number } | null = null

async function ensureTable(db: D1Database) {
  await db.prepare('CREATE TABLE IF NOT EXISTS bizz_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run()
}

export async function apiIsOpen(db: D1Database): Promise<boolean> {
  if (cache && Date.now() - cache.at < 15_000) return cache.open
  await ensureTable(db)
  const row = await db.prepare("SELECT value FROM bizz_settings WHERE key = 'api.public'").first<{ value: string }>()
  cache = { open: row?.value === 'true', at: Date.now() }
  return cache.open
}

async function setApiOpen(db: D1Database, open: boolean) {
  await ensureTable(db)
  await db.prepare("INSERT INTO bizz_settings (key, value, updated_at) VALUES ('api.public', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(open ? 'true' : 'false', Date.now()).run()
  cache = null
}

// Who is calling: asks upstream's own /auth/me with the caller's cookie, x-api-key or bearer key.
async function currentUser(request: Request, fetcher: Fetcher): Promise<{ role?: string } | null> {
  const headers = new Headers()
  for (const h of ['cookie', 'authorization', 'x-api-key']) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (![...headers.keys()].length) return null
  const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers }))
  if (!res.ok) return null
  const body = await res.json().catch(() => null) as { user?: { role?: string } } | null
  return body?.user ?? null
}

/** Returns a 401 when the API is closed and the caller is not signed in; otherwise null (go on). */
export async function guardApi(request: Request, path: string, db: D1Database, fetcher: Fetcher): Promise<Response | null> {
  if (path !== '/api' && !path.startsWith('/api/')) return null
  if (OPEN_ALWAYS.has(path) || request.method === 'OPTIONS') return null
  if (await apiIsOpen(db)) return null
  if (await currentUser(request, fetcher)) return null
  return new Response(JSON.stringify({ error: 'Authentication required', hint: 'This site keeps its API private. Sign in or send an API key (x-api-key header).' }), {
    status: 401,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  })
}

const TAB_ICON = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 18l6-6-6-6"/><path d="M8 6l-6 6 6 6"/></svg>'
const TAB_ON = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-zinc-950 dark:border-white text-zinc-950 dark:text-white'
const TAB_OFF = 'flex items-center space-x-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 whitespace-nowrap no-underline border-transparent text-zinc-500 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white'

export const API_TAB = (active: boolean) => `<a href="/admin/settings/api" data-tab="api" class="${active ? TAB_ON : TAB_OFF}">${TAB_ICON}<span>API</span></a>`

function form(open: boolean, saved: boolean) {
  const option = (value: string, checked: boolean, title: string, text: string) => `
      <label class="bizz-api-option${checked ? ' is-on' : ''}">
        <input type="radio" name="access" value="${value}"${checked ? ' checked' : ''}>
        <span><strong>${title}</strong><small>${text}</small></span>
      </label>`
  return `
    <form method="post" action="/admin/settings/api" class="space-y-6 bizz-api-settings">
      <div>
        <h3 class="text-lg/7 font-semibold text-zinc-950 dark:text-white">API access</h3>
        <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">Who can read this site's REST API at <code>/api</code>. Your website pages do not use it, so closing it changes nothing for visitors.</p>
      </div>
      ${saved ? '<p class="bizz-api-saved">Saved.</p>' : ''}
      <div class="bizz-api-options">
        ${option('closed', !open, 'Closed (recommended)', 'Every API request needs a signed-in user or an API key. The API description and the list of collections are hidden from outsiders.')}
        ${option('open', open, 'Open', 'Anyone can read published content, the collection list and the API description. Drafts, media and admin routes still need a login.')}
      </div>
      <p class="text-sm/6 text-zinc-500 dark:text-zinc-400">Apps and other servers connect with an API key: create one under <a href="/admin/plugins/api-keys">Plugins › API Keys</a> and send it as the <code>x-api-key</code> header. <code>/api/health</code> always answers, for uptime checks.</p>
      <div><button type="submit" class="bg-zinc-950">Save changes</button></div>
    </form>`
}

/** GET/POST /admin/settings/api: the settings page, drawn inside upstream's settings layout. */
export async function apiSettingsPage(request: Request, db: D1Database, fetcher: Fetcher): Promise<Response> {
  const url = new URL(request.url)
  if (request.method === 'POST') {
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
    const user = await currentUser(request, fetcher)
    if (user?.role !== 'admin') return new Response('Forbidden', { status: 403 })
    const data = await request.formData()
    await setApiOpen(db, data.get('access') === 'open')
    return Response.redirect(new URL('/admin/settings/api?saved=1', url).toString(), 303)
  }
  // Borrow the General tab page for the layout (upstream decides who may see settings).
  const base = await fetcher(new Request(new URL('/admin/settings/general', url), { headers: request.headers }))
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  const open = await apiIsOpen(db)
  return new HTMLRewriter()
    .on('#settings-content', { element: el => { el.setInnerContent(form(open, url.searchParams.has('saved')), { html: true }) } })
    .on('nav[role="tablist"] a[href="/admin/settings/general"]', { element: el => { el.setAttribute('class', TAB_OFF) } })
    .on('title', { element: el => { el.setInnerContent('API access - BizzCMS') } })
    .transform(new Response(base.body, base))
}

/** Adds the API tab to the settings tab bar (after Database Tools). */
export function withApiTab(response: Response, path: string): Response {
  if (!path.startsWith('/admin/settings') || !response.headers.get('content-type')?.includes('text/html')) return response
  return new HTMLRewriter()
    .on('nav[role="tablist"] a[href="/admin/settings/database-tools"]', { element: el => { el.after(API_TAB(path === '/admin/settings/api'), { html: true }) } })
    .transform(response)
}
