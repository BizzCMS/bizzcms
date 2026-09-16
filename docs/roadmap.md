# Next steps

## Completed in this repository

- Establish project name, positioning, and local documentation structure.
- Record requirements, decision history, source research, and technical unknowns.
- Add original-project MIT license and planned upstream attribution guidance.
- Publish the planning repository at https://github.com/idubravac/bizzcms following the owner's explicit request.

## Next: bounded SonicJS compatibility review

Before building substantial custom features:

1. Select and pin a SonicJS version; inspect extension points, dependencies, licenses, and update path.
2. Run its standard application and review the actual editor against the CMS scope.
3. Trace database access and estimate a MySQL adapter, including migrations/auth/search/transactions.
4. Verify Node.js startup under a real supported cPanel setup; a Docker demonstration alone does not establish cPanel support.
5. Prototype remote D1 access from Node.js and measure a representative page/admin request.
6. Verify R2 and generic S3 uploads, delivery, deletion, and configuration.
7. Verify configurable email delivery on both runtimes.
8. Measure build size, initial admin JavaScript, public page requests, and Node memory. Compare with the proposed budgets.

Deliverable: a concise compatibility matrix showing verified, missing, and costly features, with evidence and a recommendation to extend, minimally fork, or reconsider. Do not quietly drop hosting requirements or begin a broad rewrite.

## Then: smallest useful BizzCMS release

- Apply branding and preserve upstream notices.
- Define essential collections, page sections, menus, site settings, languages, and templates.
- Integrate the website and editor into a simple deployment experience.
- Add only the missing storage/email/database functionality established by the review.
- Document installation, upgrades, backups, and migration between deployment modes.

Cloudflare can be the first implementation milestone. All three modes remain product targets until explicitly revised; do not label unsupported modes as ready.

## Acceptance for each supported mode

- Fresh installation and first-admin setup follow documented steps without source edits or directory restructuring.
- Authorized users can create, preview, publish, edit, and restore content as scoped.
- Public visitors see published content; drafts/private content remain protected.
- Required language, navigation, SEO, and media behaviour works consistently.
- R2 and S3 are separately exercised; permanent uploads do not rely on local disk.
- Configured email delivery works for selected CMS events.
- Database migrations, backup/restore, and content export/import are verified.
- Performance results and known limitations are documented.

## Later decisions

Domain configuration, Cloudflare provisioning, release automation, commercial support, and optional features require follow-up scope. The GitHub planning repository is public; no running application has been deployed or provisioned.
