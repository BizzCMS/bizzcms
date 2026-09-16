# Initial research

Research date: 2026-09-16. This is a source/documentation review, not a running application assessment, full security audit, or performance benchmark.

## Store4 CMS reference

Inspected C:\Repository\Store4.MVC and selected referenced models in C:\Repository\Store4.Framework. The application targets .NET Framework 4.8 and references several sibling projects; its existing framework is not a suitable direct implementation for Workers.

Useful observed CMS concepts:

- Content IDs/types, parent relationships, language associations, titles/slugs, descriptions, SEO fields, publication dates.
- Categories and role associations in content saving.
- Menus, galleries, forms, roles, and email-template controllers.
- Profile/form field editing; this should not be represented as proof of a fully generic arbitrary content-schema builder.
- Website rendering through a content controller and theme infrastructure.

Evidence locations (maintainer-local, not dependencies):

- Store4.MVC/Store4/Store4.csproj: target framework and project references.
- Store4.MVC/Store4/Areas/Admin/Controllers/ContentsController.cs: content saving, metadata, categories, roles, publishing.
- Store4.Framework/Store4.Repository/Models/Content.cs and ContentType.cs: content data model.
- Store4.MVC/Store4/Areas/Admin/Controllers/FieldsController.cs: profile/form fields.
- Store4.MVC/Store4/Areas/Admin/Controllers/HtmlTemplatesController.cs: email/document templates.
- Store4.MVC/Store4/Areas/Portal/Controllers/ContentController.cs: public content rendering and language lookup.
- Store4.MVC/Store4/Areas/Portal/Controllers/FileUploadController.cs: local file saving in the legacy upload path.

One concrete performance observation: the public content controller increments Visits, changes Modified, and saves the content while rendering a page. Avoid carrying this database-write pattern into ordinary public BizzCMS requests. The observed local file upload path also conflicts with the new external-storage requirement.

Legacy code was not copied, executed, migrated, or comprehensively audited. Business modules are outside scope.

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
