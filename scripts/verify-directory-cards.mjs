// Local check that the Directory plugin's search index (src/plugins/directory/cards.ts) changes no result.
//
//   node scripts/verify-directory-cards.mjs <path to a D1 sqlite file> [--old <git ref>] [--site <path to the site repo>]
//
// It works on a COPY of the database (in the system temp folder; the original is never opened), builds two bundles of the
// plugin - the version before cards.ts (default: the parent of the commit that added it, or HEAD while uncommitted) and the
// working tree - and runs the same requests through both handleDirectory() functions: every category and subcategory,
// the biggest cities and regions, text searches with and without accents, page 1 and 2, filters, sorts, suggestions and
// profile addresses. Status, redirect target and body must be identical. A second round repeats it after test data
// (plans, extra categories and cities, paid-until and featured dates, odd values) is written into the copy, and a third
// edits, unpublishes, deletes and adds companies, changes the settings, and drops a table, checking after each step.
// Needs the site's own directory settings only for realistic categories/plans: it reads them from the site repo
// (default ../planervjencanja, read only). No data is written anywhere except the temp copy.
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { isDeepStrictEqual } from 'node:util'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : undefined }
const oldRefArg = flag('--old')
const siteArg = flag('--site')
const dbArg = args[0]
if (!dbArg) { console.error('usage: node scripts/verify-directory-cards.mjs <D1 sqlite file> [--old <git ref>] [--site <site repo>]'); process.exit(2) }
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const site = resolve(siteArg ?? join(root, '..', 'planervjencanja'))
const git = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8' }).trim()

const work = mkdtempSync(join(tmpdir(), 'dircards-'))
process.on('exit', () => { try { rmSync(work, { recursive: true, force: true }) } catch { /* temp */ } })

// ---- database copy
const base = dbArg.replace(/\.sqlite$/, '')
mkdirSync(join(work, 'db'))
const dbFile = join(work, 'db', 'copy.sqlite')
copyFileSync(dbArg, dbFile)
for (const ext of ['-wal', '-shm']) if (existsSync(base + '.sqlite' + ext)) copyFileSync(base + '.sqlite' + ext, dbFile + ext)
const sqlite = new DatabaseSync(dbFile)
sqlite.exec('PRAGMA journal_mode = WAL')

// ---- a D1-shaped wrapper around node:sqlite, with counters
const stats = { trips: 0, statements: 0, sql: [] }
const cache = new Map()
function exec(sql, args, mode) {
  stats.statements++; stats.sql.push(sql)
  let st = cache.get(sql); if (!st) { st = sqlite.prepare(sql); cache.set(sql, st) }
  const a = args.map(v => (v === undefined ? null : v))
  if (st.columns().length === 0) { st.run(...a); return { results: [], success: true, meta: {} } }
  return { results: st.all(...a).map(r => ({ ...r })), success: true, meta: {} }
}
function stmt(sql, args) {
  return {
    bind: (...b) => stmt(sql, b),
    _exec: () => exec(sql, args),
    async all() { stats.trips++; return exec(sql, args) },
    async first(col) { stats.trips++; const r = exec(sql, args).results[0] ?? null; return r && col ? r[col] : r },
    async run() { stats.trips++; return exec(sql, args) }
  }
}
const db = {
  prepare: (sql) => stmt(sql, []),
  async batch(list) {
    stats.trips++
    sqlite.exec('BEGIN')
    try { const out = list.map(s => s._exec()); sqlite.exec('COMMIT'); return out } catch (e) { sqlite.exec('ROLLBACK'); throw e }
  }
}

// ---- bundles
const oldRef = oldRefArg ?? (() => {
  try {
    const added = git('log', '--diff-filter=A', '--format=%H', '--', 'src/plugins/directory/cards.ts').split('\n').filter(Boolean).pop()
    return added ? `${added}~1` : 'HEAD'
  } catch { return 'HEAD' }
})()
const oldRoot = join(work, 'old'); mkdirSync(oldRoot)
execFileSync('git', ['-C', root, 'archive', '--format=tar', '-o', join(work, 'old.tar'), oldRef, 'src'])
execFileSync('tar', ['-xf', '../old.tar'], { cwd: oldRoot }) // relative: GNU tar reads "C:" as a host

