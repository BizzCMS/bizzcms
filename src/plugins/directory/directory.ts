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
  categoryUrl, cityUrl, directorySettings, directoryUrl, label, listingUrl, matchRoute, slugify, subcategories
} from './config'
import { esc, fold, html, icon, mediaList, pageWindow, safeDecode, safeUrl, str, truthy } from './util'

type Env = { DB: D1Database }
type Row = Record<string, unknown>
const PAGE_SIZE = 24

interface Filters {
  q: string; category: string; region: string; city: string; guests: string; price: string
  setting: string; premium: string; sort: string; view: string; page: number
  amenities: string[]
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
    : matchRoute(routes.city, path) ? { kind: 'city', slug: matchRoute(routes.city, path)!.slug } : null
  if (landing) {
    if (!get) return null
    const pattern = landing.kind === 'directory' ? routes.directory : landing.kind === 'category' ? routes.category : routes.city
    if (slashed(pattern)) return moved(url.pathname + '/' + url.search)
    const filters = readFilters(url.searchParams)
    if (landing.kind === 'category') filters.category = safeDecode(landing.slug!)
    if (landing.kind === 'city') filters.city = safeDecode(landing.slug!)
    const page = await directoryPage(env.DB, filters, url)
    return html(page.html, page.found || landing.kind === 'directory' ? 200 : 404)
  }

  const legacy = routes.legacyListing ? matchRoute(routes.legacyListing, path) : null
  const own = legacy ? null : matchRoute(routes.listing, path)
  if (!legacy && !own) return null
  const slug = own ? safeDecode(own.slug) : ''
  const company = legacy ? await findListing(env.DB, { legacyId: Number(legacy.id) })
    : /^[a-z0-9-]+$/.test(slug) ? await findListing(env.DB, { slug }) : null
  if (!company) return html(page(text.notFound, `<div class="wrap profile"><h1>${esc(text.notFound)}</h1><p><a href="${esc(directoryUrl())}">${esc(text.backToDirectory)}</a></p></div>`), 404)
  // One address per company: another name or a missing slash goes to the canonical one.
  const canonical = listingUrl(company)
  if (get && safeDecode(url.pathname) !== canonical) return moved(canonical + url.search)
  if (request.method === 'POST') {
    if (!company.premium) return html(page(company.title, `<div class="wrap profile"><h1>${esc(text.requestsUnavailable)}</h1></div>`), 403)
    const result = await saveRequest(await readForm(request), company, env)
    if (result.ok) return Response.redirect(new URL(`${canonical}?${params.sent}=1#${params.requestAnchor}`, url.origin).href, 303)
    return html(profilePage(company, { error: result.error, values: result.values }), 400)
  }
  if (!get) return null
  return html(profilePage(company, { sent: url.searchParams.get(params.sent) === '1' }))
}

const page = (title: string, body: string, opts: { description?: string; canonical?: string; index?: boolean } = {}) =>
  directorySettings().layout(title, body, opts)

// ---------------------------------------------------------------- queries

const J = (field: string) => `json_extract(data, '$.${field}')`
const TRUE = (field: string) => `${J(field)} IN (1, 'true', 'on', '1')`
const PUBLISHED = `type_id = 'partners' AND is_published = 1 AND (deleted_at IS NULL OR deleted_at = '')`
const PREMIUM = `(${TRUE('paidMember')} AND (COALESCE(${J('paidUntil')}, '') = '' OR ${J('paidUntil')} >= ?))`
const CARD_FIELDS = `slug, title, ${J('category')} AS category, ${J('subcategory')} AS subcategory, ${J('county')} AS county,
  ${J('city')} AS city, ${J('summary')} AS summary, ${J('coverImage')} AS cover, ${J('gallery')} AS gallery,
  ${J('capacity')} AS capacity, ${J('priceLevel')} AS priceLevel, ${J('legacyId')} AS legacyId, ${J('legacySlug')} AS legacySlug, ${PREMIUM} AS premium`

