# Changelog

All notable changes to BizzCMS. Versions follow [semantic versioning](https://semver.org): each release bumps the patch number (0.2.1, 0.2.2, …); the minor number moves only on the owner's request. How to release: [docs/releasing.md](docs/releasing.md).

## [Unreleased]

### Changed
- Node.js 24 LTS is now the minimum (`engines` `>=24`, `.nvmrc`); verified with 24.21.0.

## [0.2.3] - 2026-10-08

### Added
- Posts › **Sponsored** (checkbox), **Sponsored by** and **Sponsored by link**. Sponsored posts stay in the blog list with a "Sponsored" label and "Sponsored by …" on the post; links to other sites in their body get `rel="sponsored noopener"` automatically; "latest posts" teasers leave them out (`NOT_SPONSORED`). Helpers in `src/sponsored.ts`, see docs/posts.md.
- `sync:core` now also copies the Posts collection and its helpers to the sites.
- Posts › **Featured image** (picked from the Media library) and **Featured image description** (alt text). Sites show it on blog lists, the post page and as the social share image; posts without one keep the site's default image. Helper: `src/featured-image.ts`.
- Plugin **Google Analytics** (Admin › Plugins): Measurement ID, consent banner on/off, banner text and policy link in a Settings tab. Public HTML pages get a cookie banner; Google Analytics loads only after Accept (Consent Mode v2, nothing sent before), the choice is remembered, Reject keeps it off. Never on admin, sign-in or API pages, never on localhost (`?bizz-ga-preview` shows it locally). Any element with `data-cookie-settings` reopens the banner. Install works around an upstream slug clash for code-registered plugins.

### Security
- Blocked upstream's unauthenticated `POST /auth/seed-admin`, which creates or resets an admin account with a password published in the SonicJS source. It now returns 404 on every BizzCMS site.

### Fixed
- Admin, sign-in and API pages could hang for about 20 seconds on the live site. SonicJS keeps start-up state as one shared promise per Worker isolate; when the request that started it was cancelled (tab closed, link clicked twice), that promise never settled and every later request on the isolate waited for it. SonicJS calls now always run to completion (`src/upstream.ts`, `ctx.waitUntil`).

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
- Settings › API: the REST API is closed by default. Anonymous requests to `/api` get 401 (health checks excepted); signed-in users and API keys (Plugins › API Keys) work as before. The owner can open it for anonymous reading. See docs/api-access.md.

### Changed
- Documentation: branding.md rewritten for the current theme; roadmap, decisions, README and agent guide updated.
- The BizzCMS mark gets a thin dark-teal border inside the C; the centre stays transparent.
- Wordmark: "CMS" in green (dark teal #086568 on light, lime on dark) in the admin, sign-in pages, site header/footer and the logo files.
- One button standard across the admin, taken from the Migrations page: 40px high, 10px corners, 12px medium text, 16px icons. Teal primary, outlined secondary, red danger (Truncate All Data, Deactivate).
- Roles & permissions: the "Compare roles" checkboxes became toggle pills with a check mark.
- API Reference: method badges are soft tinted pills; stat numbers no longer use lime on white.
- `/api/system/info` reports BizzCMS and its version instead of SonicJS.

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
- The starter blog post is "Welcome to BizzCMS" and stays that way after SonicJS upgrades.
- The admin shows BizzCMS instead of SonicJS wherever it can: plugin names, authors and descriptions, and the new-collection screen. SonicJS is credited on /about and in the repository.
- The version badge always shows the BizzCMS version; some upstream pages showed the SonicJS version.
- The GitHub home is now github.com/BizzCMS/bizzcms.

### Fixed
- Upstream dark-only screens are readable in light mode: sign-in pages, plugin screens, new-collection screen, migrations, stats bars and the version badge (contrast scan of all 39 admin pages).

## [0.1.0] - 2026-09-16

### Added
- First local version: SonicJS 3.0.0-beta.28, Pages and Posts collections, the BizzCMS name and logo in the admin, read-only MCP, local setup without a cloud account.
