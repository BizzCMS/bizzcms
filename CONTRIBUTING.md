# Contributing

BizzCMS is currently a local evaluation app. Start with the README and documented requirements.

For proposed implementation changes, explain the CMS need, maintenance cost, deployment compatibility, and verification. Prefer small changes using upstream SonicJS extension points. New dependencies should have a clear purpose and compatible license.

Do not submit credentials, client content, or proprietary code from other projects. Contributions are made under this repository's MIT license; retain third-party notices where applicable.

Use `npm ci`, `npm run setup`, and `npm run dev` for local evaluation. Run `npm run type-check` and verify relevant browser flows after changes. See docs/local-development.md. There are no supported production releases or automated browser tests yet.
