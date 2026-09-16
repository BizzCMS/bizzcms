# BizzCMS agent guide

Read README.md and docs/decisions.md before working. Consult docs/product-requirements.md and docs/architecture.md before implementation.

## Purpose

Create a lightweight open-source business website CMS, preferably by extending SonicJS. The owner has larger projects: minimizing development effort and ongoing maintenance is a primary constraint.

## Standing rules

- Stay within CMS scope. Store4 is a functional reference, not a mandate to port its framework or business modules.
- Prefer SonicJS packages and extension points over a fork. Investigate compatibility before promising support or replacing its core.
- Support the three documented deployment modes as the target. Clearly distinguish targets from working features.
- Primary hosting is Cloudflare Workers/D1. cPanel uses Node.js; avoid PHP.
- Media must use R2 or S3, never permanent local uploads.
- Email delivery must be configurable. Verify provider and runtime compatibility before implementation.
- Keep setup simple: no manual directory restructuring, editing application code, or mandatory Docker/Redis/search service for users.
- Do not describe all Cloudflare database operations as local to every visitor or repeat unverified performance marketing.
- Never commit credentials, production content, customer information, or unreviewed Store4 source.
- Store4 is proprietary reference material unless the owner separately authorizes code reuse and its licensing is established. Inspect concepts; do not copy it into this open-source repository.
- Preserve all upstream licenses. Clearly distinguish original BizzCMS code from third-party material.
- Use codex/ as the default prefix for working branches. Do not publish a GitHub repository, deploy, or configure the domain without a user request.
- Update documentation when decisions change. Record evidence and measured results rather than inventing benchmarks.

## Local references

- Legacy application: C:\Repository\Store4.MVC
- Referenced legacy framework: C:\Repository\Store4.Framework
- Related brand documentation: C:\RepositoryAI\tbs-presentation

These paths are optional maintainer references, not build dependencies or files contributors must possess.
