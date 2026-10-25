// BizzCMS Directory plugin: the public pages. A searchable company directory with a sticky filter
// panel (category, region, city, guests, price, indoor/outdoor, amenities, Premium), removable filter
// pills, grid/list view, numbered pages, category and city landing pages, and company profiles with a
// gallery and, for Premium companies, a "request a date" form.
// Addresses, query words, categories and wording come from setDirectory() (config.ts).
// Reads published rows of the `documents` table with the same visibility rules as the public API
// (published, not deleted), so drafts never show.
import { DocumentsService } from 'bizzcms-core'
import { readForm } from '../../site-accounts'
import {
  alphabetical, bookingSql, categoryUrl, extraCategoriesOf, extraCategoriesSql, cityUrl, regionUrl, directorySettings, notifyDirectory, directoryUrl, label, listingUrl, matchRoute, planOf, type Plan, type DirectorySettings, slugify, subcategories
} from './config'
import { esc, fold, html, icon, mediaList, pageWindow, safeDecode, safeUrl, str, truthy, validEmail } from './util'
import { mediaGallery, mediaHero, mediaItems, mediaViewer, videoIds } from './media'

type Env = { DB: D1Database }
type Row = Record<string, unknown>
const PAGE_SIZE = 24

interface Filters {
  q: string; category: string; region: string; city: string; guests: string; price: string
  setting: string; premium: string; sort: string; view: string; page: number
  amenities: string[]
  /** "Favourites only": the visitor's saved profiles (slugs); null when the filter is off. */
  favorites: string[] | null
  /** "Price from" range in euros ('' = no limit). */
  priceMin: string; priceMax: string
}

/** Directory pages and profiles at the site's addresses; null for any other path. */
export async function handleDirectory(request: Request, env: Env): Promise<Response | null> {
  const { routes, text, params } = directorySettings()
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const get = request.method === 'GET' || request.method === 'HEAD'
  const moved = (target: string) => Response.redirect(new URL(target, url.origin).href, 301)
  // Same address every time: with the trailing slash when the site's addresses have one.
  const slashed = (pattern: string) => pattern.endsWith('/') && !url.pathname.endsWith('/')

  const landing = matchRoute(routes.directory, path) ? { kind: 'directory' }
    : matchRoute(routes.category, path) ? { kind: 'category', slug: matchRoute(routes.category, path)!.slug }
    : matchRoute(routes.city, path) ? { kind: 'city', slug: matchRoute(routes.city, path)!.slug }
    : routes.region && matchRoute(routes.region, path) ? { kind: 'region', slug: matchRoute(routes.region, path)!.slug } : null
  if (landing) {
    if (!get) return null
    const pattern = landing.kind === 'directory' ? routes.directory : landing.kind === 'category' ? routes.category
      : landing.kind === 'region' ? routes.region! : routes.city
    if (slashed(pattern)) return moved(url.pathname + '/' + url.search)
    // Type-ahead suggestions for the search box: ?suggest=<text> → JSON (cities first, then companies).
    const suggest = url.searchParams.get('suggest')
    if (suggest !== null) return Response.json(await suggestions(env.DB, suggest), { headers: { 'cache-control': 'public, max-age=300' } })
    // Clean addresses: empty parameters go (?q=&kategorija=x), and a search that is only a category or a city
    // goes to that category/city page (the home search form sends ?kategorija=catering&q=).
    const clean = new URLSearchParams()
    for (const [k, v] of url.searchParams) if (v.trim() !== '') clean.append(k, v)
    // Filters stay on the category (or city) page: /directory?category=x&region=y → /category/x/?region=y.
    if (landing.kind === 'directory' && !clean.has(params.q)) {
      const cat = clean.get(params.category), city = clean.get(params.city)
      if (cat) { clean.delete(params.category); return moved(categoryUrl(cat) + (clean.toString() ? `?${clean}` : '')) }
      // A city already says the region, so the region filter goes with it.
      if (city) { clean.delete(params.city); clean.delete(params.region); return moved(cityUrl(city) + (clean.toString() ? `?${clean}` : '')) }
      const region = clean.get(params.region)
      if (region && routes.region) { clean.delete(params.region); return moved(regionUrl(region) + (clean.toString() ? `?${clean}` : '')) }
    }
    if (clean.toString() !== url.searchParams.toString()) return moved(url.pathname + (clean.toString() ? `?${clean}` : ''))
    const filters = readFilters(url.searchParams)
    if (landing.kind === 'category') filters.category = safeDecode(landing.slug!)
    if (landing.kind === 'city') filters.city = safeDecode(landing.slug!)
    if (landing.kind === 'region') filters.region = safeDecode(landing.slug!)
    // A typed city is an exact filter: "osijek" → the Osijek page; "bend osijek" → "bend" among Osijek companies.
    if (filters.q && !filters.city) {
      const hit = await cityInQuery(env.DB, filters.q)
      if (hit) {
        filters.city = hit.slug
        filters.q = hit.rest
        if (!hit.rest) {
          const p = new URLSearchParams(url.search); p.delete(params.q)
          if (filters.category) { p.set(params.city, hit.slug); return moved(`${url.pathname}?${p}`) }
          return moved(cityUrl(hit.slug) + (p.toString() ? `?${p}` : ''))
        }
      }
    }
    const page = await directoryPage(env.DB, filters, url)
    return html(page.html, page.found || landing.kind === 'directory' ? 200 : 404)
  }

  const legacy = routes.legacyListing ? matchRoute(routes.legacyListing, path) : null
  const own = legacy ? null : matchRoute(routes.listing, path)
  if (!legacy && !own) return null
  const slug = own ? safeDecode(own.slug) : ''
  const company = legacy ? await findListing(env.DB, { legacyId: Number(legacy.id) })
    : /^[a-z0-9-]+$/.test(slug) ? await findListing(env.DB, { slug }) : null
  // A company taken off the directory (unpublished, e.g. closed) keeps its old address alive: 301 to its main
  // category page (a company has exactly one), or to the directory when it has none. Never a 404.
  if (!company && get) {
    // Only companies that were public before (imported from an old site, or taken down after the online check);
    // a new profile waiting for approval simply does not exist yet.
    const gone = await env.DB.prepare(`SELECT ${J('category')} AS category FROM documents WHERE type_id = 'partners' AND is_current_draft = 1
      AND (deleted_at IS NULL OR deleted_at = '') AND (${J('legacyId')} IS NOT NULL OR COALESCE(${J('checkStatus')}, '') != '')
      AND ${legacy ? `CAST(${J('legacyId')} AS INTEGER) = ?` : 'slug = ?'} LIMIT 1`)
      .bind(legacy ? Number(legacy.id) : slug).first<{ category: string | null }>()
    if (gone) return moved(gone.category && directorySettings().taxonomy.categories.some(c => c.slug === gone.category) ? categoryUrl(gone.category) : directoryUrl())
  }
  if (!company) return html(page(text.notFound, `<div class="wrap profile"><h1>${esc(text.notFound)}</h1><p><a href="${esc(directoryUrl())}">${esc(text.backToDirectory)}</a></p></div>`), 404)
  // One address per company: another name or a missing slash goes to the canonical one.
  const canonical = listingUrl(company)
  if (get && safeDecode(url.pathname) !== canonical) return moved(canonical + url.search)
  if (request.method === 'POST') {
    if (!company.requests) return html(page(company.title, `<div class="wrap profile"><h1>${esc(text.requestsUnavailable)}</h1></div>`), 403)
    const result = await saveRequest(await readForm(request), company, env, url.origin, request.headers.get('x-bizz-account') ?? undefined)
    if (result.ok) return Response.redirect(new URL(`${canonical}?${params.sent}=1#${params.requestAnchor}`, url.origin).href, 303)
    return html(profilePage(company, { error: result.error, values: result.values }, url.origin, await shareFor(env.DB, url.origin + canonical, company)), 400)
  }
  if (!get) return null
  return html(profilePage(company, { sent: url.searchParams.get(params.sent) === '1' }, url.origin, await shareFor(env.DB, url.origin + canonical, company)))
}

