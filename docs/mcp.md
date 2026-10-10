# MCP server (AI assistants)

Every BizzCMS site exposes a Model Context Protocol server so AI assistants can read — and optionally write — your content.

- Admin page: **/admin/mcp** (endpoint URL, tools, API key creation, Claude Code and Cursor config snippets, and write access settings).
- Plugin settings: **Plugins › MCP Server › Settings** (`/admin/plugins/mcp`) — list limit. An **Open MCP Server dashboard** button at the top of that page links back to `/admin/mcp`.
- Endpoint: **/mcp** (JSON-RPC over HTTP POST).
- Access: a signed-in user or an API key (Plugins › API Keys), sent as `Authorization: Bearer sk_…`. Anonymous calls get error -32001.
- Exposed: pages and posts (configurable per site). Up to 25 items per list (configurable in Plugin Settings).

MCP is separate from the REST API, so the API access setting ([api-access.md](api-access.md)) does not affect it.

## Collection write access

By default all collections are **read-only**. To let AI agents create or update content:

1. Go to **Admin › MCP Server** (`/admin/mcp`).
2. Scroll to **Collection write access** at the bottom of the page.
3. Check **Write enabled** for the collections you want agents to write to and save.

When write is enabled for a collection the extra tools (`create_<type>` and `update_<type>`) become available on the next MCP call.

Access settings are stored in the database (`bizz_settings` key `mcp.access`) and take effect immediately — no restart or redeploy needed.

## Connect a client

1. In the admin, open **MCP Server** (`/admin/mcp`) and click **Mint API Key**. Keep the key out of Git.
2. Copy the ready-made config for Claude Code or Cursor from the dashboard.
3. Add it to your client config (`~/.claude/claude_desktop_config.json` for Claude Code, or the Cursor MCP settings).
4. For **Claude.ai Connectors** (claude.ai › Settings › Connectors › Add › Custom):
   - URL: `https://your-site.com/mcp`
   - Authentication: **No sign-in**
   - Request headers → **+ Add header**: name `Authorization`, value `Bearer sk_…`
5. For [Lucy](https://justlucy.ai): Connectors › Add custom, enter the URL and the key (just `sk_…`).

A client running in the cloud cannot reach a site on `127.0.0.1`; use a deployed site.

## Tools reference

One set of tools per exposed collection (`pages`, `posts`, `categories`, …):

| Tool | Read | Write |
|---|---|---|
| `list_collections` | ✓ | — |
| `list_<collection>` (e.g. `list_posts`) | ✓ | — |
| `get_<collection>` | ✓ | — |
| `create_<collection>` | — | when write is on for that collection |
| `update_<collection>` (saves a new draft) | — | when write is on |
| `publish_<collection>` | — | when write is on |
| `delete_<collection>` | — | when write is on |
| `upload_media` | — | when any collection has write on |

`create_<collection>` refuses a slug that an existing item of that collection already uses (deleted items do not count).
Categories need `title`, an ASCII `slug` and `section` (`news` or `blog`), e.g. `{ "data": { "title": "Zanimljive građevine", "slug": "zanimljive-gradevine", "section": "news" }, "publish": true }`.

## Publish dates

`create_<collection>` and `publish_<collection>` take an optional **`publishedAt`** argument:

- ISO 8601 date: `"2016-03-15"` (taken as 12:00 UTC, so it shows the same day in every time zone)
- ISO 8601 date-time with time zone: `"2016-03-15T09:30:00Z"` or `"2016-03-15T10:30:00+01:00"`
- unix seconds: `1458043200` (number or string)

It cannot be in the future; an invalid or future value is refused with error `-32602` and nothing is
saved. With `create_<collection>` and `publish: true` the item goes live with that date; without
`publish` the date is kept on the draft and its first publish uses it. `publish_<collection>` with
`publishedAt` sets the date of an item that is already live.

Without `publishedAt`, a first publish gets the current time and **publishing again keeps the
original date** (also in the admin), so rewriting an old article does not move it to the top of the
blog or the feeds.

```json
{ "name": "create_posts", "arguments": { "data": { "title": "…", "slug": "…", "section": "news" }, "publish": true, "publishedAt": "2016-03-15" } }
```

## Media upload

`upload_media` puts an image into the media library and returns its path for `featuredImage`:

| Argument | |
|---|---|
| `url` | https link to the image (or use `base64` + `mimeType`) |
| `filename` | name in the library, e.g. `gradnja-kuce.jpg` |
| `alt` | alt text in the site language |
| `caption`, `tags` | optional |
| `source` | origin and licence, e.g. `"Unsplash, Ana Horvat, Unsplash License"` or `"AI (Flux)"` |

Answer: `{ "id", "path": "/files/<site folder>/<id>.jpg", "mimeType", "size", "alt", "source" }`.

Rules: https only; no IP addresses or internal host names; at most 3 redirects, each checked; JPEG, PNG,
WebP, GIF or AVIF only (no SVG); 10 MB at most. The link is never stored or returned, so a link with a
key in its query string is safe to pass; query strings are also cut from `source`. The file goes into the
site's own folder (`mcpWithExtras(..., { mediaFolder })`, default `uploads`).

## Cache

A successful MCP create, update, publish or delete renews the edge cache, as a save in the admin
does, so pages, sitemaps and feeds show the change right away.
