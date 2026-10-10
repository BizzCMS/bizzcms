// Per-collection write-access toggles for the BizzCMS MCP Server.
// Settings stored in bizz_settings (key 'mcp.access').
// Injects an access control section into the Admin › MCP Server page.

type Fetcher = (request: Request) => Promise<Response>

export type McpCollection = { name: string; label: string }

type AccessSettings = Record<string, { write: boolean }>

export type McpOptions = {
  expose?: string[]
  types?: Record<string, { read?: boolean; write?: boolean }>
  listLimit?: number
}

let cache: { settings: AccessSettings; at: number } | null = null

async function ensureTable(db: D1Database) {
  await db.prepare(
    'CREATE TABLE IF NOT EXISTS bizz_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)'
  ).run()
}

export async function getMcpAccessSettings(db: D1Database): Promise<AccessSettings> {
  if (cache && Date.now() - cache.at < 15_000) return cache.settings
  await ensureTable(db)
  const row = await db
    .prepare("SELECT value FROM bizz_settings WHERE key = 'mcp.access'")
    .first<{ value: string }>()
  const settings: AccessSettings = row?.value ? (JSON.parse(row.value) as AccessSettings) : {}
  cache = { settings, at: Date.now() }
  return settings
}

async function setMcpAccessSettings(db: D1Database, settings: AccessSettings) {
  await ensureTable(db)
  await db
    .prepare(
      "INSERT INTO bizz_settings (key, value, updated_at) VALUES ('mcp.access', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at"
    )
    .bind(JSON.stringify(settings), Date.now())
    .run()
  cache = null
}

/** Reads DB settings and updates mcpOptions.types[col].write accordingly. Call before each /mcp request. */
export async function applyMcpAccess(mcpOptions: McpOptions, db: D1Database, collections: McpCollection[]) {
  const settings = await getMcpAccessSettings(db)
  if (!mcpOptions.types) mcpOptions.types = {}
  for (const col of collections) {
    const current = mcpOptions.types[col.name] ?? {}
    mcpOptions.types[col.name] = { ...current, write: settings[col.name]?.write ?? false }
  }
}

async function isAdmin(request: Request, fetcher: Fetcher): Promise<boolean> {
  const headers = new Headers()
  for (const h of ['cookie', 'authorization']) {
    const v = request.headers.get(h)
    if (v) headers.set(h, v)
  }
  if (![...headers.keys()].length) return false
  const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers }))
  if (!res.ok) return false
  const body = await res.json().catch(() => null) as { user?: { role?: string } } | null
  return body?.user?.role === 'admin'
}

function accessForm(collections: McpCollection[], settings: AccessSettings, saved: boolean) {
  const rows = collections
    .map(col => {
      const write = settings[col.name]?.write ?? false
      return `<tr class="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
        <td class="py-3 pr-4 text-sm font-medium text-zinc-950 dark:text-white">${col.label}</td>
        <td class="py-3 pr-4">
          <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-900/20 dark:text-green-400 dark:ring-green-500/20">Read</span>
        </td>
        <td class="py-3">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" name="${col.name}_write" value="1"${write ? ' checked' : ''}
              class="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950 dark:border-zinc-700 dark:bg-zinc-800">
            <span class="text-sm ${write ? 'text-zinc-950 dark:text-white font-medium' : 'text-zinc-500 dark:text-zinc-400'}">${write ? 'Write enabled' : 'Write off'}</span>
          </label>
        </td>
      </tr>`
    })
    .join('')

  return `<div class="px-6 pb-10">
    <div class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 space-y-5 max-w-2xl">
      <div>
        <h3 class="text-base/7 font-semibold text-zinc-950 dark:text-white">Collection write access</h3>
        <p class="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">Control which collections AI agents can write to via MCP. Read is always on. Write defaults to off — enable only for collections where you want agents to create or update content.</p>
      </div>
      ${saved ? '<p class="text-sm font-medium text-green-600 dark:text-green-400">Settings saved.</p>' : ''}
      <form method="post" action="/admin/mcp/access">
        <table class="w-full">
          <thead>
            <tr class="border-b border-zinc-200 dark:border-zinc-800">
              <th class="pb-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 w-2/5">Collection</th>
              <th class="pb-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 w-1/5">Read</th>
              <th class="pb-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400 w-2/5">Write</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="pt-4">
          <button type="submit"
            class="inline-flex items-center rounded-md bg-zinc-950 dark:bg-white px-3 py-2 text-sm font-semibold text-white dark:text-zinc-950 shadow-sm hover:bg-zinc-800 dark:hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-950">
            Save access settings
          </button>
        </div>
      </form>
    </div>
  </div>`
}

const PLUGIN_SETTINGS_BANNER = `<div style="padding:1rem 1.5rem 0">
  <a href="/admin/mcp"
    style="display:inline-flex;align-items:center;gap:0.5rem;padding:0.5rem 1rem;background:#09090b;color:#fff;border-radius:0.375rem;font-size:0.875rem;font-weight:600;text-decoration:none;"
    onmouseover="this.style.background='#27272a'" onmouseout="this.style.background='#09090b'">
    <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/></svg>
    Open MCP Server dashboard
  </a>
  <p style="margin:0.5rem 0 0;font-size:0.8125rem;color:#71717a">Connection guide, API key creation and collection write access are on the MCP Server dashboard.</p>
</div>`

/** Handle POST /admin/mcp/access; inject sections into GET /admin/mcp and GET /admin/plugins/mcp. */
export async function mcpAccessRoute(
  request: Request,
  path: string,
  db: D1Database,
  fetcher: Fetcher,
  collections: McpCollection[]
): Promise<Response | null> {
  if (path !== '/admin/mcp' && path !== '/admin/mcp/access' && path !== '/admin/plugins/mcp') return null
  const url = new URL(request.url)

  if (request.method === 'POST' && path === '/admin/mcp/access') {
    const origin = request.headers.get('origin')
    if (origin && origin !== url.origin) return new Response('Forbidden', { status: 403 })
    if (!(await isAdmin(request, fetcher))) return new Response('Forbidden', { status: 403 })
    const data = await request.formData()
    const settings: AccessSettings = {}
    for (const col of collections) {
      settings[col.name] = { write: data.get(`${col.name}_write`) === '1' }
    }
    await setMcpAccessSettings(db, settings)
    return Response.redirect(new URL('/admin/mcp?saved=1', url).toString(), 303)
  }

  // Plugin Settings page: inject an "Open MCP Server dashboard" button so users can find the connect guide.
  if (request.method === 'GET' && path === '/admin/plugins/mcp') {
    const base = await fetcher(request)
    if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
    return new HTMLRewriter()
      .on('main', { element: el => { el.prepend(PLUGIN_SETTINGS_BANNER, { html: true }) } })
      .transform(new Response(base.body, base))
  }

  if (request.method === 'GET' && path === '/admin/mcp') {
    const base = await fetcher(request)
    if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
    const settings = await getMcpAccessSettings(db)
    const form = accessForm(collections, settings, url.searchParams.has('saved'))
    return new HTMLRewriter()
      .on('main', { element: el => { el.append(form, { html: true }) } })
      .transform(new Response(base.body, base))
  }

  return null
}
