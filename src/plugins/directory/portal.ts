// BizzCMS Directory plugin: the company portal. Businesses open a site account (role "viewer", never
// admin), add a profile (waits for approval), edit their own profile and photos, take over an imported
// profile, and see the date requests sent to them. URL words and wording come from setDirectory().
//   <base>                 landing (signed out) or the "My profile" dashboard
//   <base>/<login|register>, POST <base>/<logout>   (site-accounts)
//   <base>/<new>           add a profile
//   <base>/<edit>/<root>   edit own profile; /<photos> (POST) upload, /<photos>/<remove|cover>
//   <base>/<claim>         take over an imported profile
// A profile belongs to the account whose e-mail is in its `ownerEmail` field. Edits to a published
// profile go live at once; new profiles stay drafts until an admin publishes them.
import { DocumentsService } from 'bizzcms-core'
import {
  accountPaths, accountRoute, type Audience, type Cms, crossOrigin, currentUser, galleryAction, galleryEditor, loginRedirect,
  portalPage, readForm, type User
} from '../../site-accounts'
import { directorySettings, listingUrl, slugify, subcategories } from './config'
import { esc, fold, html, mediaList, str, truthy } from './util'

type Env = { DB: D1Database; MEDIA_BUCKET: R2Bucket }
interface Owned { rootId: string; id: string; slug: string; title: string; live: boolean; data: Record<string, unknown> }

const MAX_PHOTOS = 30

function audience(): Audience {
  const p = directorySettings().portal
  return { base: p.base, loginTitle: p.loginTitle, registerTitle: p.registerTitle, registerIntro: p.registerIntro }
}

/** The company portal at the site's base address; null for any other path. */
export async function handleCompanyPortal(request: Request, env: Env, cms: Cms): Promise<Response | null> {
  const P = directorySettings().portal
  const A = accountPaths()
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  if (path !== P.base && !path.startsWith(`${P.base}/`)) return null
  const post = request.method === 'POST'
  if (!post && request.method !== 'GET' && request.method !== 'HEAD') return null
  const blocked = crossOrigin(request, url)
  if (blocked) return blocked
  const account = await accountRoute(audience(), request, url, path, cms)
  if (account) return account

  const user = await currentUser(request, cms)
  if (path === P.base) return html(user ? await dashboard(env.DB, user, url.searchParams.get(A.notice)) : landingPage())
  if (!user) return loginRedirect(audience(), url, path)

  if (path === `${P.base}/${P.new}`) {
    if (!post) return html(editPage(null, {}))
    const form = await readForm(request)
    const result = readListing(form)
    if ('error' in result) return html(editPage(null, formValues(form), result.error), 400)
    const slug = await uniqueSlug(env.DB, result.title)
    await new DocumentsService(env.DB).create({
      typeId: 'partners', title: result.title, slug, publishOnCreate: false,
      data: { ...result.data, slug, ownerEmail: user.email, paidMember: false }
    } as unknown as Parameters<DocumentsService['create']>[0], user.id)
    return redirect(url, P.noticeNew)
  }

  if (path === `${P.base}/${P.claim}`) return post ? claim(request, env.DB, user, url) : html(await claimPage(env.DB, url.searchParams.get('q') ?? ''))

  const editBase = `${P.base}/${P.edit}/`
  if (path.startsWith(editBase)) {
    const m = path.slice(editBase.length).match(new RegExp(`^([A-Za-z0-9_-]+)(\\/${A.photos}(?:\\/(${A.photoRemove}|${A.photoCover}))?)?$`))
    if (!m) return null
    const listing = await ownedListing(env.DB, user, m[1])
    if (!listing) return html(portalPage(P.notFound, `<h1>${esc(P.notFound)}</h1><p><a href="${P.base}">${esc(P.backToProfile)}</a></p>`), 404)
    if (!m[2]) {
      if (!post) return html(editPage(listing, listing.data, undefined, url.searchParams.get(A.notice)))
      const form = await readForm(request)
      const result = readListing(form)
      if ('error' in result) return html(editPage(listing, { ...listing.data, ...formValues(form) }, result.error), 400)
      await saveListing(env.DB, listing, result.data, result.title, user)
      return Response.redirect(`${url.origin}${editBase}${listing.rootId}?${A.notice}=${A.noticeSaved}`, 303)
    }
    if (!post) return null
    return photos(request, env, listing, user, url, m[3])
  }
  return null
}

// ---------------------------------------------------------------- listings