// Structured data (schema.org JSON-LD) for search engines and AI assistants.
const jsonLd = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`
const abs = (origin: string, path: string) => (/^https?:\/\//.test(path) ? path : `${origin}${encodeURI(path)}`)
function breadcrumbs(origin: string, items: [string, string][]) {
  return { '@type': 'BreadcrumbList', itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(origin, path) })) }
}

// Share buttons (setDirectory({ share })), in a wrapper the site can style; never breaks the page.
async function shareBlock(db: D1Database, url: string, title: string, image?: string): Promise<string> {
  const share = directorySettings().share
  if (!share) return ''
  const bar = await share(db, url, title, image).catch(() => '')
  return bar ? `<div class="dir-share">${bar}</div>` : ''
}
const shareFor = (db: D1Database, url: string, p: Listing) => {
  const img = p.cover ?? p.image
  return shareBlock(db, encodeURI(url), p.title, img ? abs(new URL(url).origin, img) : undefined)
}

const page = (title: string, body: string, opts: { description?: string; canonical?: string; index?: boolean; head?: string; image?: string } = {}) =>
  directorySettings().layout(title, body, opts)

// ---------------------------------------------------------------- queries

const J = (field: string) => `json_extract(data, '$.${field}')`
const TRUE = (field: string) => `${J(field)} IN (1, 'true', 'on', '1')`
const PUBLISHED = `type_id = 'partners' AND is_published = 1 AND (deleted_at IS NULL OR deleted_at = '')`
const PREMIUM = () => bookingSql()
// Featured while `featuredUntil` (YYYY-MM-DD) is today or later; first in the default and Recommended order.
const FEATURED = `(COALESCE(${J('featuredUntil')}, '') >= date('now'))`
// A company is in a category through its main category/subcategory or, while its plan allows it, its
// `extraCategories` (category or subcategory slugs; a subcategory also counts for its parent category).
function inCategory(slug: string, today: string): { sql: string; binds: unknown[] } {
  const isSub = subcategories().some(s => s.slug === slug)
  const values = [slug, ...(isSub ? [] : subcategories().filter(s => s.parent === slug).map(s => s.slug))]
  return {
    sql: `(${J(isSub ? 'subcategory' : 'category')} = ? OR (EXISTS (SELECT 1 FROM json_each(documents.data, '$.extraCategories') e WHERE e.value IN (${values.map(() => '?').join(',')})) AND ${extraCategoriesSql()}))`,
    binds: [slug, ...values, today]
  }
}
// Category memberships of the companies matching `base` (main + allowed extras), for counts: (id, k, s) rows.
function memberships(base: string): string {
  const subs = subcategories().map(s => `('${s.slug.replace(/'/g, "''")}', '${s.parent.replace(/'/g, "''")}')`).join(', ') || "('', '')"
  return `WITH base AS (SELECT id, data FROM documents WHERE ${base}), subs(sub, parent) AS (VALUES ${subs}),
    m AS (SELECT id, ${J('category')} AS k, ${J('subcategory')} AS s FROM base
      UNION SELECT base.id, COALESCE(subs.parent, e.value), CASE WHEN subs.parent IS NULL THEN NULL ELSE e.value END
        FROM base, json_each(base.data, '$.extraCategories') e LEFT JOIN subs ON subs.sub = e.value
        WHERE (SELECT ${extraCategoriesSql().replace(/json_extract\(data,/g, 'json_extract(base.data,')}))`
}
const CARD_FIELDS = () => `slug, title, ${J('category')} AS category, ${J('subcategory')} AS subcategory, ${J('county')} AS county,
  ${J('city')} AS city, ${J('summary')} AS summary, ${J('coverImage')} AS cover, ${J('gallery')} AS gallery,
  ${J('capacity')} AS capacity, ${J('priceLevel')} AS priceLevel, ${J('priceFrom')} AS priceFrom, ${J('priceUnit')} AS priceUnit, ${J('legacyId')} AS legacyId, ${J('legacySlug')} AS legacySlug, ${PREMIUM()} AS premium, ${FEATURED} AS featured`

function readFilters(p: URLSearchParams): Filters {
  const { params, taxonomy } = directorySettings()
  const get = (k: string) => (p.get(k) ?? '').trim().slice(0, 100)
  return {
    q: get(params.q), category: get(params.category), region: get(params.region), city: get(params.city), guests: get(params.guests),
    price: get(params.price), setting: get(params.setting), premium: get(params.premium), sort: get(params.sort) === params.defaultSort ? '' : get(params.sort), view: get(params.view),
    page: Math.min(10000, Math.max(1, Number.parseInt(get(params.page), 10) || 1)),
    amenities: taxonomy.amenities.map(([k]) => k).filter(k => p.get(k) === '1'),
    priceMin: /^\d{1,7}$/.test(get(params.priceMin)) ? String(Number(get(params.priceMin))) : '',
    priceMax: /^\d{1,7}$/.test(get(params.priceMax)) ? String(Number(get(params.priceMax))) : '',
    favorites: p.has(params.favorites) ? (p.get(params.favorites) ?? '').split(',').map(s => s.trim()).filter(s => /^[a-z0-9-]{1,120}$/.test(s)).slice(0, 200) : null
  }
}

type Facet = 'category' | 'region' | 'city' | 'price'

function where(f: Filters, cityNames: string[], today: string, skip: Facet[] = []) {
  const sql = [PUBLISHED]
  const binds: unknown[] = []
  if (f.q) {
    // Every word must match somewhere (name, city, summary or keywords), e.g. "band osijek".
    const haystack = fold(`title || ' ' || COALESCE(${J('city')}, '') || ' ' || COALESCE(${J('summary')}, '') || ' ' || COALESCE(${J('keywords')}, '')`)
    for (const word of slugify(f.q).split('-').filter(Boolean).slice(0, 6)) {
      sql.push(`${haystack} LIKE ?`)
      binds.push(`%${word}%`)
    }
  }
  if (f.category && !skip.includes('category')) {
    const c = inCategory(f.category, today)
    sql.push(c.sql); binds.push(...c.binds)
  }
  if (f.region && !skip.includes('region')) { sql.push(`${J('county')} = ?`); binds.push(f.region) }
  if (f.city && !skip.includes('city')) {
    sql.push(cityNames.length ? `${J('city')} IN (${cityNames.map(() => '?').join(',')})` : '0')
    binds.push(...cityNames)
  }
  if (Number(f.guests) > 0) { sql.push(`CAST(${J('capacity')} AS INTEGER) >= ?`); binds.push(Number(f.guests)) }
  if (f.price) { sql.push(`CAST(${J('priceLevel')} AS TEXT) = ?`); binds.push(f.price) }
  if (f.setting === 'indoor' || f.setting === 'outdoor') { sql.push(`${J('setting')} IN (?, 'both')`); binds.push(f.setting) }
  for (const a of f.amenities) sql.push(TRUE(a))
  if (f.premium === '1') { sql.push(PREMIUM()); binds.push(today) }
  if ((f.priceMin || f.priceMax) && !skip.includes('price')) {
    sql.push(`CAST(COALESCE(${J('priceFrom')}, 0) AS INTEGER) > 0`)
    if (f.priceMin) { sql.push(`CAST(${J('priceFrom')} AS INTEGER) >= ?`); binds.push(Number(f.priceMin)) }
    if (f.priceMax) { sql.push(`CAST(${J('priceFrom')} AS INTEGER) <= ?`); binds.push(Number(f.priceMax)) }
  }
  if (f.favorites) {
    sql.push(f.favorites.length ? `slug IN (${f.favorites.map(() => '?').join(',')})` : '0')
    binds.push(...f.favorites)
  }
  return { sql: sql.join(' AND '), binds }
}

function orderBy(sort: string): string {
  const { params } = directorySettings()
  // Featured profiles come first in the default order and in Recommended; a sort the visitor picks is followed as is.
  const lead = !sort || sort === params.sortRecommended ? 'featured DESC, ' : ''
  if (!sort) sort = params.defaultSort
  if (sort === params.sortName) return lead + 'title COLLATE NOCASE'
  if (sort === params.sortNewest) return lead + 'created_at DESC'
  if (sort === params.sortCapacity) return lead + `CAST(${J('capacity')} AS INTEGER) IS NULL, CAST(${J('capacity')} AS INTEGER) DESC, title COLLATE NOCASE`
  // Visits: the optional `views` field (e.g. carried over from an old site).
  if (sort === params.sortPopular) return lead + `CAST(${J('views')} AS INTEGER) DESC, title COLLATE NOCASE`
  return lead + `premium DESC, CAST(${J('views')} AS INTEGER) DESC, title COLLATE NOCASE`
}

// Cities that have published companies (name + slug), cached briefly per isolate.
let cityCache: { at: number; list: { name: string; slug: string; n: number }[] } | null = null
async function cityList(db: D1Database) {
  if (cityCache && Date.now() - cityCache.at < 300_000) return cityCache.list
  const rows = (await db.prepare(`SELECT ${J('city')} AS city, COUNT(*) AS n FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('city')}, '') != '' GROUP BY 1`).all<{ city: string; n: number }>()).results
  const bySlug = new Map<string, { name: string; slug: string; n: number }>()
  for (const r of rows) { const slug = slugify(r.city); const e = bySlug.get(slug); if (e) e.n += Number(r.n); else if (slug) bySlug.set(slug, { name: r.city, slug, n: Number(r.n) }) }
  cityCache = { at: Date.now(), list: [...bySlug.values()] }
  return cityCache.list
}

/** The longest city name (whole words, accents ignored) in the search text, and the text without it. */
async function cityInQuery(db: D1Database, q: string): Promise<{ slug: string; rest: string } | null> {
  const words = slugify(q).split('-').filter(Boolean)
  if (!words.length) return null
  const cities = (await cityList(db)).map(c => ({ ...c, w: c.slug.split('-') })).sort((a, b) => b.w.length - a.w.length)
  for (const c of cities) {
    for (let i = 0; i + c.w.length <= words.length; i++) {
      if (c.w.every((w, j) => words[i + j] === w)) {
        const rest = [...words.slice(0, i), ...words.slice(i + c.w.length)].join(' ')
        return { slug: c.slug, rest }
      }
    }
  }
  return null
}

/** Search-box suggestions: up to 5 cities (by name start) and 6 companies (by name), with their addresses. */
async function suggestions(db: D1Database, raw: string) {
  const q = slugify(raw).replace(/-/g, ' ').trim()
  if (q.length < 2) return []
  const cities = (await cityList(db)).filter(c => c.slug.replace(/-/g, ' ').startsWith(q) || c.slug.replace(/-/g, ' ').includes(' ' + q))
    .sort((a, b) => b.n - a.n).slice(0, 5)
    .map(c => ({ kind: 'city', label: c.name, count: c.n, url: cityUrl(c.slug) }))
  const today = new Date().toISOString().slice(0, 10)
  const rows = (await db.prepare(`SELECT ${CARD_FIELDS()} FROM documents WHERE ${PUBLISHED} AND ${fold('title')} LIKE ? ORDER BY featured DESC, premium DESC, CAST(${J('views')} AS INTEGER) DESC, title COLLATE NOCASE LIMIT 6`)
    .bind(today, `%${q}%`).all<Row>()).results.map(toCard)
  return [...cities, ...rows.map(c => ({ kind: 'company', label: c.title, city: c.city ?? '', url: listingUrl(c) }))]
}

export interface Card {
  slug: string; title: string; category?: string; subcategory?: string; county?: string; city?: string; summary?: string
  image?: string; capacity?: number; priceLevel?: string; priceFrom?: number; priceUnit?: string; premium: boolean; featured?: boolean; legacyId?: number; legacySlug?: string
}

async function search(db: D1Database, f: Filters) {
  const today = new Date().toISOString().slice(0, 10)
  // Resolve the city slug to the stored city name(s) (names carry accents).
  let cityNames: string[] = []
  if (f.city) {
    const all = await db.prepare(`SELECT DISTINCT ${J('city')} AS city FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('city')}, '') != ''`).all<{ city: string }>()
    cityNames = all.results.map(r => r.city).filter(c => slugify(c) === f.city)
  }
  // A chosen city also shows its region in the region list (display only, so data errors never hide a company).
  let cityRegion: string | undefined
  if (f.city && !f.region && cityNames.length) {
    const row = await db.prepare(`SELECT ${J('county')} AS k, COUNT(*) AS n FROM documents WHERE ${PUBLISHED} AND ${J('city')} IN (${cityNames.map(() => '?').join(',')})
      AND COALESCE(${J('county')}, '') != '' GROUP BY 1 ORDER BY n DESC LIMIT 1`).bind(...cityNames).first<{ k: string }>()
    cityRegion = row?.k
  }
  const main = where(f, cityNames, today)
  const offset = (f.page - 1) * PAGE_SIZE
  const byCategory = where(f, cityNames, today, ['category'])
  const byRegion = where(f, cityNames, today, ['region', 'city'])
  const byCity = where(f, cityNames, today, ['city'])
  const byPrice = where(f, cityNames, today, ['price'])
  const PRICE = `CAST(COALESCE(${J('priceFrom')}, 0) AS INTEGER)`
  const [count, rows, catFacets, regionFacets, cityFacets, priceFacet] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE ${main.sql}`).bind(...main.binds),
    db.prepare(`SELECT ${CARD_FIELDS()} FROM documents WHERE ${main.sql} ORDER BY ${orderBy(f.sort)} LIMIT ? OFFSET ?`).bind(today, ...main.binds, PAGE_SIZE, offset),
    // Each company once per category and once per subcategory (main and extra categories together).
    db.prepare(`${memberships(byCategory.sql)} SELECT k, NULL AS s, COUNT(DISTINCT id) AS n FROM m GROUP BY k
      UNION ALL SELECT NULL, s, COUNT(DISTINCT id) FROM m WHERE s IS NOT NULL GROUP BY s`).bind(...byCategory.binds, today),
    db.prepare(`SELECT ${J('county')} AS k, COUNT(*) AS n FROM documents WHERE ${byRegion.sql} GROUP BY k`).bind(...byRegion.binds),
    db.prepare(`SELECT ${J('city')} AS k, COUNT(*) AS n FROM documents WHERE ${byCity.sql} AND COALESCE(${J('city')}, '') != '' GROUP BY k ORDER BY k`).bind(...byCity.binds),
    db.prepare(`SELECT MIN(${PRICE}) AS lo, MAX(${PRICE}) AS hi, COUNT(*) AS n FROM documents WHERE ${byPrice.sql} AND ${PRICE} > 0`).bind(...byPrice.binds)
  ])
  const pb = priceFacet.results[0] as { lo: number | null; hi: number | null; n: number } | undefined
  return {
    total: Number((count.results[0] as Row)?.n ?? 0),
    cards: (rows.results as Row[]).map(toCard),
    categoryCounts: catFacets.results as { k: string; s: string | null; n: number }[],
    regionCounts: new Map((regionFacets.results as { k: string; n: number }[]).map(r => [r.k, r.n])),
    cities: (cityFacets.results as { k: string; n: number }[]).map(r => ({ name: r.k, slug: slugify(r.k), n: r.n })),
    cityLabel: cityNames[0],
    cityRegion,
    /** Lowest and highest "price from" among the results (without the price filter); null when fewer than two have one. */
    priceBounds: pb && pb.n >= 2 && Number(pb.hi) > Number(pb.lo) ? { lo: Number(pb.lo), hi: Number(pb.hi) } : null
  }
}

