# Posts

The Posts collection (`src/collections/posts.ts`) is shared by every BizzCMS site: `npm run sync:core` copies it, with the helpers below, into each site. Sites never edit their copy; change it here and sync.

| Field | Admin label | Notes |
|---|---|---|
| title, slug, excerpt, content | Title, URL slug, Summary, Content | |
| featuredImage | Featured image | Picked from Media (stored as the file URL). Optional. |
| featuredImageAlt | Featured image description | Alt text; the post title is used when empty. |
| sponsored | Sponsored | Checkbox, off by default. Paid or partner posts. |
| sponsoredBy | Sponsored by | Optional sponsor name. |
| sponsoredUrl | Sponsored by link | Optional, `http(s)://` only. |

## Featured image (`src/featured-image.ts`)

`featuredImage(data, fallbackAlt)` returns `{ src, alt }` or null. Only site paths and https addresses are accepted. Use it for blog cards, the article image and the share image; keep a site default for posts without one.

## Sponsored posts (`src/sponsored.ts`)

- `sponsorOf(data)`: `{ name, url }` for a sponsored post, otherwise null.
- `sponsoredTag()`: the small "Sponsored" label for lists. `sponsoredLine(sponsor)`: "Sponsored by <name>" (linked, `rel="sponsored noopener"`), or "Sponsored" without a name.
- `markSponsoredLinks(html, host)`: adds `rel="sponsored noopener"` to every link that leaves the site. Run it after sanitising the post body. Google requires it for paid links, so editors never add it by hand.
- `NOT_SPONSORED`: SQL condition. Sponsored posts stay in the normal blog list, but "latest posts" teasers (for example a home-page block) leave them out: add `AND ${NOT_SPONSORED}` to the teaser query. A site that wants them in teasers simply does not add it.

Default classes: `bizz-sponsored-tag`, `bizz-sponsored`. Each site styles them in its own design.

## Imports

Map a source's sponsored flag to `sponsored: true` (plus `sponsoredBy` / `sponsoredUrl` when known). Where the source has no flag, import posts as normal and tick Sponsored in the admin.
