// BizzCMS Directory plugin: settings. A site calls setDirectory({...}) once at startup with its
// addresses, categories, regions, wording and page layout; everything not given keeps the English
// defaults below. See docs/directory.md.

export interface Category {
  slug: string
  label: string
  /** Venues: the directory also shows the guests, indoor/outdoor and amenity filters for this category. */
  venue?: boolean
  /** Optional photo and one-liner, e.g. for the site's own category tiles. */
  image?: string
  blurb?: string
  subs?: { slug: string; label: string }[]
}
type Pairs = readonly (readonly [string, string])[]

export interface DirectoryRoutes {
  /** The directory itself, e.g. '/companies/'. Filters are query parameters on it. */
  directory: string
  /** Category landing page; {slug} is the category, e.g. '/companies/category/{slug}/'. */
  category: string
  /** City landing page; {slug} is the city, e.g. '/companies/city/{slug}/'. */
  city: string
  /** A company's profile; {slug} is its URL slug, e.g. '/company/{slug}/'. */
  listing: string
  /** Optional: profile address for companies imported from an older site, with {name} and {id}
   *  (the Old URL name and Old site ID fields), e.g. '/directory/{name}/{id}/'. */
  legacyListing?: string
}

export const DEFAULT_ROUTES: DirectoryRoutes = {
  directory: '/companies/', category: '/companies/category/{slug}/', city: '/companies/city/{slug}/', listing: '/company/{slug}/'
}

/** Query-parameter names and values used in directory links. */
export const DEFAULT_PARAMS = {
  q: 'q', category: 'category', region: 'region', city: 'city', guests: 'guests', price: 'price', setting: 'setting',
  premium: 'premium', sort: 'sort', view: 'view', page: 'page', sent: 'sent', requestAnchor: 'request',
  sortName: 'name', sortNewest: 'newest', sortCapacity: 'capacity', sortPopular: 'popular', viewList: 'list'
}

export const DEFAULT_TAXONOMY = {
  categories: [{ slug: 'other', label: 'Other' }] as Category[],
  /** Category new companies get when none is chosen. */
  defaultCategory: 'other',
  regions: [] as Pairs,
  guestBuckets: [[50, '50+'], [100, '100+'], [200, '200+'], [300, '300+'], [400, '400+']] as readonly (readonly [number, string])[],
  priceLevels: [['1', '€'], ['2', '€€'], ['3', '€€€'], ['4', '€€€€']] as Pairs,
  settings: [['indoor', 'Indoor'], ['outdoor', 'Outdoor'], ['both', 'Indoor and outdoor']] as Pairs,
  amenities: [['hasAccommodation', 'Accommodation for guests'], ['hasCatering', 'Own catering'], ['hasParking', 'Parking']] as Pairs
}

