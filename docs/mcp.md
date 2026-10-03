# Local MCP

Enabled in src/index.ts using SonicJS's built-in mcpPlugin.

- Dashboard: http://127.0.0.1:8787/admin/mcp (administrator login required).
- Endpoint: http://127.0.0.1:8787/mcp (JSON-RPC POST).
- API keys: http://127.0.0.1:8787/admin/plugins/api-keys.
- Exposed collections: pages and posts only, read-only, limit 25.

Available tools: list_collections, list_pages, get_pages, list_posts, get_posts. No write tools are exposed. Reading drafts depends on the authenticated user's permissions.

For an external MCP client, create an appropriate API key and configure the HTTP endpoint with `Authorization: Bearer <key>`. Keep keys out of Git. A remote/cloud client cannot reach your computer's 127.0.0.1 endpoint. Client-specific transport compatibility remains to be tested.

Verified on 2026-09-16 using an authenticated local session: dashboard HTTP 200, initialize, tools/list, and list_collections. Unauthenticated tools/list returns a JSON-RPC unauthorized error. API-key client integration has not yet been tested. The upstream protocol currently identifies itself as sonicjs-mcp 1.0.0; this is distinct from the BizzCMS product version.

The upstream beta's DefinedPlugin and SonicJSConfig declarations disagree on legacy route/lifecycle signatures. A narrow type assertion bridges that declaration mismatch; runtime mounting and the operations above were verified.