const OWNED_SQL = `SELECT d.root_id AS rootId, d.id, d.slug, d.title, d.data,
    EXISTS (SELECT 1 FROM documents p WHERE p.root_id = d.root_id AND p.is_published = 1 AND (p.deleted_at IS NULL OR p.deleted_at = '')) AS live
  FROM documents d WHERE d.type_id = 'partners' AND d.is_current_draft = 1 AND (d.deleted_at IS NULL OR d.deleted_at = '')
    AND lower(json_extract(d.data, '$.ownerEmail')) = ?`

function toOwned(r: Record<string, unknown>): Owned {
  let data: Record<string, unknown> = {}
  try { data = JSON.parse(String(r.data ?? '{}')) } catch { /* empty */ }
  return { rootId: String(r.rootId), id: String(r.id), slug: String(r.slug ?? ''), title: String(r.title ?? ''), live: Number(r.live) === 1, data }
}

async function ownedListings(db: D1Database, user: User): Promise<Owned[]> {
  const rows = await db.prepare(`${OWNED_SQL} ORDER BY d.title COLLATE NOCASE`).bind(user.email).all<Record<string, unknown>>()
  return rows.results.map(toOwned)
}

async function ownedListing(db: D1Database, user: User, rootId: string): Promise<Owned | null> {
  const row = await db.prepare(`${OWNED_SQL} AND d.root_id = ? LIMIT 1`).bind(user.email, rootId).first<Record<string, unknown>>()
  return row ? toOwned(row) : null
}

// Edits to a live profile are published immediately; pending ones stay drafts.
async function saveListing(db: D1Database, listing: Owned, data: Record<string, unknown>, title: string | undefined, user: User) {
  const svc = new DocumentsService(db)
  const draft = await svc.saveDraft(listing.rootId, { ...(title ? { title } : {}), data } as unknown as Parameters<DocumentsService['saveDraft']>[1], user.id)
  if (listing.live && !draft.isPublished) await svc.publish(draft.id, user.id)
}

async function uniqueSlug(db: D1Database, title: string): Promise<string> {
  const base = slugify(title).slice(0, 80) || 'company'
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`
    const taken = await db.prepare(`SELECT 1 FROM documents WHERE type_id = 'partners' AND slug = ? AND (deleted_at IS NULL OR deleted_at = '') LIMIT 1`).bind(slug).first()
    if (!taken) return slug
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`
}

function formValues(form: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v
  for (const [k] of directorySettings().taxonomy.amenities) out[k] = form.get(k) === '1'
  return out
}

// Whitelist of fields a company may set. Paid status, owner, old site ID/name and slug stay admin-only.
function readListing(form: FormData): { title: string; data: Record<string, unknown> } | { error: string } {
  const { taxonomy: T, portal: P } = directorySettings()
  const get = (k: string, max = 300) => String(form.get(k) ?? '').trim().slice(0, max)
  const title = get('title', 200)
  if (!title) return { error: P.errTitle }
  const category = get('category')
  if (!T.categories.some(c => c.slug === category)) return { error: P.errCategory }
  const subcategory = get('subcategory')
  if (subcategory && !subcategories().some(s => s.slug === subcategory && s.parent === category)) return { error: P.errSubcategory }
  const county = get('county')
  if (county && !T.regions.some(([k]) => k === county)) return { error: P.errRegion }
  const website = get('website', 300)
  if (website && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(website)) return { error: P.errWebsite }
  const email = get('email', 200)
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: P.errEmail }
  const capacityRaw = get('capacity', 10)
  const capacity = capacityRaw ? Number.parseInt(capacityRaw, 10) : undefined
  if (capacityRaw && (!Number.isFinite(capacity) || capacity! < 1 || capacity! > 10000)) return { error: P.errCapacity }
  const priceLevel = get('priceLevel')
  const setting = get('setting')
  return {
    title,
    data: {
      title, category, subcategory, county, city: get('city', 120), summary: get('summary', 300), description: get('description', 5000),
      capacity: capacity ?? null, priceLevel: T.priceLevels.some(([k]) => k === priceLevel) ? priceLevel : '',
      setting: T.settings.some(([k]) => k === setting) ? setting : '',
      ...Object.fromEntries(T.amenities.map(([k]) => [k, form.get(k) === '1'])),
      website, phone: get('phone', 60), email
    }
  }
}

// ---------------------------------------------------------------- photos

