# Posts

The Posts and Categories collections (`src/collections/posts.ts`, `src/collections/categories.ts`) are shared by every BizzCMS site: `npm run sync:core` copies them, with the helpers below, into each site. Sites never edit their copy; change it here and sync. A site registers both: `registerCollections([pages, posts, categories])`.

| Field | Admin label | Notes |
|---|---|---|
| title, slug, excerpt, content | Title, URL slug, Summary, Content | |
| section | Section | `blog` (default) or `news`. One collection for both. Required, so the editor preselects Blog. |
| categories | Categories | Array of category **root ids** (`documents.root_id` of the category), for example `["msd-x9a5…","7Xcq…"]`. Multiselect in the editor, filtered to the post's section. |
| tags | Tags | Array of tag strings as typed, for example `["serverless","Edge CMS"]`. Multiselect with suggestions from tags already used; new tags by Enter or comma. Sites slugify them for `/blog/tag/<slug>/`. |
| authorName, authorSlug, authorUrl | Author name, Author URL slug, Author website | Plain text, not CMS users. `authorSlug` for `/blog/author/<slug>/`. |
| featuredImage | Featured image | Picked from Media (stored as the file URL). Optional. |
| featuredImageAlt | Featured image description | Alt text; the post title is used when empty. |
| sponsored | Sponsored | Checkbox, off by default. Paid or partner posts. |
| sponsoredBy | Sponsored by | Optional sponsor name. |
| sponsoredUrl | Sponsored by link | Optional, `http(s)://` only. |
| legacyId | Legacy ID | Number: the post's ID on the old website, so `/blog/post/<slug>/<id>/` keeps resolving. Set by imports. |
| legacyPath | Legacy URL | Any other old address of the post, to 301 from. |

Editor order: title, slug, then Section, Categories, Tags, Summary, Featured image, author, Sponsored, legacy (upstream always shows Content in the top card).

### Publish date

There is no separate date field: every document already has `published_at` (unix seconds), which blog lists, archives and sitemaps sort by. Imports set `published_at` (and `created_at`) to the original date when they insert the post.

## Categories

| Field | Admin label | Notes |
|---|---|---|
| title | Name | The category name. Upstream lists and reference pickers use `title`, so the name lives there. |
| slug | URL slug | Unique within categories. |
| section | Section | `blog` or `news`; posts only offer categories of their own section. |
| description | Description | |
| seoTitle, seoDescription | SEO title, SEO description | Optional. |

Flat list, no parents. A post stores the category's root id, which stays the same when the category is edited or renamed.

## Categories and Tags in the editor (`src/taxonomy.ts`)

Upstream shows array fields as "Add item" rows. On the post form, `TAXONOMY_SCRIPT` (added by `src/branding.ts`) replaces the Categories and Tags fields with a searchable multiselect with chips, and `GET /admin/bizz/taxonomy` (signed-in users only) returns the categories (`id`, `title`, `section`) and the tags already in use. The saved data is the same JSON array upstream would store. Sites wire the route next to the other admin routes in `src/index.ts`.

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
