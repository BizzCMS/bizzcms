import { createSonicJSApp, registerCollections, mcpPlugin } from 'bizzcms-core'
import type { SonicJSConfig } from 'bizzcms-core'
import pages from './collections/pages'
import posts from './collections/posts'
import categories from './collections/categories'
import metadata from '../package.json'
import { applyBranding } from './branding'
import { ensureBizzWelcome } from './welcome'
import { finishUpstream } from './upstream'
import { brandApiSpec } from './api'
import { landingPage } from './landing'
import { blogResponse } from './blog'
import { checkRegisterPasswords, blockedRoute } from './auth'
import { guardApi, apiSettingsPage, withApiTab } from './api-access'
import { googleAnalyticsPlugin, withGoogleAnalytics, gaAdminRoute } from './plugins/google-analytics'
import { taxonomyRoute } from './taxonomy'
import { safeHandle, errorLogPage, withErrorsTab } from './errors'
import { envForSection, withSectionTabs, primeSidebarCounts } from './sections'
import { withMediaUsage } from './dashboard-media'
import { contentGuardRoute } from './content-guard'
import { seoPlugin, seoAdminRoute } from './plugins/seo'

registerCollections([pages, posts, categories])

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
  plugins: { register: [readOnlyMcp as unknown as RegisteredPlugin, googleAnalyticsPlugin as unknown as RegisteredPlugin, seoPlugin as unknown as RegisteredPlugin] },
  email: { providerName: 'console', from: 'BizzCMS <noreply@bizzcms.local>' }
})

export default {
  // Errors never reach a visitor as technical text; they go to Admin › Settings › Error log (src/errors.ts).
  async fetch(request: Request, env: Parameters<typeof cms.fetch>[1], ctx: ExecutionContext) {
    return safeHandle(request, (env as unknown as { DB: D1Database }).DB, ctx, () => handleRequest(request, env, ctx))
  }
}

async function handleRequest(request: Request, env: Parameters<typeof cms.fetch>[1], ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname
    if ((path === '/blog' || path.startsWith('/blog/')) && request.method === 'GET') {
      return blogResponse((env as unknown as { DB: D1Database }).DB, metadata.version, path, new URL(request.url).hostname)
    }
    if ((path === '/' || path === '/about') && request.method === 'GET') {
      return new Response(landingPage(metadata.version, path === '/about'), {
        headers: { 'content-type': 'text/html; charset=utf-8' }
      })
    }
    const blocked = blockedRoute(path)
    if (blocked) return blocked
    // Registration needs a matching "Repeat password" (checked before upstream creates the account).
    const passwordMismatch = await checkRegisterPasswords(request, path)
    if (passwordMismatch) return passwordMismatch
    const db = (env as unknown as { DB: D1Database }).DB
    const upstream = (r: Request) => finishUpstream(ctx, cms.fetch(r, env, ctx))
    // Blog / News counts for the sidebar, drawn by the server (src/sections.ts).
    if (path.startsWith('/admin')) await primeSidebarCounts(db)
    // Google Analytics plugin: install + after-save redirect (see src/plugins/google-analytics.ts).
    const gaRoute = await gaAdminRoute(request, path, db, async () => {
      const me = await upstream(new Request(new URL('/auth/me', request.url), { headers: { cookie: request.headers.get('cookie') ?? '' } }))
      return me.ok && ((await me.json()) as { user?: { role?: string } }).user?.role === 'admin'
    })
    if (gaRoute) return gaRoute
    // Post editor: categories and tags for the multiselects (src/taxonomy.ts).
    const taxonomy = await taxonomyRoute(request, path, db, async () => (await upstream(new Request(new URL('/auth/me', request.url), { headers: { cookie: request.headers.get('cookie') ?? '' } }))).ok)
    if (taxonomy) return taxonomy
    // SEO plugin: Admin › SEO, editor data, plugin install (src/plugins/seo.ts).
    const seoRoute = await seoAdminRoute(request, path, db, upstream)
    if (seoRoute) return applyBranding(seoRoute, path)
    // Settings › API: our page inside upstream's settings layout.
    if (path === '/admin/settings/api') {
      return applyBranding(withErrorsTab(withApiTab(await apiSettingsPage(request, db, upstream), path), path), path)
    }
    // Settings › Error log (src/errors.ts).
    const errorLog = await errorLogPage(request, path, db, upstream)
    if (errorLog) return applyBranding(withErrorsTab(withApiTab(errorLog, path), path), path)
    // The REST API is closed unless the owner opens it (Settings › API).
    const denied = await guardApi(request, path, db, upstream)
    if (denied) return denied
    // Never let a save blank a post or page that has text (src/content-guard.ts).
    const guarded = await contentGuardRoute(request, path, db)
    if (guarded) return guarded
    // Posts list by section (Blog | News): src/sections.ts.
    // Dashboard Media Files count and size from the media documents (src/dashboard-media.ts).
    const response = await withMediaUsage(await withSectionTabs(await finishUpstream(ctx, cms.fetch(request, envForSection(env, request, path), ctx)), request, path, db), path, db)
    // After upstream's startup seeding has run: replace its SonicJS welcome post.
    await ensureBizzWelcome((env as unknown as { DB: D1Database }).DB).catch(e => console.error('welcome post', e))
    return applyBranding(withErrorsTab(withApiTab(await brandApiSpec(await withGoogleAnalytics(response, request, db), path), path), path), path)
}
