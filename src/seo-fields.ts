// SEO fields shared by Pages, Posts and Categories (SEO plugin, src/plugins/seo.ts).
// Spread into a collection schema: properties: { ...own fields, ...SEO_FIELDS }.
// The editor gathers them into one SEO panel with SEO / Social / Advanced tabs (src/seo-editor.ts),
// so their order here only matters when that script cannot run.
export const SEO_FIELDS = {
  focusKeyphrase: { type: 'string', title: 'Focus keyphrase', helpText: 'The search phrase this page should be found for.', maxLength: 120 },
  relatedKeyphrases: { type: 'string', title: 'Related keyphrases', helpText: 'Other phrases, separated by commas.', maxLength: 300 },
  seoTitle: { type: 'string', title: 'SEO title', helpText: 'Shown in Google. Empty = the title. The site name is added automatically.', maxLength: 200 },
  seoDescription: { type: 'textarea', title: 'Meta description', helpText: 'Shown under the title in Google. About 120 to 156 characters.', maxLength: 500 },
  socialTitle: { type: 'string', title: 'Social title', helpText: 'For Facebook, LinkedIn and X. Empty = SEO title.', maxLength: 200 },
  socialDescription: { type: 'textarea', title: 'Social description', helpText: 'Empty = meta description.', maxLength: 500 },
  seoImage: { type: 'media', title: 'Social image', helpText: 'Empty = featured image, then the site default. Best size 1200 × 630.' },
  canonical: { type: 'string', title: 'Canonical URL', helpText: 'Only when this content also lives at another address. Usually empty.', maxLength: 500 },
  noindex: { type: 'boolean', title: 'Hide from search engines (noindex)', default: false },
  nofollow: { type: 'boolean', title: 'Search engines should not follow links (nofollow)', default: false },
  breadcrumbTitle: { type: 'string', title: 'Breadcrumb title', helpText: 'Shorter name for breadcrumbs. Empty = the title.', maxLength: 80 },
  keyContent: { type: 'boolean', title: 'Key content', helpText: 'Your most important pages. Listed first in SEO › Check.', default: false },
  seoScore: { type: 'number', title: 'SEO score' },
  readabilityScore: { type: 'number', title: 'Readability score' }
} as const

export const SEO_FIELD_NAMES = Object.keys(SEO_FIELDS)
