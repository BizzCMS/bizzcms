# Languages plugin

One site in several languages, each language on its own addresses, so search engines can index every language.
A "language cookie" switch, where one address shows different languages, keeps Google on one language only.

## Set up

1. Admin › Plugins › Languages: install, then set **Languages**, main language first, e.g. `hr, en, de`. Optional
   **Switcher labels** in the same order, e.g. `HR, EN, DE`.
2. Activate the plugin.
3. In the site layout, put `<div data-bizz-languages></div>` where the switcher should appear (header, mobile menu…).
4. Add `...LANGUAGE_FIELDS` to page-like collections (adds the **Translation of** field).
5. Pass every public response through `withLanguages(response, request, db)`, inside the edge cache.

## Addresses and translations

- The main language lives at `/`, the others under `/<code>/`, e.g. `/en/`, `/de/ueber-uns/`.
- A translation is an ordinary page whose URL path starts with `/<code>/` and whose **Translation of** field holds
  the path of the original page, e.g. `/en/about-us/` → `/o-nama/`. Slugs can be translated.
- The home pages are `/` and `/<code>/`; they always count as versions of each other.
- Content that is only in the main language (e.g. news) needs nothing: the switcher links to the home page of the
  other language.

## What every public page gets

- `<html lang>` from the address.
- `hreflang` links for the versions that exist, plus `x-default` (the main language).
- `og:locale` and `og:locale:alternate`.
- The switcher in each `[data-bizz-languages]` element. It links to the same page in the other language, or to that
  language's home page when there is no translation.

## Related settings

- **SEO › General › Site language**: the main language code. It sets the RSS `<language>`, the feed texts
  (English, Croatian and German built in) and `inLanguage` in structured data. Pages pass their own `language` to
  `seoHead` for the WebPage `inLanguage`.
- **Cookie bar** (Google Analytics plugin) and **share buttons** (Social Share plugin): English, Croatian and German
  built in. The cookie bar follows `<html lang>`; `shareBar(db, url, title, image, lang)` takes the page language.
- `setSponsoredLabels({ tag, by })` sets the "Sponsored" labels for a site in another language.

## Croatian and other languages with diacritics

Keep diacritics in titles and text (Žbukanje, Đakovo), and use ASCII in slugs (`zbukanje`, `dakovo`).
