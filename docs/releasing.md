# Releasing BizzCMS

## Version numbers

`MAJOR.MINOR.PATCH` ([semver](https://semver.org)). While BizzCMS is in early development it stays at **0.x**:

- **Patch** (0.2.0 → 0.2.1): fixes only, nothing new for users.
- **Minor** (0.2.x → 0.3.0): new features, visible admin changes, or anything a site owner should read about.
- **1.0.0**: when BizzCMS is deployed in production and the hosting modes on the roadmap work.

The version lives in `package.json`. The admin shows it next to the logo, and sites built on BizzCMS show the core version they run (`npm run sync:core` copies it).

## While working

Add a line under `## [Unreleased]` in `CHANGELOG.md` with every change (Added / Changed / Fixed / Removed).

## When to release

Release when a batch of work is finished and pushed: at the latest at the end of a working day with changes, and always before a deploy. Don't release for docs-only changes.

## How

```
npm run release:patch     # or release:minor
```

The script:

1. Bumps `package.json` and `package-lock.json`.
2. Creates the commit "Release x.y.z" and the tag `vx.y.z`.
3. Pushes both.

Afterwards:

1. In `CHANGELOG.md`, rename `[Unreleased]` to the new version with today's date and add a fresh empty `[Unreleased]`. Doing this before running the script, in the same commit, is better.
2. Create the GitHub release from the changelog section: `gh release create vx.y.z --title "BizzCMS x.y.z" --notes-file <section>`.
3. In each site repo (sites\bizzcms-site and others), run `npm run sync:core`, then commit and push.

Commit messages are plain: no tool or AI attribution lines.