/** "from €35 per person", or the price level (€–€€€€) when there is no amount and the site shows levels; '' for none. */
function priceText(c: Pick<Card, 'priceFrom' | 'priceUnit' | 'priceLevel'>): string {
  const { taxonomy, text } = directorySettings()
  if (c.priceFrom) return text.priceFrom(c.priceFrom.toLocaleString('hr-HR'), label(taxonomy.priceUnits, c.priceUnit) ?? '')
  return taxonomy.showPriceLevels !== false ? label(taxonomy.priceLevels, c.priceLevel) ?? '' : ''
}

function toCard(r: Row): Card {
  return {
    slug: String(r.slug), title: String(r.title), category: str(r.category), subcategory: str(r.subcategory),
    county: str(r.county), city: str(r.city), summary: str(r.summary),
    // No photo yet: the category's photo, if the site has one.
    image: mediaList(r.cover)[0] ?? mediaList(r.gallery)[0] ?? directorySettings().taxonomy.categories.find(c => c.slug === str(r.category))?.image,
    capacity: Number(r.capacity) || undefined,
    priceLevel: r.priceLevel === null || r.priceLevel === undefined || r.priceLevel === '' ? undefined : String(r.priceLevel),
    priceFrom: Number(r.priceFrom) > 0 ? Number(r.priceFrom) : undefined, priceUnit: str(r.priceUnit),
    premium: Number(r.premium) === 1, featured: Number(r.featured) === 1,
    legacyId: Number(r.legacyId) > 0 ? Number(r.legacyId) : undefined, legacySlug: str(r.legacySlug)
  }
}

export interface Listing extends Card {
  description?: string; gallery: string[]; website?: string; phone?: string; email?: string; setting?: string; address?: string
  amenities: string[]; extraCategories: string[]; busyDates: string[]; seoTitle?: string; seoDescription?: string; seoImage?: string; canonical?: string; noindex?: boolean; cover?: string; videos: string[]
  /** The company's package now (undefined when the site has no packages). */
  plan?: Plan
  /** Social network links shown on the profile: [label, url]. */
  socials: [name: string, url: string, key: string][]
  /** Couples can send an inquiry (the package has inquiries, or the company has "request a date"). */
  requests: boolean
}

