# Decisions and discussion history

Date: 2026-09-16. This document separates explicit owner direction from proposed implementation choices.

## Confirmed direction

1. Create an extremely lightweight CMS informed by the CMS portion of Store4.
2. Support Cloudflare and cPanel as complete deployment alternatives.
3. Also support cPanel application hosting with a Cloudflare database.
4. Cloudflare is the primary offering; cPanel is available when a client wants it. "Backup" in this context means an alternative, not automatic failover.
5. Avoid PHP as much as possible. The working architecture uses Node.js-enabled cPanel.
6. Images/files must be external: both R2 and S3 are required storage options.
7. Configurable email options are required.
8. Keep installation and directory setup uncomplicated.
9. Focus solely on CMS features, despite Store4's broader feature set.
10. The owner has larger projects and wants minimal implementation and maintenance effort. SonicJS is the preferred foundation to investigate rather than building a new CMS from scratch.
11. The project will be open source. The owner owns bizzcms.com and selected BizzCMS as the project direction.
12. Create the local project under C:\RepositoryAI and document the discussion. This does not request a GitHub publication or production deployment.

## How the database decision evolved

- Initially, the owner asked for the same database on both platforms.
- An external MySQL database accessible from both was considered, but the owner highlighted latency between geographically distant hosting locations.
- The owner accepted different engines: PostgreSQL for Cloudflare-related hosting and local MySQL for cPanel.
- The owner then clarified that one mode must run entirely on Cloudflare. The proposed architecture changed to native D1 for Cloudflare and local MySQL for cPanel, with remote D1 access for the hybrid mode.
- D1/MySQL is the current documented proposal; SonicJS compatibility is not proven. PostgreSQL is not an additional implementation requirement at this stage.

## Current proposals, not completed implementation

- MIT for original BizzCMS work, preserving SonicJS's MIT notices when integrated.
- SonicJS package/extensions first; avoid a substantial fork.
- TypeScript with Workers/Node runtime boundaries.
- Shared logical content model with engine-specific adapters.
- One packaged CMS/site experience, minimal public JavaScript, cacheable HTML.
- Candidate performance budgets in product-requirements.md.

## Clarifications and limits

- Static-site publishing with a separately hosted editor was rejected as insufficient: the complete CMS must work in each mode.
- A provider-specific database adapter does not make all engines interchangeable without work.
- R2/S3 and email remain external services in the cPanel mode by design.
- An ambiguous mention of "invoice" was discussed in the context of branding/charging clients; it did not establish an invoicing application requirement. Do not add invoicing functionality.
- No Cloudflare account access was verified. A GitHub connector was verified in the originating session, but no BizzCMS remote was created.
- Store4 was inspected read-only. No permission to publish its proprietary source is inferred from permission to inspect it.

## Open decisions

- When should the pinned SonicJS 3.0.0-beta.28 evaluation dependency be upgraded?
- Can all three modes be supported without a substantial maintained fork?
- Are upstream S3 and email integrations adequate?
- What exact CMS features and editor experience are needed in the first release?
- How should themes, multilingual content, preview, and website rendering be packaged?
- What legal copyright holder, maintainer contact, and release process should be used?

## Publication follow-up

The owner subsequently requested public GitHub publication. On 2026-09-16, the planning repository was published at https://github.com/idubravac/bizzcms with main as the default branch. Earlier statements about no remote describe the initial planning setup. SonicJS integration, domain configuration, and deployment remain pending.

## Local evaluation follow-up

The owner then requested a working local application. SonicJS 3.0.0-beta.28 was integrated as a package with Pages and Posts collections, local Wrangler emulation, administrator setup, and console-only email. Authentication dependency overrides were required for login; see local-development.md. Local R2 emulation is a development exception, not a change to the external production media requirement. No cloud deployment or domain configuration was performed.
