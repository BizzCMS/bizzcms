// BizzCMS plugin: Analytics. The site's own visitor statistics in the admin, without cookies and without personal data,
// so no consent banner is needed and every visitor is counted (Google Analytics only counts those who accept cookies).
// A visitor is counted once a day by a hash of IP address + browser with a random salt per day; the salt is thrown away
// after two days, so the hashes can never be traced back. Bots are not counted.
//
// Admin › Analytics (/admin/analytics): visits, visitors, the previous period for comparison, a daily chart, top pages,
// referrers, countries, devices and campaigns (utm_*), for today / 7 / 30 / 90 / 365 days.
// Optional: Admin › Plugins › Analytics › Activate. The site wires three calls:
//   - analyticsHit(request, db, kv, ctx, { timeZone }) for POST /_bz/hit (before its page handling and cache);
//   - withAnalytics(response, request, db) on its public pages (adds the counter script while the plugin is active);
//   - analyticsAdminRoute(request, path, db, fetcher, isAdmin) for the admin page and the plugin's Install button.
import { definePlugin, PluginServiceClass as PluginService } from 'bizzcms-core'
import { schemaOnce } from '../schema-once'

export const ANALYTICS_PLUGIN_ID = 'analytics'
export const ANALYTICS_HIT_PATH = '/_bz/hit'

export const analyticsPlugin = definePlugin({
  id: ANALYTICS_PLUGIN_ID,
  name: 'Analytics',
  version: '1.0.0',
  description: 'Your own visitor statistics in the admin: visits, visitors, pages, referrers, countries, devices and campaigns. No cookies and no personal data, so no consent banner is needed.',
  author: { name: 'BizzCMS', url: 'https://bizzcms.com' },
  capabilities: [],
  menu: [{ label: 'Analytics', path: '/admin/analytics', icon: 'chart', order: 89 }]
})

type Cms = (request: Request) => Promise<Response>
type Ctx = { waitUntil(p: Promise<unknown>): void }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const SKIP = /^\/(admin|auth|api|files|mcp|cdn-cgi|_bz)(\/|$)/
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|axios|node-fetch|postman|scrapy|httpclient|semrush|ahrefs|mj12|bytespider|petalbot|gptbot|claude|perplexity/i

let activeCache: { at: number; value: boolean } | null = null
async function isActive(db: D1Database): Promise<boolean> {
  if (activeCache && Date.now() - activeCache.at < 30_000) return activeCache.value
  let value = false
  try { value = ((await new PluginService(db).getPlugin(ANALYTICS_PLUGIN_ID)) as { status?: string } | null)?.status === 'active' } catch { value = false }
  activeCache = { at: Date.now(), value }
  return value
}

