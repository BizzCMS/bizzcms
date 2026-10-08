# Changelog

All notable changes to BizzCMS. Versions follow [semantic versioning](https://semver.org): while BizzCMS is 0.x, **minor** = new features or visible changes, **patch** = fixes. How to release: [docs/releasing.md](docs/releasing.md).

## [Unreleased]

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
