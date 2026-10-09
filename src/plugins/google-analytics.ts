// BizzCMS plugin: Google Analytics 4 with a cookie consent banner.
// Admin › Plugins › Google Analytics: enter the Measurement ID (G-…), activate the plugin, done.
// Every public HTML page of the site then gets a small banner (Accept / Reject). Google Analytics loads
// only after the visitor accepts (Google Consent Mode defaults to "denied"), and the choice is remembered.
// Admin, sign-in and API pages never get it, and local hosts are skipped so test visits stay out of the
// stats. Any element with data-cookie-settings (e.g. a "Cookie settings" footer link) reopens the banner.
import { definePlugin, PluginServiceClass as PluginService, applySchemaDefaults, renderSchemaFields } from 'bizzcms-core'
import type { ConfigSchema } from 'bizzcms-core'

export const GA_PLUGIN_ID = 'google-analytics'

const SCHEMA = {
  measurementId: { type: 'string', label: 'Measurement ID', description: 'From Google Analytics › Admin › Data streams, for example G-Q8K9JDCJ5G.', placeholder: 'G-XXXXXXXXXX', maxLength: 20 },
  requireConsent: { type: 'boolean', label: 'Ask for consent first', description: 'Show the cookie banner and load Google Analytics only after the visitor accepts. Keep this on for visitors in the EU and the UK.', default: true },
  bannerText: { type: 'string', label: 'Banner text', default: 'We use Google Analytics cookies to see how this website is used, only if you agree.', maxLength: 300 },
  policyUrl: { type: 'string', label: 'Cookie policy link', description: 'Address of your cookie policy page. Leave empty to hide the link.', default: '/cookies', maxLength: 300 }
  } satisfies ConfigSchema

export const googleAnalyticsPlugin = definePlugin({
  id: GA_PLUGIN_ID,
  name: 'Google Analytics',
  version: '1.0.0',
  description: 'Google Analytics 4 for your public pages, with a cookie consent banner. Analytics loads only after the visitor accepts.',
  author: { name: 'BizzCMS', url: 'https://bizzcms.com' },
  capabilities: [],
  // Sidebar link under Plugins (shown while the plugin is installed).
  menu: [{ label: 'Google Analytics', path: `/admin/plugins/${GA_PLUGIN_ID}`, icon: 'chart', order: 90 }],
  configSchema: SCHEMA,
  // Settings tab on the plugin page, in the admin design (the form posts to the schema settings route).
  settingsTabContent: {
    render: ({ settings }) => `<div class="bizz-plugin-settings"><form method="POST" action="/admin/plugins/${GA_PLUGIN_ID}/configure" class="space-y-5">${renderSchemaFields(SCHEMA, applySchemaDefaults(SCHEMA, settings ?? {}))}<div class="pt-2"><button type="submit" class="bg-zinc-950 text-white">Save Settings</button></div></form></div>`
  }
})

interface GaSettings { measurementId?: string; requireConsent?: boolean; bannerText?: string; policyUrl?: string }
let cache: { at: number; value: GaSettings | null } | null = null

async function activeSettings(db: D1Database): Promise<GaSettings | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value
  let value: GaSettings | null = null
  try {
    const plugin = await new PluginService(db).getPlugin(GA_PLUGIN_ID) as { status?: string; settings?: GaSettings } | null
    if (plugin?.status === 'active' && /^G-[A-Z0-9]{4,16}$/.test(String(plugin.settings?.measurementId ?? '').trim())) value = plugin.settings ?? null
  } catch { value = null }
  cache = { at: Date.now(), value }
  return value
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

