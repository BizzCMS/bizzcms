# Directory plugin

A company directory for any BizzCMS site: a searchable list with filters, category and city pages,
company profiles with a gallery, date requests for Premium companies, and a portal where companies
manage their own profiles. Code: `src/plugins/directory/`, with visitor accounts in `src/site-accounts.ts`.

## What visitors get

- **The directory:** search by name or place, plus filters for category (with subcategories), region, city,
  number of guests, price, indoor/outdoor, amenities and "Premium only". Filters show as removable pills.
  Visitors can switch between grid and list view and page through the results.
- **Category and city pages** at their own addresses. These are the only indexable directory pages; every
  filter combination is `noindex`. An unknown category or city returns a 404.
- **Company profiles:** description, gallery, facts (location, capacity, price, setting, amenities) and contacts.
  Premium companies also get a **Request a date** form. Requests are saved privately for staff.
- **Premium:** a company marked as a paid member, with no expiry date or one in the future. Premium companies are
  listed first and receive requests.

## What companies get (the portal)

- They open an account (role "viewer", never admin) and sign in.
- **Add a profile.** It stays a draft until an admin publishes it.
- **Edit their own profile** and photos (upload, set the cover, remove). On a published profile, changes show at once.
- **Take over an existing profile**, for example one imported from an old site. It becomes theirs at once when its
  contact e-mail matches their account's; otherwise a claim is saved for staff.
- **See the date requests** sent to their profiles.
- **Forgotten password:** <base>/forgot-password e-mails a one-hour link (needs a mailer in configureAccounts and the
  database passed to accountRoute). **Google sign-in** shows when the CMS has GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.
- **Invitations:** createInvite(db, rootId) gives a token for <base>/activate?t=<token> (90 days, once). The company opens
  an account with the profile's e-mail and owns the profile at once; an existing account gets the profile linked. An
  account imported from an old site without a password (profile `ownerPending`) sets its password on the activation page
  and is signed in; `ownerPending` is cleared on activation.
- **Featuring:** a profile with `featuredUntil` (date, Admin › Featured until) on or after today comes first in the default
  order and in Recommended, in search suggestions and on featured lists, with a "Featured" label on its card (Premium
  cards keep the ★ badge). A sort the visitor picks is followed as is. `Plan.featureMonths` documents how many months a
  package includes; set `featuredUntil` = start + those months when the package starts.
