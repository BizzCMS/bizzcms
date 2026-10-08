# Changelog

All notable changes to BizzCMS. Versions follow [semantic versioning](https://semver.org): each release bumps the patch number (0.2.1, 0.2.2, …); the minor number moves only on the owner's request. How to release: [docs/releasing.md](docs/releasing.md).

## [Unreleased]

## [0.2.2] - 2026-10-08

### Added
- Settings › API: the REST API is closed by default. Anonymous requests to `/api` get 401 (health checks excepted); signed-in users and API keys (Plugins › API Keys) work as before. The owner can open it for anonymous reading. See docs/api-access.md.

### Changed
- Documentation: branding.md rewritten for the current theme; roadmap, decisions, README and agent guide updated.
- The BizzCMS mark gets a thin dark-teal border inside the C; the centre stays transparent.
- Wordmark: "CMS" in green (teal on light, lime on dark) in the admin, sign-in pages, site header/footer and the logo files.
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
