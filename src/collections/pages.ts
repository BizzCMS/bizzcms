import type { CollectionConfig } from '@sonicjs-cms/core'

export default {
  name: 'pages',
  displayName: 'Pages',
  slug: 'pages',
  description: 'Business website pages',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Title', required: true, maxLength: 200 },
      slug: { type: 'slug', title: 'URL slug', required: true },
      content: { type: 'lexical', title: 'Content' },
      seoTitle: { type: 'string', title: 'SEO title', maxLength: 200 },
      seoDescription: { type: 'textarea', title: 'SEO description', maxLength: 500 }
    },
    required: ['title', 'slug']
  },
  listFields: ['title', 'status'],
  searchFields: ['title'],
  managed: true,
  isActive: true
} satisfies CollectionConfig
