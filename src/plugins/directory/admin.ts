// Directory plugin in the admin: menu entries for the directory's collections (companies, booking requests,
// listing claims), shown with the other plugins. Call after setDirectory(), so the site's labels are used:
//   createSonicJSApp({ plugins: { register: [..., directoryPlugin()] } })
import { definePlugin } from 'bizzcms-core'
import { directorySettings } from './config'

const BOOK = '<svg class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 19.5V5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2.5zM8 7h6M8 11h6"/></svg>'

export function directoryPlugin() {
  const { labels } = directorySettings()
  return definePlugin({
    id: 'directory',
    name: 'Directory',
    version: '1.0.0',
    description: 'Company directory: category and city pages, company profiles, date requests and the company portal.',
    author: { name: 'BizzCMS', url: 'https://bizzcms.com' },
    capabilities: [],
    menu: [
      { label: 'Directory', path: '/admin/content?model=partners', icon: BOOK, order: 20 },
      { label: labels.bookingRequests, path: '/admin/content?model=booking-requests', icon: 'envelope', order: 21 },
      { label: labels.claims, path: '/admin/content?model=listing-claims', icon: 'document', order: 22 }
    ]
  })
}