async function tables(db: D1Database) {
  await schemaOnce('bizz_stats', () => db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS bizz_stats (day TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0, visitors INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, key))`),
    db.prepare('CREATE TABLE IF NOT EXISTS bizz_stats_seen (day TEXT NOT NULL, scope TEXT NOT NULL, hash TEXT NOT NULL, PRIMARY KEY (day, scope, hash))'),
    // Visitors right now: the last page of each visitor hash with its time (rows older than 30 minutes are removed).
    db.prepare('CREATE TABLE IF NOT EXISTS bizz_stats_live (hash TEXT PRIMARY KEY, path TEXT NOT NULL, at INTEGER NOT NULL)')
  ]))
}

// ---------------------------------------------------------------- counting

// One page view, plus window.bzStat(name) for actions on the page (an inquiry button click; the directory's contacts
// box reports "contacts" when it shows them).
const SNIPPET = `<script>(function(){function s(o){try{var b=JSON.stringify(o);if(navigator.sendBeacon)navigator.sendBeacon('${ANALYTICS_HIT_PATH}',new Blob([b],{type:'text/plain'}));else fetch('${ANALYTICS_HIT_PATH}',{method:'POST',body:b,keepalive:true})}catch(e){}}
var l=location;s({p:l.pathname,q:l.search,r:document.referrer,w:screen.width});window.bzStat=function(e){s({p:l.pathname,e:e})};
document.addEventListener('click',function(e){var a=e.target.closest&&e.target.closest('[data-open-request]');if(a)window.bzStat('inquiry')})})()</script>`
/** Actions a page may report (bzStat), counted per page: kind "event:<name>". */
const EVENTS = new Set(['inquiry', 'contacts'])

/** Adds the counter script to public HTML pages while the plugin is active. */
export async function withAnalytics(response: Response, request: Request, db: D1Database): Promise<Response> {
  if (request.method !== 'GET' || !response.headers.get('content-type')?.includes('text/html')) return response
  if (SKIP.test(new URL(request.url).pathname) || !(await isActive(db))) return response
  return new HTMLRewriter().on('body', { element(el) { el.append(SNIPPET, { html: true }) } }).transform(response)
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('')
let isolateSalt: { day: string; value: string } | null = null
async function saltFor(day: string, kv?: KVNamespace): Promise<string> {
  if (!kv) {
    if (isolateSalt?.day !== day) isolateSalt = { day, value: hex(crypto.getRandomValues(new Uint8Array(16)).buffer) }
    return isolateSalt.value
  }
  const key = `bizz:stats:salt:${day}`
  const known = await kv.get(key).catch(() => null)
  if (known) return known
  const value = hex(crypto.getRandomValues(new Uint8Array(16)).buffer)
  await kv.put(key, value, { expirationTtl: 2 * 86400 }).catch(() => {})
  return value
}

function source(referrer: string, host: string): string | null {
  let h = ''
  try { h = new URL(referrer).hostname.toLowerCase() } catch { return '(direct)' }
  if (!h) return '(direct)'
  if (h === host || h === `www.${host}` || `www.${h}` === host) return null // a page of this site: not an entry
  h = h.replace(/^(www|m|l|lm|mobile)\./, '')
  if (/(^|\.)google\./.test(h)) return 'Google'
  if (/(^|\.)bing\.com$/.test(h)) return 'Bing'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(h)) return 'Facebook'
  if (/(^|\.)instagram\.com$/.test(h)) return 'Instagram'
  if (/(^|\.)duckduckgo\.com$/.test(h)) return 'DuckDuckGo'
  if (/(^|\.)(t\.co|twitter\.com|x\.com)$/.test(h)) return 'X'
  if (/(^|\.)(linkedin\.com|lnkd\.in)$/.test(h)) return 'LinkedIn'
  if (/(^|\.)(pinterest\.[a-z.]+|pin\.it)$/.test(h)) return 'Pinterest'
  if (/(^|\.)(chatgpt\.com|openai\.com)$/.test(h)) return 'ChatGPT'
  return h.slice(0, 100)
}

/** POST /_bz/hit: one page view from the counter script (204 always; written after the response). */
export async function analyticsHit(request: Request, db: D1Database, kv: KVNamespace | undefined, ctx: Ctx | undefined, opts: { timeZone?: string } = {}): Promise<Response> {
  const done = new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } })
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { allow: 'POST' } })
  const ua = request.headers.get('user-agent') ?? ''
  if (!ua || BOT.test(ua) || !(await isActive(db))) return done
  const url = new URL(request.url)
  const origin = request.headers.get('origin')
  if (origin && origin !== url.origin) return done
  let b: { p?: unknown; q?: unknown; r?: unknown; w?: unknown; e?: unknown } = {}
  try { b = JSON.parse((await request.text()).slice(0, 4000)) } catch { return done }
  const path = String(b.p ?? '').split('?')[0].slice(0, 300)
  if (!path.startsWith('/') || SKIP.test(path)) return done
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: opts.timeZone ?? 'UTC' })
  const ref = source(String(b.r ?? ''), url.hostname)
  const q = new URLSearchParams(String(b.q ?? '').slice(0, 1000))
  const utm = ['utm_source', 'utm_medium', 'utm_campaign'].map(k => (q.get(k) ?? '').trim().slice(0, 60)).filter(Boolean).join(' / ')
  const w = Number(b.w) || 0
  const device = w ? (w < 768 ? 'Mobile' : w < 1100 ? 'Tablet' : 'Desktop') : /mobi|android|iphone/i.test(ua) ? 'Mobile' : 'Desktop'
  const country = String((request as unknown as { cf?: { country?: string } }).cf?.country ?? request.headers.get('cf-ipcountry') ?? 'XX').slice(0, 2).toUpperCase()
  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for') ?? ''
  const job = (async () => {
    await tables(db)
    const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${await saltFor(day, kv)}|${ip}|${ua}`))).slice(0, 32)
    const seen = (scope: string) => db.prepare('INSERT OR IGNORE INTO bizz_stats_seen (day, scope, hash) VALUES (?, ?, ?)').bind(day, scope, hash)
    if (b.e !== undefined) {
      // An action on the page (no page view): counted per page, with the visitors who did it.
      const name = String(b.e)
      if (!EVENTS.has(name)) return
      const [first] = await db.batch([seen(`e:${name}:${path}`)])
      await db.prepare(`INSERT INTO bizz_stats (day, kind, key, views, visitors) VALUES (?, ?, ?, 1, ?)
        ON CONFLICT (day, kind, key) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors`).bind(day, `event:${name}`, path, first.meta.changes ? 1 : 0).run()
      return
    }
    const [all, page] = await db.batch([seen(''), seen(`p:${path}`)])
    const newVisitor = all.meta.changes ? 1 : 0, newOnPage = page.meta.changes ? 1 : 0
    const add = (kind: string, key: string, views: number, visitors: number) => db.prepare(`INSERT INTO bizz_stats (day, kind, key, views, visitors) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (day, kind, key) DO UPDATE SET views = views + excluded.views, visitors = visitors + excluded.visitors`).bind(day, kind, key, views, visitors)
    const rows = [add('total', '', 1, newVisitor), add('page', path, 1, newOnPage), add('country', country, 1, newVisitor), add('device', device, 1, newVisitor)]
    if (ref) rows.push(add('ref', ref, 1, newVisitor)) // entries only (pages of this site are not a source)
    if (utm) rows.push(add('utm', utm, 1, newVisitor))
    rows.push(db.prepare('INSERT INTO bizz_stats_live (hash, path, at) VALUES (?, ?, ?) ON CONFLICT (hash) DO UPDATE SET path = excluded.path, at = excluded.at').bind(hash, path, Date.now()))
    await db.batch(rows)
    if (Math.random() < 0.05) await db.prepare('DELETE FROM bizz_stats_live WHERE at < ?').bind(Date.now() - 30 * 60000).run()
    // The visitor hashes are only needed for the current day.
    if (Math.random() < 0.02) await db.prepare("DELETE FROM bizz_stats_seen WHERE day < date('now', '-2 days')").run()
  })().catch(e => console.error('analytics: hit not stored', e))
  if (ctx) ctx.waitUntil(job); else await job
  return done
}

