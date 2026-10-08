import type { CollectionConfig } from '@sonicjs-cms/core'

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
      excerpt: { type: 'textarea', title: 'Summary' },
      // Optional. Without one, sites use their default post image (bizzcms.com: a generated cover).
      featuredImage: { type: 'media', title: 'Featured image' },
      featuredImageAlt: { type: 'string', title: 'Featured image description', maxLength: 200 },
      // Paid or partner posts: label on the site, rel="sponsored" on outbound links, left out of "latest posts" teasers.
      sponsored: { type: 'boolean', title: 'Sponsored', helpText: 'Paid or partner post. Shows a "Sponsored" label, marks links to other sites as sponsored, and keeps the post out of "latest posts" teasers.', default: false },
      sponsoredBy: { type: 'string', title: 'Sponsored by', helpText: 'Optional. Name of the sponsor.', maxLength: 120 },
      sponsoredUrl: { type: 'string', title: 'Sponsored by link', helpText: 'Optional. Website of the sponsor, for example https://example.com.', maxLength: 500 },
      content: { type: 'lexical', title: 'Content' }
    },
    required: ['title', 'slug']
  },
  listFields: ['title', 'status'],
  searchFields: ['title'],
  managed: true,
  isActive: true
} satisfies CollectionConfig