const stub = { name: 'stub', setup(b) {
  b.onResolve({ filter: /^bizzcms-core$/ }, () => ({ path: 'bizzcms-core', namespace: 'stub' }))
  b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export class DocumentsService {}\nexport const definePlugin = x => x', loader: 'js' }))
} }
const siteSrc = join(site, 'src')
async function bundle(name, srcRoot) {
  const plugin = join(srcRoot, 'plugins', 'directory')
  const entry = join(work, `${name}-entry.ts`)
  const q = (p) => JSON.stringify(p.replace(/\\/g, '/'))
  writeFileSync(entry, `
import * as config from ${q(join(plugin, 'config.ts'))}
import * as dir from ${q(join(plugin, 'directory.ts'))}
import { categories, counties, guestBuckets, priceLevels, settings, amenities } from ${q(join(siteSrc, 'directory-config.ts'))}
import { PLANS } from ${q(join(siteSrc, 'plans.ts'))}
export const handleDirectory = dir.handleDirectory
export const search = dir.search, searchOriginal = dir.searchOriginal, suggestions = dir.suggestions
export const slugify = config.slugify
export const plans = (over = {}) => PLANS.map(p => ({ key: p.key, label: p.name, photos: p.photos, categories: p.categories, cities: p.cities, videos: p.videos, links: p.links, requests: p.requests, booking: p.booking, price: p.price, items: p.items, featureMonths: p.featureMonths, ...(over[p.key] ?? {}) }))
export function setup(planOver) {
  config.setDirectory({
    plans: plans(planOver), favorites: true, priceRange: true, memberFilters: true,
    routes: { directory: '/imenik-vjencanja/', category: '/imenik/category/{slug}/', city: '/imenik/city/{slug}/', region: '/imenik/zupanija/{slug}/', listing: '/imenik-upis/{slug}/', legacyListing: '/imenik-upis/{name}/{id}/' },
    params: { q: 'q', category: 'kategorija', region: 'zupanija', city: 'grad', guests: 'gosti', price: 'cijena', setting: 'prostor', premium: 'premium', favorites: 'favoriti', priceMin: 'cijena-od', priceMax: 'cijena-do', sort: 'sort', view: 'prikaz', page: 'stranica', sent: 'poslano', requestAnchor: 'upit', sortName: 'naziv', sortNewest: 'novo', sortCapacity: 'kapacitet', sortPopular: 'popularno', viewList: 'lista', sortRecommended: 'preporuceno', defaultSort: 'novo' },
    taxonomy: { categories, defaultCategory: 'ostalo', regions: counties, guestBuckets, priceLevels, priceFilter: false, showPriceLevels: false, priceUnits: [['person', 'po osobi']], settings, amenities },
    layout: (title, body, o) => '<!--' + title + '|' + (o.description ?? '') + '|' + (o.canonical ?? '') + '|' + o.index + '-->' + (o.head ?? '') + body,
    locale: 'hr', sample: { slugPrefix: 'demo-', label: 'Primjer' }
  })
}
export { categories }
`)
  const out = join(work, `${name}.mjs`)
  await build({
    entryPoints: [entry], bundle: true, format: 'esm', platform: 'node', outfile: out, logLevel: 'error', plugins: [stub, {
      name: 'redirect', setup(b) {
        // The site's config files import the plugin by its folder; point them at the version under test.
        b.onResolve({ filter: /plugins\/directory$/ }, a => (a.importer.startsWith(siteSrc) ? { path: join(plugin, 'config.ts') } : undefined))
      }
    }]
  })
  return out
}
const bundles = { old: await bundle('old', join(oldRoot, 'src')), new: await bundle('new', join(root, 'src')) }
let loads = 0
const load = async (which) => {
  const mod = await import(`${pathToFileURL(bundles[which]).href}?v=${++loads}`) // a fresh module = fresh caches
  return mod
}

