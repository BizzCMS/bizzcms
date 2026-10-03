# Architecture and compatibility

## Intended deployment matrix

| Mode | Runtime | Database access | Permanent media |
| --- | --- | --- | --- |
| Cloudflare | Workers | D1 native binding | R2 default; S3 optional |
| cPanel independent | Node.js | Local MySQL | R2 or S3 |
| cPanel hybrid | Node.js | Remote D1 through server-side HTTPS access | R2 or S3 |

None of these modes has been implemented in this repository. SonicJS documents Workers/D1/R2 and a self-hosted SQLite path. That does not establish MySQL/cPanel, generic S3, or remote D1 support.

Local evaluation now runs SonicJS 3.0.0-beta.28 on Wrangler's Workers emulator with emulated D1/R2/KV. This is not a deployed hosting mode. See local-development.md for tested behaviour, dependency overrides, and limitations.

## Reuse-first approach

Use the SonicJS core package and supported extension points where practical. Keep branding, collection definitions, site templates, and integrations in BizzCMS. Pin the selected upstream version and document upgrade steps. A maintained fork is a fallback only after the compatibility investigation demonstrates why it is necessary.

TypeScript is the intended language. Hono is a relevant shared HTTP layer because SonicJS uses it and it supports Workers and Node.js. The exact admin frontend and website renderer are not selected; prefer retaining upstream functionality over replacing it for stylistic reasons.

The desired user-facing product includes both the website and its admin. Do not require clients to manually assemble separate frontend and CMS projects. Packaging details depend on upstream capabilities.

## Database boundary

Use the same logical content model across D1 and MySQL, not necessarily identical SQL or drivers. Earlier discussion considered PostgreSQL/MySQL; the complete-Cloudflare requirement changed the proposed engines to D1/MySQL. PostgreSQL through Hyperdrive is separately hosted and does not satisfy the intended native Cloudflare database option.

Investigate queries, schema changes, migrations, generated IDs, JSON handling, search, pagination, batch/transaction semantics, and authentication storage before estimating a MySQL adapter. An ORM does not automatically solve these differences.

Hybrid D1 access must stay server-side. Never expose database API credentials to browsers. Evaluate direct D1 HTTP API access versus an authenticated Worker gateway, including limits, latency, batching, authorization, and operational complexity before selecting one.

Cloudflare Workers running near visitors does not mean all database reads and writes happen locally to every visitor. Measure actual request paths. Cache public content safely; private previews and user-specific responses must not enter public caches.

## Media

Support R2 and S3 behind a small storage interface. Store object keys and metadata in the database. Use external object storage for originals and derivatives; no permanent local upload directory. Verify signed uploads, CORS, credentials, private/public access, public URLs/custom domains, deletion, and image transformation requirements. S3 API similarity alone is not a verified compatibility result.

## Email

Provide configurable sender/reply-to and delivery settings. Candidate events include password recovery, invitations, CMS notifications, and basic form notifications if forms enter scope.

Prefer a shared HTTPS delivery interface for both runtimes. Specific providers remain unselected. SMTP on Node.js is an optional candidate, not promised cross-runtime support. Cloudflare's documented email service has Workers, REST, and SMTP interfaces; account availability and suitability need verification. Do not assume arbitrary Node SMTP packages run on Workers.

## Portability and operations

Plan an export/import format for content, schemas, locales, menus, configuration, and media manifests. Keep secrets out of exports. Moving between deployments is an explicit migration, not live multi-primary synchronization.

Before production, verify first-admin bootstrap, authentication, permissions, preview isolation, validation, rich-text sanitization, upload restrictions, secret handling, backup/restore, and dependency licenses. Avoid building a new auth system merely to reduce dependency count.

## Primary references

- https://developers.cloudflare.com/d1/
- https://developers.cloudflare.com/hyperdrive/reference/supported-databases-and-features/
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/email-service/get-started/send-emails/
- https://docs.cpanel.net/cpanel/software/application-manager/
- https://hono.dev/docs

Reviewed during initial research on 2026-09-16. Recheck before implementation.
