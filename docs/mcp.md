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
4. For [Lucy](https://justlucy.ai): Connectors › Add custom, enter the URL and the key (just `sk_…`).

A client running in the cloud cannot reach a site on `127.0.0.1`; use a deployed site.

## Tools reference

| Tool | Read | Write |
|---|---|---|
| `list_collections` | ✓ | — |
| `list_pages` | ✓ | — |
| `get_pages` | ✓ | — |
| `create_page` | — | when pages write is on |
| `update_page` | — | when pages write is on |
| `list_posts` | ✓ | — |
| `get_posts` | ✓ | — |
| `create_post` | — | when posts write is on |
| `update_post` | — | when posts write is on |
