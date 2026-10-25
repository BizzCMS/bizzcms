// BizzCMS Directory plugin: the search index ("cards").
//
// A directory with thousands of companies kept every field in the `data` JSON of the `documents` table, so each list,
// facet, suggestion and city lookup scanned and parsed all of them (six statements per page). This file keeps a narrow
// copy of what those queries need in separate tables and answers the same questions from them:
//
//   site_directory_cards            one row per published company: sort/filter columns (plain values, no JSON)
//   site_directory_card_data        the wide card fields (summary, photos, ...), read for the 24 cards of a page only
//   site_directory_card_search      pre-folded search text (accents/case/dashes folded once, not per query)
//   site_directory_card_categories  category memberships: the main (category, subcategory) and the extra categories
//   site_directory_card_cities      city memberships: the own city and the extra cities, with the city's slug
//   site_directory_city_slugs       spelling -> slug (slugify is JavaScript; the tables are built in SQL)
//   site_directory_dirty            ids of companies changed since the tables were last brought up to date
//   site_directory_meta             the signature of the settings the tables were built for
//
// Nothing here changes a result. Everything that depends on the date (the plan's paid-until date, featuring) is stored
// as the date and compared when the query runs; everything that depends on the site's settings (plans, categories,
// amenities) is part of a signature, and the tables are rebuilt when it changes.
//
// Freshness: three triggers on `documents` write the id of every published company that is inserted, changed or deleted
// into site_directory_dirty, whoever writes it (the admin, the portal, an import, SQL by hand). Every query batch starts
// with "is anything dirty, are the triggers there, was this built for the current settings". If not, the results of that
// batch are not used: the caller falls back to the original queries on `documents`, and the dirty companies are copied
// again (all of them after a settings change or when the triggers had gone). Any error also falls back, so the worst
// case is the speed the directory had before.
//
// To remove the index: DROP the three triggers site_directory_dirty_i/_u/_d first, then the site_directory_* tables.
import { directorySettings, slugify, subcategories, bookingSql, extraCategoriesSql, extraCitiesSql } from './config'
import { fold } from './util'

/** Version of the table layout and build SQL: raise it when this file changes them (or fold() in util.ts / slugify() in config.ts). */
const VERSION = 2

export interface Waiter { waitUntil(promise: Promise<unknown>): void }
type Rows = Record<string, unknown>[]

const J = (field: string) => `json_extract(data, '$.${field}')`
const PUBLISHED = (a = '') => `${a}type_id = 'partners' AND ${a}is_published = 1 AND (${a}deleted_at IS NULL OR ${a}deleted_at = '')`
const T = {
  cards: 'site_directory_cards', data: 'site_directory_card_data', search: 'site_directory_card_search',
  cats: 'site_directory_card_categories', cities: 'site_directory_card_cities', slugs: 'site_directory_city_slugs',
  dirty: 'site_directory_dirty', meta: 'site_directory_meta'
}
const TRIGGERS = ['site_directory_dirty_i', 'site_directory_dirty_u', 'site_directory_dirty_d']
/** The plan's paid-until date has not passed (or there is none): same test as the plan SQL in config.ts. */
export const paidOk = (a: string) => `(COALESCE(${a}.paid_until, '') = '' OR ${a}.paid_until >= ?)`

// ---------------------------------------------------------------- signature

/** Amenity keys that can be stored: they go into SQL as JSON paths and into one text column. */
const amenityKeys = () => directorySettings().taxonomy.amenities.map(([k]) => k).filter(k => /^[A-Za-z0-9_]+$/.test(k))

function signature(): string {
  const s = directorySettings()
  const text = JSON.stringify([VERSION, s.plans.map(p => [p.key, !!p.booking, p.categories ?? 1, p.cities ?? 1]),
    s.taxonomy.categories.map(c => [c.slug, (c.subs ?? []).map(x => x.slug)]), amenityKeys()])
  let a = 0x811c9dc5, b = 0x01000193
  for (let i = 0; i < text.length; i++) { a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0; b = Math.imul(b + text.charCodeAt(i), 0x85ebca6b) >>> 0 }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}

