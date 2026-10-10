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
| `taxonomy` | Categories (`venue: true` adds the guests, setting and amenity filters), regions, guest buckets, price levels, settings, amenities. |
| `text` | All wording on the directory pages and profiles. |
| `portal` | The portal's base address and URL words (`new`, `edit`, `claim`), notice codes and wording. |
| `layout` | Your page shell (header, footer, styles). The plugin sends the title, body, description, canonical and index flag. |
| `labels` | The collection names in the admin. |
| `locale` | Language for sorting choices alphabetically (regions, cities, form selects), e.g. `hr`. |
| `sample` | Marks example entries: `{ slugPrefix: 'demo-', label: 'Example' }` adds the label next to the category. |
| `share` | Share buttons under company profiles and directory lists, in a `.dir-share` wrapper: `(db, url, title, image) => shareBar(db, url, title, image, 'hr')` with the Social Share plugin. Left out = no buttons. |

Sorting: **Recommended** is Premium first, then most visited (the optional `views` field, e.g. carried over from an
old site), then name. Visitors can also sort by name, newest, most visited and (venues) capacity. A company without
a photo shows its category's photo when the site gives one.

Visitor accounts have their own wording and URL words (login, register, photos …):
`configureAccounts({ text, paths, page })` in `src/site-accounts.ts`.

Other exports for the site's own pages:
- `listingCardHtml` and `featuredListings`: company cards for a home page or an article
- `directoryOverview`: counts per category and the busiest cities
- `directorySitemap`: every directory address, for the sitemap
- `directoryScript()`: filters apply on change and collapse on phones; include it once in your layout
- URL helpers: `directoryUrl`, `categoryUrl`, `cityUrl`, `listingUrl`

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
