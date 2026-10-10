# Changelog

All notable changes to BizzCMS. Versions follow [semantic versioning](https://semver.org): each release bumps the patch number (0.2.1, 0.2.2, …)

## [Unreleased]

### Added
- **Languages plugin** (`src/plugins/languages.ts`, docs/languages.md): a site in several languages, each on its own addresses (`/`, `/en/`, `/de/…`). Translations are pages with a **Translation of** field. Every public page gets `<html lang>`, `hreflang` + `x-default`, `og:locale` and a language switcher in `[data-bizz-languages]`.
- **SEO › General › Site language**: RSS `<language>` and feed texts in the site language (English, Croatian, German), `inLanguage` on WebSite and WebPage; `seoHead` takes an optional page `language`.
- Cookie bar texts in German. Share buttons in English, Croatian and German (`shareBar(…, lang)`). `setSponsoredLabels()` for the "Sponsored" labels.

### Fixed
- RSS feeds always said `<language>en</language>` and "The post … appeared first on …", also on Croatian sites.

### Changed
- **Cookie bar in the Cookiebot style** (Google Analytics plugin): full-width bar with Necessary / Preferences / Statistics / Marketing switches, details, and Allow all · Allow selection · Use necessary cookies only; English and Croatian built in (page language). **Google Consent Mode advanced**: gtag.js is on every page, cookies and identifiers only after Statistics is allowed (the current page is counted then, once). New settings: Banner title, Button colour, Button text colour.

### Fixed
- Page titles no longer end in the host name ("… | localhost") when SEO › General › Site name is empty: the company name is used, else no suffix.

### Fixed
- **Google Analytics (consent)**: Accept after Reject on the same page now grants analytics again (it was ignored once gtag.js had loaded). The snippet guards against running twice, so GA4 is configured once per page and sends one page_view. Any other `gtag.js` tag on a public page (a template or pasted HTML) is removed while the plugin is active, so the plugin is the only GA4 integration and nothing loads before consent.

### Fixed
- `/sitemap_index.xml`, `/sitemap-index.xml`, `/wp-sitemap.xml`, `/sitemap1.xml` and `/sitemap.xml.gz` (names from WordPress/Yoast that crawlers and checkers try) 301 to `/sitemap.xml` instead of 404.

### Added
- Directory plugin: **Keywords** field per company (search matches it) and **Online check** fields (result, date, notes) for staff.
- **Directory plugin** (`src/plugins/directory/`, docs/directory.md): a company directory with filters, category and city pages, company profiles with a gallery, date requests for Premium companies, and a company portal (sign up, add, edit and claim a profile, photos, requests). Addresses, query words, categories, regions, wording and layout are set per site with `setDirectory()`; English by default. Visitor accounts for public areas (sign in, register, photo galleries) are shared in `src/site-accounts.ts`.

### Fixed
- **Saving a published post no longer changes its dates.** The engine wrote each save as a new version with created_at = now and then set published_at = now, so edited posts jumped to the top of the blog, the RSS feed and the Content list, and got a new datePublished. The new version now keeps created_at and published_at; only the first publish sets the date (`src/publish-date.ts`).

### Changed
- **Content lists sort by Created** (newest first) instead of last update, so saving an item no longer moves it to the top. New **Created** column next to Updated; both headers sort the whole list (`?sort=created|updated&dir=desc|asc`). Created is the earlier of created and published date, so imported posts show their original date (`src/content-dates.ts`).

### Fixed
- **Lookup indexes** (`src/db-indexes.ts`, created once per isolate from `safeHandle`): published lists, slug and page-path lookups, `updated_at`, error log and not-found log. The engine's indexes start with `tenant_id`, which the sites' queries don't use, so busy sites could read whole tables and hit D1's CPU limit.

### Added
- Article schema: `keywords` from the post's **visible tags** (`tags`), never the focus keyphrase. AI Discovery page check warns when an article has no category or no tags.
- SEO › **AI Discovery** tab: site checks (indexing, AI search / assistants / training policy, organisation, logo and profiles, default image and description, IndexNow, llms.txt) and a page check that reads the sitemap and opens each page like an AI crawler (no cookies, no JavaScript, served from the edge cache): reachable, indexable, canonical, title, description, share image, one h1, valid JSON-LD with article fields, enough text in the HTML.
- SEO › Indexing › **AI crawlers**: three choices, AI search (on), AI assistants (on), AI training (off by default), written into robots.txt as a marked block plus a `Content-Signal` line. The bot list (`src/plugins/ai-crawlers.ts`, versioned) follows each operator's own docs: OpenAI, Anthropic, Google-Extended, Perplexity, Apple, Meta, Amazon, Common Crawl, ByteDance.
- SEO structured data: posts can be **BlogPosting** or **NewsArticle** (`articleType`) and list their categories (`articleSection` via `sections`). Leave `author` out when the organisation wrote the post: the schema then names the organisation instead of a made-up person.
- Settings › Cache: **Keep sitemaps and feeds until content changes** (on by default). Sitemaps, feeds, robots.txt and llms.txt stay at the edge until the next admin save instead of 60 minutes; clients still revalidate with the ETag.
- SEO › Check: **Calculate missing scores** / **Recalculate all**. Imported or old items get their SEO and readability scores (the dots in the Content list) without opening each one: the browser runs the same analysis as the editor in batches of 40, updates go by id and keep `updated_at` (no IndexNow, no cache flush). The analysis now lives in one shared script (`SEO_ANALYSE_CORE`).

### Fixed
- IndexNow after a save read the whole documents table (no index on `updated_at`); it now creates `idx_documents_updated_at` once and reads only the last minute's changes.

## [0.2.7] - 2026-10-08

### Added
- **Uploads made web-sized** (`src/image-upload.ts`): JPEG/PNG/WebP wider than the maximum are scaled down and saved as WebP in the browser before upload (every admin upload). **Settings › Images**: on/off, maximum width (2000), quality (82). See docs/images.md.
- **Image hints** (`src/image-hints.ts`): Media library images on public pages get their real width and height (read once from the file in R2, kept in KV), lazy images `decoding="async"`, and the first image that is not lazy `fetchpriority="high"`. Less layout shift, faster top image. Sites wrap their page handler with `withImageHints(request, response, env.MEDIA_BUCKET, env.CACHE_KV)`.
- **Registration closed**: `/auth/register` goes to sign-in and the register endpoints answer 404; administrators create accounts (Users).
- SEO › General: **X (Twitter) username**; every page then carries `twitter:site` and `twitter:creator`.
- **IndexNow** in the SEO plugin (SEO › Indexing, on by default): after every admin save the public addresses of the changed items go to IndexNow (Bing, Yandex, Seznam, Naver…); key file at `/<key>.txt` (generated, or paste your own); "Send all addresses to IndexNow now" from the sitemap; last 30 results listed. Never from local addresses or a hidden site. Sites wire `seoIndexNowKey` and `seoIndexNowChanged` (docs/seo.md).

## [0.2.6] - 2026-10-08

### Fixed
- The View on site eye (and the editor's View on Website) also works for extra collections such as a portfolio, using the site's `routes.collections` rule.

### Added
- **Edge cache** for public pages (`src/edge-cache.ts`): pages, lists, sitemaps and feeds are kept on Cloudflare (pages 5 minutes, sitemaps/feeds 60 minutes by default) and replaced at once on every admin save through a content version in KV. ETag and Last-Modified with 304 answers for browsers and crawlers; `x-bizz-cache: HIT/MISS`. Never for the admin, sign-in, API, files or signed-in people. **Settings › Cache**: on/off, both durations, "Clear the cache now". See docs/caching.md.

### Changed
- Sitemap choices: posts are split per section (**Blog posts**, **News posts**, each with its own sitemap, e.g. /sitemap-news.xml); "Other pages" is now "Pages built into the site, not in Content". /sitemap-posts.xml keeps working (all posts).

### Added
- Sidebar: sites can pin collections as their own entries with a count (`setSidebarCollections([{ name: 'portfolio', label: 'Portfolio' }])`), next to Blog and News.

### Changed
- Sidebar counts are kept in KV (`CACHE_KV`) and cleared when content is created, saved or deleted, so the sidebar never waits on a count.

### Added
- **RSS feed** (SEO plugin): `/feed/` (all posts) and `/<section>/feed/` (blog, news), RSS 2.0 like WordPress: featured image first (`webfeedsFeaturedVisual`) plus `media:content`, author, categories and tags, full text in `content:encoded`, "appeared first on" line; pages link to it. SEO › Indexing: on/off, number of posts, full text or summary. Sites call `seoFeed(url, db)`.
- SEO › Indexing › **Include in sitemap**: tick which parts go into /sitemap.xml (pages, posts, categories, tags, other pages, and extra collections a site adds with `routes.collections`, e.g. portfolio). Each settings tab now saves only its own fields.

### Security
- **No technical errors shown to visitors.** Any error, or a 5xx from the CMS engine (some of which included the raw database error), becomes a friendly page (or `{"error":"Something went wrong","reference":"…"}` for the API) with a short reference code. The details go to the console and to **Settings › Error log** (30 days, administrators only, search by reference). `src/errors.ts`; sites can give the page their own design with `setErrorPage()`.

### Added
- **Social Share plugin** (Admin › Plugins › Social Share): a share bar for posts with copy link, LinkedIn, X, Facebook, WhatsApp, Pinterest, e-mail and the phone's share menu. Plain links with built-in icons: no third-party scripts or tracking. Pick the buttons and the label in the settings. Sites place it with `await shareBar(db, url, title, image?)` (empty while the plugin is off) and theme it with CSS on `.bz-share` / `.bz-share-btn` (`--bz-share-c` = brand colour). `src/plugins/social-share.ts`.
- SEO › Redirects: a **Not found** list (last 90 days) of addresses that ended on "page not found", with hits, last visit and where visitors came from; **Redirect…** pre-fills a redirect, **Dismiss** removes it, and adding a redirect clears it. Sites call `seoNotFound()` where they return their 404 page.

### Fixed
- **SEO: no "keywords" in the Article structured data.** Search engines ignore it, and it showed anyone the keyphrases a post targets. Focus and related keyphrases stay in the editor's SEO analysis only. `src/plugins/seo.ts`.
- SEO page and the editor's SEO card use the admin's standard tab bar (as on Settings) instead of their own underline tabs.
- **Sidebar jumped on every click.** Blog and News were added by a script at the end of the page, after the sidebar was drawn. The server now puts them into the page (counts cached for a minute), so the sidebar is complete on the first paint.

## [0.2.5] - 2026-10-08

### Changed
- The CMS engine is now the `bizzcms-core` package (in `vendor/`, built from the upstream release; same code and version). All imports use `bizzcms-core`, and the admin's code examples show it too.

## [0.2.4] - 2026-10-08

### Added
- **Images, tables, embeds and code in the visual editor.** Images show as images, with an **Image** button in the toolbar (Media library) and double-click to edit the description. Tables, figures, YouTube and other embeds, code blocks and dividers are kept exactly as they are (shown read-only, edited in HTML). Loose text no longer breaks loading. `src/lexical-blocks.ts`.
- **HTML editor**: every rich text field has a **Visual | HTML | Preview** switch. HTML edits the saved HTML directly; Visual is refused for HTML it would damage (images, tables, embeds, code blocks).

### Fixed
- **Dashboard showed 0 media files and "0 B".** Upstream still counts its old `media` table, which uploads no longer fill (they are `media_asset` documents). The Media Files card and Storage Usage now count the media documents. `src/dashboard-media.ts` (sites: add it to sync-core and wrap the upstream response with `withMediaUsage`).
- **Sidebar jumped when switching between Blog and News.** The entries were only added after the counts loaded, so the menu shifted on every page. They now draw at once from the last known counts (kept in the browser) and the numbers refresh afterwards. `src/sections.ts`.
- **Editor could blank imported posts.** Upstream's visual (Lexical) editor has no images, tables, embeds or code blocks: such HTML was dropped or the box stayed empty, and saving wrote that back. Content with those elements now opens in an HTML editor with a preview (nothing lost); if the visual editor loses text on load it switches too; emptying a box with text asks for confirmation, and the server refuses a save that would blank a post or page unless confirmed. `src/content-guard.ts`.

### Added
- Content list: an **eye (View on site)** before the edit button opens the published page in a new tab; the editor's View on Website uses the same address. Sites give their URL rules once with `setPublicRoutes(SITEMAP_ROUTES)`. Drafts have no eye.
- Sidebar: **Blog** and **News** entries under Workspace (after Content) with post counts, highlighted on their list; News only when the site has news posts.
- Posts list divided by section: **All posts | Blog | News** tabs with counts above the list; filters, paging and "New Content" keep the section (a new post from News starts as News). `src/sections.ts`.
- **SEO plugin** (Admin › SEO), modelled on Yoast SEO: SEO panel on pages, posts and categories with Google and share previews, focus keyphrase, SEO and readability analysis, **Auto-fill SEO** button, scores in the Content list; General settings (site name, title formats, organisation), Indexing (robots.txt, llms.txt, hide site), **Redirects** with CSV import, and a Check list. Sites get `seoHead`, sitemaps per type, robots.txt and structured data (Article, BreadcrumbList, WebSite, Organization). See docs/seo.md.
- **Categories** collection (name, slug, section blog/news, description, SEO title and description).
- Posts: **Section** (blog or news), **Categories** and **Tags** as searchable multiselects in the editor (categories filtered to the post's section, tags suggested from existing ones or added new), **Author name / URL slug / website**, **Legacy ID** and **Legacy URL** for imported posts. See docs/posts.md.

### Changed
- Node.js 24 LTS is now the minimum (`engines` `>=24`, `.nvmrc`); verified with 24.21.0.

## [0.2.3] - 2026-10-08

### Added
- Posts › **Sponsored** (checkbox), **Sponsored by** and **Sponsored by link**. Sponsored posts stay in the blog list with a "Sponsored" label and "Sponsored by …" on the post; links to other sites in their body get `rel="sponsored noopener"` automatically; "latest posts" teasers leave them out (`NOT_SPONSORED`). Helpers in `src/sponsored.ts`, see docs/posts.md.
- `sync:core` now also copies the Posts collection and its helpers to the sites.
- Posts › **Featured image** (picked from the Media library) and **Featured image description** (alt text). Sites show it on blog lists, the post page and as the social share image; posts without one keep the site's default image. Helper: `src/featured-image.ts`.
- Plugin **Google Analytics** (Admin › Plugins): Measurement ID, consent banner on/off, banner text and policy link in a Settings tab. Public HTML pages get a cookie banner; Google Analytics loads only after Accept (Consent Mode v2, nothing sent before), the choice is remembered, Reject keeps it off. Never on admin, sign-in or API pages, never on localhost (`?bizz-ga-preview` shows it locally). Any element with `data-cookie-settings` reopens the banner. Install works around an upstream slug clash for code-registered plugins.

### Security
- Blocked upstream's unauthenticated `POST /auth/seed-admin`, which creates or resets an admin account with a publicly known password. It now returns 404 on every BizzCMS site.

### Fixed
- Admin, sign-in and API pages could hang for about 20 seconds on the live site. The framework keeps start-up state as one shared promise per Worker isolate; when the request that started it was cancelled (tab closed, link clicked twice), that promise never settled and every later request on the isolate waited for it. Framework calls now always run to completion (`src/upstream.ts`, `ctx.waitUntil`).

### Changed
- Content editor: "Preview Content" became "View on Website" and opens the published page in a new tab (pages by path, posts at /blog/<slug>) instead of upstream's bare preview page.
- bizzcms.com is live: README, package.json (homepage, repository, issues), the API description's contact link and the GitHub repository website now point to https://bizzcms.com.
- Wordmark in Inter Tight regular in the admin and on sign-in pages, like the website; the version badge uses the theme colours in light and dark.
- Admin footer and README: "Made with ♥ by Ingenium" (links to ingenium.software).
- Dark mode: the page body and the shell behind the sidebar use the dark teal canvas instead of near-black.
- Sign-in pages: the logo links to the website's home page on every page (login, register, reset password, invitation, two-step); two-step verification now shows the logo.
- Dashboard: the requests chart uses the theme (dark teal #086568 on light, lime on dark, follows the switch); storage numbers no longer lime on white; side cards line up with the chart; a plain empty state replaces the "System ·" placeholder; dark cards use the dark teal surfaces on every admin page.

## [0.2.2] - 2026-10-08

### Added
- Settings › API: the REST API is closed by default. Anonymous requests to `/api` get 401 (health checks excepted); signed-in users and API keys (Plugins › API Keys) work as before. An administrator can open it for anonymous reading. See docs/api-access.md.

### Changed
- Documentation updated.
- The BizzCMS mark gets a thin dark-teal border inside the C; the centre stays transparent.
- Wordmark: "CMS" in green (dark teal #086568 on light, lime on dark) in the admin, sign-in pages, site header/footer and the logo files.
- One button standard across the admin, taken from the Migrations page: 40px high, 10px corners, 12px medium text, 16px icons. Teal primary, outlined secondary, red danger (Truncate All Data, Deactivate).
- Roles & permissions: the "Compare roles" checkboxes became toggle pills with a check mark.
- API Reference: method badges are soft tinted pills; stat numbers no longer use lime on white.
- `/api/system/info` reports BizzCMS and its version.

## [0.2.1] - 2026-10-08

### Added
- New BizzCMS mark in the theme colours: teal blades, a lime ring and a transparent "C" cut-out; dark-background, mono and app-icon versions (source set in `sites/_templates/logo/bizzcms-teal`). Apple touch icon.
- Registration asks to repeat the password; checked in the browser and on the server.
- Global palette layer in `admin.css`: upstream accent colours (cyan, blue, indigo, purple, pink) map to the BizzCMS teal family on every admin and sign-in page, while red, green and amber keep their meaning.
- Blog styles: featured first post, card grid with artwork panels, article typography (quotes, code, images, tables) and an end panel.

### Changed
- All sign-in pages (login, register, reset password, invitation, two-step) use the workspace look in light and dark; register shows the BizzCMS logo and "Create your account".
- Collections, Roles & permissions and Database tools follow the content library and Migrations layouts; the core landing page feature row became cards.
- Blog posts may contain images (web or site addresses only) and tables.

### Fixed
- A blog post containing any HTML attribute (for example pasted content) crashed the post page (500).
- Upstream text shown double-escaped ("Roles &amp; Verbs", "&mdash;").
- Collection row action buttons had different sizes; the active tab label could be teal on teal; stats-tile numbers were invisible; table rows stayed tinted after hover classes were matched too broadly.


### Added
- Blog at /blog with post pages, safe article HTML and a refreshed core landing page (`public/brand/landing.css`).
- Admin workspace bar (breadcrumb and "View website"), redesigned content library, settings tabs, media rail and migrations cards.

### Changed
- Admin palette is teal and lime to match the BizzCMS website; the BizzCMS mark stays blue.
- The OpenAPI spec at /api is "BizzCMS API" with BizzCMS contact and licence, pretty-printed; the admin Docs menu calls it "OpenAPI spec (JSON)" and Developer Docs points to GitHub.
- Plugins screen: a line icon per plugin in BizzCMS tiles instead of emoji, readable names for the two raw ids (Magic Link Login, Email Delivery Sync), tidier descriptions, and rounder cards.

## [0.2.0] - 2026-10-08

### Added
- BizzCMS admin theme (`public/brand/admin.css`): BizzCMS blue for primary buttons and the active menu item, a soft background with a floating content sheet, navy headings, cleaner tables, and no divider lines in the sidebar.
- One consistent line-icon set in the sidebar (Lucide icons).
- Light and dark mode. Light is the default, and a "Dark mode / Light mode" switch sits in the sidebar (a round button on the sign-in pages). The choice is remembered.
- New BizzCMS mark as SVG (admin logo, favicon, landing page).

### Changed
- The starter blog post is "Welcome to BizzCMS" and stays that way after framework upgrades.
- The admin shows BizzCMS everywhere: plugin names, authors and descriptions, and the new-collection screen.
- The version badge always shows the BizzCMS version; some pages showed the framework version.
- The GitHub home is now github.com/BizzCMS/bizzcms.

### Fixed
- Upstream dark-only screens are readable in light mode: sign-in pages, plugin screens, new-collection screen, migrations, stats bars and the version badge (contrast scan of all 39 admin pages).

## [0.1.0] - 2026-09-16

### Added
- First local version: Pages and Posts collections, the BizzCMS name and logo in the admin, read-only MCP, local setup without a cloud account.