/** One page's numbers for the last `days` days (e.g. a company profile for its owner): views and visitors of the page,
 *  inquiry button clicks and contact openings (the visitors who did it). */
export async function pageStats(db: D1Database, path: string, days: number, timeZone = 'UTC'): Promise<{ views: number; visitors: number; inquiry: number; contacts: number }> {
  await tables(db)
  const to = new Date().toLocaleDateString('sv-SE', { timeZone })
  const from = new Date(Date.parse(`${to}T12:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10)
  const rows = (await db.prepare(`SELECT kind, SUM(views) AS v, SUM(visitors) AS u FROM bizz_stats WHERE key = ? AND day BETWEEN ? AND ?
    AND kind IN ('page', 'event:inquiry', 'event:contacts') GROUP BY kind`).bind(path, from, to).all<{ kind: string; v: number; u: number }>()).results
  const get = (k: string) => rows.find(r => r.kind === k)
  return { views: get('page')?.v ?? 0, visitors: get('page')?.u ?? 0, inquiry: get('event:inquiry')?.u ?? 0, contacts: get('event:contacts')?.u ?? 0 }
}

// ---------------------------------------------------------------- admin

const RANGES: [string, string, number][] = [['today', 'Today', 1], ['7', '7 days', 7], ['30', '30 days', 30], ['90', '90 days', 90], ['365', '12 months', 365]]
const dayOf = (d: Date, timeZone: string) => d.toLocaleDateString('sv-SE', { timeZone })
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const num = (n: number) => n.toLocaleString('en-US')
const change = (now: number, before: number) => !before ? '' : `<span class="bizz-stats-change ${now >= before ? 'up' : 'down'}">${now >= before ? '+' : ''}${Math.round((now - before) / before * 100)}%</span>`
let regionNames: Intl.DisplayNames | null = null
const country = (code: string) => { try { regionNames ??= new Intl.DisplayNames(['en'], { type: 'region' }); return code === 'XX' ? 'Unknown' : regionNames.of(code) ?? code } catch { return code } }

async function me(request: Request, fetcher: Cms): Promise<{ role?: string } | null> {
  const cookie = request.headers.get('cookie')
  if (!cookie) return null
  const res = await fetcher(new Request(new URL('/auth/me', request.url), { headers: { cookie } }))
  if (!res.ok) return null
  return ((await res.json().catch(() => null)) as { user?: { role?: string } } | null)?.user ?? null
}

function chart(days: { day: string; views: number; visitors: number }[]): string {
  if (!days.length) return ''
  const max = Math.max(1, ...days.map(d => d.views)), w = 100 / days.length
  const bars = days.map((d, i) => `<g><title>${esc(d.day)}: ${num(d.views)} views, ${num(d.visitors)} visitors</title>
    <rect x="${(i * w + w * 0.12).toFixed(3)}%" y="${(100 - d.views / max * 100).toFixed(2)}%" width="${(w * 0.76).toFixed(3)}%" height="${(d.views / max * 100).toFixed(2)}%" class="v"/>
    <rect x="${(i * w + w * 0.12).toFixed(3)}%" y="${(100 - d.visitors / max * 100).toFixed(2)}%" width="${(w * 0.76).toFixed(3)}%" height="${(d.visitors / max * 100).toFixed(2)}%" class="u"/></g>`).join('')
  return `<div class="bizz-stats-chart"><svg width="100%" height="160" preserveAspectRatio="none" role="img" aria-label="Views and visitors per day">${bars}</svg>
    <div class="bizz-stats-axis"><span>${esc(days[0].day)}</span><span>${esc(days[days.length - 1].day)}</span></div>
    <p class="bizz-stats-legend"><i class="v"></i>Views <i class="u"></i>Visitors</p></div>`
}

function table(title: string, rows: { key: string; v: number; u: number }[], label: (k: string) => string, total: number): string {
  const body = rows.map(r => `<tr><td>${label(r.key)}</td><td class="n">${num(r.u)}</td><td class="n">${num(r.v)}</td><td class="bar"><span style="width:${Math.max(1, Math.round(r.v / Math.max(1, total) * 100))}%"></span></td></tr>`).join('')
  return `<div class="bizz-stats-box"><h2>${esc(title)}</h2><table class="bizz-seo-table"><thead><tr><th></th><th class="n">Visitors</th><th class="n">Views</th><th></th></tr></thead>
    <tbody>${body || '<tr><td colspan="4" class="bizz-seo-empty">No data yet.</td></tr>'}</tbody></table></div>`
}

const STYLE = `<style>.bizz-stats-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:18px 0}
.bizz-stats-card{border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:14px 16px}.bizz-stats-card b{display:block;font-size:26px;line-height:1.2;font-variant-numeric:tabular-nums}
.bizz-stats-card span{font-size:13px;opacity:.7}.bizz-stats-change{font-size:12px;margin-left:6px;font-weight:600}.bizz-stats-change.up{color:#2f7a4f}.bizz-stats-change.down{color:#b4232c}
.bizz-stats-chart{border:1px solid rgba(0,0,0,.08);border-radius:10px;padding:14px 16px;margin-bottom:18px}.bizz-stats-chart rect.v{fill:#cfd8dc}.bizz-stats-chart rect.u{fill:#455a64}
.bizz-stats-axis{display:flex;justify-content:space-between;font-size:12px;opacity:.6;margin-top:4px}.bizz-stats-legend{font-size:12px;margin:6px 0 0}.bizz-stats-legend i{display:inline-block;width:10px;height:10px;border-radius:2px;margin:0 4px 0 10px;vertical-align:-1px}
.bizz-stats-legend i.v{background:#cfd8dc}.bizz-stats-legend i.u{background:#455a64}.bizz-stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px}
.bizz-stats-box h2{font-size:15px;font-weight:600;margin:0 0 8px}.bizz-stats-box td.n,.bizz-stats-box th.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.bizz-stats-box td{overflow-wrap:anywhere}.bizz-stats-box td.bar{width:22%}.bizz-stats-box td.bar span{display:block;height:6px;border-radius:3px;background:#90a4ae}
.bizz-stats-ranges{display:flex;flex-wrap:wrap;gap:6px}.bizz-stats-ranges a{padding:5px 11px;border-radius:999px;border:1px solid rgba(0,0,0,.12);font-size:13px;text-decoration:none;color:inherit}
.bizz-stats-live ul{list-style:none;margin:8px 0 0;padding:0;font-size:12.5px}.bizz-stats-live li{display:flex;justify-content:space-between;gap:8px;padding:2px 0;overflow-wrap:anywhere}.bizz-stats-live li b{font-size:12.5px;display:inline}
.bizz-stats-live .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#2f9e5a;margin-right:6px;animation:bzpulse 1.6s infinite}@keyframes bzpulse{50%{opacity:.35}}
.bizz-stats-ranges a[aria-current]{background:#18181b;color:#fff;border-color:#18181b}.bizz-stats-note{font-size:13px;opacity:.7;margin-top:14px}</style>`

/** Admin › Analytics, and the Install button on Admin › Plugins; null when the path is not ours. */
export async function analyticsAdminRoute(request: Request, path: string, db: D1Database, fetcher: Cms, isAdmin: () => Promise<boolean>, opts: { timeZone?: string } = {}): Promise<Response | null> {
  if (request.method === 'POST' && path === '/admin/plugins/install') {
    const body = await request.clone().json().catch(() => null) as { name?: string; id?: string } | null
    if (body?.name !== ANALYTICS_PLUGIN_ID && body?.id !== ANALYTICS_PLUGIN_ID) return null
    if (!(await isAdmin())) return Response.json({ error: 'Access denied' }, { status: 403 })
    const plugin = await new PluginService(db).ensurePlugin(ANALYTICS_PLUGIN_ID, { displayName: 'Analytics', version: '1.0.0', description: analyticsPlugin.description, author: 'BizzCMS' })
    activeCache = null
    return Response.json({ success: true, plugin })
  }
  if (path.startsWith(`/admin/plugins/${ANALYTICS_PLUGIN_ID}`)) activeCache = null // activate / deactivate shows at once
  if ((path !== '/admin/analytics' && path !== '/admin/analytics/live') || request.method !== 'GET') return null
  const url = new URL(request.url)
  // The page frame (the dashboard layout) is fetched while the sign-in is checked and the numbers are read, not
  // after them: three internal passes in a row made Analytics the slowest admin page (2026-10-25).
  const page = path === '/admin/analytics' ? fetcher(new Request(new URL('/admin/dashboard', url), { headers: request.headers })) : null
  page?.catch(() => {}) // a signed-out or non-admin visitor returns before it is used
  const [user] = await Promise.all([me(request, fetcher), tables(db)])
  if (!user) return Response.redirect(new URL('/auth/login?redirect=/admin/analytics', url).toString(), 302)
  if (user.role !== 'admin') return new Response('Only administrators can open Analytics.', { status: 403 })
  const live = async () => {
    const rows = (await db.prepare('SELECT path, COUNT(*) AS n FROM bizz_stats_live WHERE at > ? GROUP BY path ORDER BY n DESC LIMIT 10').bind(Date.now() - 5 * 60000).all<{ path: string; n: number }>()).results
    return { now: rows.reduce((a, r) => a + r.n, 0), pages: rows }
  }
  // Visitors right now (last 5 minutes), for the page's own refresh every 15 seconds.
  if (path === '/admin/analytics/live') return Response.json(await live(), { headers: { 'cache-control': 'no-store' } })
  const tz = opts.timeZone ?? 'UTC'
  const range = RANGES.find(r => r[0] === url.searchParams.get('d')) ?? RANGES[2]
  const to = dayOf(new Date(), tz), from = shift(to, 1 - range[2]), pTo = shift(from, -1), pFrom = shift(pTo, 1 - range[2])
  const sum = (a: string, b: string) => db.prepare("SELECT COALESCE(SUM(views), 0) AS v, COALESCE(SUM(visitors), 0) AS u FROM bizz_stats WHERE kind = 'total' AND day BETWEEN ? AND ?").bind(a, b).first<{ v: number; u: number }>()
  const top = (kind: string, limit = 15) => db.prepare('SELECT key, SUM(views) AS v, SUM(visitors) AS u FROM bizz_stats WHERE kind = ? AND day BETWEEN ? AND ? GROUP BY key ORDER BY v DESC LIMIT ?').bind(kind, from, to, limit).all<{ key: string; v: number; u: number }>()
  const [now, before, daily, pages, refs, countries, devices, utms, active, rightNow] = await Promise.all([
    sum(from, to), sum(pFrom, pTo),
    db.prepare("SELECT day, views, visitors FROM bizz_stats WHERE kind = 'total' AND day BETWEEN ? AND ? ORDER BY day").bind(from, to).all<{ day: string; views: number; visitors: number }>(),
    top('page', 20), top('ref'), top('country'), top('device', 5), top('utm'), isActive(db), live()])
  const v = now?.v ?? 0, u = now?.u ?? 0, pv = before?.v ?? 0, pu = before?.u ?? 0
  const byDay = new Map(daily.results.map(d => [d.day, d]))
  const days = range[2] > 1 ? Array.from({ length: range[2] }, (_, i) => shift(from, i)).map(d => byDay.get(d) ?? { day: d, views: 0, visitors: 0 }) : []
  const livePages = (l: { pages: { path: string; n: number }[] }) => l.pages.map(r => `<li><span>${esc(r.path)}</span><b>${r.n}</b></li>`).join('') || '<li class="muted">Nobody on the site right now.</li>'
  const ranges = RANGES.map(([k, l]) => `<a href="/admin/analytics?d=${k}"${k === range[0] ? ' aria-current="page"' : ''}>${l}</a>`).join('')
  const body = `${STYLE}<div class="bizz-seo-page"><div class="mb-6"><h1 class="text-2xl/8 font-semibold text-zinc-950 dark:text-white sm:text-xl/8">Analytics</h1>
    <p class="mt-2 text-sm/6 text-zinc-500 dark:text-zinc-400">Every visitor of the public pages, counted without cookies and without personal data. Bots are not counted. ${esc(from)} – ${esc(to)}.</p></div>
    ${active ? '' : `<p class="bizz-api-saved">The plugin is not active, so nothing is counted. Activate it in <a href="/admin/plugins/${ANALYTICS_PLUGIN_ID}">Plugins › Analytics</a>.</p>`}
    <nav class="bizz-stats-ranges" aria-label="Period">${ranges}</nav>
    <div class="bizz-stats-cards"><div class="bizz-stats-card bizz-stats-live"><span><i class="dot"></i>Right now</span><b data-live-now>${num(rightNow.now)}</b><ul data-live-pages>${livePages(rightNow)}</ul></div><div class="bizz-stats-card"><span>Visitors</span><b>${num(u)}${change(u, pu)}</b></div><div class="bizz-stats-card"><span>Page views</span><b>${num(v)}${change(v, pv)}</b></div>
    <div class="bizz-stats-card"><span>Views per visitor</span><b>${u ? (v / u).toFixed(1) : '0'}</b></div></div>
    ${chart(days)}
    <div class="bizz-stats-grid">${table('Pages', pages.results, k => `<a href="${esc(k)}" target="_blank" rel="noopener">${esc(k)}</a>`, v)}
    ${table('Referrers', refs.results, k => esc(k), v)}${table('Countries', countries.results, k => esc(country(k)), v)}
    ${table('Devices', devices.results, k => esc(k), v)}${table('Campaigns (utm_source / medium / campaign)', utms.results, k => esc(k), v)}</div>
    <script>(function(){var n=document.querySelector('[data-live-now]'),u=document.querySelector('[data-live-pages]');function e(t){return String(t).replace(/[&<>"]/g,function(c){return'&#'+c.charCodeAt(0)+';'})}
    setInterval(function(){fetch('/admin/analytics/live',{credentials:'same-origin'}).then(function(r){return r.json()}).then(function(j){n.textContent=j.now;u.innerHTML=j.pages.length?j.pages.map(function(p){return'<li><span>'+e(p.path)+'</span><b>'+p.n+'</b></li>'}).join(''):'<li class="muted">Nobody on the site right now.</li>'}).catch(function(){})},15000)})()</script>
    <p class="bizz-stats-note">Right now: visitors with a page view in the last 5 minutes, refreshed every 15 seconds. Referrers count entries from other sites ((direct): typed address, bookmarks, apps). The previous period is shown as the change in %.</p></div>`
  const base = await page!
  if (!base.ok || !base.headers.get('content-type')?.includes('text/html')) return base
  return new HTMLRewriter()
    .on('main > div.grow', { element: el => { el.setInnerContent(body, { html: true }) } })
    .on('title', { element: el => { el.setInnerContent('Analytics - BizzCMS') } })
    .transform(new Response(base.body, base))
}