// ---------------------------------------------------------------- build

/** The plan SQL of config.ts without the date test (they bind today's date once; an empty date passes every paid-until value). */
const noDate = (sql: string) => sql.replace('?', "''")

const subsValues = () => subcategories().map(s => `('${s.slug.replace(/'/g, "''")}', '${s.parent.replace(/'/g, "''")}')`).join(', ') || "('', '')"

const DDL = [
  `CREATE TABLE ${T.cards} (id TEXT PRIMARY KEY, rid INTEGER, slug TEXT, title TEXT, category, subcategory, county, city, legacy_id, legacy_slug,
    booking, xcat, xcity, paid_until, featured_until, views INTEGER, created_at INTEGER, published_at INTEGER, capacity INTEGER, price_i INTEGER,
    price_level TEXT, setting, amenities TEXT)`,
  `CREATE TABLE ${T.data} (card_id TEXT PRIMARY KEY, summary, cover, gallery, capacity, price_level, price_from, price_unit)`,
  `CREATE TABLE ${T.search} (card_id TEXT PRIMARY KEY, hay TEXT, tfold TEXT)`,
  `CREATE TABLE ${T.cats} (card_id TEXT NOT NULL, extra INTEGER NOT NULL, k, s)`,
  `CREATE TABLE ${T.cities} (card_id TEXT NOT NULL, extra INTEGER NOT NULL, city TEXT, slug TEXT)`,
  `CREATE INDEX idx_sdc_county ON ${T.cards}(county)`,
  `CREATE INDEX idx_sdc_cat_card ON ${T.cats}(card_id)`,
  `CREATE INDEX idx_sdc_cat_k ON ${T.cats}(k, card_id)`,
  `CREATE INDEX idx_sdc_cat_s ON ${T.cats}(s, card_id)`,
  `CREATE INDEX idx_sdc_city_card ON ${T.cities}(card_id)`,
  `CREATE INDEX idx_sdc_city_slug ON ${T.cities}(slug, card_id)`
]
const DROPS = [T.cards, T.data, T.search, T.cats, T.cities].map(t => `DROP TABLE IF EXISTS ${t}`)

// Prerequisites that a rebuild never drops: the dirty list must exist as long as the triggers do.
const PRELUDE = [
  `CREATE TABLE IF NOT EXISTS ${T.meta} (key TEXT PRIMARY KEY, value TEXT)`,
  `CREATE TABLE IF NOT EXISTS ${T.slugs} (city TEXT PRIMARY KEY, slug TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS ${T.dirty} (id TEXT PRIMARY KEY)`,
  `CREATE TRIGGER IF NOT EXISTS ${TRIGGERS[0]} AFTER INSERT ON documents WHEN NEW.type_id = 'partners' AND NEW.is_published = 1
     BEGIN INSERT OR IGNORE INTO ${T.dirty} (id) VALUES (NEW.id); END`,
  `CREATE TRIGGER IF NOT EXISTS ${TRIGGERS[1]} AFTER UPDATE ON documents
     WHEN (OLD.type_id = 'partners' AND OLD.is_published = 1) OR (NEW.type_id = 'partners' AND NEW.is_published = 1)
     BEGIN INSERT OR IGNORE INTO ${T.dirty} (id) VALUES (OLD.id), (NEW.id); END`,
  `CREATE TRIGGER IF NOT EXISTS ${TRIGGERS[2]} AFTER DELETE ON documents WHEN OLD.type_id = 'partners' AND OLD.is_published = 1
     BEGIN INSERT OR IGNORE INTO ${T.dirty} (id) VALUES (OLD.id); END`
]

