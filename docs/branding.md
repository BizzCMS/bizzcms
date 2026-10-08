# BizzCMS branding

- Product name: BizzCMS.
- Display version: package.json version (currently 0.1.0), passed into SonicJS configuration.
- Product URL: https://bizzcms.com. No DNS or production deployment changes have been made.
- Logo: owner-supplied mark, used as SVG at public/brand/bizzcms.svg (2026-10-08: a clean trace of the owner's image, with blue #0f6cb6, fold lines #0b4f86, navy #123d62 and white). public/brand/bizzcms.png is a 256 px render of it, kept as a PNG favicon fallback. It is a bundled interface asset, not a customer media upload. The wordmark next to it is weight 600 in the logo navy.
- Tagline: Lightweight content management for business websites.

The upstream admin/auth HTML is adapted by src/branding.ts using Workers HTMLRewriter. This replaces product titles, the upstream wordmark, favicon, default name/description, and the main product link without modifying node_modules. Author/license metadata and stored customer content are not globally renamed. Validate these selectors when upgrading SonicJS.

The root route is the first local BizzCMS website preview; /about preserves upstream attribution. The landing page currently uses a code template in src/landing.ts and is not yet edited through the CMS. It describes current capabilities and roadmap separately. The domain is a product link, not the local login origin.

Verified: branded login HTML, authenticated collections/settings screens, displayed 0.1.0 version, logo asset response, settings save, and local homepage. TypeScript check passes.

Admin colour scheme (2026-10-08): the admin is light (white) by default. Upstream hard-codes `class="dark"`. `src/branding.ts` removes it and only re-adds it when a user picked dark with the admin's own toggle (`localStorage.darkMode`). Upstream's dark-only auth pages and the stats bars get small light overrides (`LIGHT_AUTH`, `LIGHT_FIXES`). Verified on login, dashboard, content, editor, collections, media, settings and users.

Welcome post (2026-10-08): SonicJS seeds a "Welcome to SonicJS" blog post on startup and seeds it again whenever no post with slug `welcome-to-sonicjs` exists, for example after an upgrade. `src/welcome.ts` turns it into "Welcome to BizzCMS" (slug `welcome-to-bizzcms`) and keeps a deleted placeholder with the old slug, so upstream never brings its version back. The new-collection screen's "SonicJS uses code-first…" sentence also says BizzCMS. Upstream SonicJS is still credited where it is real: plugin authors (Plugins screen), code examples (`@sonicjs-cms/core`), /about, README and the licence notices.
