# Notes for AI coding agents

- Read the [README](README.md), [features](docs/features.md) and [local development](docs/local-development.md) first.
- Admin look and behaviour live in `src/` (`branding.ts`, `public/brand/admin.css` and the feature files); never edit `node_modules`.
- Keep the REST API closed by default ([api-access.md](docs/api-access.md)).
- Never commit credentials, `.dev.vars`, `private/` or client content.
- Every change gets a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md); run `npm run type-check` before committing.
- No AI co-author or attribution lines in commits or pull requests.