/** Statements that copy the companies (all, or the dirty ones) into the tables. */
function inserts(full: boolean): string[] {
  const only = full ? '1' : `id IN (SELECT id FROM ${T.dirty})`
  const onlyD = full ? '1' : `d.id IN (SELECT id FROM ${T.dirty})`
  const amenities = `',' || ${amenityKeys().map(k => `CASE WHEN ${J(k)} IN (1, 'true', 'on', '1') THEN '${k},' ELSE '' END`).join(' || ') || "''"}`
  const slugOf = (expr: string) => `(SELECT slug FROM ${T.slugs} WHERE city = ${expr})`
  return [
    `WITH subs(sub, parent) AS (VALUES ${subsValues()})
     INSERT INTO ${T.cats} (card_id, extra, k, s)
     SELECT id, 0, ${J('category')}, ${J('subcategory')} FROM documents WHERE ${PUBLISHED()} AND ${only}
     UNION ALL SELECT d.id, 1, COALESCE(subs.parent, e.value), CASE WHEN subs.parent IS NULL THEN NULL ELSE e.value END
       FROM documents d, json_each(d.data, '$.extraCategories') e LEFT JOIN subs ON subs.sub = e.value
       WHERE ${PUBLISHED('d.')} AND ${onlyD}`,
    `INSERT INTO ${T.cities} (card_id, extra, city, slug)
     SELECT id, 0, ${J('city')}, ${slugOf(J('city'))} FROM documents WHERE ${PUBLISHED()} AND typeof(${J('city')}) = 'text' AND ${J('city')} != '' AND ${only}
     UNION ALL SELECT d.id, 1, e.value, (SELECT slug FROM ${T.slugs} WHERE city = e.value) FROM documents d, json_each(d.data, '$.extraCities') e
       WHERE ${PUBLISHED('d.')} AND typeof(e.value) = 'text' AND e.value != '' AND ${onlyD}`,
    `INSERT INTO ${T.search} (card_id, hay, tfold)
     SELECT id, ${fold(`title || ' ' || COALESCE(${J('city')}, '') || ' ' || COALESCE(${J('summary')}, '') || ' ' || COALESCE(${J('keywords')}, '')`)}, ${fold('title')}
     FROM documents WHERE ${PUBLISHED()} AND ${only}`,
    `INSERT INTO ${T.data} (card_id, summary, cover, gallery, capacity, price_level, price_from, price_unit)
     SELECT id, ${J('summary')}, ${J('coverImage')}, ${J('gallery')}, ${J('capacity')}, ${J('priceLevel')}, ${J('priceFrom')}, ${J('priceUnit')}
     FROM documents WHERE ${PUBLISHED()} AND ${only}`,
    `INSERT INTO ${T.cards} (id, rid, slug, title, category, subcategory, county, city, legacy_id, legacy_slug, booking, xcat, xcity, paid_until, featured_until,
       views, created_at, published_at, capacity, price_i, price_level, setting, amenities)
     SELECT id, rowid, slug, title, ${J('category')}, ${J('subcategory')}, ${J('county')}, ${J('city')}, ${J('legacyId')}, ${J('legacySlug')},
       ${noDate(bookingSql())}, ${noDate(extraCategoriesSql())}, ${noDate(extraCitiesSql())}, ${J('paidUntil')}, ${J('featuredUntil')},
       CAST(${J('views')} AS INTEGER), created_at, published_at, CAST(${J('capacity')} AS INTEGER), CAST(COALESCE(${J('priceFrom')}, 0) AS INTEGER),
       CAST(${J('priceLevel')} AS TEXT), ${J('setting')}, ${amenities}
     FROM documents WHERE ${PUBLISHED()} AND ${only}`
  ]
}

/** Removes the dirty companies from the tables (they are copied again if they are still published). */
function removals(): string[] {
  const dirty = `SELECT id FROM ${T.dirty}`
  return [
    `DELETE FROM ${T.cats} WHERE card_id IN (${dirty})`, `DELETE FROM ${T.cities} WHERE card_id IN (${dirty})`,
    `DELETE FROM ${T.search} WHERE card_id IN (${dirty})`, `DELETE FROM ${T.data} WHERE card_id IN (${dirty})`,
    `DELETE FROM ${T.cards} WHERE id IN (${dirty})`
  ]
}

