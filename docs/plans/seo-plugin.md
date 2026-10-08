# Plan: SEO plugin

Status: **built** (owner: "implement all above", 2026-10-08). Decisions taken: own redirects table (runs before the site's page rendering), readability English first, Check flags missing featured images and categories. How it works: [../seo.md](../seo.md).

## Why

SEO is spread out today. Pages have SEO title and description, bizzcms.com pages also a share image. Categories have SEO fields. Posts have none. Each site writes its own sitemap.xml, robots.txt, llms.txt, title format and structured data, and old URLs have no redirect screen. The Ingenium import needs redirects now: thousands of old blog, tag, author and archive URLs.

One shared plugin gives every BizzCMS site the same SEO tools, and sites keep only their design.

## Modelled on Yoast SEO

Editors already know Yoast from WordPress, so BizzCMS follows its shape (our own code and wording, nothing copied):

| Yoast SEO | BizzCMS SEO plugin |
|---|---|
| Yoast box under the editor: Google preview, SEO title, meta description, slug | **SEO panel** on pages, posts and categories with the same live Google preview |
| Focus keyphrase + SEO analysis with traffic lights (green / orange / red) | Focus keyphrase + checks: keyphrase in title, description, slug, first paragraph and an image alt; title and description length; links in and out; text length |
| Readability analysis | Sentence and paragraph length, subheadings every ~300 words, passive voice (English first) |
| Social tab: Facebook and X previews | **Social** tab: share title, description and image, with previews |
| Advanced: noindex, canonical, breadcrumbs title | **Advanced**: noindex, nofollow, canonical URL, breadcrumb title |
| Cornerstone content | **Key content** flag: listed first in the Check tab and in internal-link suggestions |
| Settings: site representation, title templates, separators | **General** tab: Organization or Person, logo, social profiles, title templates per type |
| XML sitemaps per content type | Automatic sitemap index with one sitemap per type (pages, posts, categories, tags) |
| Breadcrumbs | `breadcrumbs()` helper + BreadcrumbList structured data |
| Schema graph (Organization, WebSite, WebPage, Article) | The same graph, built from the settings and each item |
| Redirect manager (Premium) | **Redirects** tab, included |
| Score column in the posts list | SEO and readability dots in the Content list |

What we skip: Yoast's paid AI features, internal-linking blocks inside the editor (later, maybe), and anything that needs an external service.

## What the owner sees

**Admin › Plugins › SEO**, one page with tabs:

| Tab | What it does |
|---|---|
| General | Site name, title pattern (home "Brand - tagline", other pages "Title \| Brand", never an em dash), default description, default share image, Organization details for Google (name, logo, social profiles). |
| Indexing | robots.txt rules (with sitemap and llms.txt lines added automatically), a switch to keep the whole site out of search engines (for staging), llms.txt text. |
| Redirects | List of old URL → new URL with 301/302, search, add, edit, import from CSV. Hit counter, so dead redirects can be removed later. |
| Check | A list of pages and posts with SEO problems: missing description, title too long or too short, missing image alt text, duplicate titles. |

**On every page, post and category**, an **SEO panel** in the editor (Yoast style) with three tabs:
- **SEO**: focus keyphrase, SEO title, meta description, live Google preview, and the traffic-light checks (SEO and readability) updating as you type;
- **Social**: share title, description and image (picked from Media; falls back to the featured image, then the site default), with Facebook and X previews;
- **Advanced**: noindex, nofollow, canonical URL, breadcrumb title, Key content flag.

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

1. **Redirects** (Ingenium needs them for the import).
2. **SEO panel** with SEO / Social / Advanced tabs, Google preview, General settings, title templates, `seoHead()` helper; switch bizzcms.com and Ingenium to it.
3. **Analysis**: focus keyphrase checks and readability, with traffic lights in the editor and dots in the Content list.
4. Automatic sitemaps, robots.txt and llms.txt; structured data graph and breadcrumbs.
5. The Check tab and Key content.

Each step is local first, tested, and deployed only on the owner's go.

## Decisions for the owner

1. Build in this order, Yoast-style, starting with redirects for Ingenium?
2. Redirect screen: use the SonicJS plugin if it works, or always our own small one?
3. Readability checks in English only at first, Croatian later?
4. Should the Check tab also flag missing featured images and posts without categories?
