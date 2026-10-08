import type { CollectionConfig } from 'bizzcms-core'
import { SEO_FIELDS } from '../seo-fields'

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
      // SEO panel (SEO plugin), including seoTitle and seoDescription.
      ...SEO_FIELDS
    },
    required: ['title', 'slug']
  },
  listFields: ['title', 'status'],
  searchFields: ['title'],
  managed: true,
  isActive: true
} satisfies CollectionConfig