let syncing = 0 // when the running sync started (0 = none)
let disabledUntil = 0
let failures = 0 // consecutive failed batches; three in a row pause the index for a minute (a bad request alone does not)
function failed(e: unknown): void {
  console.error('directory cards', e)
  if (++failures >= 3) { disabledUntil = Date.now() + 60_000; failures = 0 }
}

/** Brings the tables up to date: the dirty companies only, or everything (first run, settings changed, triggers gone). */
async function sync(db: D1Database, full: boolean): Promise<void> {
  await db.batch(PRELUDE.map(s => db.prepare(s)))
  const only = full ? '' : `AND id IN (SELECT id FROM ${T.dirty})`
  const onlyD = full ? '' : `AND d.id IN (SELECT id FROM ${T.dirty})`
  // Spellings of cities not yet in the slug table (slugify is JavaScript).
  const spellings = (await db.prepare(`SELECT DISTINCT v FROM (SELECT ${J('city')} AS v FROM documents WHERE ${PUBLISHED()} ${only}
      UNION SELECT e.value FROM documents d, json_each(d.data, '$.extraCities') e WHERE ${PUBLISHED('d.')} ${onlyD})
      WHERE typeof(v) = 'text' AND v != '' ${full ? '' : `AND v NOT IN (SELECT city FROM ${T.slugs})`}`).all<{ v: string }>()).results
  for (let i = 0; i < spellings.length; i += 1000) {
    const part = spellings.slice(i, i + 1000), stmts: D1PreparedStatement[] = []
    for (let j = 0; j < part.length; j += 40) {
      const rows = part.slice(j, j + 40)
      stmts.push(db.prepare(`INSERT OR REPLACE INTO ${T.slugs} (city, slug) VALUES ${rows.map(() => '(?, ?)').join(', ')}`)
        .bind(...rows.flatMap(r => [r.v, slugify(r.v)])))
    }
    await db.batch(stmts)
  }
  // One transaction: what was dirty at its start is copied and cleared; a change made after it stays dirty.
  await db.batch([
    ...(full ? [...DROPS, ...DDL] : removals()).map(s => db.prepare(s)),
    ...inserts(full).map(s => db.prepare(s)),
    // A spelling that appeared after the list above was read: filled in if known now, else the company stays dirty for the next run.
    db.prepare(`UPDATE ${T.cities} SET slug = (SELECT slug FROM ${T.slugs} s WHERE s.city = ${T.cities}.city) WHERE slug IS NULL`),
    db.prepare(`DELETE FROM ${T.dirty}`),
    db.prepare(`INSERT OR IGNORE INTO ${T.dirty} (id) SELECT DISTINCT card_id FROM ${T.cities} WHERE slug IS NULL`),
    db.prepare(`INSERT OR REPLACE INTO ${T.meta} (key, value) VALUES ('sig', ?)`).bind(signature())
  ])
}

async function runSync(db: D1Database, full: boolean): Promise<boolean> {
  if (syncing && Date.now() - syncing < 30_000) return false
  syncing = Date.now()
  try { await sync(db, full); return true } catch (e) {
    failed(e)
    return false
  } finally { syncing = 0 }
}

// ---------------------------------------------------------------- reading

/**
 * Runs the statements from `build` in one batch, preceded by the freshness check. Returns their results, or null when
 * the tables are missing / out of date / failing (the caller then runs the original queries). With a `ctx` the tables are
 * brought up to date after the response; without one, before this answer.
 */
