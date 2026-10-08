# Local development

## Start

Node.js 24 (LTS) and npm; `.nvmrc` pins the major version.

```bash
git clone https://github.com/BizzCMS/bizzcms.git
cd bizzcms
npm ci
npm run setup
npm run dev
```

Open http://127.0.0.1:8787/admin and sign in as `admin@bizzcms.local` with the generated password in `private/local-admin.txt`. Setup is repeatable: it runs the migrations and never resets an existing account or content. Later, `npm run dev` is all you need; stop it with Ctrl+C. If port 8787 is taken, stop the earlier instance instead of starting a second one.

## What runs locally

- The full admin: pages, posts, categories, media, users and roles, plugins, settings, SEO.
- D1 (database), R2 (media) and KV (cache) emulated by Wrangler, kept under `.wrangler/`.
- E-mail is printed to the console instead of sent.
- No Cloudflare account is needed.

## Data and secrets

`.dev.vars` holds generated authentication secrets and `private/local-admin.txt` the local login. Both are ignored by Git, as is `.wrangler/`. Delete `.wrangler/` only when you want to start with an empty local database.

The dev server listens on 127.0.0.1 only. The resource IDs in `wrangler.toml` are placeholders for local use; a production deployment needs its own D1, R2 and KV resources and secrets.

## Dependency pins

`package.json` pins the authentication library and its database adapter (npm `overrides`) to versions that work with the current schema, and pins two packages to versions without known advisories. The lockfile captures the tested dependency tree. Check these pins when upgrading dependencies.

## Checks

- `npm run type-check` before every commit.
- Try the changed admin screens in a browser: sign in, open and save a page and a post.