// ---- running a request
async function call(mod, path) {
  const req = new Request('https://verify.test' + path)
  const res = await mod.handleDirectory(req, { DB: db })
  if (!res) return { status: 'null' }
  return { status: res.status, location: res.headers.get('location'), body: res.headers.get('location') ? '' : await res.text() }
}
const sameResult = (a, b) => a.status === b.status && a.location === b.location && a.body === b.body

let failures = 0, compared = 0
const failed = []
async function compare(label, paths, mods, opts = {}) {
  let n = 0
  for (const path of paths) {
    stats.sql.length = 0
    const o = await call(mods.old, path)
    const w = await call(mods.new, path)
    compared++; n++
    if (!sameResult(o, w)) {
      failures++; failed.push(path)
      if (failed.length <= 8) {
        const i = [...o.body ?? ''].findIndex((c, k) => c !== (w.body ?? '')[k])
        console.log(`  DIFF ${path}\n    old ${o.status} ${o.location ?? ''} ${(o.body ?? '').length}b / new ${w.status} ${w.location ?? ''} ${(w.body ?? '').length}b; first difference at ${i}:\n    old: ${(o.body ?? '').slice(Math.max(0, i - 80), i + 160).replace(/\n/g, ' ')}\n    new: ${(w.body ?? '').slice(Math.max(0, i - 80), i + 160).replace(/\n/g, ' ')}`)
      }
    }
  }
  if (!opts.quiet) console.log(`${label}: ${n} requests`)
}

