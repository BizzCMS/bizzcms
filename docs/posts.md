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

SEO fields (focus keyphrase, SEO title, meta description, social, noindex …) come from `src/seo-fields.ts` and show in the SEO panel; see seo.md.

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

## Editing imported and rich HTML (`src/content-guard.ts`)

Every rich text field has a **Visual | HTML | Preview** switch above it. The visual editor (Lexical, upstream) only knows paragraphs, headings, lists, quotes, links and bold/italic. Content that also has images, tables, iframes, figures, `pre`, `hr` or `div` opens in an HTML editor with a Preview tab instead, so nothing is dropped. If the visual editor loads other content but loses text or links, the field is restored and switched to HTML. Emptying a box that had text asks for confirmation (`bizz_confirm_clear`), and `contentGuardRoute` (wired before `cms.fetch`) refuses any `PUT /admin/content/:id` that would replace real text in `content` or `body` with an empty box.

## Images and other blocks in the visual editor (`src/lexical-blocks.ts`)

Lexical only takes node types when an editor is created, so `LEXICAL_BLOCKS_SCRIPT` loads the same `lexical` module (same import-map URL as upstream) and wraps `window.__lexical.createEditor`, adding two vanilla DecoratorNodes before upstream creates its editors (toolbar, history and save stay upstream's):

- `bizz-image`: `<img>` with src, alt, width; inline; double-click edits the description; the toolbar's **Image** button opens the Media library.
- `bizz-html`: `table`, `figure`, `iframe`, `pre`, `hr`, `video`, `audio`, `embed`, `object`, stored as the original HTML and written back unchanged; shown read-only (iframes as a placeholder, scripts and event attributes stripped for display only).

`$generateNodesFromDOM` is wrapped so loose text or inline nodes at the top level go into a paragraph instead of failing the import. Only `div`/`section` layouts still open in HTML. If the blocks cannot load (CDN down), the content guard falls back to HTML for anything the plain editor would drop.

## Posts list by section (`src/sections.ts`)

Content › Posts shows **All posts | Blog | News** tabs with counts. Upstream's list can only filter by collection, status and title, so for `?model=posts&section=…` the request's database handle adds `section = …` to the list and count queries only (`envForSection`); `withSectionTabs` adds the tabs and keeps `section` in paging, per-page and "New Content" links. A new post opened from the News tab starts with Section = News. Posts without a section count as blog. Sites wire both next to `cms.fetch` in `src/index.ts`.

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