/** A published company by URL slug or by its old site ID. */
export async function findListing(db: D1Database, by: { slug: string } | { legacyId: number }): Promise<Listing | null> {
  const today = new Date().toISOString().slice(0, 10)
  const match = 'slug' in by ? 'slug = ?' : `CAST(${J('legacyId')} AS INTEGER) = ?`
  const row = await db.prepare(`SELECT slug, title, data, ${PREMIUM()} AS premium FROM documents WHERE ${PUBLISHED} AND ${match} LIMIT 1`)
    .bind(today, 'slug' in by ? by.slug : by.legacyId).first<Row>()
  if (!row) return null
  let d: Row = {}
  try { d = JSON.parse(String(row.data ?? '{}')) } catch { /* keep empty */ }
  // The package decides what the profile shows: photos (the cover counts), videos, website and social links.
  const plan = planOf(d)
  const premium = Number(row.premium) === 1
  const cover = mediaList(d.coverImage)[0]
  const links = plan ? plan.links : true
  let gallery = mediaList(d.gallery)
  if (plan) gallery = gallery.filter(u => u !== cover).slice(0, Math.max(0, plan.photos - (cover ? 1 : 0)))
  return {
    ...toCard({ ...d, slug: row.slug, title: str(d.title) ?? row.title, cover: d.coverImage, premium: row.premium }),
    description: str(d.description), gallery, cover, videos: videoIds(d.videos).slice(0, plan ? plan.videos : undefined),
    website: safeUrl(str(d.website)), address: str(d.address), plan, requests: premium || !!plan?.requests,
    socials: links ? directorySettings().taxonomy.socials.flatMap(([k, name]) => { const u = safeUrl(str(d[k])); return u ? [[name, u, k] as [string, string, string]] : [] }) : [],
    phone: str(d.phone), email: str(d.email), setting: str(d.setting),
    amenities: directorySettings().taxonomy.amenities.filter(([k]) => truthy(d[k])).map(([, v]) => v),
    extraCategories: extraCategoriesOf(d),
    // Days the company marked busy (or accepted), from today on; only with "request a date" (the site's booking calendar).
    busyDates: premium ? [...new Set((Array.isArray(d.busyDates) ? d.busyDates : []).map(String).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x) && x >= today))].sort().slice(0, 400) : [],
    seoTitle: str(d.seoTitle), seoDescription: str(d.seoDescription), seoImage: str(d.seoImage), canonical: str(d.canonical), noindex: truthy(d.noindex)
  }
}

/** `account`: the signed-in visitor's e-mail, when the site passes it (header x-bizz-account, set by the site only). */
async function saveRequest(form: FormData, company: Listing, env: Env, origin: string, account?: string) {
  const { text } = directorySettings()
  const values = Object.fromEntries(['coupleName', 'email', 'phone', 'weddingDate', 'guests', 'message']
    .map(k => [k, String(form.get(k) ?? '').trim()]))
  if (String(form.get('website') ?? '') !== '') return { ok: true as const } // honeypot: pretend success
  if (!values.coupleName || values.coupleName.length > 200) return { ok: false as const, error: text.errName, values }
  if (!validEmail(values.email)) return { ok: false as const, error: text.errEmail, values }
  if (values.weddingDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.weddingDate)) return { ok: false as const, error: text.errDate, values }
  if (values.weddingDate && company.busyDates.includes(values.weddingDate)) return { ok: false as const, error: text.errDateBusy, values }
  if (values.message.length > 3000 || values.phone.length > 60) return { ok: false as const, error: text.errTooLong, values }
  const guests = Number.parseInt(values.guests, 10)

  const title = `${values.coupleName} → ${company.title}${values.weddingDate ? ` (${values.weddingDate})` : ''}`.slice(0, 200)
  // Drafts are never returned by the public API, so requests stay private to staff.
  await new DocumentsService(env.DB).create({
    typeId: 'booking-requests', title, publishOnCreate: false,
    data: {
      title, partner: company.slug, partnerName: company.title, coupleName: values.coupleName,
      email: values.email, phone: values.phone, weddingDate: values.weddingDate || undefined,
      guests: Number.isFinite(guests) && guests > 0 ? guests : undefined, message: values.message, handling: 'new',
      ...(account ? { userEmail: account } : {})
    }
  } as unknown as Parameters<DocumentsService['create']>[0]) // create() applies schema defaults
  await notifyDirectory({ type: 'booking', listing: { title: company.title, url: abs(origin, listingUrl(company)), email: company.email || undefined },
    request: { coupleName: values.coupleName, email: values.email, phone: values.phone, weddingDate: values.weddingDate || undefined,
      guests: Number.isFinite(guests) && guests > 0 ? guests : undefined, message: values.message } })
  return { ok: true as const }
}

/** Directory card: the directory, and anywhere a site shows companies (home page, articles). */
/**
 * Price range slider: two handles on one track, from the lowest to the highest "price from" in the results. A handle
 * left at its end does not filter (the script disables it before the form is sent). Without bounds (fewer than two
 * companies with a price) the section only shows while a price filter is in use, so it can be removed by its pill.
 */
function priceSlider(f: Filters, bounds: { lo: number; hi: number } | null): string {
  const { text, params: P, locale } = directorySettings()
  if (!bounds) return ''
  const span = bounds.hi - bounds.lo
  const step = span <= 300 ? 5 : span <= 3000 ? 50 : 100
  const lo = Math.floor(bounds.lo / step) * step, hi = Math.ceil(bounds.hi / step) * step
  const clamp = (v: string, d: number) => (v ? Math.min(hi, Math.max(lo, Number(v))) : d)
  const from = clamp(f.priceMin, lo), to = clamp(f.priceMax, hi)
  const fmt = (n: number) => n.toLocaleString(locale === 'hr' ? 'hr-HR' : 'en-GB')
  return `<div class="fsec price-range"${memberOnly(!!(f.priceMin || f.priceMax))}>
    <p class="flabel">${esc(text.priceRange)}</p>
    <p class="pr-out" data-pr-out data-from="${esc(text.priceRangeFrom)}" data-to="${esc(text.priceRangeTo)}" data-locale="${locale === 'hr' ? 'hr-HR' : 'en-GB'}">${esc(text.priceRangeFrom)} ${fmt(from)} € – ${esc(text.priceRangeTo)} ${fmt(to)} €</p>
    <div class="dual" data-dual data-lo="${lo}" data-hi="${hi}">
      <input type="range" name="${P.priceMin}" min="${lo}" max="${hi}" step="${step}" value="${from}" aria-label="${esc(text.priceRange)}: ${esc(text.priceRangeFrom)}">
      <input type="range" name="${P.priceMax}" min="${lo}" max="${hi}" step="${step}" value="${to}" aria-label="${esc(text.priceRange)}: ${esc(text.priceRangeTo)}">
    </div></div>`
}

/** Marks a filter that only signed-in visitors see (memberFilters): hidden until the site's script reveals it,
 *  unless it is already in use (e.g. a shared link). */
function memberOnly(inUse: boolean): string {
  return directorySettings().memberFilters ? ` data-member-only${inUse ? '' : ' hidden'}` : ''
}

// Profile contact and social icons (single colour, currentColor; the site sets the colour).
const svg = (body: string, stroke = false) => `<svg viewBox="0 0 24 24" width="18" height="18" ${stroke ? 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' : 'fill="currentColor"'} aria-hidden="true">${body}</svg>`
const CONTACT_SVG = {
  web: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>', true),
  phone: svg('<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>', true),
  mail: svg('<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>', true)
}
const SOCIAL_SVG: Record<string, string> = {
  facebook: svg('<path d="M13.5 22v-8.2h2.8l.4-3.2h-3.2V8.5c0-.9.3-1.6 1.6-1.6h1.7V4.1c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.4H7.3v3.2h2.8V22h3.4z"/>'),
  instagram: svg('<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>', true),
  tiktok: svg('<path d="M16.6 5.8A4.3 4.3 0 0 1 15.5 3h-3.1v12.4a2.6 2.6 0 1 1-2.6-2.6c.3 0 .5 0 .8.1V9.7a5.8 5.8 0 1 0 4.9 5.7V9.1a7.3 7.3 0 0 0 4.3 1.4V7.4a4.3 4.3 0 0 1-3.2-1.6z"/>'),
  youtube: svg('<path d="M21.6 7.2a2.5 2.5 0 0 0-1.8-1.8C18.2 5 12 5 12 5s-6.2 0-7.8.4A2.5 2.5 0 0 0 2.4 7.2 26 26 0 0 0 2 12a26 26 0 0 0 .4 4.8 2.5 2.5 0 0 0 1.8 1.8C5.8 19 12 19 12 19s6.2 0 7.8-.4a2.5 2.5 0 0 0 1.8-1.8A26 26 0 0 0 22 12a26 26 0 0 0-.4-4.8zM10 15V9l5.2 3L10 15z"/>'),
  pinterest: svg('<path d="M12 2a10 10 0 0 0-3.6 19.3c-.1-.8-.2-2 0-2.9l1.3-5.4s-.3-.7-.3-1.6c0-1.5.9-2.6 1.9-2.6.9 0 1.4.7 1.4 1.5 0 .9-.6 2.3-.9 3.6-.3 1.1.5 2 1.6 2 1.9 0 3.4-2 3.4-5 0-2.6-1.9-4.4-4.5-4.4-3.1 0-4.9 2.3-4.9 4.7 0 .9.4 1.9.8 2.5.1.1.1.2.1.3l-.3 1.2c0 .2-.2.3-.4.2-1.4-.6-2.2-2.6-2.2-4.2 0-3.4 2.5-6.5 7.1-6.5 3.7 0 6.6 2.7 6.6 6.2 0 3.7-2.3 6.7-5.6 6.7-1.1 0-2.1-.6-2.5-1.2l-.7 2.6c-.2 1-.9 2.2-1.4 2.9A10 10 0 1 0 12 2z"/>'),
  linkedin: svg('<path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.8-2 4 0 4.8 2.7 4.8 6.1V21h-4v-5.4c0-1.3 0-3-1.8-3s-2.1 1.4-2.1 2.9V21H9z"/>'),
  x: svg('<path d="M17.8 3h3.1l-6.8 7.7 8 10.3h-6.2l-4.9-6.3L5.4 21H2.3l7.2-8.3L1.8 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.5l11.2 14.5z"/>')
}

