# BizzCMS features

Everything below is in BizzCMS today. See the [changelog](../CHANGELOG.md) for when each arrived.

## Editing

- **Visual editor with images, tables, embeds and code.** Images show as images, with an **Image** button that opens the Media library and double-click to edit the image description. Tables, figures with captions, YouTube and other embeds, code blocks and dividers are kept exactly as they are and can be moved or deleted.
- **Visual | HTML | Preview switch** on every rich text field. Edit the HTML directly when you need to, and preview it safely.
- **Never loses content.** Imported or pasted HTML is loaded without dropping anything; if a box would be emptied, BizzCMS asks first, and the server refuses a save that would blank a post or page by accident.
- **Auto-save** every 30 seconds while you edit.
- **View on Website** from the editor and an **eye** in the Content list open the published page on your site in a new tab.
- Field types for every need: text, rich text, number, date, yes/no, select, media, URL slug, lists.

## Blog and news

- Pages and posts, drafts and publishing.
- **Blog and News** in one place: each post has a section, the sidebar has **Blog** and **News** entries with counts, and the posts list has **All | Blog | News** tabs. A new post from the News tab starts as news. Sites can pin other collections (for example a portfolio) as their own sidebar entries.
- **Categories** per section and **tags**, picked with searchable multiselects (new tags with one key).
- **Featured image** with description, used on lists, the article and social share cards.
- **Sponsored posts**: one checkbox adds a "Sponsored" label and "Sponsored by …", marks links to other sites as sponsored (as Google requires) and keeps the post out of "latest posts" teasers.
- **Author** name, page and website per post (no user account needed).
- **Imports keep old addresses**: an old ID and old URL per post, so links from the old website keep working.

## SEO (built in, like Yoast)

- **SEO panel** on every page, post and category: focus keyphrase, related keyphrases, SEO title, meta description, live **Google preview** and **share preview** (Facebook, LinkedIn, X), noindex, nofollow, canonical URL, breadcrumb title, key content.
- **Auto-fill SEO** button: fills keyphrases, meta description, a shorter SEO title and image descriptions from the content in one click.
- **Live checks** with green, orange and red: 16 SEO checks (keyphrase in title, description, URL, introduction, subheadings and images; density; duplicates; lengths; links; images; headings) and readability checks (sentence and paragraph length, subheadings, varied starts, passive voice and transition words).
- **Scores in the Content list** as two dots per item.
- **Admin › SEO**: site name and title formats, company or person for Google, social profiles, default description and share image; robots.txt, llms.txt (instructions for AI assistants) and a switch to hide a staging site; **Redirects** with CSV import, wildcards and hit counts; a **Check** list of everything that needs fixing.
- Automatic **sitemaps** per content type, **robots.txt**, and **structured data** for Google: Organization, WebSite, WebPage, Article and breadcrumbs.
- **Schema map for AI agents**: `/schemamap.xml` with one structured-data feed per content type, so AI agents can read the whole site in one request instead of crawling every page. Follows the sitemap rules and is listed in robots.txt. See [docs/seo.md](seo.md).
- **Article tags for social networks**: published and modified time, section and up to six tags, so LinkedIn, Facebook and others show the date and topic of a post.
- **Choose what goes into the sitemap**: pages, blog posts, news posts, categories, tags, extra collections such as a portfolio, and the site's built-in pages, each with its own tick box.
- **Content lists sorted by date created**, with Created and Updated columns you can sort by: editing an item doesn't move it to the top.
- **Fast images**: every Media library image gets its width and height automatically (no jumping while the page loads), the top image loads first, the rest lazily.
- **Uploads made web-sized**: big photos are scaled down (2000 px by default) and saved as WebP before they are uploaded; on/off, width and quality under Settings › Images. See [docs/images.md](images.md).
- **Image sources on record**: every image in the Media library can keep its source link, author and licence. Stored for you only, never shown on public pages.
- **IndexNow**, like WordPress plugins: new, changed and removed addresses go to Bing, Yandex and the other IndexNow engines the moment you save; key file created for you; "Send all addresses now"; a log of the last results.
- **RSS feed** at `/feed/` and per section (`/blog/feed/`, `/news/feed/`), like WordPress: featured image first, author, categories and tags, full text or summary, number of posts adjustable.
- **No dead ends**: old addresses can be redirected one by one or in bulk, and every address that still ends on "page not found" is listed with its hits, ready to be redirected in one click.

