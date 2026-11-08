# Analytics plugin

Your own visitor statistics in the admin, without cookies and without personal data. No consent banner is needed, so every visitor is counted (Google Analytics only counts visitors who accept cookies). It can run alongside the Google Analytics plugin.

## What you see

**Admin › Analytics** shows, for today, 7, 30, 90 or 365 days:

- visits and visitors, with the change against the previous period;
- a daily chart;
- top pages, referrers, countries, devices and campaigns (`utm_*`).

## Privacy

- A visitor is counted once a day by a hash of IP address and browser with a random salt for that day. The salt is deleted after two days, so the hashes can never be traced back to a person.
- No cookies, no local storage, no personal data stored.
- Bots and crawlers are not counted.

## Set up

1. Admin › Plugins › Analytics › **Install**, then **Activate**.
2. The site wires three calls from `src/plugins/analytics.ts`:
   - `analyticsHit(request, db, kv, ctx, { timeZone })` for `POST /_bz/hit`, before its page handling and cache;
   - `withAnalytics(response, request, db)` on public pages (adds the small counter script while the plugin is active);
   - `analyticsAdminRoute(request, path, db, fetcher, isAdmin)` for the admin page and the plugin's Install button.

Switched off, nothing is added to the pages and nothing is counted.