function readFilters(p: URLSearchParams): Filters {
  const { params, taxonomy } = directorySettings()
  const get = (k: string) => (p.get(k) ?? '').trim().slice(0, 100)
  return {
    q: get(params.q), category: get(params.category), region: get(params.region), city: get(params.city), guests: get(params.guests),
    price: get(params.price), setting: get(params.setting), premium: get(params.premium), sort: get(params.sort), view: get(params.view),
    page: Math.min(10000, Math.max(1, Number.parseInt(get(params.page), 10) || 1)),
    amenities: taxonomy.amenities.map(([k]) => k).filter(k => p.get(k) === '1')
  }
}

type Facet = 'category' | 'region' | 'city'

function where(f: Filters, cityNames: string[], today: string, skip: Facet[] = []) {
  const sql = [PUBLISHED]
  const binds: unknown[] = []
  if (f.q) {
    // Every word must match somewhere (name, city or summary), e.g. "band osijek".
    const haystack = fold(`title || ' ' || COALESCE(${J('city')}, '') || ' ' || COALESCE(${J('summary')}, '')`)
    for (const word of slugify(f.q).split('-').filter(Boolean).slice(0, 6)) {
      sql.push(`${haystack} LIKE ?`)
      binds.push(`%${word}%`)
    }
  }
  if (f.category && !skip.includes('category')) {
    sql.push(subcategories().some(s => s.slug === f.category) ? `${J('subcategory')} = ?` : `${J('category')} = ?`)
    binds.push(f.category)
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
  if (f.premium === '1') { sql.push(PREMIUM); binds.push(today) }
  return { sql: sql.join(' AND '), binds }
}

function orderBy(sort: string): string {
  const { params } = directorySettings()
  if (sort === params.sortName) return 'title COLLATE NOCASE'
  if (sort === params.sortNewest) return 'created_at DESC'
  if (sort === params.sortCapacity) return `CAST(${J('capacity')} AS INTEGER) IS NULL, CAST(${J('capacity')} AS INTEGER) DESC, title COLLATE NOCASE`
  return 'premium DESC, title COLLATE NOCASE'
}

export interface Card {
  slug: string; title: string; category?: string; subcategory?: string; county?: string; city?: string; summary?: string
  image?: string; capacity?: number; priceLevel?: string; premium: boolean; legacyId?: number; legacySlug?: string
}

async function search(db: D1Database, f: Filters) {
  const today = new Date().toISOString().slice(0, 10)
  // Resolve the city slug to the stored city name(s) (names carry accents).
  let cityNames: string[] = []
  if (f.city) {
    const all = await db.prepare(`SELECT DISTINCT ${J('city')} AS city FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('city')}, '') != ''`).all<{ city: string }>()
    cityNames = all.results.map(r => r.city).filter(c => slugify(c) === f.city)
  }
  const main = where(f, cityNames, today)
  const offset = (f.page - 1) * PAGE_SIZE
  const byCategory = where(f, cityNames, today, ['category'])
  const byRegion = where(f, cityNames, today, ['region', 'city'])
  const byCity = where(f, cityNames, today, ['city'])
  const [count, rows, catFacets, regionFacets, cityFacets] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS n FROM documents WHERE ${main.sql}`).bind(...main.binds),
    db.prepare(`SELECT ${CARD_FIELDS} FROM documents WHERE ${main.sql} ORDER BY ${orderBy(f.sort)} LIMIT ? OFFSET ?`).bind(today, ...main.binds, PAGE_SIZE, offset),
    db.prepare(`SELECT ${J('category')} AS k, ${J('subcategory')} AS s, COUNT(*) AS n FROM documents WHERE ${byCategory.sql} GROUP BY k, s`).bind(...byCategory.binds),
    db.prepare(`SELECT ${J('county')} AS k, COUNT(*) AS n FROM documents WHERE ${byRegion.sql} GROUP BY k`).bind(...byRegion.binds),
    db.prepare(`SELECT ${J('city')} AS k, COUNT(*) AS n FROM documents WHERE ${byCity.sql} AND COALESCE(${J('city')}, '') != '' GROUP BY k ORDER BY k`).bind(...byCity.binds)
  ])
  return {
    total: Number((count.results[0] as Row)?.n ?? 0),
    cards: (rows.results as Row[]).map(toCard),
    categoryCounts: catFacets.results as { k: string; s: string | null; n: number }[],
    regionCounts: new Map((regionFacets.results as { k: string; n: number }[]).map(r => [r.k, r.n])),
    cities: (cityFacets.results as { k: string; n: number }[]).map(r => ({ name: r.k, slug: slugify(r.k), n: r.n })),
    cityLabel: cityNames[0]
  }
}

function toCard(r: Row): Card {
  return {
    slug: String(r.slug), title: String(r.title), category: str(r.category), subcategory: str(r.subcategory),
    county: str(r.county), city: str(r.city), summary: str(r.summary),
    image: mediaList(r.cover)[0] ?? mediaList(r.gallery)[0], capacity: Number(r.capacity) || undefined,
    priceLevel: r.priceLevel === null || r.priceLevel === undefined || r.priceLevel === '' ? undefined : String(r.priceLevel),
    premium: Number(r.premium) === 1,
    legacyId: Number(r.legacyId) > 0 ? Number(r.legacyId) : undefined, legacySlug: str(r.legacySlug)
  }
}

export interface Listing extends Card {
  description?: string; gallery: string[]; website?: string; phone?: string; email?: string; setting?: string
  amenities: string[]; seoTitle?: string; seoDescription?: string
}

/** A published company by URL slug or by its old site ID. */
export async function findListing(db: D1Database, by: { slug: string } | { legacyId: number }): Promise<Listing | null> {
  const today = new Date().toISOString().slice(0, 10)
  const match = 'slug' in by ? 'slug = ?' : `CAST(${J('legacyId')} AS INTEGER) = ?`
  const row = await db.prepare(`SELECT slug, title, data, ${PREMIUM} AS premium FROM documents WHERE ${PUBLISHED} AND ${match} LIMIT 1`)
    .bind(today, 'slug' in by ? by.slug : by.legacyId).first<Row>()
  if (!row) return null
  let d: Row = {}
  try { d = JSON.parse(String(row.data ?? '{}')) } catch { /* keep empty */ }
  return {
    ...toCard({ ...d, slug: row.slug, title: str(d.title) ?? row.title, cover: d.coverImage, premium: row.premium }),
    description: str(d.description), gallery: mediaList(d.gallery), website: safeUrl(str(d.website)),
    phone: str(d.phone), email: str(d.email), setting: str(d.setting),
    amenities: directorySettings().taxonomy.amenities.filter(([k]) => truthy(d[k])).map(([, v]) => v),
    seoTitle: str(d.seoTitle), seoDescription: str(d.seoDescription)
  }
}

async function saveRequest(form: FormData, company: Listing, env: Env) {
  const { text } = directorySettings()
  const values = Object.fromEntries(['coupleName', 'email', 'phone', 'weddingDate', 'guests', 'message']
    .map(k => [k, String(form.get(k) ?? '').trim()]))
  if (String(form.get('website') ?? '') !== '') return { ok: true as const } // honeypot: pretend success
  if (!values.coupleName || values.coupleName.length > 200) return { ok: false as const, error: text.errName, values }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) || values.email.length > 200) return { ok: false as const, error: text.errEmail, values }
  if (values.weddingDate && !/^\d{4}-\d{2}-\d{2}$/.test(values.weddingDate)) return { ok: false as const, error: text.errDate, values }
  if (values.message.length > 3000 || values.phone.length > 60) return { ok: false as const, error: text.errTooLong, values }
  const guests = Number.parseInt(values.guests, 10)

  const title = `${values.coupleName} → ${company.title}${values.weddingDate ? ` (${values.weddingDate})` : ''}`.slice(0, 200)
  // Drafts are never returned by the public API, so requests stay private to staff.
  await new DocumentsService(env.DB).create({
    typeId: 'booking-requests', title, publishOnCreate: false,
    data: {
      title, partner: company.slug, partnerName: company.title, coupleName: values.coupleName,
      email: values.email, phone: values.phone, weddingDate: values.weddingDate || undefined,
      guests: Number.isFinite(guests) && guests > 0 ? guests : undefined, message: values.message, handling: 'new'
    }
  } as unknown as Parameters<DocumentsService['create']>[0]) // create() applies schema defaults
  return { ok: true as const }
}

/** Directory card: the directory, and anywhere a site shows companies (home page, articles). */
export function listingCardHtml(c: Card): string {
  const { taxonomy, text } = directorySettings()
  const where = [c.city, label(taxonomy.regions, c.county)].filter(Boolean).join(', ')
  const catLabel = subcategories().find(s => s.slug === c.subcategory)?.label ?? taxonomy.categories.find(x => x.slug === c.category)?.label ?? text.companyFallback
  const href = esc(listingUrl(c))
  return `<article class="card${c.premium ? ' is-premium' : ''}">
      <a class="media" href="${href}" tabindex="-1" aria-hidden="true">${c.image ? `<img src="${esc(c.image)}" alt="" loading="lazy">` : '<span class="ph"></span>'}
        ${c.premium ? `<span class="pill premium">${esc(text.premium)}</span>` : ''}</a>
      <div class="body">
        <span class="cat">${esc(catLabel)}</span>
        <h2><a href="${href}">${esc(c.title)}</a></h2>
        <div class="meta">${where ? `<span>${icon('pin')}${esc(where)}</span>` : ''}${c.capacity ? `<span>${icon('people')}${esc(text.upTo(c.capacity))}</span>` : ''}${c.priceLevel ? `<span class="price">${esc(label(taxonomy.priceLevels, c.priceLevel) ?? '')}</span>` : ''}</div>
        ${c.summary ? `<p>${esc(c.summary)}</p>` : ''}
        <div class="actions">${c.premium ? `<a class="btn" href="${href}#${directorySettings().params.requestAnchor}">${esc(text.requestDate)}</a><a class="more" href="${href}">${esc(text.details)}</a>` : `<a class="btn ghost" href="${href}">${esc(text.view)}</a>`}</div>
      </div></article>`
}

/** Premium companies first (with a photo preferred), optionally from one category. */
export async function featuredListings(db: D1Database, limit: number, category?: string): Promise<Card[]> {
  const today = new Date().toISOString().slice(0, 10)
  const where = category ? `AND (${J('category')} = ? OR ${J('subcategory')} = ?)` : ''
  const rows = await db.prepare(`SELECT ${CARD_FIELDS} FROM documents WHERE ${PUBLISHED} ${where}
    ORDER BY premium DESC, (COALESCE(${J('coverImage')}, '') != '' OR COALESCE(${J('gallery')}, '[]') != '[]') DESC, updated_at DESC LIMIT ?`)
    .bind(today, ...(category ? [category, category] : []), limit).all<Row>()
  return rows.results.map(toCard)
}

/** Counts for a home page: companies per category and the busiest cities. */
export async function directoryOverview(db: D1Database) {
  const [cats, cities, total] = await db.batch([
    db.prepare(`SELECT ${J('category')} AS k, COUNT(*) AS n FROM documents WHERE ${PUBLISHED} GROUP BY k`),
    db.prepare(`SELECT ${J('city')} AS k, COUNT(*) AS n FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('city')}, '') != '' GROUP BY k ORDER BY n DESC, k LIMIT 12`),
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
  const [companies, cities] = await db.batch([
    db.prepare(`SELECT slug, updated_at, ${J('legacyId')} AS legacyId, ${J('legacySlug')} AS legacySlug FROM documents WHERE ${PUBLISHED} ORDER BY slug`),
    db.prepare(`SELECT DISTINCT ${J('city')} AS city FROM documents WHERE ${PUBLISHED} AND COALESCE(${J('city')}, '') != ''`)
  ])
  const citySlugs = [...new Set((cities.results as { city: string }[]).map(r => slugify(r.city)).filter(Boolean))]
  return [
    [directoryUrl()],
    ...taxonomy.categories.flatMap(c => [[categoryUrl(c.slug)], ...(c.subs ?? []).map(s => [categoryUrl(s.slug)])] as [string][]),
    ...citySlugs.map(s => [cityUrl(s)] as [string]),
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
  const DIR = directoryUrl()

  // Links keep every current filter except the ones being changed. Keys are filter names; the URL uses the site's words.
  const params = (change: Partial<Record<keyof typeof P | string, string | null>>) => {
    const current: Record<string, string> = {
      q: f.q, category: f.category, region: f.region, city: f.city, guests: f.guests, price: f.price,
      setting: f.setting, premium: f.premium, sort: f.sort, view: f.view, page: f.page > 1 ? String(f.page) : '',
      ...Object.fromEntries(f.amenities.map(a => [a, '1']))
    }
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...current, ...change })) if (v) p.set((P as Record<string, string>)[k] ?? k, v)
    // Only a category or only a city: its own landing page; anything else: the directory with filters.
    const keys = [...p.keys()]
    if (keys.length === 1 && keys[0] === P.category) return categoryUrl(p.get(P.category)!)
    if (keys.length === 1 && keys[0] === P.city) return cityUrl(p.get(P.city)!)
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
  const regionOptions = taxonomy.regions.map(([k, v]) => option(k, v, f.region, r.regionCounts.get(k) ?? 0)).join('')
  const cityOptions = r.cities.map(c => option(c.slug, c.name, f.city, c.n)).join('')
  const radios = (name: string, list: readonly (readonly [string | number, string])[], current: string) =>
    `<div class="opts">${[['', text.all] as const, ...list].map(([k, v]) => `<label class="opt"><input type="radio" name="${name}" value="${k}"${String(k) === current ? ' checked' : ''}>${esc(v)}</label>`).join('')}</div>`

  const pills = [
    f.q && ['q', text.quoted(f.q)], f.category && ['category', sub?.label ?? cat?.label ?? f.category],
    f.region && ['region', label(taxonomy.regions, f.region) ?? f.region], f.city && ['city', r.cityLabel ?? f.city],
    f.guests && ['guests', text.guestsPill(f.guests)], f.price && ['price', label(taxonomy.priceLevels, f.price) ?? f.price],
    f.setting && ['setting', label(taxonomy.settings, f.setting) ?? f.setting], f.premium === '1' && ['premium', text.premiumPill],
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
    <div class="fsec">${taxonomy.regions.length ? `<label class="flabel" for="f-zup">${esc(text.region)}</label><select id="f-zup" name="${P.region}">${option('', text.allRegions, f.region)}${regionOptions}</select>` : ''}
      <label class="flabel" for="f-grad">${esc(text.city)}</label><select id="f-grad" name="${P.city}">${option('', text.allCities, f.city)}${cityOptions}</select></div>
    ${isVenue || f.guests || f.setting ? `<div class="fsec"><p class="flabel">${esc(text.guests)}</p>${radios(P.guests, taxonomy.guestBuckets.map(([n, t]) => [String(n), t] as const), f.guests)}
      <label class="flabel" for="f-pro">${esc(text.setting)}</label><select id="f-pro" name="${P.setting}">${option('', text.any, f.setting)}${option('indoor', settingLabel('indoor'), f.setting)}${option('outdoor', settingLabel('outdoor'), f.setting)}</select></div>` : ''}
    <div class="fsec"><p class="flabel">${esc(text.price)}</p>${radios(P.price, taxonomy.priceLevels, f.price)}</div>
    <div class="fsec">${(isVenue || f.amenities.length ? taxonomy.amenities : []).map(([k, v]) =>
      `<label class="check"><input type="checkbox" name="${k}" value="1"${f.amenities.includes(k) ? ' checked' : ''}>${esc(v)}</label>`).join('')}
      <label class="check"><input type="checkbox" name="${P.premium}" value="1"${f.premium === '1' ? ' checked' : ''}>${esc(text.premiumOnly)}</label></div>
    <div class="fsec factions"><button type="submit">${esc(text.apply)}</button><a class="link" href="${esc(DIR)}">${esc(text.clear)}</a></div>
    </details></form>`

  // A category with a photo gets it as the header background.
  const photo = parent?.image
  const header = `<div class="bar${photo ? ' photo' : ''}"${photo ? ` style="--bar-img:url('${esc(photo)}')"` : ''}><div class="wrap barin">
    <div><p class="crumbs"><a href="${esc(DIR)}">${esc(text.directoryTitle)}</a>${parent && sub ? ` › <a href="${esc(categoryUrl(parent.slug))}">${esc(parent.label)}</a>` : ''}</p>
      <h1>${f.q ? esc(text.resultsFor(f.q)) : esc(heading)}</h1></div>
    <form class="tools" method="get" action="${esc(DIR)}">
      ${Object.entries({ category: f.category, region: f.region, city: f.city, guests: f.guests, price: f.price, setting: f.setting, premium: f.premium, view: f.view }).map(([k, v]) => hidden((P as Record<string, string>)[k], v)).join('')}
      ${f.amenities.map(a => hidden(a, '1')).join('')}
      <label class="search">${icon('search')}<input type="search" name="${P.q}" value="${esc(f.q)}" placeholder="${esc(text.searchPlaceholder)}" aria-label="${esc(text.searchLabel)}"></label>
      <select name="${P.sort}" aria-label="${esc(text.sortLabel)}" data-auto-submit>${option('', text.sortRecommended, f.sort)}${option(P.sortName, text.sortName, f.sort)}${option(P.sortNewest, text.sortNewest, f.sort)}${isVenue ? option(P.sortCapacity, text.sortCapacity, f.sort) : ''}</select>
      <span class="views"><a class="${f.view === P.viewList ? '' : 'on'}" href="${params({ view: null })}" title="${esc(text.viewGrid)}" aria-label="${esc(text.viewGridLabel)}">${icon('grid')}</a><a class="${f.view === P.viewList ? 'on' : ''}" href="${params({ view: P.viewList })}" title="${esc(text.viewList)}" aria-label="${esc(text.viewListLabel)}">${icon('list')}</a></span>
    </form></div></div>`

  // Only plain category/city pages are canonical and indexable; filter combinations are noindex.
  const plain = !f.q && !f.region && !f.guests && !f.price && !f.setting && !f.premium && !f.amenities.length && !f.sort && !f.view && f.page === 1
  const canonicalPath = !plain ? null
    : f.category && !f.city ? categoryUrl(f.category)
    : f.city && !f.category ? cityUrl(f.city)
    : !f.category && !f.city ? DIR : null
  const body = `${header}<div class="wrap layout"><aside>${sidebar}</aside><section>
    ${pillBar}
    <div class="results ${f.view === P.viewList ? 'list' : 'grid'}">${cards || `<div class="empty"><h2>${esc(text.noResults)}</h2><p>${esc(text.noResultsText)}</p><p><a class="btn ghost" href="${esc(DIR)}">${esc(text.clearFilters)}</a></p></div>`}</div>
    ${pager}</section></div>`
  // Unknown category/city landing pages are 404s (but still render the directory).
  const found = (!f.category || !!(cat || sub)) && (!f.city || !!r.cityLabel)
  return { found, html: page(`${heading}${f.page > 1 ? text.pageSuffix(f.page) : ''}`, body, {
    description: text.metaDescription(heading, text.results(r.total)),
    canonical: canonicalPath && found ? `${url.origin}${encodeURI(canonicalPath)}` : undefined, index: !!canonicalPath && found }) }
}

