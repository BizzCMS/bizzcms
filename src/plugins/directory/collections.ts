// BizzCMS Directory plugin: the admin collections. Call directoryCollections() after setDirectory()
// and register the result with the site's other collections. The collection names (partners,
// booking-requests, listing-claims) are fixed so data stays the same when a site changes its labels.
import type { CollectionConfig } from 'bizzcms-core'
import { directorySettings, subcategories } from './config'
import { SEO_FIELDS } from '../../seo-fields'

const pairs = (list: readonly (readonly [string, string])[]) => ({ enum: list.map(([k]) => k), enumLabels: list.map(([, v]) => v) })

export function directoryCollections(): CollectionConfig[] {
  const { taxonomy: T, labels, routes } = directorySettings()
  const listings = {
    name: 'partners',
    displayName: labels.listings,
    slug: 'partners',
    description: `Directory companies shown at ${routes.directory}`,
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', title: 'Business name', required: true, maxLength: 200 },
        slug: { type: 'slug', title: 'URL slug', required: true },
        category: { type: 'select', title: 'Category', ...pairs(T.categories.map(c => [c.slug, c.label])), default: T.defaultCategory },
        subcategory: { type: 'select', title: 'Subcategory (optional)', ...pairs([['', '—'], ...subcategories().map(s => [s.slug, `${T.categories.find(c => c.slug === s.parent)!.label} › ${s.label}`] as [string, string])]) },
        county: { type: 'select', title: 'Region', ...pairs([['', '—'], ...T.regions]) },
        city: { type: 'string', title: 'City', maxLength: 120 },
        address: { type: 'string', title: 'Address', maxLength: 200 },
        taxId: { type: 'string', title: 'Tax / VAT ID (not public)', maxLength: 20 },
        summary: { type: 'textarea', title: 'Short summary (listing card)', maxLength: 300 },
        description: { type: 'textarea', title: 'Description', helpText: 'Plain text. Blank lines start new paragraphs; **words** between double asterisks are shown bold.' },
        coverImage: { type: 'media', title: 'Cover image' },
        // `multiple` is read by the admin media picker but missing from the typings.
        gallery: { type: 'media', title: 'Gallery', multiple: true } as { type: 'media'; title: string },
        videos: { type: 'textarea', title: 'YouTube videos', helpText: 'One YouTube link per line (up to 12). They play on the profile.' },
        capacity: { type: 'number', title: 'Max guests (venues)', min: 0 },
        priceLevel: { type: 'select', title: 'Price level', ...pairs([['', '—'], ...T.priceLevels]) },
        priceFrom: { type: 'number', title: 'Price from (€)', min: 0 },
        priceUnit: { type: 'select', title: 'Price unit', ...pairs([['', '—'], ...T.priceUnits]) },
        setting: { type: 'select', title: 'Indoor / outdoor (venues)', ...pairs([['', '—'], ...T.settings]) },
        ...Object.fromEntries(T.amenities.map(([key, name]) => [key, { type: 'checkbox' as const, title: name, default: false }])),
        website: { type: 'url', title: 'Website' },
        phone: { type: 'string', title: 'Phone', maxLength: 60 },
        email: { type: 'email', title: 'Contact email' },
        ...(directorySettings().plans.length ? { plan: { type: 'select' as const, title: 'Package', ...pairs(directorySettings().plans.map(p => [p.key, p.label] as const)) } } : {}),
        ...(directorySettings().plans.length ? { planRequest: { type: 'select' as const, title: 'Package requested by the company (switch Package after payment)', ...pairs([['', '—'], ...directorySettings().plans.map(p => [p.key, p.label] as const)]) } } : {}),
        ...Object.fromEntries(T.socials.map(([key, name]) => [key, { type: 'url' as const, title: name }])),
        paidMember: { type: 'checkbox', title: directorySettings().plans.length ? 'Paid member (old Premium; used only when no package is chosen)' : 'Paid member (Premium: listed first, booking requests)', default: false },
        paidUntil: { type: 'date', title: 'Paid until', helpText: 'Leave empty for no expiry.' },
        featuredUntil: { type: 'date', title: 'Featured until', helpText: 'First in the directory and marked "Featured" until this date. Set it when a package starts: start + the package\'s featuring months.' },
        ownerEmail: { type: 'email', title: 'Owner account email', helpText: 'The company account that may edit this listing (set it to approve a claim).' },
        legacyId: { type: 'number', title: 'Old site ID', helpText: 'From the old site\'s profile address. Keeps old links working.' },
        legacySlug: { type: 'string', title: 'Old URL name', helpText: 'The name part of the old site\'s profile address, spelled exactly as there (accents included). Empty = the URL slug.', maxLength: 200 },
        inviteEmail: { type: 'string', title: 'Invitation e-mail', helpText: 'Where the activation invitation goes, e.g. the old site account that ran this profile. Empty = the profile e-mail.', maxLength: 200 },
        legacyMemberId: { type: 'number', title: 'Old site account ID', helpText: 'The old site account that ran this profile (import).' },
        keywords: { type: 'string', title: 'Keywords', helpText: 'Search phrases people use, separated by commas. The directory search finds the company by them too.', maxLength: 500 },
        // The SEO panel (SEO / Social / Advanced) like Pages and Posts; seoTitle and seoDescription keep their keys.
        ...SEO_FIELDS,
        // Online check (e.g. after an import): is the business still there? For staff only; never shown publicly.
        checkStatus: { type: 'select', title: 'Online check', enum: ['', 'active', 'closed', 'unknown'], enumLabels: ['Not checked', 'Active', 'Closed', 'Unknown'], default: '' },
        checkedAt: { type: 'date', title: 'Checked on' },
        checkNote: { type: 'textarea', title: 'Online check notes', helpText: 'Evidence and sources from the check.', maxLength: 3000 }
      },
      required: ['title', 'slug']
    },
    listFields: ['title', 'category', 'city', 'paidMember', 'checkStatus', 'status'],
    searchFields: ['title', 'city'],
    managed: true,
    isActive: true
  } satisfies CollectionConfig

  // Date requests sent from Premium profiles. Saved as drafts so the public API never returns them.
  const bookingRequests = {
    name: 'booking-requests',
    displayName: labels.bookingRequests,
    slug: 'booking-requests',
    description: 'Date requests sent to Premium companies (private)',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', title: 'Summary', required: true, maxLength: 200 },
        partner: { type: 'string', title: 'Company slug', maxLength: 200 },
        partnerName: { type: 'string', title: 'Company', maxLength: 200 },
        coupleName: { type: 'string', title: 'Name', maxLength: 200 },
        email: { type: 'email', title: 'Email' },
        phone: { type: 'string', title: 'Phone', maxLength: 60 },
        weddingDate: { type: 'date', title: 'Event date' },
        guests: { type: 'number', title: 'Guests' },
        message: { type: 'textarea', title: 'Message', maxLength: 3000 },
        handling: { type: 'select', title: 'Handling', enum: ['new', 'forwarded', 'confirmed', 'declined'], enumLabels: ['New', 'Forwarded to the company', 'Confirmed', 'Declined'], default: 'new' }
      },
      required: ['title']
    },
    listFields: ['title', 'partnerName', 'weddingDate', 'handling'],
    searchFields: ['title', 'coupleName', 'partnerName'],
    managed: true,
    isActive: true
  } satisfies CollectionConfig

  // Requests to take over an existing profile whose contact e-mail does not match the account.
  // Approve by setting the profile's "Owner account email" to the requester's e-mail.
  const claims = {
    name: 'listing-claims',
    displayName: labels.claims,
    slug: 'listing-claims',
    description: 'Company requests to manage an existing directory profile (private)',
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string', title: 'Summary', required: true, maxLength: 200 },
        partner: { type: 'string', title: 'Profile slug', maxLength: 200 },
        partnerName: { type: 'string', title: 'Profile', maxLength: 200 },
        userEmail: { type: 'email', title: 'Requested by (account email)' },
        message: { type: 'textarea', title: 'Message', maxLength: 2000 },
        handling: { type: 'select', title: 'Handling', enum: ['new', 'approved', 'rejected'], enumLabels: ['New', 'Approved (owner email set)', 'Rejected'], default: 'new' }
      },
      required: ['title']
    },
    listFields: ['title', 'partnerName', 'userEmail', 'handling'],
    searchFields: ['title', 'userEmail', 'partnerName'],
    managed: true,
    isActive: true
  } satisfies CollectionConfig

  return [listings, bookingRequests, claims] as unknown as CollectionConfig[]
}
