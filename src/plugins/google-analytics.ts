// BizzCMS plugin: Google Analytics 4 with a cookie consent banner.
// Admin › Plugins › Google Analytics: enter the Measurement ID (G-…), activate the plugin, done.
// Every public HTML page of the site then gets a cookie bar in the Cookiebot style: Necessary / Preferences /
// Statistics / Marketing switches, details, and Allow all · Allow selection · Use necessary cookies only. Google Analytics loads
// only after the visitor accepts (Google Consent Mode defaults to "denied"), and the choice is remembered.
// Admin, sign-in and API pages never get it, and local hosts are skipped so test visits stay out of the
// stats. Any element with data-cookie-settings (e.g. a "Cookie settings" footer link) reopens the banner.
import { definePlugin, PluginServiceClass as PluginService, applySchemaDefaults, renderSchemaFields } from 'bizzcms-core'
import type { ConfigSchema } from 'bizzcms-core'

export const GA_PLUGIN_ID = 'google-analytics'

const SCHEMA = {
  measurementId: { type: 'string', label: 'Measurement ID', description: 'From Google Analytics › Admin › Data streams, for example G-Q8K9JDCJ5G.', placeholder: 'G-XXXXXXXXXX', maxLength: 20 },
  requireConsent: { type: 'boolean', label: 'Ask for consent', description: 'Show the cookie bar. Google Analytics is on every page, but uses cookies only after the visitor allows Statistics (Google Consent Mode). Keep this on for visitors in the EU and the UK.', default: true },
  bannerTitle: { type: 'string', label: 'Banner title', description: 'Leave empty for "This website uses cookies" in the language of the page.', default: '', maxLength: 120 },
  bannerText: { type: 'string', label: 'Banner text', description: 'Leave empty for the standard text in the language of the page (English, Croatian and German built in).', default: '', maxLength: 400 },
  accentColor: { type: 'string', label: 'Button colour', description: 'Colour of "Allow all", the button borders and the switches, e.g. #4168b1. Empty = BizzCMS teal.', default: '', maxLength: 9 },
  accentTextColor: { type: 'string', label: 'Button text colour', description: 'Text colour on "Allow all", e.g. #ffffff. Empty = white.', default: '', maxLength: 9 },
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

export interface GaSettings { measurementId?: string; requireConsent?: boolean; bannerTitle?: string; bannerText?: string; policyUrl?: string; accentColor?: string; accentTextColor?: string }
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

// Banner texts per language (the page's <html lang>); the Banner title / text settings override them.
const TEXTS = {
  en: {
    title: 'This website uses cookies',
    body: 'We use cookies to keep this website working, to remember your choices and, with your permission, to see how the site is used (Google Analytics) and to measure our advertising.',
    necessary: 'Necessary', preferences: 'Preferences', statistics: 'Statistics', marketing: 'Marketing',
    show: 'Show details', hide: 'Hide details',
    all: 'Allow all', selection: 'Allow selection', only: 'Use necessary cookies only', policy: 'Cookie policy',
    dNecessary: 'Keep the website working and remember this choice (bizz_consent, stored in your browser). Always on.',
    dPreferences: 'Remember your settings on this website, such as language.',
    dStatistics: 'Google Analytics (_ga, _ga_*; up to 2 years): which pages are visited and how visitors find the website.',
    dMarketing: 'Measure our advertising with Google. Nothing is used for advertising unless you allow it.'
  },
  hr: {
    title: 'Ova web-stranica koristi kolačiće',
    body: 'Kolačiće koristimo kako bi stranica radila, kako bismo zapamtili vaše postavke i, uz vaše dopuštenje, analizirali promet (Google Analytics) i mjerili oglašavanje.',
    necessary: 'Nužni', preferences: 'Za postavke', statistics: 'Statistički', marketing: 'Marketinški',
    show: 'Prikaži detalje', hide: 'Sakrij detalje',
    all: 'Omogući sve kolačiće', selection: 'Dopusti selektiranje', only: 'Samo nužni kolačići', policy: 'Pravila o kolačićima',
    dNecessary: 'Omogućuju rad stranice i pamte ovaj odabir (bizz_consent, u vašem pregledniku). Uvijek uključeni.',
    dPreferences: 'Pamte vaše postavke na stranici, npr. jezik.',
    dStatistics: 'Google Analytics (_ga, _ga_*; do 2 godine): koje se stranice posjećuju i kako posjetitelji pronalaze stranicu.',
    dMarketing: 'Mjerenje našeg oglašavanja putem Googlea. Ništa se ne koristi za oglašavanje bez vašeg dopuštenja.'
  },
  de: {
    title: 'Diese Website verwendet Cookies',
    body: 'Wir verwenden Cookies, damit die Website funktioniert, um Ihre Auswahl zu speichern und, mit Ihrer Zustimmung, um die Nutzung der Website zu analysieren (Google Analytics) und unsere Werbung zu messen.',
    necessary: 'Notwendig', preferences: 'Präferenzen', statistics: 'Statistiken', marketing: 'Marketing',
    show: 'Details zeigen', hide: 'Details ausblenden',
    all: 'Alle zulassen', selection: 'Auswahl erlauben', only: 'Nur notwendige Cookies verwenden', policy: 'Cookie-Richtlinie',
    dNecessary: 'Halten die Website funktionsfähig und speichern diese Auswahl (bizz_consent, in Ihrem Browser). Immer aktiv.',
    dPreferences: 'Speichern Ihre Einstellungen auf dieser Website, z. B. die Sprache.',
    dStatistics: 'Google Analytics (_ga, _ga_*; bis zu 2 Jahre): welche Seiten besucht werden und wie Besucher die Website finden.',
    dMarketing: 'Messung unserer Werbung mit Google. Ohne Ihre Zustimmung wird nichts für Werbung verwendet.'
  }
}
const OLD_DEFAULT_TEXT = 'We use Google Analytics cookies to see how this website is used, only if you agree.'

/** The banner + GA snippet for given settings (also used to preview the bar). */
export function gaSnippet(s: GaSettings): string {
  const id = String(s.measurementId).trim()
  const consent = s.requireConsent !== false
  const policy = (s.policyUrl ?? '').trim()
  const colour = (v: unknown, d: string) => (/^#[0-9a-f]{3,8}$/i.test(String(v ?? '').trim()) ? String(v).trim() : d)
  const accent = colour(s.accentColor, '#086568'), accentText = colour(s.accentTextColor, '#ffffff')
  const custom = { title: (s.bannerTitle ?? '').trim(), body: (s.bannerText ?? '').trim() === OLD_DEFAULT_TEXT ? '' : (s.bannerText ?? '').trim() }
  const cfg = { id, ask: consent, policy: /^(https?:\/\/|\/)/.test(policy) ? policy : '', texts: TEXTS, custom }
  // Cookiebot-style bar: categories with switches, details, and three choices with "Allow all" first.
  const css = `#bz-consent{--bz-a:${accent};--bz-at:${accentText};position:fixed;left:0;right:0;bottom:0;z-index:9999;background:#fff;color:#141414;box-shadow:0 -8px 32px rgba(0,0,0,.14);font:14px/1.55 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;max-height:88vh;overflow:auto}#bz-consent[hidden]{display:none}
#bz-consent .bz-in{max-width:1200px;margin:0 auto;padding:16px 24px;display:grid;grid-template-columns:1fr 260px;gap:20px 40px;align-items:center}
#bz-consent h2{margin:0 0 6px;font:700 15px/1.3 system-ui,-apple-system,'Segoe UI',sans-serif;color:#141414}#bz-consent p{margin:0}#bz-consent a{color:var(--bz-a)}
#bz-consent .bz-cats{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px;margin-top:12px}#bz-consent .bz-cat{display:inline-flex;align-items:center;gap:10px;font-weight:600;cursor:pointer;user-select:none}
#bz-consent .bz-cat input{position:absolute;opacity:0;width:1px;height:1px}#bz-consent .bz-sw{width:44px;height:24px;border-radius:999px;background:#141414;position:relative;transition:background .2s;flex:none}#bz-consent .bz-sw::after{content:'';position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .2s}
#bz-consent .bz-cat input:checked+.bz-sw{background:var(--bz-a)}#bz-consent .bz-cat input:checked+.bz-sw::after{transform:translateX(20px)}#bz-consent .bz-cat input:disabled+.bz-sw{opacity:.75}#bz-consent .bz-cat input:focus-visible+.bz-sw{outline:2px solid var(--bz-a);outline-offset:2px}
#bz-consent .bz-more{background:none;border:0;padding:0;color:var(--bz-a);font:600 14px system-ui,sans-serif;cursor:pointer}#bz-consent .bz-det{grid-column:1/-1;display:grid;gap:8px;padding-top:4px;border-top:1px solid #eee}#bz-consent .bz-det[hidden]{display:none}#bz-consent .bz-det b{display:block}
#bz-consent .bz-btns{display:grid;gap:8px}#bz-consent .bz-btns button{width:100%;padding:10px 16px;border-radius:4px;border:2px solid var(--bz-a);background:#fff;color:#141414;font:600 14px system-ui,sans-serif;cursor:pointer}#bz-consent .bz-btns .bz-all{background:var(--bz-a);color:var(--bz-at)}#bz-consent .bz-btns button:hover{filter:brightness(.95)}
@media (max-width:860px){#bz-consent .bz-in{grid-template-columns:1fr;padding:18px 16px;gap:14px}#bz-consent .bz-cats{gap:12px 18px}}`
  // The one GA4 integration of the site (nothing else may print gtag.js). Google Consent Mode v2 "advanced",
  // as with Cookiebot: gtag.js loads on every page; until the visitor allows Statistics, GA gets only
  // cookieless pings (no cookies, no identifiers). "Allow all" / a selection with Statistics grants consent
  // and counts the current page once; a stored choice is the default on later pages. The choice is kept in
  // localStorage (bizz_consent, JSON; old "granted"/"denied" values still count). [data-cookie-settings]
  // elements reopen the bar.
  const js = `(function(){if(window.__bizzGa)return;window.__bizzGa=1;var C=${JSON.stringify(cfg).replace(/</g, '\\u003c')},K='bizz_consent';
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;
function read(){try{var v=localStorage.getItem(K);if(!v)return null;if(v==='granted')return{p:false,s:true,m:false};if(v==='denied')return{p:false,s:false,m:false};var o=JSON.parse(v);return o&&typeof o==='object'?o:null}catch(e){return null}}
function save(c){try{localStorage.setItem(K,JSON.stringify({p:!!c.p,s:!!c.s,m:!!c.m,t:Date.now()}))}catch(e){}}
// The stored choice (if any) is the default, so a returning visitor's first page_view is counted normally.
var cur=C.ask?(read()||null):{p:true,s:true,m:true},st=cur&&cur.s,mk=cur&&cur.m,counted=!!st;
gtag('consent','default',{analytics_storage:st?'granted':'denied',ad_storage:mk?'granted':'denied',ad_user_data:mk?'granted':'denied',ad_personalization:mk?'granted':'denied',wait_for_update:500});
var g=document.createElement('script');g.async=true;g.src='https://www.googletagmanager.com/gtag/js?id='+C.id;document.head.appendChild(g);gtag('js',new Date());gtag('config',C.id);
function apply(c){var m=c.m?'granted':'denied';gtag('consent','update',{analytics_storage:c.s?'granted':'denied',ad_storage:m,ad_user_data:m,ad_personalization:m});
  // First "yes" to Statistics on this page: count this page now (until then GA only sent a cookieless ping).
  if(c.s&&!counted){counted=true;gtag('event','page_view')}}
if(!C.ask)return
var lang=(document.documentElement.getAttribute('lang')||'en').slice(0,2).toLowerCase(),T=C.texts[lang]||C.texts.en;
function esc(v){return String(v).replace(/[&<>"]/g,function(ch){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[ch]})}
function cat(k,label,on,fixed){return '<label class="bz-cat"><input type="checkbox" data-cat="'+k+'"'+(on?' checked':'')+(fixed?' disabled':'')+'><span class="bz-sw" aria-hidden="true"></span>'+esc(label)+'</label>'}
function render(c){var b=document.getElementById('bz-consent');if(!b)return null;c=c||{p:false,s:false,m:false};
  b.innerHTML='<div class="bz-in"><div><h2>'+esc(C.custom.title||T.title)+'</h2><p>'+esc(C.custom.body||T.body)+(C.policy?' <a href="'+esc(C.policy)+'">'+esc(T.policy)+'</a>':'')+'</p>'
  +'<div class="bz-cats">'+cat('n',T.necessary,true,true)+cat('p',T.preferences,c.p)+cat('s',T.statistics,c.s)+cat('m',T.marketing,c.m)+'<button type="button" class="bz-more" aria-expanded="false">'+esc(T.show)+' &rsaquo;</button></div></div>'
  +'<div class="bz-btns"><button type="button" class="bz-all" data-consent="all">'+esc(T.all)+'</button><button type="button" data-consent="selection">'+esc(T.selection)+'</button><button type="button" data-consent="necessary">'+esc(T.only)+'</button></div>'
  +'<div class="bz-det" hidden><div><b>'+esc(T.necessary)+'</b>'+esc(T.dNecessary)+'</div><div><b>'+esc(T.preferences)+'</b>'+esc(T.dPreferences)+'</div><div><b>'+esc(T.statistics)+'</b>'+esc(T.dStatistics)+'</div><div><b>'+esc(T.marketing)+'</b>'+esc(T.dMarketing)+'</div></div></div>';
  return b}
function show(){var b=render(read());if(b){b.hidden=false;b.setAttribute('role','dialog');b.setAttribute('aria-label',T.title)}}
function hide(){var b=document.getElementById('bz-consent');if(b)b.hidden=true}
function choose(c){save(c);hide();apply(c)}
document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('[data-consent],[data-cookie-settings],.bz-more');if(!t)return;
  if(t.hasAttribute('data-cookie-settings')){e.preventDefault();show();return}
  var b=document.getElementById('bz-consent');
  if(t.classList.contains('bz-more')){var d=b.querySelector('.bz-det');d.hidden=!d.hidden;t.setAttribute('aria-expanded',String(!d.hidden));t.innerHTML=esc(d.hidden?T.show:T.hide)+(d.hidden?' &rsaquo;':' &lsaquo;');return}
  var v=t.getAttribute('data-consent'),box=function(k){var i=b.querySelector('[data-cat="'+k+'"]');return !!(i&&i.checked)};
  if(v==='all'||v==='granted')choose({p:true,s:true,m:true});else if(v==='selection')choose({p:box('p'),s:box('s'),m:box('m')});else choose({p:false,s:false,m:false})});
function start(){if(!read())show()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start()})();`
  return `<style>${css}</style><div id="bz-consent" hidden aria-live="polite"></div><script>${js}</script>`
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
  const add = gaSnippet(settings)
  // One integration only: a gtag.js tag printed by a template or pasted into content would load GA a second
  // time, outside consent. It is removed here; the snippet below is the only place GA4 starts.
  return new HTMLRewriter()
    .on('script[src*="googletagmanager.com/gtag/js"]', { element(el) { el.remove() } })
    .on('body', { element(el) { el.append(add, { html: true }) } })
    .transform(response)
}