/** Heart button (the site's script saves the profile and marks it); empty when favourites are off. */
function favButton(slug: string): string {
  const { favorites, text } = directorySettings()
  return favorites ? `<button type="button" class="fav" data-fav="${esc(slug)}" aria-pressed="false" aria-label="${esc(text.favAdd)}" title="${esc(text.favAdd)}" data-label-on="${esc(text.favRemove)}" data-label-off="${esc(text.favAdd)}"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-7.5-10.3A4.3 4.3 0 0 1 12 7.6a4.3 4.3 0 0 1 7.5 2.6c0 5.7-7.5 10.3-7.5 10.3z"/></svg></button>` : ''
}

export function listingCardHtml(c: Card): string {
  const { taxonomy, text, sample } = directorySettings()
  const where = [c.city, label(taxonomy.regions, c.county)].filter(Boolean).join(', ')
  const isSample = !!sample && c.slug.startsWith(sample.slugPrefix)
  const catLabel = subcategories().find(s => s.slug === c.subcategory)?.label ?? taxonomy.categories.find(x => x.slug === c.category)?.label ?? text.companyFallback
  const href = esc(listingUrl(c))
  return `<article class="card${c.premium ? ' is-premium' : ''}">${favButton(c.slug)}
      <a class="media" href="${href}" tabindex="-1" aria-hidden="true">${c.image ? `<img src="${esc(c.image)}" alt="${esc(c.title)}" loading="lazy">` : '<span class="ph"></span>'}
        ${c.premium ? `<span class="pill premium">${esc(text.premium)}</span>` : c.featured ? `<span class="pill premium featured">${esc(text.featured)}</span>` : ''}</a>
      <div class="body">
        <span class="cat">${esc(catLabel)}${isSample ? ` · ${esc(sample!.label)}` : ''}</span>
        <h2><a href="${href}">${esc(c.title)}</a></h2>
        <div class="meta">${where ? `<span>${icon('pin')}${esc(where)}</span>` : ''}${c.capacity ? `<span>${icon('people')}${esc(text.upTo(c.capacity))}</span>` : ''}${priceText(c) ? `<span class="price">${esc(priceText(c))}</span>` : ''}</div>
        ${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
        <div class="actions">${c.premium ? `<a class="btn" href="${href}#${directorySettings().params.requestAnchor}">${esc(text.requestDate)}</a><a class="more" href="${href}">${esc(text.details)}</a>` : `<a class="btn ghost" href="${href}">${esc(text.view)}</a>`}</div>
      </div></article>`
}

/** Featured, then premium companies first (with a photo preferred), optionally from one category. */
export async function featuredListings(db: D1Database, limit: number, category?: string): Promise<Card[]> {
  const today = new Date().toISOString().slice(0, 10)
  const c = category ? inCategory(category, today) : null
  const rows = await db.prepare(`SELECT ${CARD_FIELDS()} FROM documents WHERE ${PUBLISHED} ${c ? `AND ${c.sql}` : ''}
    ORDER BY featured DESC, premium DESC, (COALESCE(${J('coverImage')}, '') != '' OR COALESCE(${J('gallery')}, '[]') != '[]') DESC, created_at DESC LIMIT ?`)
    .bind(today, ...(c ? c.binds : []), limit).all<Row>()
  return rows.results.map(toCard)
}