function snippet(s: GaSettings): string {
  const id = String(s.measurementId).trim()
  const consent = s.requireConsent !== false
  const policy = (s.policyUrl ?? '').trim()
  const policyLink = /^(https?:\/\/|\/)/.test(policy) ? ` <a href="${esc(policy)}">Cookie policy</a>` : ''
  const css = `#bz-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:9999;max-width:560px;margin:0 auto;padding:16px 18px;border-radius:14px;background:#fff;color:#172e30;box-shadow:0 18px 50px rgba(16,47,49,.18),0 0 0 1px rgba(16,47,49,.08);font:14px/1.5 system-ui,-apple-system,'Segoe UI',sans-serif;display:flex;flex-wrap:wrap;align-items:center;gap:12px}#bz-consent[hidden]{display:none}#bz-consent p{margin:0;flex:1 1 260px}#bz-consent a{color:#086568;text-decoration:underline}#bz-consent .bz-c-actions{display:flex;gap:8px;margin-left:auto}#bz-consent button{border:0;border-radius:9px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer}#bz-consent .bz-c-no{background:#eef2f1;color:#172e30}#bz-consent .bz-c-yes{background:#086568;color:#fff}`
  const banner = consent ? `<div id="bz-consent" role="dialog" aria-live="polite" aria-label="Cookie consent" hidden><p>${esc(s.bannerText || 'We use Google Analytics cookies to see how this website is used, only if you agree.')}${policyLink}</p><div class="bz-c-actions"><button type="button" class="bz-c-no" data-consent="denied">Reject</button><button type="button" class="bz-c-yes" data-consent="granted">Accept</button></div></div>` : ''
  // The one GA4 integration of the site (nothing else may print gtag.js). Consent Mode v2: everything denied
  // until the visitor accepts; gtag.js is fetched and GA4 configured ONCE, on the first "granted" (stored or
  // clicked), which sends the page_view for the current page. Later Reject/Accept clicks only update consent,
  // so no second initialisation and no duplicate page_view. A second copy of this snippet on a page does nothing.
  const js = `(function(){if(window.__bizzGa)return;window.__bizzGa=1;var ID=${JSON.stringify(id)},K='bizz_consent',ask=${consent};window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:ask?'denied':'granted'});
var loaded=false;function load(){gtag('consent','update',{analytics_storage:'granted'});if(loaded)return;loaded=true;var s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+ID;document.head.appendChild(s);gtag('js',new Date());gtag('config',ID)}
function get(){try{return localStorage.getItem(K)}catch(e){return null}}function set(v){try{localStorage.setItem(K,v)}catch(e){}}
if(!ask){load();return}
function banner(show){var b=document.getElementById('bz-consent');if(b)b.hidden=!show}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-consent],[data-cookie-settings]');if(!t)return;if(t.hasAttribute('data-cookie-settings')){e.preventDefault();banner(true);return}var v=t.getAttribute('data-consent');set(v);banner(false);if(v==='granted')load();else if(loaded){gtag('consent','update',{analytics_storage:'denied'})}});
function start(){var v=get();if(v==='granted')load();else if(v!=='denied')banner(true)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()})();`
  return `<style>${css}</style>${banner}<script>${js}</script>`
}

/** Admin routes for this plugin, answered before upstream:
 *  - after saving, the bare upstream settings page is skipped: back to the plugin page;
 *  - "Install" (upstream's install fails for code-registered plugins with a slug clash in beta.28):
 *    the plugin record is created the same way upstream's own settings save does (ensurePlugin).
 *  Both need an admin session; upstream checks it again on every following request. */
export async function gaAdminRoute(request: Request, path: string, db: D1Database, isAdmin: () => Promise<boolean>): Promise<Response | null> {
  if (request.method === 'GET' && path === `/admin/plugins/${GA_PLUGIN_ID}/configure`) return Response.redirect(new URL(`/admin/plugins/${GA_PLUGIN_ID}?saved=1`, request.url).toString(), 302)
  if (request.method === 'POST' && path === '/admin/plugins/install') {
    const body = await request.clone().json().catch(() => null) as { name?: string; id?: string } | null
    if (body?.name !== GA_PLUGIN_ID && body?.id !== GA_PLUGIN_ID) return null
    if (!(await isAdmin())) return Response.json({ error: 'Access denied' }, { status: 403 })
    const svc = new PluginService(db)
    const plugin = await svc.ensurePlugin(GA_PLUGIN_ID, { displayName: 'Google Analytics', version: '1.0.0', description: googleAnalyticsPlugin.description, author: 'BizzCMS' })
    cache = null
    return Response.json({ success: true, plugin })
  }
  return null
}

/** Adds the banner and Google Analytics to public HTML pages when the plugin is active and configured. */
export async function withGoogleAnalytics(response: Response, request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url)
  if (request.method !== 'GET' || !response.headers.get('content-type')?.includes('text/html')) return response
  if (/^\/(admin|auth|api|files|mcp)(\/|$)/.test(url.pathname)) return response
  const host = url.hostname
  // Local hosts are skipped (test visits stay out of the stats); ?bizz-ga-preview shows the banner locally for checking.
  if ((host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost')) && !url.searchParams.has('bizz-ga-preview')) return response
  const settings = await activeSettings(db)
  if (!settings) return response
  const add = snippet(settings)
  // One integration only: a gtag.js tag printed by a template or pasted into content would load GA a second
  // time, outside consent. It is removed here; the snippet below is the only place GA4 starts.
  return new HTMLRewriter()
    .on('script[src*="googletagmanager.com/gtag/js"]', { element(el) { el.remove() } })
    .on('body', { element(el) { el.append(add, { html: true }) } })
    .transform(response)
}
