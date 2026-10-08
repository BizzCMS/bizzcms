# MCP server (AI assistants)

Every BizzCMS site has a read-only Model Context Protocol server, so AI assistants can read your pages and posts.

- Admin page: **/admin/mcp** (shows the endpoint, the tools and ready-to-copy client configs).
- Endpoint: **/mcp** (JSON-RPC over HTTP POST).
- Access: a signed-in user or an API key (Plugins › API Keys), sent as `Authorization: Bearer sk_…`. Anonymous calls get error -32001.
- Exposed: pages and posts, read-only, up to 25 items per list.
- Tools: `list_collections`, `list_pages`, `get_pages`, `list_posts`, `get_posts`. There are no write tools.

MCP is separate from the REST API, so the API access setting ([api-access.md](api-access.md)) does not change it: it always needs a login or an API key.

## Connect a client

1. In the admin, open **MCP** and click **Mint API Key**. Keep the key out of Git.
2. Add the server to your client with the URL `https://your-site.com/mcp` and the key as a Bearer token. The admin page has configs for Claude Code and Cursor.
3. For [Lucy](https://justlucy.ai): Connectors › Add custom, enter the URL and the key (just `sk_…`).

A client running in the cloud cannot reach a site on your own computer (127.0.0.1); use a deployed site.
