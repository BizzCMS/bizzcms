# Product requirements

Recorded from the founding discussion on 2026-09-16.

## Product and priorities

- Name: BizzCMS. Owner reports ownership of bizzcms.com.
- Positioning: Lightweight content management for business websites.
- Open source, with MIT chosen as the initial project license following the discussion; legal copyright entity can be refined by the owner.
- Reuse SonicJS to avoid spending significant time creating another CMS.
- Lightweight means a small runtime, responsive public pages, simple editing, simple installation, and little operational maintenance. It does not mean arbitrarily removing useful CMS functionality.

## CMS scope

Candidate functionality to map against SonicJS and validate with the owner:

| Area | Intended functionality |
| --- | --- |
| Content | Pages, content types/collections, categories, custom fields, ordering |
| Editing | Rich text, reusable sections, drafts, preview, publishing, basic revisions |
| Structure | Menus, page hierarchy, slugs, redirects |
| Presentation | Themes, templates, galleries; website delivered alongside CMS |
| Languages and SEO | Translated content, locale associations, SEO metadata |
| Media | R2/S3 upload and selection, media metadata |
| Administration | Users, editing permissions, settings |
| Email | Configurable delivery and CMS notifications |

Basic contact forms are a candidate website feature, not approval to rebuild Store4's full form/business platform. Exact first-release field types, language behaviour, roles, templates, form features, and editor interactions remain to be defined.

Exclude Store4 CRM, campaigns, coupons, commerce, payments, tasks, referrals, and unrelated business modules. AI, full design canvases, analytics, plugin marketplaces, and complex approval flows are not initial requirements. Existing upstream features need not be rewritten simply to remove them; assess their actual cost.

## Hosting requirements

1. Complete application and database on Cloudflare.
2. Complete application with local database on Node.js-enabled cPanel.
3. Application on cPanel and database on Cloudflare.

Cloudflare is primary. cPanel is a client-selected independent alternative, not a standby/failover site. A standard PHP-only cPanel account is outside the intended target.

Permanent images/files must live in Cloudflare R2 or AWS S3 in every mode. Thus "entire app on cPanel" does not mean local media storage. Email may also use an external delivery provider.

Prefer application/database proximity. Avoid making the default deployment depend on a distant cPanel database. Hybrid mode explicitly accepts a network round trip to Cloudflare.

## Installation experience

Deploy an appropriate package, provide required service configuration, complete first-admin setup, and begin editing. Avoid manual directory restructuring and application-code edits. Cloudflare service provisioning and secrets setup still exist; documentation or tooling should make them straightforward.

## Proposed performance budgets — not yet approved or measured

- Initial admin JavaScript below 100 KB compressed, excluding a lazy-loaded rich-text editor.
- Public pages need only the JavaScript required by their interactive features.
- No content-database writes on ordinary public page views.
- No mandatory Redis, Docker, separate search server, or queue service merely to operate a basic CMS.

Measure upstream first. Adjust budgets openly rather than creating a large custom rewrite solely to meet an arbitrary size target.
