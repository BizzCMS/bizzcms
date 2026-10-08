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
      content: { type: 'lexical', title: 'Content' }
    },
    required: ['title', 'slug']
  },
  listFields: ['title', 'status'],
  searchFields: ['title'],
  managed: true,
  isActive: true
} satisfies CollectionConfig
