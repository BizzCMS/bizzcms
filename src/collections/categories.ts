import type { CollectionConfig } from '@sonicjs-cms/core'

// Blog and news categories, picked on posts (Posts › Categories). Flat list, no parents.
// "title" is the category name: the admin lists and the reference picker show it.
export default {
  name: 'categories',
  displayName: 'Categories',
  slug: 'categories',
  description: 'Blog and news categories',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string', title: 'Name', required: true, maxLength: 120 },
      slug: { type: 'slug', title: 'URL slug', required: true },
      section: { type: 'string', title: 'Section', enum: ['blog', 'news'], enumLabels: ['Blog', 'News'], default: 'blog', required: true, helpText: 'Blog and news keep separate categories.' },
      description: { type: 'textarea', title: 'Description' },
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