export const DEFAULT_TEXT = {
  directoryTitle: 'Company directory',
  backToDirectory: '← Company directory',
  notFound: 'Company not found',
  requestsUnavailable: 'Requests are not available',
  errName: 'Please enter your name.',
  errEmail: 'Please enter a valid e-mail address.',
  errDate: 'Invalid date.',
  errTooLong: 'The message is too long.',
  companyFallback: 'Company',
  premium: '★ Premium',
  requestDate: 'Request a date',
  details: 'Details',
  view: 'View',
  upTo: (n: number) => `up to ${n}`,
  results: (n: number) => `${n} ${n === 1 ? 'result' : 'results'}`,
  removeFilter: 'Remove filter',
  clearAll: 'Clear all',
  clear: 'Clear',
  clearFilters: 'Clear filters',
  quoted: (q: string) => `"${q}"`,
  guestsPill: (n: string) => `${n}+ guests`,
  premiumPill: 'Premium',
  pages: 'Pages',
  previous: '‹ Previous',
  next: 'Next ›',
  filters: 'Filters',
  category: 'Category',
  allCategories: 'All categories',
  region: 'Region',
  allRegions: 'All regions',
  city: 'City',
  allCities: 'All cities',
  guests: 'Number of guests',
  setting: 'Setting',
  any: 'Any',
  all: 'All',
  price: 'Price',
  premiumOnly: 'Premium only (online date requests)',
  apply: 'Apply',
  resultsFor: (q: string) => `Results for "${q}"`,
  searchPlaceholder: 'Search by name or place…',
  searchLabel: 'Search',
  sortLabel: 'Order',
  sortRecommended: 'Recommended',
  sortName: 'Name A–Z',
  sortNewest: 'Newest',
  sortCapacity: 'Largest capacity',
  sortPopular: 'Most visited',
  viewGrid: 'Grid',
  viewGridLabel: 'Show as grid',
  viewList: 'List',
  viewListLabel: 'Show as list',
  noResults: 'No results',
  noResultsText: 'No company matches the filters. Try removing a filter.',
  pageSuffix: (n: number) => ` - page ${n}`,
  metaDescription: (heading: string, results: string) => `${heading}: ${results}.`,
  // Profile
  gallery: 'Gallery',
  videos: 'Videos',
  video: 'Video',
  showAllMedia: (n: number) => `Show all (${n})`,
  close: 'Close',
  photoAlt: (title: string, n: number) => `${title} – photo ${n}`,
  location: 'Location',
  capacity: 'Capacity',
  capacityValue: (n: number) => `up to ${n} guests`,
  amenities: 'Amenities',
  website: 'Website ↗',
  contact: 'Contact',
  thanksTitle: 'Thank you!',
  thanksText: 'Your request has been received. We will get back to you soon.',
  requestTitle: 'Request a date',
  formName: 'Full name*',
  formEmail: 'E-mail*',
  formPhone: 'Phone',
  formDate: 'Event date',
  formGuests: 'Number of guests',
  formMessage: 'Message',
  formSend: 'Send request'
}

