// BizzCMS plugin: Languages. One site in several languages, each on its own addresses, so search engines
// index every language (the old "language cookie" switchers showed one URL in one language to Google).
// - Admin › Plugins › Languages: the site's languages (e.g. hr, en, de) and the main one.
// - Main language at /, the others under /<code>/ (/en/, /de/about-us/ …). A translated page is an ordinary
//   page whose URL path starts with /<code>/ and whose "Translation of" field holds the original's path.
// - Every public HTML page then gets <html lang>, hreflang links (+ x-default) for the versions that exist,
//   and a switcher in any element with data-bizz-languages. A language without a version of this page
//   links to that language's home page.
//   Site wiring: response = await withLanguages(response, request, db)   (inside the edge cache)
//                layout:  <div data-bizz-languages></div> where the switcher goes
//                page collections: ...LANGUAGE_FIELDS
import { definePlugin, PluginServiceClass as PluginService, applySchemaDefaults, renderSchemaFields } from 'bizzcms-core'
import type { ConfigSchema } from 'bizzcms-core'

export const LANG_PLUGIN_ID = 'languages'

const SCHEMA = {
  languages: { type: 'string', label: 'Languages', description: 'Language codes of the site, main language first, separated by commas, e.g. hr, en, de.', default: 'en', maxLength: 100 },
  labels: { type: 'string', label: 'Switcher labels', description: 'Optional, same order, e.g. HR, EN, DE or Hrvatski, English, Deutsch. Empty = the codes in capitals.', default: '', maxLength: 200 }
} satisfies ConfigSchema

export const languagesPlugin = definePlugin({
  id: LANG_PLUGIN_ID,
  name: 'Languages',
  version: '1.0.0',
  description: 'Your site in several languages: own addresses per language (/en/, /de/ …), hreflang for search engines and a language switcher.',
  author: { name: 'BizzCMS', url: 'https://bizzcms.com' },
  capabilities: [],
  menu: [{ label: 'Languages', path: `/admin/plugins/${LANG_PLUGIN_ID}`, icon: 'globe', order: 91 }],
  configSchema: SCHEMA,
  settingsTabContent: {
    render: ({ settings }) => `<div class="bizz-plugin-settings"><form method="POST" action="/admin/plugins/${LANG_PLUGIN_ID}/configure" class="space-y-5">${renderSchemaFields(SCHEMA, applySchemaDefaults(SCHEMA, settings ?? {}))}
<p class="text-sm text-zinc-500 dark:text-zinc-400">A translation is a page with the URL path /&lt;code&gt;/… (e.g. /en/about-us/) and, under "Translation of", the path of the original page (e.g. /o-nama/). The home pages are / and /&lt;code&gt;/.</p>
<button type="submit" class="rounded-lg bg-zinc-950 px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-zinc-950">Save</button></form></div>`
  }
})

/** Field for page-like collections: links a translation to its original. */
export const LANGUAGE_FIELDS = {
  translationOf: { type: 'string', title: 'Translation of', maxLength: 200, helpText: 'Languages plugin: on a translated page, the URL path of the original page, e.g. /o-nama/. Empty on originals.' }
} as const

export interface LanguageSettings { languages: string[]; labels: string[]; main: string }
let cache: { at: number; value: LanguageSettings | null } | null = null

const CODE = /^[a-z]{2,3}(-[a-z]{2,4})?$/

/** Settings of the active plugin with at least two languages, else null (the site is single-language). */
export async function languageSettings(db: D1Database): Promise<LanguageSettings | null> {
  if (cache && Date.now() - cache.at < 30_000) return cache.value
  let value: LanguageSettings | null = null
  try {
    const plugin = await new PluginService(db).getPlugin(LANG_PLUGIN_ID) as { status?: string; settings?: { languages?: string; labels?: string } } | null
    if (plugin?.status === 'active') {
      const languages = String(plugin.settings?.languages ?? '').toLowerCase().split(',').map(s => s.trim()).filter(s => CODE.test(s))
      const labels = String(plugin.settings?.labels ?? '').split(',').map(s => s.trim())
      if (languages.length > 1) value = { languages: [...new Set(languages)], labels, main: languages[0] }
    }
  } catch { value = null }
  cache = { at: Date.now(), value }
  return value
}

/** Language of a public path: /en/… → en, anything else → the main language. */
export function pathLanguage(path: string, s: LanguageSettings): string {
  const first = path.split('/')[1]?.toLowerCase() ?? ''
  return s.languages.includes(first) && first !== s.main ? first : s.main
}

const homeOf = (lang: string, s: LanguageSettings) => (lang === s.main ? '/' : `/${lang}/`)

/** The versions of a page that exist: { lang: path }. Home pages are / and /<code>/; other pages are linked
 *  through "Translation of" (any collection whose documents have a path). */
