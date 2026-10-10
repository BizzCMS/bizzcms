// BizzCMS plugin: Social Share. A "Share" bar for posts (and any page a site chooses): copy link,
// LinkedIn, X, Facebook, WhatsApp, Pinterest, e-mail and the phone's own share sheet. Plain share links
// with built-in icons: no third-party scripts, no tracking, nothing loaded from other sites.
// Admin › Plugins › Social Share: install, pick the buttons, activate. Sites call
//   await shareBar(db, url, title, image?)   where the bar goes (empty while the plugin is off)
// and theme it with CSS on .bz-share / .bz-share-btn (each button sets --bz-share-c to its brand colour).
import { definePlugin, PluginServiceClass as PluginService, applySchemaDefaults, renderSchemaFields } from 'bizzcms-core'
import type { ConfigSchema } from 'bizzcms-core'

export const SHARE_PLUGIN_ID = 'social-share'

const SCHEMA = {
  label: { type: 'string', label: 'Label', description: 'Text before the buttons. Leave empty to hide it.', default: 'Share', maxLength: 40 },
  copyLink: { type: 'boolean', label: 'Copy link', default: true },
  nativeShare: { type: 'boolean', label: "Phone's share menu", description: 'On phones and browsers that have one.', default: true },
  linkedin: { type: 'boolean', label: 'LinkedIn', default: true },
  x: { type: 'boolean', label: 'X (Twitter)', default: true },
  facebook: { type: 'boolean', label: 'Facebook', default: true },
  whatsapp: { type: 'boolean', label: 'WhatsApp', default: true },
  pinterest: { type: 'boolean', label: 'Pinterest', description: 'Only where the page has an image.', default: false },
  email: { type: 'boolean', label: 'E-mail', default: true }
} satisfies ConfigSchema

export const socialSharePlugin = definePlugin({
  id: SHARE_PLUGIN_ID,
  name: 'Social Share',
  version: '1.0.0',
  description: 'Share buttons for posts: copy link, LinkedIn, X, Facebook, WhatsApp, Pinterest, e-mail and the phone\'s share menu. No third-party scripts or tracking.',
  author: { name: 'BizzCMS', url: 'https://bizzcms.com' },
  capabilities: [],
  menu: [{ label: 'Social Share', path: `/admin/plugins/${SHARE_PLUGIN_ID}`, icon: 'share', order: 91 }],
  configSchema: SCHEMA,
  settingsTabContent: {
    render: ({ settings }) => `<div class="bizz-plugin-settings"><form method="POST" action="/admin/plugins/${SHARE_PLUGIN_ID}/configure" class="space-y-5">${renderSchemaFields(SCHEMA, applySchemaDefaults(SCHEMA, settings ?? {}))}<div class="pt-2"><button type="submit" class="inline-flex items-center justify-center rounded-lg bg-zinc-950 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950">Save settings</button></div></form></div>`
  }
})

