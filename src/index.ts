import { createSonicJSApp, registerCollections, mcpPlugin } from '@sonicjs-cms/core'
import type { SonicJSConfig } from '@sonicjs-cms/core'
import pages from './collections/pages'
import posts from './collections/posts'
import metadata from '../package.json'
import { applyBranding } from './branding'
import { ensureBizzWelcome } from './welcome'
import { brandApiSpec } from './api'
import { landingPage } from './landing'
import { blogResponse } from './blog'
import { checkRegisterPasswords } from './auth'
import { guardApi, apiSettingsPage, withApiTab } from './api-access'

registerCollections([pages, posts])

const readOnlyMcp = mcpPlugin({
  expose: ['pages', 'posts'],
  types: {
    pages: { read: true, write: false },
    posts: { read: true, write: false }
  },
  listLimit: 25
})
// Upstream's built-in v3 plugin is runtime-supported, but its beta declarations
// still expect legacy Plugin routes/lifecycle signatures in SonicJSConfig.
type RegisteredPlugin = NonNullable<NonNullable<SonicJSConfig['plugins']>['register']>[number]

// Keep the upstream editor intact for the first local evaluation.
const cms = createSonicJSApp({
  name: 'BizzCMS',
  version: metadata.version,
  plugins: { register: [readOnlyMcp as unknown as RegisteredPlugin] },
  email: { providerName: 'console', from: 'BizzCMS <noreply@bizzcms.local>' }
})

export default {
  async fetch(request: Request, env: Parameters<typeof cms.fetch>[1], ctx: ExecutionContext) {
    const path = new URL(request.url).pathname
    if ((path === '/blog' || path.startsWith('/blog/')) && request.method === 'GET') {
      return blogResponse((env as unknown as { DB: D1Database }).DB, metadata.version, path)
    }
    if ((path === '/' || path === '/about') && request.method === 'GET') {
      return new Response(landingPage(metadata.version, path === '/about'), {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }
    // Registration needs a matching "Repeat password" (checked before upstream creates the account).
    const passwordMismatch = await checkRegisterPasswords(request, path)
    if (passwordMismatch) return passwordMismatch
    const db = (env as unknown as { DB: D1Database }).DB
    const upstream = (r: Request) => Promise.resolve(cms.fetch(r, env, ctx))
    // Settings › API: our page inside upstream's settings layout.
    if (path === '/admin/settings/api') {
      return applyBranding(withApiTab(await apiSettingsPage(request, db, upstream), path), path)
    }
    // The REST API is closed unless the owner opens it (Settings › API).
    const denied = await guardApi(request, path, db, upstream)
    if (denied) return denied
    const response = await cms.fetch(request, env, ctx)
    // After upstream's startup seeding has run: replace its SonicJS welcome post.
    await ensureBizzWelcome((env as unknown as { DB: D1Database }).DB).catch(e => console.error('welcome post', e))
    return applyBranding(withApiTab(await brandApiSpec(response, path), path), path)
  }
}