// ---- raw comparison of search() against searchOriginal() inside the new bundle (facets, cards, order)
const baseFilters = () => ({ q: '', category: '', region: '', city: '', guests: '', price: '', setting: '', premium: '', sort: '', view: '', page: 1, amenities: [], favorites: null, priceMin: '', priceMax: '' })
const norm = (r) => ({
  ...r,
  categoryCounts: [...r.categoryCounts].map(x => ({ k: x.k ?? null, s: x.s ?? null, n: Number(x.n) })).sort((a, b) => String(a.k).localeCompare(String(b.k)) || String(a.s).localeCompare(String(b.s))),
  regionCounts: [...r.regionCounts].map(([k, n]) => [k ?? null, Number(n)]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  cities: r.cities.map(c => ({ ...c, n: Number(c.n) }))
})
async function rawCompare(label, filters, mod) {
  let n = 0
  for (const f of filters) {
    const a = norm(await mod.searchOriginal(db, f)), b = norm(await mod.search(db, f))
    compared++; n++
    if (!isDeepStrictEqual(a, b)) {
      failures++; failed.push(JSON.stringify(f))
      const keys = Object.keys(a).filter(k => !isDeepStrictEqual(a[k], b[k]))
      if (failed.length <= 8) console.log(`  RAW DIFF ${JSON.stringify(f)} in ${keys.join(', ')}`, keys.includes('cards') ? { old: a.cards.map(c => c.slug).slice(0, 6), new: b.cards.map(c => c.slug).slice(0, 6) } : { old: a[keys[0]], new: b[keys[0]] })
    }
  }
  console.log(`${label}: ${n} raw search() comparisons`)
}

// ---- the cases
const q = (sql, ...a) => sqlite.prepare(sql).all(...a)
const PUB = "type_id = 'partners' AND is_published = 1 AND (deleted_at IS NULL OR deleted_at = '')"
function cases(mod) {
  const { slugify, categories } = mod
  const cats = categories.map(c => c.slug), subs = categories.flatMap(c => (c.subs ?? []).map(s => s.slug))
  const cityRows = q(`SELECT json_extract(data,'$.city') c, COUNT(*) n FROM documents WHERE ${PUB} AND json_extract(data,'$.city') IS NOT NULL GROUP BY 1 ORDER BY n DESC`)
  const cities = [...new Set(cityRows.map(r => slugify(String(r.c))).filter(Boolean))]
  const regions = q(`SELECT json_extract(data,'$.county') c FROM documents WHERE ${PUB} GROUP BY 1 HAVING c IS NOT NULL AND c != ''`).map(r => r.c)
  const textQ = ['bend', 'bend osijek', 'dakovo', 'đakovo', 'Đakovo', 'fotograf zagreb', 'fotograf', 'catering', 'kastel sucurac', 'kaštel sućurac', 'caffe', 'sala za svadbe', 'restoran split', 'a', 'torta', 'dj', 'zagreb', 'osijek', 'tamburasi', 'cvijeće', 'make up', 'šator', 'vila', 'hotel dubrovnik', 'ž', 'xyzzy nothing', 'la-la', 'bend  zagreb  band  2024', 'photo & video', "o'brien", '100%']
  const out = []
  const add = (p) => out.push(p)
  add('/imenik-vjencanja/')
  for (const p of [2, 3, 50, 200]) add(`/imenik-vjencanja/?stranica=${p}`)
  for (const s of ['naziv', 'novo', 'popularno', 'kapacitet', 'preporuceno', 'nepoznato']) { add(`/imenik-vjencanja/?sort=${s}`); add(`/imenik-vjencanja/?sort=${s}&stranica=2`) }
  add('/imenik-vjencanja/?prikaz=lista')
  for (const c of [...cats, ...subs]) {
    add(`/imenik/category/${c}/`); add(`/imenik/category/${c}/?stranica=2`)
    add(`/imenik/category/${c}/?sort=naziv`); add(`/imenik/category/${c}/?sort=popularno&stranica=2`); add(`/imenik/category/${c}/?sort=kapacitet`); add(`/imenik/category/${c}/?sort=preporuceno`)
  }
  add('/imenik/category/ne-postoji/')
  for (const c of cities.slice(0, 40)) { add(`/imenik/city/${c}/`); add(`/imenik/city/${c}/?stranica=2`); add(`/imenik/city/${c}/?sort=naziv`) }
  for (const c of cities.slice(0, 8)) for (const cat of cats.slice(0, 6)) add(`/imenik/category/${cat}/?grad=${c}`)
  for (const c of cities.slice(-5)) add(`/imenik/city/${c}/`)
  add('/imenik/city/ne-postoji/'); add('/imenik/city/kastel-sucurac/')
  for (const r of regions) { add(`/imenik/zupanija/${r}/`); add(`/imenik/zupanija/${r}/?stranica=2`); add(`/imenik-vjencanja/?zupanija=${r}&q=bend`); add(`/imenik/category/${cats[0]}/?zupanija=${r}`) }
  add(`/imenik/city/${cities[0]}/?zupanija=${regions[1]}`)
  for (const t of textQ) {
    const e = encodeURIComponent(t)
    add(`/imenik-vjencanja/?q=${e}`); add(`/imenik-vjencanja/?q=${e}&stranica=2`); add(`/imenik/category/${cats[1]}/?q=${e}`); add(`/imenik-vjencanja/?q=${e}&sort=naziv`)
  }
  for (const f of ['gosti=100', 'gosti=300', 'prostor=indoor', 'prostor=outdoor', 'prostor=both', 'cijena=2', 'cijena=4', 'premium=1', 'hasParking=1', 'hasCatering=1&hasAccommodation=1', 'cijena-od=10', 'cijena-od=50&cijena-do=500', 'cijena-do=100', 'cijena-od=0',
    'favoriti=', 'favoriti=catering-fratelli-51,nema-takvog', 'gosti=100&prostor=indoor&hasParking=1', 'gosti=abc', 'stranica=abc', 'stranica=0', 'stranica=99999']) {
    add(`/imenik-vjencanja/?${f}`); add(`/imenik/category/${cats[0]}/?${f}`)
  }
  add(`/imenik/city/${cities[0]}/?premium=1`); add(`/imenik/city/${cities[1]}/?q=bend`); add(`/imenik/city/${cities[1]}/?gosti=100`)
  add('/imenik-vjencanja/?kategorija=bendovi-za-svadbe&q=')
  add(`/imenik-vjencanja/?grad=${cities[2]}&q=bend`)
  add(`/imenik-vjencanja/?q=osijek&kategorija=${cats[0]}`)
  const sug = ['os', 'osi', 'osij', 'za', 'zag', 'da', 'đak', 'dak', 'ca', 'cafe', 'bend', 'ban', 'hotel', 'spl', 'ka', 'kas', 'x', 'xy', 'vila', 'sala za', 'a-b', 'DJ', 'foto', 'cat', 'ž', 'šibenik']
  const suggestions = sug.map(s => `/imenik-vjencanja/?suggest=${encodeURIComponent(s)}`)
  // profile addresses
  const profiles = q(`SELECT slug, json_extract(data,'$.legacyId') lid, json_extract(data,'$.legacySlug') ls FROM documents WHERE ${PUB} ORDER BY rowid LIMIT 400`).filter((_, i) => i % 40 === 0)
  const prof = [...profiles.map(p => `/imenik-upis/${p.slug}/`), ...profiles.filter(p => p.lid).map(p => `/imenik-upis/${p.ls ?? p.slug}/${p.lid}/`), '/imenik-upis/ne-postoji/', '/imenik-upis/x/999999/']
  const filters = [baseFilters()]
  for (const c of [...cats, ...subs]) { filters.push({ ...baseFilters(), category: c }); filters.push({ ...baseFilters(), category: c, page: 2, sort: 'popularno' }) }
  for (const c of cities.slice(0, 25)) { filters.push({ ...baseFilters(), city: c }); filters.push({ ...baseFilters(), city: c, category: cats[0] }); filters.push({ ...baseFilters(), city: c, region: regions[0], q: 'bend' }) }
  for (const r of regions) filters.push({ ...baseFilters(), region: r })
  for (const t of textQ) filters.push({ ...baseFilters(), q: t }, { ...baseFilters(), q: t, category: cats[2], page: 2 })
  filters.push({ ...baseFilters(), priceMin: '20', priceMax: '300' }, { ...baseFilters(), premium: '1' }, { ...baseFilters(), guests: '100', setting: 'indoor', amenities: ['hasParking'] }, { ...baseFilters(), favorites: [] }, { ...baseFilters(), city: 'ne-postoji' })
  return { pages: out, suggestions, prof, filters }
}

async function round(title) {
  console.log(`\n== ${title}`)
  const mods = { old: await load('old'), new: await load('new') }
  mods.old.setup(); mods.new.setup()
  const c = cases(mods.new)
  stats.sql.length = 0; stats.trips = 0; stats.statements = 0
  await call(mods.new, '/imenik/category/catering/') // first request builds the tables
  console.log(`first request (builds or refreshes the index): ${stats.trips} round trips, ${stats.statements} statements`)
  await compare('pages', c.pages, mods)
  await compare('suggestions', c.suggestions, mods)
  await compare('profiles', c.prof, mods)
  await rawCompare('facets/cards', c.filters, mods.new)
  return { mods, c }
}

// ---- round 1: the data as it is
const t0 = Date.now()
const ONLY3 = process.env.ROUNDS === '3' // ROUNDS=3 runs only the third round (changes while running)
const { mods } = ONLY3 ? { mods: { new: await load('new') } } : await round('Round 1: the copy as it is')
if (!ONLY3) {
  // round trips and time of typical pages, old vs new, warm
  const sample = ['/imenik/category/sale-za-svatove/', '/imenik/city/zagreb/', '/imenik-vjencanja/?q=bend%20osijek', '/imenik/category/foto-i-video/?stranica=2', '/imenik-vjencanja/?suggest=zag']
  for (const p of sample) {
    const m = {}
    for (const w of ['old', 'new']) {
      await call(mods[w], p) // warm (caches, statement cache)
      stats.trips = 0; stats.statements = 0
      const s = performance.now(); for (let i = 0; i < 5; i++) { await call(mods[w], p) }
      m[w] = { ms: ((performance.now() - s) / 5).toFixed(1), trips: stats.trips / 5, statements: stats.statements / 5 }
    }
    console.log(`  ${p}: old ${m.old.ms} ms, ${m.old.trips} round trips, ${m.old.statements} statements | new ${m.new.ms} ms, ${m.new.trips} round trips, ${m.new.statements} statements`)
  }
}

// ---- round 2: plans, extra categories and cities, dates, odd values
const today = new Date().toISOString().slice(0, 10)
const day = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10)
function plantTestData() {
  const ids = q(`SELECT id, json_extract(data,'$.category') cat, json_extract(data,'$.city') city FROM documents WHERE ${PUB} ORDER BY rowid`)
  const cats = mods.new.categories.map(x => x.slug), subs = mods.new.categories.flatMap(x => (x.subs ?? []).map(s => s.slug))
  const set = (id, patch) => sqlite.prepare("UPDATE documents SET updated_at = updated_at + 1, data = (SELECT json_patch(data, ?) FROM documents WHERE id = ?) WHERE id = ?").run(JSON.stringify(patch), id, id)
  const cityNames = [...new Set(ids.map(r => r.city).filter(Boolean))]
  let n = 0
  const pick = (k) => ids.filter((_, i) => i % 23 === k)
  for (const r of pick(0)) set(r.id, { plan: 'napredni', paidUntil: day(30), featuredUntil: day(10) })
  for (const r of pick(1)) set(r.id, { plan: 'premium', paidUntil: day(30), extraCategories: [cats[(n++) % cats.length], subs[n % subs.length]], featuredUntil: today })
  for (const r of pick(2)) set(r.id, { plan: 'premium', paidUntil: day(-1), extraCategories: [cats[(n++) % cats.length]], featuredUntil: day(-1) })
  for (const r of pick(3)) set(r.id, { plan: 'elite', paidUntil: today, extraCategories: [cats[(n++) % cats.length], subs[(n + 3) % subs.length], cats[(n + 5) % cats.length]], extraCities: [cityNames[(n++) % cityNames.length], cityNames[(n + 7) % cityNames.length]] })
  for (const r of pick(4)) set(r.id, { plan: 'elite', paidUntil: day(1), extraCategories: [cats[(n++) % cats.length], subs[n % subs.length]], extraCities: [cityNames[n % cityNames.length], 'Kaštel Sućurac', 'KAŠTEL SUCURAC'] })
  for (const r of pick(5)) set(r.id, { plan: 'elite', paidUntil: day(-1), extraCategories: [cats[(n++) % cats.length]], extraCities: [cityNames[n % cityNames.length]] })
  for (const r of pick(6)) set(r.id, { paidMember: true, extraCategories: [cats[(n++) % cats.length]], extraCities: ['Zagreb'] })
  for (const r of pick(7)) set(r.id, { plan: 'elite', extraCategories: [cats[(n++) % cats.length], 5, '', null, 'nema-takve'], extraCities: ['Zagreb', 'Split', '', 'Pula', 'Osijek ', 'osijek'] })
  for (const r of pick(8)) set(r.id, { plan: 'premium', paidUntil: day(5), extraCategories: cats[(n++) % cats.length] })
  for (const r of pick(9)) set(r.id, { plan: 'elite', extraCategories: { a: cats[(n++) % cats.length] } })
  for (const r of pick(10)) set(r.id, { featuredUntil: [day(3), today, day(-3), ''][(n++) % 4], views: [0, 5, 938, 938, 12][n % 5] })
  for (const r of pick(11)) set(r.id, { capacity: [50, 120, 250, 400, 'x', null][(n++) % 6], priceLevel: [1, '2', 3, 4, null][n % 5], priceFrom: [0, 20, 49, 120, 999, null, 'x'][n % 7], priceUnit: 'person', setting: ['indoor', 'outdoor', 'both', null][n % 4], hasParking: [true, 'true', 1, '1', 'on', false, 0][n % 7], hasCatering: [true, false][n % 2], hasAccommodation: n % 3 === 0 })
  for (const r of pick(12)) set(r.id, { plan: 'premium', paidMember: true, paidUntil: '' })
  for (const r of pick(13)) set(r.id, { plan: 'elite', paidUntil: 2030 })
  // equal titles and views on purpose (ties)
  for (const r of pick(14)) set(r.id, { views: 777 })
  for (const r of ids.slice(0, 12)) sqlite.prepare("UPDATE documents SET title = ?, updated_at = updated_at + 1 WHERE id = ?").run("Isti naziv", r.id)
  for (const r of ids.slice(12, 20)) set(r.id, { city: 'Đakovo' })
  return n
}
if (!ONLY3) plantTestData()
if (!ONLY3) await round('Round 2: plans, extra categories/cities, dates, odd values written into the copy')