/** Counts for a home page: companies per category and the busiest cities. */
export async function directoryOverview(db: D1Database) {
  const [cats, cities, total] = await db.batch([
    db.prepare(`${memberships(PUBLISHED)} SELECT k, COUNT(DISTINCT id) AS n FROM m GROUP BY k`).bind(new Date().toISOString().slice(0, 10)),
    db.prepare(`SELECT ${J('city')} AS k, COUNT(*) AS n FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('city')}, '') != '' GROUP BY k ORDER BY n DESC, k`),
    db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE ${PUBLISHED}`)
  ])
  return {
    categories: new Map((cats.results as { k: string; n: number }[]).map(r => [r.k, Number(r.n)])),
    cities: (cities.results as { k: string; n: number }[]).map(r => ({ name: r.k, slug: slugify(r.k), n: Number(r.n) })),
    total: Number((total.results[0] as Row)?.n ?? 0)
  }
}

/** For the sitemap: the directory, every category and city page and every company profile (path, last change). */
export async function directorySitemap(db: D1Database): Promise<[string, number?][]> {
  const { taxonomy } = directorySettings()
  const [companies, cities, regions] = await db.batch([
    db.prepare(`SELECT slug, updated_at, ${J('legacyId')} AS legacyId, ${J('legacySlug')} AS legacySlug FROM documents WHERE ${PUBLISHED} ORDER BY slug`),
    db.prepare(`SELECT DISTINCT ${J('city')} AS city FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('city')}, '') != ''`),
    db.prepare(`SELECT DISTINCT ${J('county')} AS region FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('county')}, '') != ''`)
  ])
  const regionSlugs = directorySettings().routes.region
    ? (regions.results as { region: string }[]).map(r => r.region).filter(s => taxonomy.regions.some(([k]) => k === s)) : []
  const citySlugs = [...new Set((cities.results as { city: string }[]).map(r => slugify(r.city)).filter(Boolean))]
  return [
    [directoryUrl()],
    ...taxonomy.categories.flatMap(c => [[categoryUrl(c.slug)], ...(c.subs ?? []).map(s => [categoryUrl(s.slug)])] as [string][]),
    ...citySlugs.map(s => [cityUrl(s)] as [string]),
    ...regionSlugs.map(s => [regionUrl(s)] as [string]),
    ...(companies.results as Row[]).map(r => [listingUrl({ slug: String(r.slug), legacyId: Number(r.legacyId) || undefined, legacySlug: str(r.legacySlug) }), Number(r.updated_at)] as [string, number])
  ]
}

// ---------------------------------------------------------------- pages

async function directoryPage(db: D1Database, f: Filters, url: URL): Promise<{ html: string; found: boolean }> {
  const { taxonomy, text, params: P } = directorySettings()
  const r = await search(db, f)
  const cat = taxonomy.categories.find(c => c.slug === f.category)
  const sub = subcategories().find(s => s.slug === f.category)
  const parent = cat ?? taxonomy.categories.find(c => c.slug === sub?.parent)
  const isVenue = !!parent?.venue
  const place = r.cityLabel ?? label(taxonomy.regions, f.region)
  const heading = [sub?.label ?? cat?.label ?? text.directoryTitle, place].filter(Boolean).join(' · ')
  // The main directory page (no category, place or search) can carry its own H1, lead, SEO texts and company box.
  const isMain = !f.q && !f.category && !f.city && !f.region
  const DIR = directoryUrl()

  // Links keep every current filter except the ones being changed. Keys are filter names; the URL uses the site's words.
  const params = (change: Partial<Record<keyof typeof P | string, string | null>>) => {
    const current: Record<string, string> = {
      q: f.q, category: f.category, region: f.region, city: f.city, guests: f.guests, price: f.price,
      setting: f.setting, premium: f.premium, favorites: f.favorites?.join(',') ?? '', priceMin: f.priceMin, priceMax: f.priceMax, sort: f.sort, view: f.view, page: f.page > 1 ? String(f.page) : '',
      ...Object.fromEntries(f.amenities.map(a => [a, '1']))
    }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...current, ...change })) if (v) p.set((P as Record<string, string>)[k] ?? k, v)
    // Only a category or only a city: its own landing page; anything else: the directory with filters.
    const keys = [...p.keys()]
    if (keys.length === 1 && keys[0] === P.category) return categoryUrl(p.get(P.category)!)
    if (keys.length === 1 && keys[0] === P.city) return cityUrl(p.get(P.city)!)
    // Without a search the directory would only 301 these to the category / city page (see the top of the handler):
    // link there directly, so pager, view and sort links cost no redirect.
    if (!p.has(P.q)) {
      const cat = p.get(P.category), city = p.get(P.city)
      if (cat) { p.delete(P.category); return `${categoryUrl(cat)}?${p}` }
      if (city) { p.delete(P.city); p.delete(P.region); return `${cityUrl(city)}${p.toString() ? `?${p}` : ''}` }
    }
    const s = p.toString()
    return `${DIR}${s ? `?${s}` : ''}`
  }

  const catCount = (slug: string, isSub = false) => r.categoryCounts
    .filter(c => (isSub ? c.s === slug : c.k === slug)).reduce((n, c) => n + Number(c.n), 0)
  const categoryList = taxonomy.categories.map(c => {
    const n = catCount(c.slug)
    const open = parent?.slug === c.slug
    const subs = open && c.subs ? `<ul>${c.subs.filter(s => catCount(s.slug, true) || f.category === s.slug).map(s => `<li><a class="${f.category === s.slug ? 'on' : ''}" href="${params({ category: s.slug, page: null })}">${esc(s.label)}<span>${catCount(s.slug, true)}</span></a></li>`).join('')}</ul>` : ''
    return n || open ? `<li><a class="${f.category === c.slug ? 'on' : ''}" href="${params({ category: c.slug, page: null })}">${esc(c.label)}<span>${n}</span></a>${subs}</li>` : ''
  }).join('')

  const option = (value: string, txt: string, selected: string, n?: number) =>
    `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(txt)}${n !== undefined ? ` (${n})` : ''}</option>`
  const regionOptions = alphabetical(taxonomy.regions, c => c[1]).map(([k, v]) => option(k, v, f.region || r.cityRegion || '', r.regionCounts.get(k) ?? 0)).join('')
  const cityOptions = alphabetical(r.cities, c => c.name).map(c => option(c.slug, c.name, f.city, c.n)).join('')
  const radios = (name: string, list: readonly (readonly [string | number, string])[], current: string) =>
    `<div class="opts">${[['', text.all] as const, ...list].map(([k, v]) => `<label class="opt"><input type="radio" name="${name}" value="${k}"${String(k) === current ? ' checked' : ''}>${esc(v)}</label>`).join('')}</div>`

  const pills = [
    f.q && ['q', text.quoted(f.q)], f.category && ['category', sub?.label ?? cat?.label ?? f.category],
    f.region && ['region', label(taxonomy.regions, f.region) ?? f.region], f.city && ['city', r.cityLabel ?? f.city],
    f.guests && ['guests', text.guestsPill(f.guests)], f.price && ['price', label(taxonomy.priceLevels, f.price) ?? f.price],
    f.setting && ['setting', label(taxonomy.settings, f.setting) ?? f.setting], f.premium === '1' && ['premium', text.premiumPill], f.favorites && ['favorites', text.favPill], f.priceMin && ['priceMin', text.priceMinPill(f.priceMin)], f.priceMax && ['priceMax', text.priceMaxPill(f.priceMax)],
    ...f.amenities.map(a => [a, label(taxonomy.amenities, a) ?? a])
  ].filter(Boolean) as [string, string][]
  const pillBar = pills.length ? `<div class="pills">${pills.map(([k, v]) =>
    `<a class="pill" href="${params({ [k]: null, page: null })}" title="${esc(text.removeFilter)}">${esc(v)}<span aria-hidden="true">×</span></a>`).join('')}
    <a class="link" href="${esc(DIR)}">${esc(text.clearAll)}</a></div>` : ''

  const cards = r.cards.map(listingCardHtml).join('')

  const pages = Math.max(1, Math.ceil(r.total / PAGE_SIZE))
  const pager = pages <= 1 ? '' : `<nav class="pager" aria-label="${esc(text.pages)}">${[
    f.page > 1 && `<a href="${params({ page: f.page > 2 ? String(f.page - 1) : null })}">${esc(text.previous)}</a>`,
    ...pageWindow(f.page, pages).map(n => n === 0 ? '<span>…</span>' : n === f.page
      ? `<span class="on" aria-current="page">${n}</span>` : `<a href="${params({ page: n > 1 ? String(n) : null })}">${n}</a>`),
    f.page < pages && `<a href="${params({ page: String(f.page + 1) })}">${esc(text.next)}</a>`
  ].filter(Boolean).join('')}</nav>`

  const hidden = (k: string, v: string) => v ? `<input type="hidden" name="${k}" value="${esc(v)}">` : ''
  const settingLabel = (k: string) => label(taxonomy.settings, k) ?? k
  const sidebar = `<form class="filters" method="get" action="${esc(DIR)}" data-auto>
    ${hidden(P.q, f.q)}${hidden(P.category, f.category)}${hidden(P.sort, f.sort)}${hidden(P.view, f.view)}
    <details open><summary><span class="ftitle">${esc(text.filters)}</span><span class="count">${esc(text.results(r.total))}</span></summary>
    <div class="fsec"><p class="flabel">${esc(text.category)}</p><ul class="cats"><li><a class="${f.category ? '' : 'on'}" href="${params({ category: null, page: null })}">${esc(text.allCategories)}</a></li>${categoryList}</ul></div>
    <div class="fsec">${taxonomy.regions.length ? `<label class="flabel" for="f-zup">${esc(text.region)}</label><select id="f-zup" name="${P.region}">${option('', text.allRegions, f.region || r.cityRegion || '')}${regionOptions}</select>` : ''}
      <label class="flabel" for="f-grad">${esc(text.city)}</label><select id="f-grad" name="${P.city}">${option('', text.allCities, f.city)}${cityOptions}</select></div>
    ${isVenue || f.guests || f.setting ? `<div class="fsec"><p class="flabel">${esc(text.guests)}</p>${radios(P.guests, taxonomy.guestBuckets.map(([n, t]) => [String(n), t] as const), f.guests)}
      <label class="flabel" for="f-pro">${esc(text.setting)}</label><select id="f-pro" name="${P.setting}">${option('', text.any, f.setting)}${option('indoor', settingLabel('indoor'), f.setting)}${option('outdoor', settingLabel('outdoor'), f.setting)}</select></div>` : ''}
    ${directorySettings().priceRange ? priceSlider(f, r.priceBounds) : ''}
    ${taxonomy.priceFilter !== false && taxonomy.priceLevels.length ? `<div class="fsec"><p class="flabel">${esc(text.price)}</p>${radios(P.price, taxonomy.priceLevels, f.price)}</div>` : ''}
    <div class="fsec">${(isVenue || f.amenities.length ? taxonomy.amenities : []).map(([k, v]) =>
      `<label class="check"><input type="checkbox" name="${k}" value="1"${f.amenities.includes(k) ? ' checked' : ''}>${esc(v)}</label>`).join('')}
      <label class="check"><input type="checkbox" name="${P.premium}" value="1"${f.premium === '1' ? ' checked' : ''}>${esc(text.premiumOnly)}</label>
      ${directorySettings().favorites ? `<label class="check"${memberOnly(!!f.favorites)}><input type="checkbox" data-fav-only${f.favorites ? ' checked' : ''}>${esc(text.favOnly)} <span class="fav-n" data-fav-count></span></label><input type="hidden" name="${P.favorites}" value="${esc(f.favorites?.join(',') ?? '')}" data-fav-list${f.favorites ? '' : ' disabled'}>` : ''}</div>
    <div class="fsec factions"><button type="submit">${esc(text.apply)}</button><a class="link" href="${esc(DIR)}">${esc(text.clear)}</a></div>
    </details></form>`

  // A category with a photo gets it as the header background.
  const photo = parent?.image
  const header = `<div class="bar${photo ? ' photo' : ''}"${photo ? ` style="--bar-img:url('${esc(photo)}')"` : ''}><div class="wrap barin">
    <div><p class="crumbs"><a href="${esc(DIR)}">${esc(text.directoryTitle)}</a>${parent && sub ? ` › <a href="${esc(categoryUrl(parent.slug))}">${esc(parent.label)}</a>` : ''}</p>
      <h1>${f.q ? esc(text.resultsFor(f.q)) : esc(isMain && text.directoryHeading ? text.directoryHeading : heading)}</h1>${isMain && text.directoryLead ? `<p class="lead">${esc(text.directoryLead)}</p>` : ''}</div>
    <form class="tools" method="get" action="${esc(DIR)}">
      ${Object.entries({ category: f.category, region: f.region, city: f.city, guests: f.guests, price: f.price, setting: f.setting, premium: f.premium, favorites: f.favorites?.join(',') ?? '', priceMin: f.priceMin, priceMax: f.priceMax, view: f.view }).map(([k, v]) => hidden((P as Record<string, string>)[k], v)).join('')}
      ${f.amenities.map(a => hidden(a, '1')).join('')}
      <label class="search">${icon('search')}<input type="search" name="${P.q}" value="${esc(f.q)}" placeholder="${esc(text.searchPlaceholder)}" aria-label="${esc(text.searchLabel)}" data-suggest="${esc(DIR)}"></label>
      <select name="${P.sort}" aria-label="${esc(text.sortLabel)}" data-auto-submit>${option(P.defaultSort ? P.sortRecommended : '', text.sortRecommended, f.sort)}${alphabetical([[P.sortName, text.sortName], [P.sortNewest, text.sortNewest], [P.sortPopular, text.sortPopular], ...(isVenue ? [[P.sortCapacity, text.sortCapacity]] : [])] as [string, string][], o => o[1]).map(([k, t]) => option(k === P.defaultSort ? '' : k, t, f.sort)).join('')}</select>
      <span class="views"><a class="${f.view === P.viewList ? '' : 'on'}" href="${params({ view: null })}" title="${esc(text.viewGrid)}" aria-label="${esc(text.viewGridLabel)}">${icon('grid')}</a><a class="${f.view === P.viewList ? 'on' : ''}" href="${params({ view: P.viewList })}" title="${esc(text.viewList)}" aria-label="${esc(text.viewListLabel)}">${icon('list')}</a></span>
    </form></div></div>`

  // Only plain category/city/region pages are canonical and indexable; filter combinations are noindex.
  const hasRegionPage = !!directorySettings().routes.region
  const plain = !f.q && !f.guests && !f.price && !f.setting && !f.premium && !f.favorites && !f.priceMin && !f.priceMax && !f.amenities.length && !f.sort && !f.view && f.page === 1
  const canonicalPath = !plain ? null
    : f.category && !f.city && !f.region ? categoryUrl(f.category)
    : f.city && !f.category && !f.region ? cityUrl(f.city)
    : f.region && hasRegionPage && !f.category && !f.city ? regionUrl(f.region)
    : !f.category && !f.city && !f.region ? DIR : null
  // "Join the directory" (main page, first page only): a box under the results, or with directoryJoinLayout 'band' a
  // full-width band after the layout (optional eyebrow and icon HTML from the site's settings).
  const joinOn = isMain && f.page === 1 && !!text.directoryJoinTitle
  const joinBand = joinOn && text.directoryJoinLayout === 'band' ? `<section class="directory-join-band"><div class="wrap directory-join-inner">${text.directoryJoinIcon ? `<span class="directory-join-icon" aria-hidden="true">${text.directoryJoinIcon}</span>` : ''}<div>${text.directoryJoinEyebrow ? `<p class="eyebrow">${esc(text.directoryJoinEyebrow)}</p>` : ''}<h2>${esc(text.directoryJoinTitle)}</h2><p>${esc(text.directoryJoinText)}</p></div>${text.directoryJoinHref ? `<div class="directory-join-actions"><a class="btn" href="${esc(text.directoryJoinHref)}">${esc(text.directoryJoinCta)}</a></div>` : ''}</div></section>` : ''
  const body = `${header}<div class="wrap layout"><aside>${sidebar}</aside><section>
    ${pillBar}
    <div class="results ${f.view === P.viewList ? 'list' : 'grid'}">${cards || `<div class="empty"><h2>${esc(text.noResults)}</h2><p>${esc(text.noResultsText)}</p><p><a class="btn ghost" href="${esc(DIR)}">${esc(text.clearFilters)}</a></p></div>`}</div>
    ${pager}${joinOn && text.directoryJoinLayout !== 'band' ? `<div class="box join-box"><h2>${esc(text.directoryJoinTitle)}</h2><p>${esc(text.directoryJoinText)}</p>${text.directoryJoinHref ? `<p><a class="btn ghost" href="${esc(text.directoryJoinHref)}">${esc(text.directoryJoinCta)}</a></p>` : ''}</div>` : ''}</section></div>${joinBand}`
  // Unknown category/city landing pages are 404s (but still render the directory).
  const found = (!f.category || !!(cat || sub)) && (!f.city || !!r.cityLabel) && (!f.region || !!label(taxonomy.regions, f.region))
  const ld = jsonLd({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'CollectionPage', name: heading, url: `${url.origin}${encodeURI(canonicalPath ?? DIR)}`, mainEntity: { '@type': 'ItemList', numberOfItems: r.total,
      itemListElement: r.cards.map((c, i) => ({ '@type': 'ListItem', position: (f.page - 1) * PAGE_SIZE + i + 1, url: abs(url.origin, listingUrl(c)), name: c.title })) } },
    breadcrumbs(url.origin, [[text.directoryTitle, DIR], ...(parent && sub ? [[parent.label, categoryUrl(parent.slug)] as [string, string]] : []), ...(cat || sub ? [[(sub ?? cat)!.label, categoryUrl((sub ?? cat)!.slug)] as [string, string]] : [])])
  ] })
  return { found, html: page(isMain && text.directorySeoTitle ? text.directorySeoTitle : heading, body, { // no page numbers in titles (owner's rule, all BizzCMS sites)
    head: ld,
    description: isMain && text.directorySeoDescription ? text.directorySeoDescription : text.metaDescription(heading, text.results(r.total)),
    canonical: canonicalPath && found ? `${url.origin}${encodeURI(canonicalPath)}` : undefined, index: !!canonicalPath && found }) }
}

// Contacts for some visitors only (DirectorySettings.contactsGate): the page (cached, crawled) never contains them; the
// script asks the site's address for them when the visitor is signed in and fills them in, or shows why not. One
// sign-in call only: a profile with the inquiry button (which sends signed-out visitors to sign-in) gets no own button.
function contactGateBox(p: Listing, gate: NonNullable<DirectorySettings['contactsGate']>): string {
  const svg = JSON.stringify({ phone: CONTACT_SVG.phone, mail: CONTACT_SVG.mail, web: CONTACT_SVG.web, social: SOCIAL_SVG, website: directorySettings().text.website, socialTitle: directorySettings().text.socialTitle })
  return `<div class="contact-gate" data-contacts="${esc(p.slug)}"><p class="muted">${esc(gate.locked)}</p>