- **Packages** (setDirectory({ plans, pricingUrl })): the first plan is free. Each plan sets the photos shown and allowed,
  the YouTube videos shown, social links (taxonomy.socials; the website shows on every profile), inquiries from couples and booking ("request a
  date", badge, first in lists). A profile's plan is its `plan` field; without one, paidMember means the first booking
  plan; after paidUntil it is the free plan. No plans = the old behaviour (paidMember = Premium, 30 photos, everything shown).
- **Busy days** (`busyDates`, YYYY-MM-DD, written by the site's booking calendar): with "request a date" the request
  popup tells free / booked as the date is picked and refuses a booked day (text `errDateBusy`, `dateBusy`, `dateFree`).
- **More categories** (`Plan.categories`, default 1; the main category counts): the portal shows one "More categories"
  choice per extra category the plan allows (a category or a subcategory, stored in `extraCategories`). While the plan
  allows it (`extraCategoriesSql()`), the company is listed and counted on those category pages too (a subcategory also
  counts for its parent) and its profile lists all its categories. When the plan lapses they hide but stay stored.

## In the admin

Three collections:
- **Companies** (`partners`)
- **Booking requests** (`booking-requests`)
- **Listing claims** (`listing-claims`)

Also on each company:
- **Keywords**: search phrases, comma separated. The directory search matches them too.
- **Online check**, **Checked on** and **Online check notes**: the result of checking the business online, e.g. after
  an import (active, closed or unknown, with evidence). Staff only, never shown publicly.

Fields admins set, which companies can't:
- **Paid member** and **Paid until**: Premium status.
- **Owner account email**: who may edit the profile. Set it to approve a claim.
- **Old site ID** and **Old URL name**: keep an imported company at its old address.

## Turning it on in a site

```ts
// src/directory-site.ts: imported first in src/index.ts
import { setDirectory } from './plugins/directory'
setDirectory({
  routes: { directory: '/companies/', category: '/companies/category/{slug}/', city: '/companies/city/{slug}/', listing: '/company/{slug}/' },
  taxonomy: { categories: [{ slug: 'venues', label: 'Venues', venue: true }, { slug: 'other', label: 'Other' }], defaultCategory: 'other', regions: [['north', 'North']] },
  layout: (title, body, { description, canonical, index }) => myLayout(title, body, description, canonical, index ?? true)
})

// src/index.ts
import { handleDirectory, handleCompanyPortal, directoryCollections } from './plugins/directory'
registerCollections([pages, posts, ...directoryCollections()])
// in fetch, before the admin layer:
const portal = await handleCompanyPortal(request, env, cms.fetch)   // null for other paths
if (portal) return portal
const directory = await handleDirectory(request, env)               // null for other paths
if (directory) return directory
```

Everything you don't set keeps an English default (`src/plugins/directory/config.ts`):

| Setting | What it is |
|---|---|
| `routes` | Addresses. `{slug}` is the category, city or company. Optional `legacyListing` with `{name}` and `{id}` keeps imported companies at the old site's profile address. Addresses ending in `/` redirect requests without the slash. |
| `params` | Query words in the links (`category`, `region`, `page`, …), sort and view values, and the `#request` anchor. |
| `taxonomy` | Categories (`venue: true` adds the guests, setting and amenity filters), regions, guest buckets, price levels, price units, settings, amenities. With `priceUnits` the portal asks for a "price from" amount in euros plus a unit (per person, per event, ...) instead of a price level; cards and profiles show "from €35 per person". `showPriceLevels: false` hides the old €–€€€€ levels where no amount is set. `priceFilter: false` hides the price filter. |
| `text` | All wording on the directory pages and profiles. |
| `portal` | The portal's base address and URL words (`new`, `edit`, `claim`), notice codes and wording. |
| `layout` | Your page shell (header, footer, styles). The plugin sends the title, body, description, canonical and index flag. |
| `labels` | The collection names in the admin. |
| `locale` | Language for sorting choices alphabetically (regions, cities, form selects), e.g. `hr`. |
| `sample` | Marks example entries: `{ slugPrefix: 'demo-', label: 'Example' }` adds the label next to the category. |
| `share` | Share buttons under company profiles, in a `.dir-share` wrapper: `(db, url, title, image) => shareBar(db, url, title, image, 'hr')` with the Social Share plugin. Left out = no buttons. |

Admin menu: register `directoryPlugin()` (after `setDirectory`) in `createSonicJSApp({ plugins: { register: [...] } })`. It adds Directory, booking requests and listing claims to the plugin menu once a plugin row `directory` is active (Admin › Plugins, or the same insert as for Social Share).

Sorting: **Recommended** is Premium first, then most visited (the optional `views` field, e.g. carried over from an
old site), then name. Visitors can also sort by name, newest, most visited and (venues) capacity. `params.defaultSort`
sets the order used when the address has no sort (e.g. the `sortNewest` value); that order needs no parameter, and
Recommended then uses `params.sortRecommended`. A company without
a photo shows its category's photo when the site gives one.

Visitor accounts have their own wording and URL words (login, register, photos …):
`configureAccounts({ text, paths, page })` in `src/site-accounts.ts`.

Other exports for the site's own pages:
- `listingCardHtml` and `featuredListings`: company cards for a home page or an article
- `directoryOverview`: counts per category and the busiest cities
- `directorySitemap`: every directory address, for the sitemap
- `directoryScript()`: filters apply on change and collapse on phones; include it once in your layout
- URL helpers: `directoryUrl`, `categoryUrl`, `cityUrl`, `listingUrl`

Region pages: set `routes.region` (e.g. `'/companies/region/{slug}/'`) and each region with published companies gets its own indexable page (and sitemap entry); choosing a region in the filter goes there. Without it a region stays a ?region= filter (noindex).

## Styling

The plugin writes plain HTML with stable class names, styled by your site's CSS:

| Part | Classes |
|---|---|
| Page header | `.bar` |
| Layout | `.layout`, `aside`, `.filters` |
| Results | `.results.grid` / `.results.list` |
| Company card | `.card`, `.card.is-premium` |
| Pager | `.pager` |
| Profile | `.profile`, `.pcols`, `.facts`, `.gallery` |
| Request form | `.request` |
| Portal | `.portal`, `.auth`, `.editform`, `.pgrid` |

A default stylesheet is not included yet.