type ShareSettings = Partial<Record<keyof typeof SCHEMA, unknown>>
let cache: { at: number; value: ShareSettings | null } | null = null
async function activeSettings(db: D1Database): Promise<ShareSettings | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value
  let value: ShareSettings | null = null
  try {
    const plugin = await new PluginService(db).getPlugin(SHARE_PLUGIN_ID) as { status?: string; settings?: ShareSettings } | null
    if (plugin?.status === 'active') value = applySchemaDefaults(SCHEMA, plugin.settings ?? {}) as ShareSettings
  } catch { value = null }
  cache = { at: Date.now(), value }
  return value
}

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
const svg = (inner: string, stroke = false) => `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"${stroke ? ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' : ' fill="currentColor"'}>${inner}</svg>`
// Brand marks: Simple Icons (CC0); LinkedIn drawn for BizzCMS.
const ICON = {
  linkedin: svg('<rect x="2.5" y="8.5" width="4.2" height="13" rx=".6"/><circle cx="4.6" cy="4.6" r="2.4"/><path d="M9.5 8.5h4v1.9c.7-1.2 2.2-2.2 4.3-2.2 3.6 0 4.7 2.3 4.7 5.6v7.7h-4.2v-6.8c0-1.7-.4-3-2.1-3-1.9 0-2.5 1.4-2.5 3.1v6.7H9.5z"/>'),
  x: svg('<path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z"/>'),
  facebook: svg('<path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z"/>'),
  whatsapp: svg('<path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>'),
  pinterest: svg('<path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z"/>'),
  email: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>', true),
  link: svg('<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>', true),
  share: svg('<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>', true)
}
const NETWORKS: { key: 'linkedin' | 'x' | 'facebook' | 'whatsapp' | 'pinterest' | 'email'; label: string; color: string; url: (u: string, t: string, img: string) => string }[] = [
  { key: 'linkedin', label: 'LinkedIn', color: '#0A66C2', url: u => `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  { key: 'x', label: 'X', color: '#000000', url: (u, t) => `https://x.com/intent/post?url=${u}&text=${t}` },
  { key: 'facebook', label: 'Facebook', color: '#1877F2', url: u => `https://www.facebook.com/sharer/sharer.php?u=${u}` },
  { key: 'whatsapp', label: 'WhatsApp', color: '#25D366', url: (u, t) => `https://wa.me/?text=${t}%20${u}` },
  { key: 'pinterest', label: 'Pinterest', color: '#E60023', url: (u, t, img) => `https://pinterest.com/pin/create/button/?url=${u}&media=${img}&description=${t}` },
  { key: 'email', label: 'E-mail', color: '#46546a', url: (u, t) => `mailto:?subject=${t}&body=${u}` }
]
// Neutral default look; sites override with their own CSS. Copy link + native share need the small script.
const CSS = `<style>.bz-share{display:flex;flex-wrap:wrap;align-items:center;gap:8px}.bz-share-label{font-weight:700;font-size:12px;letter-spacing:1.4px;text-transform:uppercase;opacity:.7;margin-right:6px}.bz-share-btn{--bz-share-c:#334;width:40px;height:40px;display:inline-grid;place-items:center;border-radius:999px;border:1px solid rgba(0,0,0,.12);background:#fff;color:var(--bz-share-c);cursor:pointer;padding:0;transition:background .2s,color .2s,border-color .2s,transform .2s}.bz-share-btn:hover{background:var(--bz-share-c);border-color:var(--bz-share-c);color:#fff;transform:translateY(-2px)}.bz-share-btn[hidden]{display:none}.bz-share-done{font-size:13px;font-weight:700;margin-left:4px}</style>`
const SCRIPT = `<script>(function(){document.querySelectorAll('.bz-share:not([data-ready])').forEach(function(bar){bar.setAttribute('data-ready','');var url=bar.getAttribute('data-url'),title=bar.getAttribute('data-title'),done=bar.querySelector('.bz-share-done'),nat=bar.querySelector('[data-share="native"]');
if(navigator.share&&nat){nat.hidden=false;nat.addEventListener('click',function(){navigator.share({title:title,url:url}).catch(function(){})})}
var copy=bar.querySelector('[data-share="copy"]');if(copy)copy.addEventListener('click',function(){var ok=function(){done.textContent=bar.getAttribute('data-copied')||'Link copied';setTimeout(function(){done.textContent=''},2000)};if(navigator.clipboard)navigator.clipboard.writeText(url).then(ok,function(){prompt(bar.getAttribute('data-prompt')||'Copy this link',url)});else prompt(bar.getAttribute('data-prompt')||'Copy this link',url)})})})();</script>`

// Button texts per page language (English, Croatian, German built in); the Label setting stays as entered
// unless it is the default "Share".
const TEXTS: Record<string, { share: string; copy: string; email: string; on: string; copied: string; prompt: string }> = {
  en: { share: 'Share', copy: 'Copy link', email: 'Share by e-mail', on: 'Share on', copied: 'Link copied', prompt: 'Copy this link' },
  hr: { share: 'Podijeli', copy: 'Kopiraj poveznicu', email: 'Pošalji e-poštom', on: 'Podijeli na', copied: 'Poveznica je kopirana', prompt: 'Kopirajte ovu poveznicu' },
  de: { share: 'Teilen', copy: 'Link kopieren', email: 'Per E-Mail teilen', on: 'Teilen auf', copied: 'Link kopiert', prompt: 'Diesen Link kopieren' }
}

/** The share bar for a page, or '' while the plugin is not active. `url` must be absolute; `lang` is the page language. */
export async function shareBar(db: D1Database, url: string, title: string, image?: string, lang = 'en'): Promise<string> {
  const T = TEXTS[lang.slice(0, 2).toLowerCase()] ?? TEXTS.en
  const s = await activeSettings(db)
  if (!s) return ''
  const u = encodeURIComponent(url), t = encodeURIComponent(title), img = image ? encodeURIComponent(new URL(image, url).href) : ''
  const btn = (attrs: string, label: string, color: string, icon: string) => `<${attrs.startsWith('href') ? 'a' : 'button type="button"'} class="bz-share-btn bz-share-${label.toLowerCase().replace(/[^a-z]/g, '')}" style="--bz-share-c:${color}" ${attrs} aria-label="${esc(label)}" title="${esc(label)}">${icon}</${attrs.startsWith('href') ? 'a' : 'button'}>`
  const items = [
    s.nativeShare !== false ? btn('data-share="native" hidden', T.share, '#334', ICON.share) : '',
    s.copyLink !== false ? btn('data-share="copy"', T.copy, '#334', ICON.link) : '',
    ...NETWORKS.filter(n => s[n.key] === true && (n.key !== 'pinterest' || img)).map(n => btn(`href="${esc(n.url(u, t, img))}"${n.key === 'email' ? '' : ' target="_blank" rel="noopener nofollow"'}`, n.key === 'email' ? T.email : `${T.on} ${n.label}`, n.color, ICON[n.key]))
  ].filter(Boolean)
  if (!items.length) return ''
  const set = String(s.label ?? '').trim(), label = set === 'Share' ? T.share : set
  return `${CSS}<div class="bz-share" data-url="${esc(url)}" data-title="${esc(title)}" data-copied="${esc(T.copied)}" data-prompt="${esc(T.prompt)}">${label ? `<span class="bz-share-label">${esc(label)}</span>` : ''}${items.join('')}<span class="bz-share-done" role="status" aria-live="polite"></span></div>${SCRIPT}`
}

/** Admin routes, answered before upstream (same as the Google Analytics plugin): back to the plugin
 *  page after saving, and "Install" for this code-registered plugin. Both need an admin session. */
export async function shareAdminRoute(request: Request, path: string, db: D1Database, isAdmin: () => Promise<boolean>): Promise<Response | null> {
  if (request.method === 'GET' && path === `/admin/plugins/${SHARE_PLUGIN_ID}/configure`) { cache = null; return Response.redirect(new URL(`/admin/plugins/${SHARE_PLUGIN_ID}?saved=1`, request.url).toString(), 302) }
  if (request.method === 'POST' && path === '/admin/plugins/install') {
    const body = await request.clone().json().catch(() => null) as { name?: string; id?: string } | null
    if (body?.name !== SHARE_PLUGIN_ID && body?.id !== SHARE_PLUGIN_ID) return null
    if (!(await isAdmin())) return Response.json({ error: 'Access denied' }, { status: 403 })
    const plugin = await new PluginService(db).ensurePlugin(SHARE_PLUGIN_ID, { displayName: 'Social Share', version: '1.0.0', description: socialSharePlugin.description, author: 'BizzCMS' })
    cache = null
    return Response.json({ success: true, plugin })
  }
  return null
}