</div>
    <script>(function(){var b=document.querySelector('[data-contacts]');if(!b||(' '+document.cookie).indexOf(' signed_in=1')<0)return;
    var s=${svg},e=function(t){return String(t).replace(/[&<>"']/g,function(c){return'&#'+c.charCodeAt(0)+';'})};
    fetch(${JSON.stringify(gate.path)}+'?s='+encodeURIComponent(b.getAttribute('data-contacts')),{credentials:'same-origin',headers:{accept:'application/json'}})
    .then(function(r){return r.json().then(function(j){return[r.status,j]})}).then(function(x){var j=x[1];
    if(x[0]===200){var h='';if(j.phone)h+='<a class="contact-line" href="tel:'+e(j.phone.replace(/[^0-9+]/g,''))+'">'+s.phone+'<span>'+e(j.phone)+'</span></a>';
    if(j.email)h+=(h?'<br>':'')+'<a class="contact-line" href="mailto:'+e(j.email)+'">'+s.mail+'<span>'+e(j.email)+'</span></a>';
    var ok=function(u){return /^https?:[/][/]/i.test(String(u||''))};
    if(ok(j.website))h+=(h?'<br>':'')+'<a class="contact-line" href="'+e(j.website)+'" rel="noopener" target="_blank">'+s.web+'<span>'+e(s.website)+'</span></a>';
    var so=(j.socials||[]).filter(function(x){return ok(x[1])});
    if(so.length)h+='<div class="contact-gate-social"><span>'+e(s.socialTitle)+'</span><span class="social-icons">'+so.map(function(x){return'<a class="social-icon" href="'+e(x[1])+'" rel="noopener" target="_blank" aria-label="'+e(x[0])+'" title="'+e(x[0])+'">'+(s.social[x[2]]||e(x[0]))+'</a>'}).join('')+'</span></div>';
    b.innerHTML=h;document.querySelectorAll('[data-gate-cta]').forEach(function(a){a.remove()});if(window.bzStat)window.bzStat('contacts');}
    else if(x[0]===403){b.innerHTML='<p class="muted">'+e(${JSON.stringify(gate.denied)})+'</p>';document.querySelectorAll('[data-gate-cta]').forEach(function(a){a.remove()});}}).catch(function(){});})();</script>`
}

function profilePage(p: Listing, state: { sent?: boolean; error?: string; values?: Record<string, string> }, origin: string, share = ''): string {
  const { taxonomy, text, params: P, contactsGate: gate } = directorySettings()
  const v = state.values ?? {}
  const parent = taxonomy.categories.find(c => c.slug === p.category)
  const sub = subcategories().find(s => s.slug === p.subcategory)
  // Plain text; **words** are shown bold (after escaping, so nothing else can become markup).
  const paragraphs = (p.description ?? '').split(/\n\s*\n/).filter(Boolean)
    .map(t => `<p>${esc(t).replace(/\*\*([^*\n]{1,120}?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>')}</p>`).join('')
  // Photos and YouTube videos: mosaic on top, gallery section, full-screen viewer (media.ts).
  const media = mediaItems(p.cover ?? p.image, p.gallery, p.videos)
  const mt = { showAll: text.showAllMedia, photos: text.gallery, videos: text.videos, video: text.video, close: text.close, previous: text.previous, next: text.next, photoAlt: text.photoAlt }
  const gallery = mediaGallery(media, p.title, mt, p.videos.length && !p.gallery.length ? text.videos : text.gallery)
  const facts = [
    [text.location, [p.address, p.city, label(taxonomy.regions, p.county)].filter(Boolean).join(', ')],
    [text.capacity, p.capacity ? text.capacityValue(p.capacity) : ''],
    [text.price, priceText(p)],
    [text.setting, label(taxonomy.settings, p.setting) ?? ''],
    [text.amenities, p.amenities.join(', ')]
  ].filter(([, val]) => val)
  // Every category the company is in (main first), as links: shown under the facts.
  const catName = (slug: string) => subcategories().find(s => s.slug === slug)?.label ?? taxonomy.categories.find(c => c.slug === slug)?.label
  const allCats = [p.subcategory || p.category, ...p.extraCategories].filter((slug): slug is string => !!slug && !!catName(slug))
  const catLinks = allCats.length > 1 ? `<div><span>${esc(text.categories)}</span>${allCats.map(slug => `<a href="${esc(categoryUrl(slug))}">${esc(catName(slug)!)}</a>`).join(', ')}</div>` : ''
  const contact = [
    ...(gate ? [(p.phone || p.email || p.website || p.socials.length) && contactGateBox(p, gate)] : [
      p.website && `<a class="contact-line" href="${esc(p.website)}" rel="noopener" target="_blank">${CONTACT_SVG.web}<span>${esc(text.website)}</span></a>`,
      p.phone && `<a class="contact-line" href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${CONTACT_SVG.phone}<span>${esc(p.phone)}</span></a>`,
      p.email && `<a class="contact-line" href="mailto:${esc(p.email)}">${CONTACT_SVG.mail}<span>${esc(p.email)}</span></a>`])
  ].filter(Boolean)
  const requestForm = `<h2>${esc(p.premium ? text.requestTitle : text.inquiryTitle)}</h2>${state.error ? `<p class="err">${esc(state.error)}</p>` : ''}
      <form class="request" method="post" action="${esc(listingUrl(p))}">
        <label>${esc(text.formName)}<input name="coupleName" required maxlength="200" value="${esc(v.coupleName ?? '')}"></label>
        <label>${esc(text.formEmail)}<input name="email" type="email" required maxlength="200" value="${esc(v.email ?? '')}"></label>
        <label>${esc(text.formPhone)}<input name="phone" maxlength="60" value="${esc(v.phone ?? '')}"></label>
        <label>${esc(text.formDate)}<input name="weddingDate" type="date" value="${esc(v.weddingDate ?? '')}"${p.busyDates.length ? ` data-busy="${esc(JSON.stringify(p.busyDates))}"` : ''}>${p.premium ? `<small class="req-date-state" data-date-state aria-live="polite"></small>` : ''}</label>
        <label>${esc(text.formGuests)}<input name="guests" type="number" min="1" max="5000" value="${esc(v.guests ?? '')}"></label>
        <label class="full">${esc(text.formMessage)}<textarea name="message" rows="4" maxlength="3000">${esc(v.message ?? '')}</textarea></label>
        <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <button type="submit">${esc(text.formSend)}</button>
      </form>`
  // Booking calendar: the date field says free / booked as the couple picks it; a booked day is refused (here and on the server).
  const dateCheck = p.premium ? `<style>.req-date-state{display:block;font-size:12px;margin-top:4px}.req-date-state.busy{color:#982038}.req-date-state.free{color:#42694e}</style><script>(function(){var i=document.querySelector('[data-request] input[name=weddingDate]'),o=document.querySelector('[data-date-state]');if(!i||!o)return;var busy=[];try{busy=JSON.parse(i.getAttribute('data-busy')||'[]')}catch(e){}
    function check(){var b=busy.indexOf(i.value)>=0;o.textContent=i.value?(b?${JSON.stringify(text.dateBusy)}:${JSON.stringify(text.dateFree)}):'';o.className='req-date-state '+(i.value?(b?'busy':'free'):'');i.setCustomValidity(b?${JSON.stringify(text.errDateBusy)}:'')}
    i.addEventListener('input',check);i.addEventListener('change',check);check()})()</script>` : ''
  // The request form opens as a popup (the profile's button, "Request a date" on cards: #<anchor> or ?<anchor>=1).
  // With requestLogin, signed-out visitors see sign-in / sign-up links in it instead (the site refuses their posts).
  const login = directorySettings().requestLogin
  // A profile without inquiries (contacts gate only) returns to the profile itself: signed in, its contacts show.
  const back = encodeURIComponent(p.requests ? `${listingUrl(p)}?${P.requestAnchor}=1` : listingUrl(p))
  const loginBox = login ? `<div class="req-login" data-req-login hidden><h2>${esc(text.requestLoginTitle)}</h2><p>${esc(text.requestLoginText)}</p>
      <p class="actions"><a class="btn" href="${esc(login.login.replace('{return}', back))}">${esc(text.requestLoginButton)}</a><a class="btn ghost" href="${esc(login.register.replace('{return}', back))}">${esc(text.requestRegisterButton)}</a></p></div>` : ''
  // Contacts gate on a profile without inquiries: the same popup, sign-in box only (its button sits in the contacts box).
  const form = !p.requests && !(gate && login) ? '' : `<dialog id="${esc(P.requestAnchor)}" class="req-dialog" data-request${login ? ' data-needs-login' : ''}${state.sent || state.error ? ' data-open' : ''}>
      <button type="button" class="req-close" data-close aria-label="${esc(text.close)}">×</button>${state.sent ? '' : loginBox}
      <div data-req-form>${!p.requests ? '' : state.sent ? `<div class="req-thanks"><h2>${esc(text.thanksTitle)}</h2><p>${esc(text.thanksText)}</p></div>` : requestForm}</div></dialog>`
  // Title: the company's own SEO title, else name - (sub)category, city, so companies with the same name in
  // different towns or categories never share a <title> (old directories have many: "Ana", "Simple", "Croata").
  const where = [sub?.label ?? parent?.label, p.city].filter(Boolean).join(', ')
  const ownTitle = p.seoTitle && p.seoTitle.trim() !== p.title.trim() ? p.seoTitle : '' // an imported SEO title equal to the name adds nothing
  return page(ownTitle || (where ? `${p.title} - ${where}` : p.title), `<div class="wrap profile">
    <p class="crumbs"><a href="${esc(directoryUrl())}">${esc(text.directoryTitle)}</a>${parent ? ` › <a href="${esc(categoryUrl(parent.slug))}">${esc(parent.label)}</a>` : ''}${sub ? ` › <a href="${esc(categoryUrl(sub.slug))}">${esc(sub.label)}</a>` : ''}</p>
    <div class="phead"><h1>${esc(p.title)}</h1>${p.premium ? `<span class="pill premium">${esc(text.premium)}</span>` : ''}${favButton(p.slug)}</div>
    ${mediaHero(media, p.title, mt)}
    <div class="pcols"><div>${paragraphs}${gallery}${share}${form}${dateCheck}</div>
    <aside class="box facts">${facts.map(([k, val]) => `<div><span>${esc(k)}</span>${esc(val)}</div>`).join('')}${catLinks}
      ${contact.length ? `<div><span>${esc(text.contact)}</span>${contact.join('<br>')}</div>` : ''}
      ${p.socials.length && !gate ? `<div><span>${esc(text.socialTitle)}</span><span class="social-icons">${p.socials.map(([name, u, k]) => `<a class="social-icon" href="${esc(u)}" rel="noopener" target="_blank" aria-label="${esc(name)}" title="${esc(name)}">${SOCIAL_SVG[k] ?? esc(name)}</a>`).join('')}</span></div>` : ''}
      ${p.requests ? `<a class="btn" href="#${esc(P.requestAnchor)}" data-open-request>${esc(p.premium ? text.requestDate : text.inquiryTitle)}</a>`
        : gate && directorySettings().requestLogin ? `<a class="btn" href="#${esc(P.requestAnchor)}" data-open-request data-gate-cta>${esc(text.inquiryTitle)}</a>` : ''}</aside></div></div>${mediaViewer(media, p.title, mt)}`,
    { description: p.seoDescription || p.summary, canonical: p.canonical && /^https?:\/\//.test(p.canonical) ? p.canonical : abs(origin, listingUrl(p)), index: !p.noindex,
      image: p.seoImage ?? p.cover ?? p.image ? abs(origin, (p.seoImage ?? p.cover ?? p.image)!) : undefined, head: jsonLd({ '@context': 'https://schema.org', '@graph': [
      {
        '@type': 'LocalBusiness', '@id': `${abs(origin, listingUrl(p))}#business`, name: p.title, url: abs(origin, listingUrl(p)),
        description: p.seoDescription || p.summary || undefined,
        image: media.filter(m => m.kind === 'photo').slice(0, 6).map(m => abs(origin, m.src)),
        telephone: gate ? undefined : p.phone || undefined,
        address: { '@type': 'PostalAddress', addressLocality: p.city || undefined, addressRegion: label(taxonomy.regions, p.county) || undefined, addressCountry: 'HR' },
        sameAs: gate ? undefined : [p.website, ...p.socials.map(([, u]) => u)].filter(Boolean).length ? [p.website, ...p.socials.map(([, u]) => u)].filter(Boolean) : undefined,
        subjectOf: p.videos.length ? p.videos.map(id => ({ '@type': 'VideoObject', name: `${p.title} - ${text.video}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}`, thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` })) : undefined,
        additionalType: sub?.label ?? parent?.label
      },
      breadcrumbs(origin, [[text.directoryTitle, directoryUrl()], ...(parent ? [[parent.label, categoryUrl(parent.slug)] as [string, string]] : []), ...(sub ? [[sub.label, categoryUrl(sub.slug)] as [string, string]] : []), [p.title, listingUrl(p)]])
    ] }) })
}
