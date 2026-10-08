import type { CollectionConfig } from 'bizzcms-core'
import { SEO_FIELDS } from '../seo-fields'

export default {
  name: 'posts',
  displayName: 'Posts',
  slug: 'posts',
  description: 'News and blog posts',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title', required: true, maxLength: 200 },
      slug: { type: 'slug', title: 'URL slug', required: true },
      // Blog or news: one collection for both, like the old site.
      section: { type: 'string', title: 'Section', enum: ['blog', 'news'], enumLabels: ['Blog', 'News'], default: 'blog', required: true },
      // References to Categories (stored as the category root ids). Pick only categories of the same section.
      categories: { type: 'array', title: 'Categories', itemTitle: 'Category', items: { type: 'reference', title: 'Category', collection: 'categories' } },
      // Free tags; sites build /blog/tag/<slug>/ pages from them.
      tags: { type: 'array', title: 'Tags', itemTitle: 'Tag', items: { type: 'string', title: 'Tag', maxLength: 80 } },
      excerpt: { type: 'textarea', title: 'Summary' },
      // Optional. Without one, sites use their default post image (bizzcms.com: a generated cover).
      featuredImage: { type: 'media', title: 'Featured image' },
      featuredImageAlt: { type: 'string', title: 'Featured image description', maxLength: 200 },
      content: { type: 'lexical', title: 'Content' },
      // Author shown on the site. Plain fields, not CMS users (imports would otherwise create an account per old author).
      authorName: { type: 'string', title: 'Author name', maxLength: 120 },
      authorSlug: { type: 'string', title: 'Author URL slug', helpText: 'For /blog/author/<slug>/. Lowercase letters, numbers and hyphens.', maxLength: 120 },
      authorUrl: { type: 'string', title: 'Author website', helpText: 'Optional, https://…', maxLength: 500 },
      // Paid or partner posts: label on the site, rel="sponsored" on outbound links, left out of "latest posts" teasers.
      sponsored: { type: 'boolean', title: 'Sponsored', helpText: 'Paid or partner post. Shows a "Sponsored" label, marks links to other sites as sponsored, and keeps the post out of "latest posts" teasers.', default: false },
      sponsoredBy: { type: 'string', title: 'Sponsored by', helpText: 'Optional. Name of the sponsor.', maxLength: 120 },
      sponsoredUrl: { type: 'string', title: 'Sponsored by link', helpText: 'Optional. Website of the sponsor, for example https://example.com.', maxLength: 500 },
      // Imported posts: the old ID keeps old URLs such as /blog/post/<slug>/<id>/ working; legacyPath is any other old URL to redirect from.
      legacyId: { type: 'number', title: 'Legacy ID', helpText: 'ID from the old website. Set by imports; leave as is.' },
      legacyPath: { type: 'string', title: 'Legacy URL', helpText: 'Old address of this post, redirected here (301).', maxLength: 500 },
      // SEO panel (SEO plugin).
      ...SEO_FIELDS
    },
    required: ['title', 'slug']
  },
  listFields: ['title', 'status'],
  searchFields: ['title'],
  managed: true,
  isActive: true
} satisfies CollectionConfig