async function photos(request: Request, env: Env, listing: Owned, user: User, url: URL, action?: string): Promise<Response> {
  const P = directorySettings().portal
  const result = await galleryAction({
    form: await readForm(request), action, bucket: env.MEDIA_BUCKET, prefix: `partners/${listing.rootId}/`,
    gallery: mediaList(listing.data.gallery), cover: str(listing.data.coverImage) ?? '', max: MAX_PHOTOS,
    save: data => saveListing(env.DB, listing, data, undefined, user)
  })
  if ('error' in result) return html(editPage(listing, listing.data, result.error), 400)
  return Response.redirect(`${url.origin}${P.base}/${P.edit}/${listing.rootId}?${accountPaths().notice}=${result.notice}#photos`, 303)
}

// ---------------------------------------------------------------- claims

async function claimPage(db: D1Database, q: string, error?: string): Promise<string> {
  const P = directorySettings().portal
  const claimUrl = `${P.base}/${P.claim}`
  let results = ''
  const term = slugify(q).replace(/-/g, ' ').trim()
  if (term.length >= 2) {
    const rows = await db.prepare(`SELECT slug, title, json_extract(data, '$.city') AS city, COALESCE(json_extract(data, '$.ownerEmail'), '') AS owner
      FROM documents WHERE type_id = 'partners' AND is_published = 1 AND (deleted_at IS NULL OR deleted_at = '') AND ${fold('title')} LIKE ? ORDER BY title LIMIT 20`)
      .bind(`%${term}%`).all<{ slug: string; title: string; city: string | null; owner: string }>()
    results = rows.results.length ? `<ul class="claimlist">${rows.results.map(r => `<li><div><strong>${esc(r.title)}</strong>${r.city ? `<span>${esc(r.city)}</span>` : ''}</div>
      ${r.owner ? `<span class="status">${esc(P.claimTaken)}</span>` : `<form method="post" action="${claimUrl}"><input type="hidden" name="slug" value="${esc(r.slug)}"><button type="submit">${esc(P.claimMine)}</button></form>`}</li>`).join('')}</ul>`
      : `<p>${esc(P.claimNone)} <a href="${P.base}/${P.new}">${esc(P.claimAddNew)}</a></p>`
  }
  return portalPage(P.claimTitle, `<p class="crumbs"><a href="${P.base}">${esc(P.myProfile)}</a></p><h1>${esc(P.claimTitle)}</h1>
    <p class="lead">${esc(P.claimLead)}</p>
    ${error ? `<p class="err">${esc(error)}</p>` : ''}
    <form class="inline" method="get" action="${claimUrl}"><input type="search" name="q" value="${esc(q)}" placeholder="${esc(P.claimSearch)}" aria-label="${esc(P.claimSearch)}"><button type="submit">${esc(P.claimSearchButton)}</button></form>
    ${results}`)
}

async function claim(request: Request, db: D1Database, user: User, url: URL): Promise<Response> {
  const P = directorySettings().portal
  const form = await readForm(request)
  const slug = String(form.get('slug') ?? '')
  const row = await db.prepare(`SELECT d.root_id AS rootId, d.id, d.slug, d.title, d.data, 1 AS live FROM documents d
    WHERE d.type_id = 'partners' AND d.is_published = 1 AND (d.deleted_at IS NULL OR d.deleted_at = '') AND d.slug = ? LIMIT 1`).bind(slug).first<Record<string, unknown>>()
  if (!row) return html(await claimPage(db, '', P.claimNotFound), 404)
  const listing = toOwned(row)
  const owner = String(listing.data.ownerEmail ?? '').toLowerCase()
  if (owner === user.email) return redirect(url, P.noticeClaimed)
  if (owner) return html(await claimPage(db, '', P.claimOther), 409)
  if (String(listing.data.email ?? '').toLowerCase() === user.email) {
    // The published row may not be the current draft if an admin left unpublished edits; save onto the current draft.
    const current = await db.prepare(`SELECT root_id AS rootId, id, slug, title, data, 1 AS live FROM documents WHERE root_id = ? AND is_current_draft = 1`).bind(listing.rootId).first<Record<string, unknown>>()
    await saveListing(db, current ? toOwned(current) : listing, { ownerEmail: user.email }, undefined, user)
    return redirect(url, P.noticeClaimed)
  }
  const exists = await db.prepare(`SELECT 1 FROM documents WHERE type_id = 'listing-claims' AND (deleted_at IS NULL OR deleted_at = '')
    AND json_extract(data, '$.partner') = ? AND lower(json_extract(data, '$.userEmail')) = ? LIMIT 1`).bind(listing.slug, user.email).first()
  if (!exists) {
    const title = `${user.email} → ${listing.title}`.slice(0, 200)
    await new DocumentsService(db).create({
      typeId: 'listing-claims', title, publishOnCreate: false,
      data: { title, partner: listing.slug, partnerName: listing.title, userEmail: user.email, message: '', handling: 'new' }
    } as unknown as Parameters<DocumentsService['create']>[0], user.id)
  }
  return redirect(url, P.noticeRequested)
}