function profilePage(p: Listing, state: { sent?: boolean; error?: string; values?: Record<string, string> }): string {
  const { taxonomy, text, params: P } = directorySettings()
  const v = state.values ?? {}
  const parent = taxonomy.categories.find(c => c.slug === p.category)
  const sub = subcategories().find(s => s.slug === p.subcategory)
  const paragraphs = (p.description ?? '').split(/\n\s*\n/).filter(Boolean).map(t => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`).join('')
  const gallery = p.gallery.length ? `<h2>${esc(text.gallery)}</h2><div class="gallery">${p.gallery.map((src, i) =>
    `<a href="${esc(src)}" target="_blank" rel="noopener"><img src="${esc(src)}" alt="${esc(text.photoAlt(p.title, i + 1))}" loading="lazy"></a>`).join('')}</div>` : ''
  const facts = [
    [text.location, [p.city, label(taxonomy.regions, p.county)].filter(Boolean).join(', ')],
    [text.capacity, p.capacity ? text.capacityValue(p.capacity) : ''],
    [text.price, label(taxonomy.priceLevels, p.priceLevel) ?? ''],
    [text.setting, label(taxonomy.settings, p.setting) ?? ''],
    [text.amenities, p.amenities.join(', ')]
  ].filter(([, val]) => val)
  const contact = [
    p.website && `<a href="${esc(p.website)}" rel="noopener" target="_blank">${esc(text.website)}</a>`,
    p.phone && `<a href="tel:${esc(p.phone.replace(/[^\d+]/g, ''))}">${esc(p.phone)}</a>`,
    p.email && `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>`
  ].filter(Boolean)
  const form = !p.premium ? '' : state.sent
    ? `<section id="${esc(P.requestAnchor)}" class="box ok"><h2>${esc(text.thanksTitle)}</h2><p>${esc(text.thanksText)}</p></section>`
    : `<section id="${esc(P.requestAnchor)}" class="box"><h2>${esc(text.requestTitle)}</h2>${state.error ? `<p class="err">${esc(state.error)}</p>` : ''}
      <form class="request" method="post" action="${esc(listingUrl(p))}#${esc(P.requestAnchor)}">
        <label>${esc(text.formName)}<input name="coupleName" required maxlength="200" value="${esc(v.coupleName ?? '')}"></label>
        <label>${esc(text.formEmail)}<input name="email" type="email" required maxlength="200" value="${esc(v.email ?? '')}"></label>
        <label>${esc(text.formPhone)}<input name="phone" maxlength="60" value="${esc(v.phone ?? '')}"></label>
        <label>${esc(text.formDate)}<input name="weddingDate" type="date" value="${esc(v.weddingDate ?? '')}"></label>
        <label>${esc(text.formGuests)}<input name="guests" type="number" min="1" max="5000" value="${esc(v.guests ?? '')}"></label>
        <label class="full">${esc(text.formMessage)}<textarea name="message" rows="4" maxlength="3000">${esc(v.message ?? '')}</textarea></label>
        <label class="hp" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <button type="submit">${esc(text.formSend)}</button>
      </form></section>`
  return page(p.seoTitle || p.title, `<div class="wrap profile">
    <p class="crumbs"><a href="${esc(directoryUrl())}">${esc(text.directoryTitle)}</a>${parent ? ` › <a href="${esc(categoryUrl(parent.slug))}">${esc(parent.label)}</a>` : ''}${sub ? ` › <a href="${esc(categoryUrl(sub.slug))}">${esc(sub.label)}</a>` : ''}</p>
    <div class="phead"><h1>${esc(p.title)}</h1>${p.premium ? `<span class="pill premium">${esc(text.premium)}</span>` : ''}</div>
    ${p.image ? `<img class="cover" src="${esc(p.image)}" alt="${esc(p.title)}">` : ''}
    <div class="pcols"><div>${paragraphs}${gallery}${form}</div>
    <aside class="box facts">${facts.map(([k, val]) => `<div><span>${esc(k)}</span>${esc(val)}</div>`).join('')}
      ${contact.length ? `<div><span>${esc(text.contact)}</span>${contact.join('<br>')}</div>` : ''}
      ${p.premium && !state.sent ? `<a class="btn" href="#${esc(P.requestAnchor)}">${esc(text.requestDate)}</a>` : ''}</aside></div></div>`,
    { description: p.seoDescription || p.summary })
}
