# BizzCMS

**Lightweight content management for business websites.**

Domain: **bizzcms.com** (owned by the project owner).

Public repository: https://github.com/idubravac/bizzcms

BizzCMS is a planned open-source CMS built on SonicJS. The objective is to reuse an existing CMS and keep custom development and long-term maintenance small, allowing the owner to focus on larger projects.

**Status: planning repository.** No SonicJS code, dependencies, application, or deployment has been installed yet. Hosting compatibility below is a requirement, not a claim of implemented support. The domain has not been configured by this project.

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
- [Contributing](CONTRIBUTING.md)
- [Agent instructions](AGENTS.md)

## License and attribution

Original BizzCMS material is available under the [MIT license](LICENSE).

Planned attribution: **BizzCMS — built on SonicJS.** SonicJS has not yet been integrated. Its copyright and MIT license must be preserved when incorporating or distributing its code. See [third-party notices](THIRD_PARTY_NOTICES.md).

There are no application run commands yet. This repository deliberately records the agreed direction before choosing a SonicJS version or modifying its core.
