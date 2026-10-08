# Initial research

Research date: 2026-09-16. This is a source/documentation review, not a running application assessment, full security audit, or performance benchmark.

## Lessons from earlier in-house systems

Concepts carried over: content types with parent relationships, languages, titles/slugs, SEO fields and publication dates; menus, galleries, forms, roles and e-mail templates. Two patterns to avoid: writing to the database (visit counters) while rendering public pages, and storing uploads on the local disk instead of external storage. No legacy code was copied.

## Open-source comparisons

| Project | Useful inspiration | Compatibility caveat |
| --- | --- | --- |
| SonicJS | Hono/TypeScript, schema-driven admin and REST API, Workers/D1/R2, HTML-based admin interactions | Documents self-hosting with SQLite; MySQL/cPanel and remote D1 mode need investigation |
| Flare CMS | Preview, media workflows, editing UX, Astro integration | SonicJS fork targeting Workers/D1/R2; additional workflows/plugins may exceed minimum scope |
| Payload | Collections, globals, fields, hooks, permissions | Official database adapter overview lists PostgreSQL, SQLite, MongoDB; not MySQL |
| PocketBase | Compact administration, integrated users/files/API, installation simplicity | Go executable and embedded SQLite do not match Workers/MySQL architecture |

Sources:

- https://github.com/SonicJs-Org/sonicjs
- https://sonicjs.com/
- https://github.com/jjaimealeman/flarecms
- https://payloadcms.com/docs/getting-started/concepts
- https://payloadcms.com/docs/database/overview
- https://github.com/pocketbase/pocketbase

SonicJS is the preferred starting point based on the owner's desire to save time. This does not establish production readiness, measured size, or full compatibility. Marketing response-time claims were not independently verified. Flare CMS is a related fork, not an independent architectural validation of SonicJS.

Directus documentation was also screened for SQL database support, but it was not selected as the lightweight Workers foundation. No detailed adoption or licensing assessment of Directus was performed.
