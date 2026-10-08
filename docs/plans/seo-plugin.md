# Plan: SEO plugin

Status: **proposal, waiting for the owner's yes.** Nothing is built yet.

## Why

SEO is spread out today. Pages have SEO title and description, bizzcms.com pages also a share image. Categories have SEO fields. Posts have none. Each site writes its own sitemap.xml, robots.txt, llms.txt, title format and structured data, and old URLs have no redirect screen. The Ingenium import needs redirects now: thousands of old blog, tag, author and archive URLs.

One shared plugin gives every BizzCMS site the same SEO tools, and sites keep only their design.

## What the owner sees

**Admin › Plugins › SEO**, one page with tabs:

| Tab | What it does |
|---|---|
| General | Site name, title pattern (home "Brand - tagline", other pages "Title \| Brand", never an em dash), default description, default share image, Organization details for Google (name, logo, social profiles). |
| Indexing | robots.txt rules (with sitemap and llms.txt lines added automatically), a switch to keep the whole site out of search engines (for staging), llms.txt text. |
| Redirects | List of old URL → new URL with 301/302, search, add, edit, import from CSV. Hit counter, so dead redirects can be removed later. |
| Check | A list of pages and posts with SEO problems: missing description, title too long or too short, missing image alt text, duplicate titles. |

**On every page, post and category**, a small **SEO** section in the editor:
- SEO title and description, with a live length hint and a Google-style preview;
- share image (picked from Media; falls back to the featured image, then the site default);
- canonical URL (optional) and **noindex** (keep this page out of search).

## What the website gets, automatically

- `<title>`, meta description, canonical, Open Graph and Twitter tags on every public page, from the fields above and the defaults.
- `sitemap.xml` with pages, posts, categories and tags, using `published_at` for the dates; noindex items left out.
- `robots.txt` and `llms.txt` served from the plugin settings.
- Structured data for Google: Organization on the home page, Article on posts (author, dates, image), BreadcrumbList on posts and categories.
- Redirects answered before the page is rendered, so old URLs never show a 404.

Sites that already render their own tags (bizzcms.com, Ingenium) call one helper, `seoHead(...)`, instead of their own code, so nothing is printed twice.

## How it is built

- `src/plugins/seo.ts` in the core, the same pattern as the Google Analytics plugin (settings in the plugin record, cached 30 s, admin page in the BizzCMS design). Synced to all sites by `npm run sync:core`.
- SEO fields are added to the shared Posts, Pages and Categories collections (`seoTitle`, `seoDescription`, `seoImage`, `canonical`, `noindex`). Existing `seoTitle` / `seoDescription` values stay where they are.
- Redirects: SonicJS ships a "Redirect Management" plugin (exact, partial and regex matching, optional sync to Cloudflare Bulk Redirects). First step is to test it. If it works with our sites, we style it and use it; otherwise a small redirects table of our own. Either way, redirects must run before the site's own page rendering.
- No new services, no extra cost: everything stays in D1 on the site's own Cloudflare account.

## Order of work

1. **Redirects** (Ingenium needs them for the import) and the SEO section on posts and categories.
2. General settings, title pattern, share image fallbacks, `seoHead()` helper; switch bizzcms.com and Ingenium to it.
3. Automatic sitemap.xml, robots.txt and llms.txt from the plugin.
4. Structured data (Article, BreadcrumbList).
5. The Check tab.

Each step is local first, tested, and deployed only on the owner's go.

## Decisions for the owner

1. Build in this order, starting with redirects for Ingenium?
2. Redirect screen: use the SonicJS plugin if it works, or always our own small one?
3. Should the Check tab also flag missing featured images and posts without categories?
