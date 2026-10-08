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
| Keep sitemaps, feeds, robots.txt and llms.txt for (minutes) | 60 | They change less often. |
| Clear the cache now | | Replaces every cached page straight away. |

Saving the settings also clears the cache.

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
