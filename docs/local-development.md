# Local development

## Start

Prerequisite: Node.js 22+ and npm. Verified with Node.js 24.14.0 on Windows.

```powershell
cd C:\RepositoryAI\bizzcms
npm ci
npm run setup
npm run dev
```

Visit http://127.0.0.1:8787/admin. Sign in as `admin@bizzcms.local` using the generated password in `private/local-admin.txt`. The setup script is repeatable: migrations run locally and an existing account/content is preserved. It does not reset forgotten passwords.

For subsequent runs, use `npm run dev`. Keep that terminal running and press Ctrl+C to stop it. If port 8787 is already occupied, stop the previous BizzCMS instance rather than launching a second one.

## What works in this evaluation

- SonicJS 3.0.0-beta.28 through the npm core package; no maintained fork.
- Upstream authentication and admin interface.
- Pages collection with title, slug, rich text, and SEO fields.
- Posts collection with title, slug, summary, and rich text.
- Local D1 migrations and random-password administrator bootstrap.
- D1/R2/KV emulation with persisted local state under `.wrangler/`.
- Console email provider: logs messages rather than sending them.

The existing machine has a draft named "Welcome to BizzCMS" created through the browser during verification. It is local database content, not a tracked seed for every clone. Upstream also seeds its own welcome content and system collections.

## Data and secrets

`.dev.vars` contains generated authentication secrets. `private/local-admin.txt` contains local credentials. Both are ignored by Git, as is `.wrangler/`. Do not delete emulator state unless intentionally resetting local data. Media uploads in this environment are development fixtures stored by the local R2 emulator, not production external storage.

The server listens on 127.0.0.1 only. Cloudflare resources, domain/DNS, production credentials, and outgoing email are not configured. Do not deploy this local configuration: resource IDs are placeholders.

## Dependency compatibility

The upstream beta permits Better Auth versions that are incompatible with its current organization schema. An initial install resolved Better Auth 1.7.5 and login failed with a Drizzle schema mismatch. The application pins Better Auth, its Drizzle adapter, and telemetry package to 1.6.23 using npm overrides. Login then succeeded.

Additional overrides: Drizzle ORM 0.45.2 and csv-parse 7.0.2 address findings reported by npm audit. These exceed upstream's older declared ranges and must be reconsidered when upgrading SonicJS. The lockfile captures the tested dependency tree. The CSV import feature has not been exercised; its override is not a blanket compatibility guarantee.

## Verified on 2026-09-16

- Local migrations and administrator creation.
- Repeat setup without resetting the account.
- TypeScript check passed.
- npm audit reported zero vulnerabilities for the installed tree (not a complete security audit).
- Browser login, Pages/Posts creation menu, draft page creation, and rich-text editing/save.

## Remaining work

This is the CMS evaluation foundation, not a finished website product. BizzCMS branding and independent versioning are applied to admin/login screens, and a code-rendered landing page is available at /. See branding.md. A CMS-editable public website, publication/preview acceptance, media-upload acceptance, real R2/S3 integration, email delivery, MySQL/cPanel, remote D1 mode, and production hardening remain to be verified/implemented. Do not infer those capabilities from a successful local login.