/** The company portal: URL words and wording. */
export const DEFAULT_PORTAL = {
  base: '/for-companies',
  new: 'new', edit: 'edit', claim: 'claim',
  /** Notice codes in the URL after an action (?notice=…); the gallery and sign-up codes come from site-accounts. */
  noticeNew: 'new', noticeClaimed: 'claimed', noticeRequested: 'requested',
  loginTitle: 'Sign in for companies',
  registerTitle: 'Register your company',
  registerIntro: 'For businesses that offer services in this directory.',
  notices: {
    saved: 'Your changes have been saved.',
    new: 'Your profile has been sent. It will appear in the directory after we approve it.',
    claimed: 'The profile is now linked to your account.',
    requested: 'Your request to take over the profile has been sent. We will get back to you after checking it.',
    photos: 'The photos have been added.',
    removed: 'The photo has been removed.',
    cover: 'The cover photo has been set.',
    registered: 'Welcome! Your account is open.'
  },
  errTitle: 'Please enter the name.',
  errCategory: 'Please choose a category.',
  errSubcategory: 'The subcategory does not belong to the chosen category.',
  errRegion: 'Please choose a region.',
  errWebsite: 'The web address must start with https://',
  errEmail: 'Invalid contact e-mail.',
  errCapacity: 'Capacity must be a number of guests (1–10000).',
  notFound: 'Profile not found',
  myProfile: 'My profile',
  backToProfile: '← My profile',
  forCompanies: 'For companies',
  // Landing (signed out)
  landingHeading: 'Present your business to people looking for it',
  landingLead: 'Edit your profile, add photos and receive date requests.',
  landingCta: 'Open a free account',
  landingLogin: 'Sign in',
  landingFeatures: [
    ['Your profile', 'Description, prices, capacity, contacts and a photo gallery in one place.'],
    ['Already in the directory?', 'Take over your existing profile instead of opening a new one. Old links keep pointing to you.'],
    ['Date requests', 'Premium companies receive requests straight from their profile and see them in their account.']
  ] as [string, string][],
  // Dashboard
  logout: 'Sign out',
  published: 'Published',
  pending: 'Waiting for approval',
  editProfile: 'Edit profile',
  view: 'View',
  myListings: 'My profiles in the directory',
  addNew: 'Add a new profile',
  claimExisting: 'Take over an existing profile',
  noListings: 'You have no profile yet. Add a new one, or take over an existing one if your business is already in the directory.',
  requests: 'Date requests',
  requestColumns: ['Name', 'Contact', 'Date', 'Guests', 'Profile', 'Message'],
  noRequests: 'No requests yet. Requests come from the profiles of Premium companies.',
  // Claim
  claimTitle: 'Take over your profile',
  claimLead: 'Your business may already be in the directory. Find it and link it to your account. If the e-mail in the profile is the same as your account\'s, the profile is yours at once; otherwise we check it by hand.',
  claimSearch: 'Business name…',
  claimSearchButton: 'Search',
  claimTaken: 'Already taken',
  claimMine: 'This is my profile',
  claimNone: 'No profile with that name.',
  claimAddNew: 'Add a new profile.',
  claimNotFound: 'Profile not found.',
  claimOther: 'That profile is linked to another account. Contact us if this is a mistake.',
  // Edit form
  editTitle: (name: string) => `Edit: ${name}`,
  newTitle: 'New profile',
  newHeading: 'New profile in the directory',
  livePublished: 'Published: changes show at once',
  newPending: 'The new profile will appear after we approve it.',
  fieldName: 'Name*',
  fieldCategory: 'Category*',
  fieldSubcategory: 'Subcategory',
  fieldRegion: 'Region',
  fieldCity: 'City / place',
  fieldSummary: 'Short description (shown in the directory)',
  fieldDescription: 'Description',
  fieldDescriptionHint: 'An empty line starts a new paragraph.',
  fieldPrice: 'Price',
  fieldCapacity: 'Capacity (number of guests, for venues)',
  fieldSetting: 'Setting',
  fieldAmenities: 'Amenities',
  fieldWebsite: 'Website',
  fieldPhone: 'Phone',
  fieldEmail: 'Contact e-mail',
  fieldVideos: 'YouTube videos',
  fieldVideosHint: 'One YouTube link per line, up to 12. They play on your profile.',
  save: 'Save changes',
  submitNew: 'Send profile for approval',
  photos: 'Photos',
  photosAfterSave: 'You can add photos after saving the profile.'
}

export type DirectoryText = typeof DEFAULT_TEXT
export type DirectoryParams = typeof DEFAULT_PARAMS
export type DirectoryTaxonomy = typeof DEFAULT_TAXONOMY
export type PortalSettings = Omit<typeof DEFAULT_PORTAL, 'notices'> & { notices: Record<string, string> }

/** head: extra tags for <head> (the plugin sends structured data, JSON-LD, for search engines and AI assistants). */
export interface PageOptions { description?: string; canonical?: string; index?: boolean; head?: string; image?: string }
export interface DirectorySettings {
  routes: DirectoryRoutes
  params: DirectoryParams
  taxonomy: DirectoryTaxonomy
  text: DirectoryText
  portal: PortalSettings
  /** The site's page shell for directory pages. */
  layout: (title: string, body: string, opts: PageOptions) => string
  /** Collection labels in the admin. */
  labels: { listings: string; bookingRequests: string; claims: string }
  /** Language for sorting choices alphabetically (regions, cities, form selects), e.g. 'hr'. */
  locale: string
  /** Sample entries (e.g. demo data): companies whose slug starts with `slugPrefix` get `label` next to the category. */
  sample?: { slugPrefix: string; label: string }
}

