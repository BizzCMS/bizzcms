# Caching and speed

BizzCMS serves public pages from Cloudflare's edge cache, so visitors and search engines get them fast without the page being rebuilt from the database each time.

## What is cached

| Cached | Never cached |
|---|---|
| Public pages: home, pages, blog and news lists, posts, categories | The admin (`/admin`), sign-in (`/auth`), the API (`/api`), files (`/files`), MCP (`/mcp`) |
| Sitemaps, RSS feeds, robots.txt, llms.txt | Anything for a signed-in person (they always see fresh pages) |
| Only successful pages (200) that set no cookies | Errors, redirects and "page not found" |

## Settings (Admin › Settings › Cache)

| Setting | Default | |
|---|---|---|
| Cache public pages | on | Switch the whole cache off or on. |
| Keep pages for (minutes) | 5 | 0 turns caching off for pages. |
| Keep sitemaps and feeds until content changes | on | Sitemaps, RSS feeds, robots.txt and llms.txt are built once and kept at the edge until something is saved in the admin. Browsers and crawlers still revalidate every time, so they never get an old copy. |
| Keep sitemaps, feeds, robots.txt and llms.txt for (minutes) | 60 | Used when the box above is off. |
| Clear the cache now | | Replaces every cached page straight away. |

Saving the settings also clears the cache. A post that goes live through a schedule (no save at that moment) shows up in the sitemap and feed after the next save or **Clear the cache now**.

## Your changes show right away

Every save in the admin (a page, a post, media, settings, SEO, redirects) replaces all cached pages at once, everywhere. The minutes above only matter when nothing is saved: then a page is rebuilt at most once per period in each Cloudflare location.

## Crawlers and browsers

Every cached page carries an `ETag` and `Last-Modified`. A browser or crawler that already has the page asks "has it changed?" and gets a tiny `304 Not Modified` answer when it has not. Browsers are told to check back each time (`Cache-Control: public, no-cache`), so nobody keeps an old copy.

Each response says whether it came from the cache: header `x-bizz-cache: HIT` or `MISS`. Add `?nocache` to an address to skip the cache once.

## For site code

Wrap the site's handler inside the error handler:

```ts
return safeHandle(request, db, ctx, () => edgeCached(request, db, env.CACHE_KV, ctx, () => handle(request, env, ctx)))
```

and add the settings page next to the other settings pages: `cacheSettingsPage(request, path, db, env.CACHE_KV, upstream)` and `withCacheTab(...)` around the settings responses. The content version is kept in KV (`CACHE_KV`). On a local computer pages are not stored (add `?bizz-cache-test` to try it).

### Which pages a session cookie skips

By default any session cookie skips the cache on every public page (people who are signed in always see fresh pages). A site where only a few public pages are personal (for example "my account" or a saved list) can narrow that:

```ts
import { setCacheBypass } from './edge-cache'
setCacheBypass((path, request) => path.startsWith('/my/') || path === '/saved')
```

Pages for which the function returns `false` are served from the cache to everybody, signed in or not. Pages for which it returns `true` skip the cache for people with a session cookie, as before. `/admin`, `/auth` and `/api` always skip it. A page built for a signed-in person is never stored in the cache, so one person's page can never be shown to another; make sure nothing personal is drawn on pages the function lets through.

### Fewer round trips

- The settings and the content version are read together on every public page.
- `src/session.ts` asks the engine "who is signed in?" once per request (`sessionUser`, `isSignedIn`, `isAdminSession`); routes that need it in several places share the answer. Nothing is kept between requests.
- Admin pages that borrow another page's layout (SEO, Settings › API / Cache / Error log) fetch it at the same time as the sign-in check and their own queries.
- `primeSidebarCounts(db, kv, ctx)`, `clearSidebarCounts(kv, ctx)` and `withImageHints(request, response, bucket, kv, ctx)` accept the request's `ctx` so their KV writes finish after the response.

## Table setup once per deploy (2026-10-20)

The shared files create their own tables (`CREATE TABLE IF NOT EXISTS`) and plugin records. Before, some did it on every
request or every 15–30 s on every isolate. Now `src/schema-once.ts` runs each step at most once per isolate. With the
deploy id it also runs once per deploy: new isolates skip what this deploy already did.

To turn it on in a site:
- `wrangler.toml`: add `[version_metadata] binding = "CF_VERSION_METADATA"`, and `[env.production.version_metadata]` too
  (bindings are not inherited).
- At the start of the site's `fetch`, call
  `configureSchemaOnce({ kv: env.CACHE_KV, deployId: env.CF_VERSION_METADATA?.id })`.

Without the binding it still works, once per isolate. A failing step is not remembered, so it runs again. The KV keys are
`bizz:schema:<name>:<deployId>` (120 days). The engine does the same for its own bootstrap (`bizz:once:…`).