export async function pageVersions(db: D1Database, path: string, s: LanguageSettings): Promise<Record<string, string>> {
  const lang = pathLanguage(path, s)
  if (path === homeOf(lang, s)) return Object.fromEntries(s.languages.map(l => [l, homeOf(l, s)]))
  const out: Record<string, string> = { [lang]: path }
  const live = `is_published = 1 AND is_current_draft = 1 AND (deleted_at IS NULL OR deleted_at = '')`
  const own = await db.prepare(`SELECT json_extract(data, '$.translationOf') AS t FROM documents WHERE ${live} AND json_extract(data, '$.path') = ? LIMIT 1`).bind(path).first<{ t: string | null }>()
  const original = typeof own?.t === 'string' && own.t.trim().startsWith('/') ? own.t.trim() : path
  const { results } = await db.prepare(`SELECT json_extract(data, '$.path') AS p FROM documents WHERE ${live} AND (json_extract(data, '$.path') = ? OR json_extract(data, '$.translationOf') = ?) LIMIT 20`)
    .bind(original, original).all<{ p: string | null }>()
  for (const r of results) if (typeof r.p === 'string' && r.p.startsWith('/')) { const l = pathLanguage(r.p, s); if (!out[l]) out[l] = r.p }
  return out
}

const esc = (v: string) => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function hreflangLinks(versions: Record<string, string>, origin: string, s: LanguageSettings): string {
  const links = s.languages.filter(l => versions[l]).map(l => `<link rel="alternate" hreflang="${l}" href="${esc(origin + versions[l])}">`)
  if (links.length < 2) return ''
  return links.join('') + (versions[s.main] ? `<link rel="alternate" hreflang="x-default" href="${esc(origin + versions[s.main])}">` : '')
}

export function languageSwitcher(versions: Record<string, string>, current: string, s: LanguageSettings): string {
  return `<nav class="bizz-lang" aria-label="Language">${s.languages.map((l, i) => {
    const label = s.labels[i] || l.toUpperCase()
    return l === current ? `<span class="bizz-lang-current" aria-current="true" lang="${l}">${esc(label)}</span>`
      : `<a href="${esc(versions[l] ?? homeOf(l, s))}" hreflang="${l}" lang="${l}">${esc(label)}</a>`
  }).join('')}</nav>`
}

// Open Graph locales (language_TERRITORY); a language not listed here uses its code twice (fr → fr_FR).
const REGION: Record<string, string> = { en: 'GB', hr: 'HR', de: 'DE', sl: 'SI', sr: 'RS', bs: 'BA', cs: 'CZ', da: 'DK', el: 'GR', sv: 'SE', uk: 'UA', ja: 'JP', zh: 'CN', ko: 'KR' }

/** Public HTML pages: <html lang>, hreflang links, og:locale and the switcher in [data-bizz-languages]. */
export async function withLanguages(response: Response, request: Request, db: D1Database): Promise<Response> {
  const url = new URL(request.url)
  if (request.method !== 'GET' || !response.headers.get('content-type')?.includes('text/html')) return response
  if (/^\/(admin|auth|api|files|mcp)(\/|$)/.test(url.pathname)) return response
  const s = await languageSettings(db)
  if (!s) return response
  const lang = pathLanguage(url.pathname, s)
  // A 404 has no versions; the switcher then points at the home pages.
  const versions = response.status === 200 ? await pageVersions(db, url.pathname, s) : {}
  const locale = (l: string) => (l.includes('-') ? l.replace('-', '_') : `${l}_${REGION[l] ?? l.toUpperCase()}`)
  const links = (response.status === 200 ? hreflangLinks(versions, url.origin, s) : '') + `<meta property="og:locale" content="${locale(lang)}">`
    + s.languages.filter(l => l !== lang && versions[l]).map(l => `<meta property="og:locale:alternate" content="${locale(l)}">`).join('')
  const switcher = languageSwitcher(versions, lang, s)
  return new HTMLRewriter()
    .on('html', { element(el) { el.setAttribute('lang', lang) } })
    .on('link[rel="alternate"][hreflang]', { element(el) { el.remove() } })
    .on('head', { element(el) { el.append(links, { html: true }) } })
    .on('[data-bizz-languages]', { element(el) { el.setInnerContent(switcher, { html: true }) } })
    .transform(response)
}

export async function languagesAdminRoute(request: Request, path: string, db: D1Database, isAdmin: () => Promise<boolean>): Promise<Response | null> {
  if (request.method === 'GET' && path === `/admin/plugins/${LANG_PLUGIN_ID}/configure`) return Response.redirect(new URL(`/admin/plugins/${LANG_PLUGIN_ID}?saved=1`, request.url).toString(), 302)
  if (request.method === 'POST' && path === `/admin/plugins/${LANG_PLUGIN_ID}/configure`) cache = null
  if (request.method === 'POST' && path === '/admin/plugins/install') {
    const body = await request.clone().json().catch(() => null) as { name?: string; id?: string } | null
    if (body?.name !== LANG_PLUGIN_ID && body?.id !== LANG_PLUGIN_ID) return null
    if (!(await isAdmin())) return Response.json({ error: 'Access denied' }, { status: 403 })
    const plugin = await new PluginService(db).ensurePlugin(LANG_PLUGIN_ID, { displayName: 'Languages', version: '1.0.0', description: languagesPlugin.description, author: 'BizzCMS' })
    cache = null
    return Response.json({ success: true, plugin })
  }
  return null
}