export async function viaCards(db: D1Database, ctx: Waiter | undefined, build: (today: string) => D1PreparedStatement[]): Promise<D1Result<Rows[number]>[] | null> {
  if (Date.now() < disabledUntil) return null
  const today = new Date().toISOString().slice(0, 10)
  for (let attempt = 0; attempt < 2; attempt++) {
    let full = true
    try {
      const res = await db.batch<Rows[number]>([
        db.prepare(`SELECT EXISTS (SELECT 1 FROM ${T.dirty}) AS dirty,
          (SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND name IN (${TRIGGERS.map(t => `'${t}'`).join(', ')})) AS triggers,
          (SELECT value FROM ${T.meta} WHERE key = 'sig') AS sig`),
        ...build(today)
      ])
      failures = 0
      const s = res[0].results[0] as { dirty: number; triggers: number; sig: string | null }
      const current = s.triggers === TRIGGERS.length && s.sig === signature()
      if (current && !s.dirty) return res.slice(1)
      full = !current // settings changed or triggers gone: everything; otherwise only the dirty companies
    } catch (e) {
      // No tables yet (first run, or dropped): build them. Anything else: the original queries.
      if (!/no such (table|column)/i.test(String(e))) { failed(e); return null }
    }
    if (attempt === 1) return null
    if (ctx) { ctx.waitUntil(runSync(db, full)); return null }
    if (!(await runSync(db, full))) return null
  }
  return null
}

/** Rows for `build`'s statement only (a single-statement use of viaCards). */
export async function oneViaCards(db: D1Database, ctx: Waiter | undefined, build: (today: string) => D1PreparedStatement): Promise<Rows | null> {
  const res = await viaCards(db, ctx, today => [build(today)])
  return res ? res[0].results : null
}

// ---------------------------------------------------------------- queries on the tables

type Facet = 'category' | 'region' | 'city' | 'price'
export interface CardFilters {
  q: string; category: string; region: string; city: string; guests: string; price: string
  setting: string; premium: string; sort: string; amenities: string[]; favorites: string[] | null; priceMin: string; priceMax: string
}

/** The same conditions as where() in directory.ts, on the cards table (alias c). */
export function cardsWhere(f: CardFilters, today: string, skip: Facet[] = []) {
  const sql: string[] = ['1']
  const binds: unknown[] = []
  if (f.q) {
    const words = slugify(f.q).split('-').filter(Boolean).slice(0, 6)
    if (words.length) {
      sql.push(`c.id IN (SELECT card_id FROM ${T.search} WHERE ${words.map(() => 'hay LIKE ?').join(' AND ')})`)
      binds.push(...words.map(w => `%${w}%`))
    }
  }
  if (f.category && !skip.includes('category')) {
    // A category also holds its subcategories' extra memberships (k is the parent for them); a subcategory is matched on s.
    const isSub = subcategories().some(s => s.slug === f.category)
    sql.push(`c.id IN (SELECT m.card_id FROM ${T.cats} m JOIN ${T.cards} x ON x.id = m.card_id WHERE m.${isSub ? 's' : 'k'} = ? AND (m.extra = 0 OR (x.xcat AND ${paidOk('x')})))`)
    binds.push(f.category, today)
  }
  if (f.region && !skip.includes('region')) { sql.push('c.county = ?'); binds.push(f.region) }
  if (f.city && !skip.includes('city')) {
    sql.push(`c.id IN (SELECT m.card_id FROM ${T.cities} m JOIN ${T.cards} x ON x.id = m.card_id WHERE m.slug = ? AND (m.extra = 0 OR (x.xcity AND ${paidOk('x')})))`)
    binds.push(f.city, today)
  }
  if (Number(f.guests) > 0) { sql.push('c.capacity >= ?'); binds.push(Number(f.guests)) }
  if (f.price) { sql.push('c.price_level = ?'); binds.push(f.price) }
  if (f.setting === 'indoor' || f.setting === 'outdoor') { sql.push("c.setting IN (?, 'both')"); binds.push(f.setting) }
  for (const a of f.amenities) { sql.push('instr(c.amenities, ?) > 0'); binds.push(`,${a},`) }
  if (f.premium === '1') { sql.push(`(c.booking AND ${paidOk('c')})`); binds.push(today) }
  if ((f.priceMin || f.priceMax) && !skip.includes('price')) {
    sql.push('c.price_i > 0')
    if (f.priceMin) { sql.push('c.price_i >= ?'); binds.push(Number(f.priceMin)) }
    if (f.priceMax) { sql.push('c.price_i <= ?'); binds.push(Number(f.priceMax)) }
  }
  if (f.favorites) {
    sql.push(f.favorites.length ? `c.slug IN (${f.favorites.map(() => '?').join(',')})` : '0')
    binds.push(...f.favorites)
  }
  return { sql: sql.join(' AND '), binds }
}

