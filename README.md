# BizzCMS

**Free, open-source headless CMS for business websites.**

Website: **https://bizzcms.com** · Repository: https://github.com/BizzCMS/bizzcms · Licence: MIT

BizzCMS is an open-source CMS built on SonicJS. Pages, a blog and media in a clean admin, with roles, two-step login, a REST API that is closed by default, API keys and read-only MCP access for AI assistants.

**Status: in production.** bizzcms.com itself runs on BizzCMS (Cloudflare Workers, D1 and R2) since 2026-10-08. SonicJS 3.0.0-beta.28 is pinned. Hosting on Node.js / cPanel is on the roadmap (see [docs/roadmap.md](docs/roadmap.md)), not available yet.

## Run locally

Use Node.js 22 or newer (tested with Node 24 on Windows):

```powershell
cd C:\RepositoryAI\bizzcms
npm ci
npm run setup
npm run dev
```

Open http://127.0.0.1:8787/admin. Setup creates `admin@bizzcms.local` with a random password saved in the gitignored `private/local-admin.txt`. Repeat setup safely without resetting your account or content. On later starts, only `npm run dev` is needed. Stop the server with Ctrl+C.

No Cloudflare account is required. D1, R2, and KV are **locally emulated** under `.wrangler/`; this is a development-only exception to external production media storage. Email is logged to the server console, not delivered. See [local development](docs/local-development.md) for limitations and dependency pins.

## Intended deployment options

| Mode | Application and website | Database | Media |
| --- | --- | --- | --- |
| Primary | Cloudflare Workers | Cloudflare D1 | R2 or S3 |
| Independent alternative | Node.js on cPanel | Local MySQL | R2 or S3 |
| Hybrid alternative | Node.js on cPanel | Cloudflare D1 through server-side access | R2 or S3 |

cPanel is an alternative for clients who request it, not automatic failover. Node.js support is required; PHP is not planned. External media storage is intentional in every mode.

## Documentation

- [Product requirements](docs/product-requirements.md)
- [Architecture and compatibility](docs/architecture.md)
- [Decisions and discussion history](docs/decisions.md)
- [Store4 and open-source research](docs/research.md)
- [Next steps and acceptance criteria](docs/roadmap.md)
- [Local development](docs/local-development.md)
- [Branding and admin theme](docs/branding.md)
- [API access (closed by default)](docs/api-access.md)
- [MCP setup and verification](docs/mcp.md)
- [Changelog](CHANGELOG.md) and [releasing](docs/releasing.md)
- [Contributing](CONTRIBUTING.md)
- [Agent instructions](AGENTS.md)

## License and attribution

Original BizzCMS material is available under the [MIT license](LICENSE).

**BizzCMS is built on SonicJS.** Its package license is preserved in [licenses/sonicjs-MIT.txt](licenses/sonicjs-MIT.txt). See [third-party notices](THIRD_PARTY_NOTICES.md).

Made with ♥ by [Ingenium](https://ingenium.software/).