## Directory (plugin)

- **Company directory** with search, filters (category, region, city, guests, price, indoor/outdoor, amenities, Premium), grid or list view, and category and city pages. See [docs/directory.md](directory.md).
- **Company profiles** with a gallery, and **date requests** for Premium companies.
- **Company portal**: companies open an account, add or take over their profile, edit it and their photos, and see their requests.
- **Your addresses and language**: every address, query word and piece of wording can be set per site, so imported companies keep their old links.
- **Region pages** with clean, indexable addresses in the sitemap, and clean filter addresses (empty filters are dropped).
- **Featured companies** shown first with a "Featured" label until a date you set.
- **Protected contacts**: phone, e-mail and links can be shown only to signed-in visitors; profile pages and their structured data never contain them.
- **Fast on large directories**: lists, filters, counts, search and suggestions read a search index kept up to date automatically, one database round trip per page.

## Languages (plugin)

- One site in several languages, each language on its own addresses, so search engines can index every language. A language switcher and "Translation of" links between pages. See [docs/languages.md](languages.md).

## Analytics (plugin)

- **Your own visitor statistics** in the admin, without cookies and without personal data, so no consent banner is needed: visits, visitors, daily chart, pages, referrers, countries, devices and campaigns. Bots are not counted. See [docs/analytics.md](analytics.md).

## Admin

- Clean, calm admin in **light and dark mode**, one design and one button style throughout.
- Dashboard with live request stats, content, media and storage at a glance.
- **Media library** on R2 (Cloudflare object storage).
- **Users and roles** (admin, editor, author) with permissions and invitations.
- **Two-step login**, repeat-password check on sign-up, risky default routes blocked.
- **Plugins** screen with on/off switches: SEO, Analytics, Google Analytics, Languages, Media, rich text editor, two-step login and more.
- **Site accounts** for visitors (for example companies in the directory): e-mail confirmation before an account can be used, and **Cloudflare Turnstile** on sign-up, sign-in and forgotten password when the Turnstile plugin is on.
- **Abuse guard**: visitors can never send script or markup through public forms; a signed-in account that tries is blocked at once. See [docs/abuse-guard.md](abuse-guard.md).

## Integrations

- **REST API, closed by default**: one switch under Settings › API, API keys for apps, an OpenAPI description.
- **MCP server** for AI assistants (Claude Code, Cursor, Claude.ai, [Lucy](https://justlucy.ai) and others) with an API key: read pages, posts and categories; per collection, optional write access (create, update, publish, delete, original publish dates) and image upload to the media library. Read-only by default.
- **Google Analytics plugin** with a cookie consent banner: nothing loads until the visitor accepts (Consent Mode v2).

## Hosting and speed

- **Serverless on Cloudflare**: Workers for the app, D1 for the database, R2 for media, KV for caching. No server to patch, no PHP.
- Pages served from Cloudflare's network, close to your visitors.
- **Edge cache**: public pages are kept on Cloudflare for a few minutes (adjustable in Settings › Cache) and replaced at once whenever you save, so the site stays fast for visitors and search engines while your changes show right away. Crawlers get "not modified" answers for pages they already have.
- **Friendly error pages**: visitors never see technical errors, only a short reference code; the details are kept for you in Settings › Error log.
- Your content stays in your own Cloudflare account.
- **Fast admin and pages**: one sign-in check per request, cache settings read together with the content version, setup run once per deploy and writes finished after the response is sent.
- One admin layer for every BizzCMS site: improvements reach all sites with one command.

## Open source

- MIT licence, no licence fees.
- Source on [GitHub](https://github.com/BizzCMS/bizzcms), versioned releases with a changelog.