const FEATURED = "(COALESCE(c.featured_until, '') >= date('now'))"
const PREMIUM = `(c.booking AND ${paidOk('c')})`

/** ORDER BY of the list (see orderBy() in directory.ts), with a fixed order for equal rows: the order the companies were published. */
function order(sort: string): { sql: string; binds: unknown[]; today: boolean } {
  const { params } = directorySettings()
  const lead = !sort || sort === params.sortRecommended ? 'featured DESC, ' : ''
  if (!sort) sort = params.defaultSort
  const tie = ', c.published_at, c.rid'
  if (sort === params.sortName) return { sql: lead + 'c.title COLLATE NOCASE' + tie, binds: [], today: false }
  if (sort === params.sortNewest) return { sql: lead + 'c.created_at DESC' + tie, binds: [], today: false }
  if (sort === params.sortCapacity) return { sql: lead + 'c.capacity IS NULL, c.capacity DESC, c.title COLLATE NOCASE' + tie, binds: [], today: false }
  if (sort === params.sortPopular) return { sql: lead + 'c.views DESC, c.title COLLATE NOCASE' + tie, binds: [], today: false }
  return { sql: lead + 'premium DESC, c.views DESC, c.title COLLATE NOCASE' + tie, binds: [], today: true }
}

/** One page of cards, in order. Select columns have the names toCard() reads. */
export function pageStatement(db: D1Database, f: CardFilters, today: string, limit: number, offset: number): D1PreparedStatement {
  const main = cardsWhere(f, today)
  const o = order(f.sort)
  // Window order inside, so the outer join keeps it. The premium test appears in the select list and, for the default order, in the window.
  const winOrder = o.sql.replace(/\bfeatured\b/g, FEATURED).replace(/\bpremium\b/g, PREMIUM)
  return db.prepare(`SELECT x.premium, x.featured, c.slug, c.title, c.category, c.subcategory, c.county, c.city, c.legacy_id AS legacyId, c.legacy_slug AS legacySlug,
      d.summary, d.cover, d.gallery, d.capacity, d.price_level AS priceLevel, d.price_from AS priceFrom, d.price_unit AS priceUnit
    FROM (SELECT c.id AS cid, ${PREMIUM} AS premium, ${FEATURED} AS featured, ROW_NUMBER() OVER (ORDER BY ${winOrder}) AS rn
      FROM ${T.cards} c WHERE ${main.sql} ORDER BY rn LIMIT ? OFFSET ?) x
    JOIN ${T.cards} c ON c.id = x.cid LEFT JOIN ${T.data} d ON d.card_id = x.cid ORDER BY x.rn`)
    .bind(today, ...(o.today ? [today] : []), ...main.binds, limit, offset)
}

export function countStatement(db: D1Database, f: CardFilters, today: string): D1PreparedStatement {
  const w = cardsWhere(f, today)
  return db.prepare(`SELECT COUNT(*) AS n FROM ${T.cards} c WHERE ${w.sql}`).bind(...w.binds)
}

/** Companies per category (k) and per subcategory (s), each company once, extra categories only while the plan allows them. */
export function categoryFacetStatement(db: D1Database, f: CardFilters, today: string): D1PreparedStatement {
  const w = cardsWhere(f, today, ['category'])
  // The filters are written once (a CTE), so a long favourites list does not double the number of bound values.
  const from = `FROM ${T.cats} m JOIN base c ON c.id = m.card_id WHERE (m.extra = 0 OR (c.xcat AND ${paidOk('c')}))`
  return db.prepare(`WITH base AS (SELECT c.id, c.xcat, c.paid_until FROM ${T.cards} c WHERE ${w.sql})
    SELECT m.k AS k, NULL AS s, COUNT(DISTINCT m.card_id) AS n ${from} GROUP BY m.k
    UNION ALL SELECT NULL, m.s, COUNT(DISTINCT m.card_id) ${from} AND m.s IS NOT NULL GROUP BY m.s`).bind(...w.binds, today, today)
}