// ---------------------------------------------------------------- pages

function redirect(url: URL, notice: string): Response {
  return Response.redirect(`${url.origin}${directorySettings().portal.base}?${accountPaths().notice}=${notice}`, 303)
}

function landingPage(): string {
  const P = directorySettings().portal
  const A = accountPaths()
  return portalPage(P.forCompanies, `<section class="hero"><p class="eyebrow">${esc(P.forCompanies)}</p><h1>${esc(P.landingHeading)}</h1>
    <p class="lead">${esc(P.landingLead)}</p>
    <p class="actions"><a class="btn" href="${P.base}/${A.register}">${esc(P.landingCta)}</a><a class="btn ghost" href="${P.base}/${A.login}">${esc(P.landingLogin)}</a></p></section>
    <div class="features">${P.landingFeatures.map(([h, t]) => `<div class="box"><h2>${esc(h)}</h2><p>${esc(t)}</p></div>`).join('')}</div>`)
}

async function dashboard(db: D1Database, user: User, notice: string | null): Promise<string> {
  const P = directorySettings().portal
  const listings = await ownedListings(db, user)
  const slugs = listings.map(l => l.slug).filter(Boolean)
  const requests = slugs.length ? (await db.prepare(`SELECT data, created_at FROM documents WHERE type_id = 'booking-requests'
      AND (deleted_at IS NULL OR deleted_at = '') AND is_current_draft = 1 AND json_extract(data, '$.partner') IN (${slugs.map(() => '?').join(',')})
      ORDER BY created_at DESC LIMIT 50`).bind(...slugs).all<{ data: string; created_at: number }>()).results : []
  const cards = listings.map(l => {
    const image = str(l.data.coverImage) ?? mediaList(l.data.gallery)[0]
    const href = listingUrl({ slug: l.slug, legacyId: Number(l.data.legacyId) || undefined, legacySlug: str(l.data.legacySlug) })
    return `<article class="mine">${image ? `<img src="${esc(image)}" alt="">` : '<span class="ph"></span>'}
      <div><h3>${esc(l.title)}</h3><p><span class="status ${l.live ? 'ok' : 'wait'}">${esc(l.live ? P.published : P.pending)}</span>
      ${truthy(l.data.paidMember) ? `<span class="pill premium">${esc(directorySettings().text.premium)}</span>` : ''}</p>
      <p class="actions"><a class="btn" href="${P.base}/${P.edit}/${l.rootId}">${esc(P.editProfile)}</a>${l.live ? `<a class="btn ghost" href="${esc(href)}">${esc(P.view)}</a>` : ''}</p></div></article>`
  }).join('')
  const reqs = requests.map(r => {
    let d: Record<string, string> = {}
    try { d = JSON.parse(r.data) } catch { /* empty */ }
    return `<tr><td>${esc(d.coupleName ?? '')}</td><td><a href="mailto:${esc(d.email ?? '')}">${esc(d.email ?? '')}</a>${d.phone ? `<br>${esc(d.phone)}` : ''}</td>
      <td>${esc(d.weddingDate ?? '')}</td><td>${esc(String(d.guests ?? ''))}</td><td>${esc(d.partnerName ?? '')}</td><td class="msg">${esc(d.message ?? '')}</td></tr>`
  }).join('')
  return portalPage(P.myProfile, `<div class="dhead"><div><p class="eyebrow">${esc(P.forCompanies)}</p><h1>${esc(P.myProfile)}</h1><p class="muted">${esc(user.email)}</p></div>
    <form method="post" action="${P.base}/${accountPaths().logout}"><button class="btn ghost" type="submit">${esc(P.logout)}</button></form></div>
    ${notice && P.notices[notice] ? `<p class="notice">${esc(P.notices[notice])}</p>` : ''}
    <section><div class="shead"><h2>${esc(P.myListings)}</h2><p class="actions"><a class="btn" href="${P.base}/${P.new}">${esc(P.addNew)}</a><a class="btn ghost" href="${P.base}/${P.claim}">${esc(P.claimExisting)}</a></p></div>
    ${cards || `<div class="empty box"><p>${esc(P.noListings)}</p></div>`}</section>
    <section><h2>${esc(P.requests)}</h2>${reqs ? `<div class="tablewrap"><table><thead><tr>${P.requestColumns.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${reqs}</tbody></table></div>`
      : `<p class="muted">${esc(P.noRequests)}</p>`}</section>`)
}

function editPage(listing: Owned | null, v: Record<string, unknown>, error?: string, notice?: string | null): string {
  const { taxonomy: T, portal: P } = directorySettings()
  const s = (k: string) => esc(String(v[k] ?? ''))
  const opt = (value: string, text: string, current: unknown) => `<option value="${esc(value)}"${value === String(current ?? '') ? ' selected' : ''}>${esc(text)}</option>`
  const subOptions = T.categories.map(c => c.subs ? `<optgroup label="${esc(c.label)}">${c.subs.map(sub => opt(sub.slug, sub.label, v.subcategory)).join('')}</optgroup>` : '').join('')
  const gallery = listing ? mediaList(listing.data.gallery) : []
  const cover = listing ? str(listing.data.coverImage) : undefined
  const editUrl = listing ? `${P.base}/${P.edit}/${listing.rootId}` : `${P.base}/${P.new}`
  const photosSection = !listing ? `<p class="muted">${esc(P.photosAfterSave)}</p>` : galleryEditor(editUrl, gallery, cover, MAX_PHOTOS)
  return portalPage(listing ? P.editTitle(listing.title) : P.newTitle, `<p class="crumbs"><a href="${P.base}">${esc(P.myProfile)}</a></p>
    <h1>${listing ? esc(listing.title) : esc(P.newHeading)}</h1>
    ${listing ? `<p><span class="status ${listing.live ? 'ok' : 'wait'}">${esc(listing.live ? P.livePublished : P.pending)}</span></p>` : `<p class="muted">${esc(P.newPending)}</p>`}
    ${notice && P.notices[notice] ? `<p class="notice">${esc(P.notices[notice])}</p>` : ''}${error ? `<p class="err">${esc(error)}</p>` : ''}
    <form method="post" action="${editUrl}" class="editform box">
      <label class="full">${esc(P.fieldName)}<input name="title" required maxlength="200" value="${s('title')}"></label>
      <label>${esc(P.fieldCategory)}<select name="category" required>${T.categories.map(c => opt(c.slug, c.label, v.category)).join('')}</select></label>
      <label>${esc(P.fieldSubcategory)}<select name="subcategory">${opt('', '—', v.subcategory)}${subOptions}</select></label>
      ${T.regions.length ? `<label>${esc(P.fieldRegion)}<select name="county">${opt('', '—', v.county)}${T.regions.map(([k, t]) => opt(k, t, v.county)).join('')}</select></label>` : ''}
      <label>${esc(P.fieldCity)}<input name="city" maxlength="120" value="${s('city')}"></label>
      <label class="full">${esc(P.fieldSummary)}<textarea name="summary" rows="2" maxlength="300">${s('summary')}</textarea></label>
      <label class="full">${esc(P.fieldDescription)}<textarea name="description" rows="8" maxlength="5000">${s('description')}</textarea><small>${esc(P.fieldDescriptionHint)}</small></label>
      <label>${esc(P.fieldPrice)}<select name="priceLevel">${opt('', '—', v.priceLevel)}${T.priceLevels.map(([k, t]) => opt(k, t, v.priceLevel)).join('')}</select></label>
      <label>${esc(P.fieldCapacity)}<input name="capacity" type="number" min="1" max="10000" value="${s('capacity')}"></label>
      <label>${esc(P.fieldSetting)}<select name="setting">${opt('', '—', v.setting)}${T.settings.map(([k, t]) => opt(k, t, v.setting)).join('')}</select></label>
      <fieldset><legend>${esc(P.fieldAmenities)}</legend>${T.amenities.map(([k, t]) => `<label class="check"><input type="checkbox" name="${k}" value="1"${truthy(v[k]) ? ' checked' : ''}>${esc(t)}</label>`).join('')}</fieldset>
      <label>${esc(P.fieldWebsite)}<input name="website" type="url" placeholder="https://" maxlength="300" value="${s('website')}"></label>
      <label>${esc(P.fieldPhone)}<input name="phone" maxlength="60" value="${s('phone')}"></label>
      <label>${esc(P.fieldEmail)}<input name="email" type="email" maxlength="200" value="${s('email')}"></label>
      <div class="full"><button type="submit">${esc(listing ? P.save : P.submitNew)}</button></div>
    </form>
    <section id="photos"><h2>${esc(P.photos)}</h2>${photosSection}</section>`)
}
