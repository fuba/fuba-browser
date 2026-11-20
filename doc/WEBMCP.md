# WebMCP bridge

Fuba Browser provides a Streamable HTTP MCP endpoint at `/mcp` on the existing API
port. It exposes WebMCP tools from the main browser page and the same-origin
frames visible through that page's native WebMCP discovery API. It uses the
browser's current login and page state.

## Connect

Start a container built from this revision, navigate to a WebMCP-enabled page, and
configure your MCP client with `http://localhost:39000/mcp`. For clients accepting
an MCP server configuration:

```json
{
  "mcpServers": {
    "fuba-browser": {
      "type": "http",
      "url": "http://localhost:39000/mcp"
    }
  }
}
```

The MCP endpoint speaks JSON-RPC directly. It does not use the REST API's
`{ "success": true, "data": ... }` envelope. Clients must complete MCP
initialization, retain the `Mcp-Session-Id` header, and list tools before calling
them. HTTP POST handles requests, GET provides SSE notifications, and DELETE
terminates a session.

Existing REST APIs still control navigation. For example:

```bash
curl -X POST http://localhost:39000/api/navigate \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://your-webmcp-site.example"}'
```

A page without WebMCP tools returns an empty tool list. The bridge does not add
browser navigation or evaluation tools to MCP, and does not install a WebMCP
polyfill in websites.

## Tool mapping

- Names, descriptions, input schemas, titles, annotations, and output schemas
  are forwarded when the browser exposes them. Missing input schemas become an
  empty object schema. Browser versions may omit annotations or output schemas
  from discovery even when the page registered them.
- Tool metadata includes `webmcp/origin` and `webmcp/name` under `_meta`.
- Duplicate names from same-origin frames receive distinct `__frame_...` suffixes.
  Calls retain the native tool object, so each alias targets its original frame.
- MCP-shaped results retain their content blocks, structured content, and error
  flag. Ordinary objects become `structuredContent` with a text representation;
  strings and other values become text content.
- Input is validated against the discovered schema before execution. Failures,
  cancellation, and timeouts return MCP tool errors. The default execution limit
  is 30 seconds. Cancellation reaches the native callback's `AbortSignal`;
  callbacks must cooperate to stop their own work.

The current API uses `document.modelContext.getTools()` and
`document.modelContext.executeTool(tool, arguments, { signal })`. The bridge also
recognizes `navigator.modelContext.getTools()` and the legacy
`navigator.modelContextTesting.listTools()/executeTool(name, jsonArguments)`.
The testing API compatibility branch is covered with a test fixture; the current
API is tested against native Chromium WebMCP.

Chromium starts with `WebMCP` and `WebMCPTesting` enabled. Existing GPU feature
flags are merged into the same `--enable-features` argument.

## Changes and sessions

Each client retains its own discovery snapshot. The bridge checks for changes
once a second while sessions exist and emits `notifications/tools/list_changed`.
After receiving this notification, clients should list tools again. Execution
also checks the snapshot immediately before invoking page code.

Navigation, browser reset, and frame changes invalidate old snapshots. A stale
call fails rather than looking up the same tool name on a replacement document.
Dynamic registration is reflected by the next `tools/list` without reconnecting.
The endpoint allows up to 64 sessions; idle sessions expire after 15 minutes.

The initial scope is the main controlled page and its discoverable same-origin
frames. Other tabs and popups are not aggregated. Cross-origin frame discovery
is not requested by the bridge.

## Access controls

The endpoint inherits Fuba Browser's trusted-machine/network deployment model.
It has no separate authentication layer. Use the same external authentication
and network controls as the existing REST API.

Requests carrying an `Origin` header are rejected unless that exact origin is in
`API_CORS_ORIGINS`. The wildcard `*` does not authorize origins on `/mcp`.
Native MCP clients generally omit `Origin`. Browser tool descriptions and results
remain untrusted website content; origin metadata and schema validation do not
establish that a site's tools are safe to execute.

## References

- [WebMCP specification](https://webmachinelearning.github.io/webmcp/)
- [Chromium imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [MCP Streamable HTTP transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)