let current: DirectorySettings = {
  routes: DEFAULT_ROUTES, params: DEFAULT_PARAMS, taxonomy: DEFAULT_TAXONOMY, text: DEFAULT_TEXT, portal: DEFAULT_PORTAL,
  layout: (title, body, o) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title.replace(/</g, '&lt;')}</title>${o.canonical ? `<link rel="canonical" href="${o.canonical}">` : ''}${o.index === false ? '<meta name="robots" content="noindex,follow">' : ''}</head><body><main>${body}</main></body></html>`,
  labels: { listings: 'Companies', bookingRequests: 'Booking requests', claims: 'Listing claims' },
  locale: 'en'
}

export interface DirectoryOptions {
  routes?: Partial<DirectoryRoutes>
  params?: Partial<DirectoryParams>
  taxonomy?: Partial<DirectoryTaxonomy>
  text?: Partial<DirectoryText>
  portal?: Partial<PortalSettings>
  layout?: DirectorySettings['layout']
  labels?: Partial<DirectorySettings['labels']>
  locale?: string
  sample?: DirectorySettings['sample']
}

/** Turn the directory on for this site with its own addresses, categories, wording and layout. */
export function setDirectory(opts: DirectoryOptions): void {
  current = {
    routes: { ...DEFAULT_ROUTES, ...opts.routes },
    params: { ...DEFAULT_PARAMS, ...opts.params },
    taxonomy: { ...DEFAULT_TAXONOMY, ...opts.taxonomy },
    text: { ...DEFAULT_TEXT, ...opts.text },
    portal: { ...DEFAULT_PORTAL, ...opts.portal, notices: { ...DEFAULT_PORTAL.notices, ...opts.portal?.notices } },
    layout: opts.layout ?? current.layout,
    labels: { ...current.labels, ...opts.labels },
    locale: opts.locale ?? current.locale,
    sample: opts.sample ?? current.sample
  }
}
export const directorySettings = (): DirectorySettings => current

// ---------------------------------------------------------------- taxonomy helpers

export const subcategories = () => current.taxonomy.categories.flatMap(c => (c.subs ?? []).map(s => ({ ...s, parent: c.slug })))

/** Choices sorted alphabetically in the site's language (the configured order stays as it is). */
export function alphabetical<T>(items: readonly T[], text: (item: T) => string): T[] {
  return [...items].sort((a, b) => text(a).localeCompare(text(b), current.locale, { sensitivity: 'base', numeric: true }))
}

export const label = (list: readonly (readonly [string | number, string])[], key?: string | number) =>
  list.find(([k]) => String(k) === String(key))?.[1]

/** URL slug from any text; folds accents (č → c, đ → d, é → e …). */
export function slugify(value: string): string {
  return value.toLowerCase().replace(/đ/g, 'd').replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// ---------------------------------------------------------------- addresses

const fill = (pattern: string, values: Record<string, string>) => pattern.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? '')

export const directoryUrl = () => current.routes.directory
export const categoryUrl = (slug: string) => fill(current.routes.category, { slug })
export const cityUrl = (slug: string) => fill(current.routes.city, { slug })
/** A company's profile address: the old site's address when it came from one, else the listing pattern. */
export function listingUrl(p: { slug: string; legacyId?: number; legacySlug?: string }): string {
  const legacy = current.routes.legacyListing
  return legacy && p.legacyId ? fill(legacy, { name: p.legacySlug || p.slug, id: String(p.legacyId) }) : fill(current.routes.listing, { slug: p.slug })
}

/** Matches a decoded path against a pattern; returns its {placeholders}, or null. Trailing slashes are ignored. */
export function matchRoute(pattern: string, path: string): Record<string, string> | null {
  const names: string[] = []
  const source = pattern.replace(/\/+$/, '').replace(/[.*+?^$()|[\]\\]/g, '\\$&')
    .replace(/\{(\w+)\}/g, (_, k: string) => { names.push(k); return k === 'id' ? '(\\d+)' : '([^/]+)' })
  const m = path.replace(/\/+$/, '').match(new RegExp(`^${source}$`))
  return m ? Object.fromEntries(names.map((k, i) => [k, m[i + 1]])) : null
}
