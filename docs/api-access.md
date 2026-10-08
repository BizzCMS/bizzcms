# API access

Since 0.2.2 the REST API under `/api` is **closed by default**.

## Behaviour

| Setting (Settings › API) | Anonymous visitor | Signed-in user | API key |
|---|---|---|---|
| Closed (default) | 401 on every `/api` route except health | upstream rules | upstream rules |
| Open | upstream rules: published content, collection list and API description are public | upstream rules | upstream rules |

- `/api/health` and `/api/system/health` always answer, for uptime checks.
- Drafts, media and `/admin/api/*` need a login in both modes (upstream).
- Website pages (`/`, `/blog`, site templates) read the database directly and do not use `/api`, so closing it changes nothing for visitors.

## API keys

Outside apps and servers use an API key: create one under **Plugins › API Keys** (upstream plugin). Send it as `x-api-key: sk_…` or `Authorization: Bearer sk_…`. The secret is shown once. A signed-in admin does not need a key; the login session is enough (the API Reference page and the Docs › OpenAPI spec link work as before).

## Implementation

- `src/api-access.ts`:
  - `guardApi` runs before upstream. When the API is closed it asks upstream's own `/auth/me` with the caller's cookie, `authorization` or `x-api-key` header, so session and API-key checks stay upstream's.
  - `apiSettingsPage` serves `/admin/settings/api` inside the settings layout borrowed from the General tab.
  - `withApiTab` adds the API tab to every settings page.
- Storage: our own table `bizz_settings` (`key`, `value`, `updated_at`), created on first use. Key `api.public` = `true` | `false`; missing means closed. Read once per 15 seconds per worker.
- Saving needs an admin (`/auth/me` role `admin`). A cross-origin `Origin` header is refused.

## Verified locally (2026-10-08)

- Closed: anonymous `/api`, `/api/collections`, `/api/content` and `/api/system/info` return 401; `/api/health` returns 200; the same routes return 200 for the signed-in admin, an `x-api-key` and a bearer key; a wrong key returns 401.
- Open: anonymous `/api/content` returns 200; switching back to Closed returns 401 again.
- Saving from another origin, or signed out, returns 403.
