# BizzCMS branding and admin theme

Current state as of 0.2.1 plus the unreleased work in [CHANGELOG.md](../CHANGELOG.md). Everything here is done at the application boundary (`src/branding.ts` with Workers HTMLRewriter, plus `public/brand/admin.css`); `node_modules` is never patched. Check these selectors whenever SonicJS is upgraded.

## Identity

- Product name: BizzCMS. Tagline: Lightweight content management for business websites.
- Version: `package.json`, shown as the badge next to the logo, in `/api` and in `/api/system/info`. Release rules: [releasing.md](releasing.md).
- Product URL: https://bizzcms.com (site repository BizzCMS/bizzcms-site). No DNS or production deployment changes have been made.
- Colours: teal `#086568` (hover `#064e50`, light `#0c8987`), lime `#c4f56a`, deep teal `#102f31`, ink `#172e30`.
- Font: Inter in the admin; Inter Tight 600 for the wordmark.

## Logo

- Mark: teal blades, a lime ring and a transparent "C" cut-out with a thin dark-teal border inside it. No white or black fill in the middle.
- Wordmark: "Bizz" in ink, "CMS" in green (teal `#0c8987` on light backgrounds, lime on dark).
- Source set: `C:\RepositoryAI\sites\_templates\logo\bizzcms-teal`: mark (normal, gradient, dark background, mono teal and white), app icons (deep and light tile), full logos (light and dark), PNG exports 512/192/180/32, `favicon.ico` and `preview.png`.
- In this repository: `public/brand/bizzcms.svg`, `bizzcms-dark.svg`, `bizzcms-icon.svg`, `bizzcms.png` (256 px favicon fallback) and `apple-touch-icon.png`. These are bundled interface assets, not customer uploads.

## Admin theme

- Light (white) by default. Upstream hard-codes `class="dark"`; `src/branding.ts` removes it and re-adds it only when the user picked dark (`localStorage.darkMode`). The switch is "Dark mode / Light mode" under Settings in the sidebar and a round button on sign-in pages.
- Global palette layer (`admin.css`): upstream accent colours (cyan, sky, blue, indigo, violet, purple, pink) map to the teal family on every admin and sign-in page. Red, green and amber keep their meaning. Selectors match whole class tokens only, so `hover:` and `dark:` variants never fire permanently. Lime is a fill colour; lime text on white shows as teal.
- Sidebar: Lucide icons (`src/icons.ts`, credited in THIRD_PARTY_NOTICES.md); the selected item is teal with a lime icon.
- Buttons, one standard taken from the Migrations page: 40px high, 10px corners, 12px medium text, 16px icons. Teal primary, outlined secondary, red danger. Table row icon buttons, tabs, the sidebar and menus keep their own styles.
- Pages restyled to the content-library layout: dashboard, content, collections, users, roles and permissions (compare roles are toggle pills), media, plugins, settings (General, Security, Migrations, Database Tools, API), API Reference (tinted method badges) and all sign-in pages (login, register with "Repeat password", reset, invitation, two-step).
- Plugin names, icons and descriptions show BizzCMS wording (`PLUGIN_TITLES`, `pluginIcon`).
- Text fixes: literal `&amp;` and `&mdash;` left by upstream markup are repaired in the browser (`ENTITY_FIX`).

## SonicJS credit

The welcome post is "Welcome to BizzCMS" (`src/welcome.ts` keeps a deleted placeholder with the old slug, so upstream does not seed its own post again). SonicJS stays credited where it is real: /about, README, licence notices, the Docs menu and the API description ("Built on SonicJS").

## Sites

Sites built on BizzCMS copy this admin layer with `npm run sync:core` (`scripts/sync-core.mjs` in BizzCMS/bizzcms-site and BizzCMS/ingeniumweb-site; planervjencanja not yet). Change it here first, then sync.