export function regionFacetStatement(db: D1Database, f: CardFilters, today: string): D1PreparedStatement {
  const w = cardsWhere(f, today, ['region', 'city'])
  return db.prepare(`SELECT c.county AS k, COUNT(*) AS n FROM ${T.cards} c WHERE ${w.sql} GROUP BY c.county`).bind(...w.binds)
}

export function cityFacetStatement(db: D1Database, f: CardFilters, today: string): D1PreparedStatement {
  const w = cardsWhere(f, today, ['city'])
  return db.prepare(`SELECT m.city AS k, COUNT(DISTINCT m.card_id) AS n FROM ${T.cities} m JOIN ${T.cards} c ON c.id = m.card_id
    WHERE ${w.sql} AND (m.extra = 0 OR (c.xcity AND ${paidOk('c')})) GROUP BY m.city ORDER BY m.city`).bind(...w.binds, today)
}

export function priceFacetStatement(db: D1Database, f: CardFilters, today: string): D1PreparedStatement {
  const w = cardsWhere(f, today, ['price'])
  return db.prepare(`SELECT MIN(c.price_i) AS lo, MAX(c.price_i) AS hi, COUNT(*) AS n FROM ${T.cards} c WHERE ${w.sql} AND c.price_i > 0`).bind(...w.binds)
}

/** The city's name as stored (the first spelling by company, as the original query found it); the slug is `slug`. */
export function cityLabelStatement(db: D1Database, slug: string, today: string): D1PreparedStatement {
  return db.prepare(`SELECT m.city AS city FROM ${T.cities} m JOIN ${T.cards} c ON c.id = m.card_id
    WHERE m.slug = ? AND (m.extra = 0 OR (c.xcity AND ${paidOk('c')})) ORDER BY m.card_id, m.city LIMIT 1`).bind(slug, today)
}

/** The region most of the city's own companies are in. */
export function cityRegionStatement(db: D1Database, slug: string): D1PreparedStatement {
  return db.prepare(`SELECT c.county AS k, COUNT(*) AS n FROM ${T.cities} m JOIN ${T.cards} c ON c.id = m.card_id
    WHERE m.slug = ? AND m.extra = 0 AND COALESCE(c.county, '') != '' GROUP BY c.county ORDER BY n DESC, k LIMIT 1`).bind(slug)
}

/** Cities with companies (own and, while the plan allows it, extra), with their counts: (city, n) rows. */
export function cityListStatement(db: D1Database, today: string): D1PreparedStatement {
  return db.prepare(`SELECT m.city AS city, COUNT(DISTINCT m.card_id) AS n FROM ${T.cities} m JOIN ${T.cards} c ON c.id = m.card_id
    WHERE (m.extra = 0 OR (c.xcity AND ${paidOk('c')})) GROUP BY m.city ORDER BY m.city`).bind(today)
}

/** Up to 6 companies whose name contains the (folded) text, in list order. */
export function suggestStatement(db: D1Database, q: string, today: string): D1PreparedStatement {
  return db.prepare(`SELECT c.slug, c.title, c.city, c.legacy_id AS legacyId, c.legacy_slug AS legacySlug, ${FEATURED} AS featured, ${PREMIUM} AS premium
    FROM ${T.cards} c WHERE c.id IN (SELECT card_id FROM ${T.search} WHERE tfold LIKE ?)
    ORDER BY featured DESC, premium DESC, c.views DESC, c.title COLLATE NOCASE, c.published_at, c.rid LIMIT 6`).bind(today, `%${q}%`)
}
