# Abuse guard (`src/plugins/abuse-guard.ts`)

Visitors may never enter script or markup. Every POST outside `/admin`, `/api`, `/auth` and `/files` is checked
before the site handles it:

- a value with markup that runs or loads something (`<script`, `<img`, `<iframe`, `<svg`, `<style` …, inline
  handlers such as `onerror=`, `javascript:` / `data:text/html` URLs, encoded `<`) is refused (400) for a
  visitor who is not signed in;
- a signed-in account that sends one is **blocked at once**: `auth_user.is_active = 0`, all its `auth_session`
  rows deleted, cookies cleared, a "blocked" page (403), and `notify` is called (page, field, IP, first 300
  characters) so the site can e-mail the team;
- the engine's sign-in does not look at `is_active`, so the guard refuses sign-in for a blocked e-mail on the
  site's sign-in paths and signs out an old session in the private areas;
- admin accounts are never blocked (the input is still refused).

Ordinary text (`<3`, `2 < 3`, `<b>`, `bonus=5`) passes. Pages escape all output regardless; the guard stops the
attempt and the attacker. Re-enable an account in Admin › Users.

## Wiring a site

```ts
import { setAbuseGuard, withAbuseGuard } from './plugins/abuse-guard'
setAbuseGuard({
  signIn: /^\/(account|companies)\/login\/?$/,
  private: /^\/(account|companies)(\/|$)/,
  texts: { blockedTitle, blockedBody, refusedTitle, refusedBody },
  notify: e => sendMail({ to: TEAM, subject: `Account blocked: ${e.email}`, text: `${e.path} ${e.field} ${e.ip}\n${e.value}` })
})
// in fetch, around the site's own routes:
return withAbuseGuard(request, env.DB, req => cms.fetch(req, env, ctx), () => handle(request, env, ctx))
```

Sites copy the file with `scripts/sync-core.mjs`. First used by planervjencanja.hr (`src/abuse-guard-site.ts`).

## Admin › Security

The guard is the **Security** plugin (`abuseGuardPlugin`, id `abuse-guard`): a card under Plugins, a sidebar entry and
`/admin/abuse-guard` (administrators only; register `abuseGuardPlugin` and route `abuseGuardAdminRoute` before the
engine). **Log** tab: every refused or blocked attempt, signed-out ones too (table `bizz_abuse_log`, newest 5000 kept,
values shown escaped). **Blocked accounts** tab: accounts with `is_active = 0` and their last attempt, with an
**Unblock** button (POST, same-origin). The protection has no off switch.
