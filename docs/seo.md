# SEO plugin

Search engine optimisation for every BizzCMS site, modelled on Yoast SEO (our own code and wording).

## For editors

**In the editor** (pages, posts and categories): an **SEO** card below the content fields, with three tabs.

- **SEO**: focus keyphrase, related keyphrases, SEO title, meta description, a live **Google preview** with length bars, and the analysis:
  - **SEO analysis**: keyphrase in the SEO title (best at the start), in the meta description, in the URL, in the first paragraph, in a subheading and in an image description; keyphrase density (0.5 to 3%); keyphrase already used on another page; title length (30 to 60 characters); meta description length (120 to 156); text length (300 words for posts, 150 for pages); internal and outbound links; images and missing alt text; an H1 inside the text; noindex switched on.
  - **Readability**: long sentences, long paragraphs, text without subheadings, repeated sentence starts, and (English only for now) passive voice and transition words.
  - Green, orange or red per check; a score for each list next to the card title.
- **Social**: social title, description and image, with a share preview (Facebook, LinkedIn, X).
- **Advanced**: noindex, nofollow, canonical URL, breadcrumb title, Key content.

**Auto-fill SEO** (button on the card) fills every empty SEO field from the content: focus keyphrase (best two or three word phrase from the title, headings, summary, tags and text), related keyphrases, meta description (the summary, or the first sentences, preferring the one with the keyphrase, cut at about 155 characters), a shorter SEO title when the title is too long, and the featured image description. It never overwrites a field that already has text. Meta keywords are not used: Google ignores them; the focus and related keyphrases do that job and go into the Article structured data.

The scores are saved with the item; the **Content** list shows them as two dots next to each title.

**Admin › SEO** (`/admin/seo`, also under Plugins in the sidebar):

| Tab | |
|---|---|
| General | Site name (added as "Title \| Site name"), home page tagline ("Site name - tagline"), default meta description, default social image, company or person behind the site, logo, social profiles. |
| Indexing | Hide the whole site from search engines (staging), extra robots.txt lines, llms.txt text. |
| Redirects | Old URL → new URL (301 or 302), search, delete, CSV import, hit counter. An old URL ending in `*` matches everything that starts with it (`/old/*` → `/new/*` keeps the rest of the path). |
| Check | Pages, posts and categories that need attention (no keyphrase, no or long description, long or duplicate title, no featured image or category, images without alt text, noindex), Key content first. |

Only administrators change settings and redirects; editors can see them.

## For site code

Everything lives in `src/plugins/seo.ts`, `src/seo-editor.ts` and `src/seo-fields.ts`; `npm run sync:core` copies them. A site:

1. Registers the plugin: `plugins: { register: [..., seoPlugin] }`.
2. Spreads `...SEO_FIELDS` into its pages collection (posts and categories already have them).
3. Calls `seoRedirect(request, db, ctx)` before rendering public pages, and `seoAdminRoute(request, path, db, upstream)` next to the other admin routes (wrap the result in `applyBranding`).
4. Serves `seoRobots(url, db)`, `seoSitemap(url, db, routes)` (routes map pages, posts, categories and tags to their URL paths; `extra` adds fixed URLs) and `seoLlms(db)` (null when no llms.txt text is set, so the site's own one stays).
5. Builds each page head with `seoHead({ origin, path, kind, title, data, excerpt, image, publishedAt, modifiedAt, author, breadcrumbs, extraGraph }, settings)` and `socialTags(head, data, siteName)`. It returns the full title, description, canonical, robots (`index,follow,max-image-preview:large` or noindex/nofollow), image and the structured data graph (Organization or Person once set, WebSite, WebPage or CollectionPage, Article for posts, BreadcrumbList).

**View on site.** `setPublicRoutes(routes)` (call once with the same routes object as `seoSitemap`) tells the admin where each page, post and category lives: the Content list then shows an eye before the edit button for published items, and the editor's View on Website opens the same address (`GET /admin/bizz/seo/urls?ids=…`). Without it: pages by `path`, posts under `/blog/<slug>`, categories none. Drafts get no eye (no preview of unpublished changes yet).

**Sitemap choices.** SEO › Indexing lists the parts the site offers (from `setPublicRoutes`): pages, posts, categories, tags, `routes.collections` (e.g. `portfolio: (d, slug) => "/portfolio/" + slug + "/"`) and other pages (`routes.extra`). Unticked parts leave the sitemap index and their sitemap returns 404.

**RSS feed.** `seoFeed(url, db)` answers `/feed/`, `/feed`, `/rss.xml` and `/<blog|news>/feed/` (call it before the site's blog routes). Settings: on/off, posts (5–100), full text or summary. `socialTags()` adds the `<link rel="alternate">` to every page.

**Not found log.** `seoNotFound(request, db, ctx)` (call it where the site returns its 404 page) records the address, hits, last visit and referrer in `bizz_not_found`; Admin › SEO › Redirects lists the last 90 days with Redirect… and Dismiss.

Imports add redirects with `addRedirects(db, [{ source, target, status }])`.

Storage: settings in `bizz_settings` (`seo.settings`), redirects in `bizz_redirects` (created on first use). No extra services.