// ---- round 3: changes while running
{
  console.log('\n== Round 3: edits, unpublish, delete, new company, settings change, dropped table')
  const mods3 = { old: await load('old'), new: await load('new') }
  mods3.old.setup(); mods3.new.setup()
  const c3 = cases(mods3.new)
  const pages = c3.pages.filter((_, i) => i % 7 === 0).concat(c3.suggestions.filter((_, i) => i % 3 === 0))
  const allSql = () => stats.sql.join('\n')
  const usedIndex = async (p) => { stats.sql.length = 0; await call(mods3.new, p); return !/SELECT COUNT\(\*\) AS n FROM documents WHERE type_id/.test(allSql()) }
  const bump = (id, extra = '') => sqlite.prepare(`UPDATE documents SET updated_at = ?${extra} WHERE id = ?`).run(Math.floor(Date.now() / 1000), id)
  const rows = q(`SELECT id, slug FROM documents WHERE ${PUB} ORDER BY rowid`)
  await compare('before the edits', pages, mods3, { quiet: true })
  const step = async (name, mutate, wait = 0) => {
    mutate()
    await compare(name + '', pages, mods3)
    if (wait) await new Promise(r => setTimeout(r, wait))
    await call(mods3.new, '/imenik/category/catering/')
    await compare(name + ' (second pass)', pages, mods3)
    console.log(`  index used for the next request: ${await usedIndex('/imenik/category/catering/')}`)
  }
  await step('title change', () => { sqlite.prepare("UPDATE documents SET title = 'Zzz Promijenjen naziv bend' WHERE id = ?").run(rows[3].id); bump(rows[3].id) })
  await step('city + category change', () => { sqlite.prepare("UPDATE documents SET data = json_set(data, '$.city', 'Novi Grad Test', '$.category', 'nakit', '$.county', 'zadarska') WHERE id = ?").run(rows[10].id); bump(rows[10].id) })
  await step('unpublish', () => { sqlite.prepare('UPDATE documents SET is_published = 0 WHERE id = ?').run(rows[20].id); bump(rows[20].id) })
  await step('soft delete', () => { sqlite.prepare('UPDATE documents SET deleted_at = ? WHERE id = ?').run(Math.floor(Date.now() / 1000), rows[30].id); bump(rows[30].id) })
  await step('hard delete', () => { sqlite.prepare('DELETE FROM documents WHERE id = ?').run(rows[40].id) })
  await step('new company', () => {
    sqlite.prepare("INSERT INTO documents (id, root_id, type_id, is_current_draft, is_published, status, slug, title, published_at, data, created_at, updated_at) VALUES ('verify-new-1', 'verify-new-1', 'partners', 1, 1, 'published', 'verify-nova-tvrtka', 'Nova tvrtka Test', ?, ?, ?, ?)")
      .run(Math.floor(Date.now() / 1000), JSON.stringify({ title: 'Nova tvrtka Test', category: 'make-up', subcategory: 'frizerski-saloni', city: 'Novi Grad Test', county: 'zadarska', summary: 'Novi opis bend', plan: 'elite', extraCities: ['Zagreb'], extraCategories: ['nakit'] }), Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000))
  })
  // The site's end-to-end cases (planervjencanja scripts/e2e.mjs): the package is changed with plain SQL (no updated_at,
  // same-length values like premium/osnovni), then the category and city pages are read right away.
  {
    const target = rows[70], name = 'Zzz Paket Test'
    const lg = sqlite.prepare("SELECT json_extract(data,'$.legacyId') id, json_extract(data,'$.legacySlug') ls FROM documents WHERE id = ?").get(target.id)
    const profile = lg.id ? `/imenik-upis/${lg.ls ?? target.slug}/${lg.id}/` : `/imenik-upis/${target.slug}/` // the company's own address
    sqlite.prepare('UPDATE documents SET title = ?, updated_at = updated_at + 1 WHERE id = ?').run(name, target.id)
    const setPlan = (plan, extra = '') => sqlite.prepare(`UPDATE documents SET data = json_set(data, '$.plan', ?${extra}) WHERE id = ?`).run(plan, target.id)
    const urls = ['/imenik/category/torte-i-kolaci/', '/imenik/category/ostalo/', '/imenik/city/split/', '/imenik/category/foto-i-video/'].map(u => u + '?q=' + encodeURIComponent(name))
    const shown = async (u) => (await call(mods3.new, u)).body?.includes(profile)
    const expect = (label, got, want) => { compared++; if (got !== want) { failures++; failed.push(label); console.log('  E2E CASE FAILED: ' + label + ' got ' + got) } else console.log('  ok: ' + label) }
    setPlan('elite', ", '$.extraCategories', json('[\"torte-i-kolaci\",\"organizacija-vjencanja\"]'), '$.extraCities', json('[\"Osijek\",\"Split\"]')")
    await compare('e2e: elite saved with plain SQL', urls, mods3)
    expect('elite: shown in an extra category', await shown(urls[0]), true)
    expect('extra subcategory counts for its parent', await shown(urls[1]), true)
    expect('elite: listed in an extra city', await shown(urls[2]), true)
    setPlan('osnovni')
    await compare('e2e: basic again (plain SQL, no updated_at)', urls, mods3)
    expect('basic: extra categories hidden', await shown(urls[0]), false)
    expect('basic: extra cities hidden', await shown(urls[2]), false)
    setPlan('premium') // same length as osnovni: only the content differs
    sqlite.prepare("UPDATE documents SET data = json_set(data, '$.paidUntil', '2020-01-01') WHERE id = ?").run(target.id)
    await compare('e2e: expired package (plain SQL)', urls, mods3)
    expect('expired elite-like package: extras hidden', await shown(urls[0]), false)
    // busy days live in the same data and are not touched by the index
    sqlite.prepare("UPDATE documents SET data = json_set(data, '$.busyDates', json('[\"2027-06-12\"]'), '$.plan', 'premium', '$.paidUntil', '') WHERE id = ?").run(target.id)
    await compare('busy days: profile', [profile], mods3)
    expect('busy day on the profile', (await call(mods3.new, profile)).body.includes('2027-06-12'), true)
  }
  // edits in the same second as the build must not be missed
  sqlite.prepare("UPDATE documents SET data = json_set(data, '$.city', 'Sekunda Grad') WHERE id = ?").run(rows[50].id); bump(rows[50].id)
  await call(mods3.new, '/imenik/category/catering/')
  sqlite.prepare("UPDATE documents SET data = json_set(data, '$.city', 'Sekunda Grad Dva') WHERE id = ?").run(rows[50].id); bump(rows[50].id)
  await compare('two edits within one second', ['/imenik/city/sekunda-grad-dva/', '/imenik/city/sekunda-grad/'], mods3)
  await call(mods3.new, '/imenik/category/catering/')
  // a settings change (signature): Elite loses a city, Premium gains categories
  for (const w of ['old', 'new']) mods3[w].setup({ elite: { cities: 2, categories: 3 }, premium: { categories: 3 } })
  await compare('settings changed (full rebuild)', pages, mods3)
  console.log(`  index used afterwards: ${await usedIndex('/imenik/category/catering/')}`)
  // a dropped table: first request rebuilds
  sqlite.exec('DROP TABLE site_directory_card_data')
  await compare('table dropped', pages, mods3)
  console.log(`  index used afterwards: ${await usedIndex('/imenik/category/catering/')}`)
  await rawCompare('raw after all changes', c3.filters, mods3.new)
}

console.log(`\n${compared} comparisons, ${failures} differences, ${((Date.now() - t0) / 1000).toFixed(1)} s`)
if (failures) { console.log('Failed:', failed.slice(0, 20)); process.exit(1) }
