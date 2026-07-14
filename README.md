<div align="center">
  <img src="assets/icons/icon128.png" width="96" height="96" alt="Capture All logo">
  <h1>Capture All</h1>
  <p>A Chrome MV3 debugging black box for capturing browser evidence and querying it through MCP.</p>
  <p><a href="README.zh-CN.md">简体中文</a></p>
</div>

Capture All collects browser activity into structured local data: user actions, navigation, network requests, console output, runtime errors, Storage changes, and Cookie changes. A local Bridge and MCP server let AI agents control captures and query the resulting evidence.

> [!WARNING]
> This extension requests broad browser permissions and can capture sensitive page content. Review the [Permissions and data](#permissions-and-data) section before use. Use it only in browsers, profiles, and sites you are authorized to inspect.

## Status

Capture All is an early-stage project. It is not published to the Chrome Web Store or npm. Install it as an unpacked extension from a local build.

No public product screenshots are tracked yet. This avoids publishing private browser content from development captures.

## Features

- Capture seven data groups: user actions, navigation, network, console, errors, Storage, and Cookies.
- Inspect captures in the popup, dashboard, timeline, request inspector, and DevTools panel.
- Export JSON, JSONL, HTML, or HAR.
- Query capture metadata and data entries with paginated MCP tools.
- Run a local authenticated Bridge bound to `127.0.0.1`.
- Store capture data locally in IndexedDB and settings in `chrome.storage.local`.
- Apply configurable URL, header, and data redaction plus unconditional size limits.

## Requirements

- Chrome or another Chromium browser with Manifest V3 support.
- Node.js `^20.19.0` or `>=22.12.0`.
- npm.

## Install from source

```bash
git clone https://github.com/TuTouPower/capture_all.git
cd capture_all
npm ci
npm run build
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `artifacts/dist` from this repository.

After rebuilding, reload the extension card on `chrome://extensions` when manifest or service worker changes are not picked up automatically.

## Development

```bash
npm run dev          # Vite development server
npm test             # Unit and integration tests
npm run build        # Extension + Bridge + MCP production artifacts
npm run test:e2e     # Base headless Playwright test
npm run scan:tracked-tree  # Scan repository candidates for secrets and private paths
npm run bridge       # Bridge from TypeScript source
npm run mcp          # MCP server from TypeScript source
```

Build outputs:

- Extension: `artifacts/dist`
- Bridge: `artifacts/bridge/bridge.mjs`
- MCP server: `artifacts/mcp/mcp.mjs`

See the [architecture](docs/omni_powers/op_blueprint/architecture.md) and [test plan](docs/omni_powers/op_blueprint/test.md) for implementation details.

## Bridge and MCP

Build the project first, then create the project-local MCP configuration:

```bash
cp .mcp.json.example .mcp.json
```

Replace `<YOUR_BRIDGE_TOKEN>` in `.mcp.json` with a random token you provide. Use the same token in the extension settings and when starting the Bridge:

```bash
CAPTURE_ALL_BRIDGE_TOKEN='<your token>' \
    node artifacts/bridge/bridge.mjs --port 17831
```

The Bridge binds only to `127.0.0.1`. Keep `.mcp.json` local; it is ignored by Git. Do not put real tokens in source files, documentation, issues, or capture exports.

The MCP server provides status, capture control, paginated data queries, timeline queries, and export commands. See the [MCP usage guide](docs/mcp_usage.md) for the tool list and configuration fields.

## Permissions and data

| Permission | Purpose |
|---|---|
| `storage` | Store user configuration in `chrome.storage.local`. |
| `webRequest` | Observe request and response metadata. |
| `debugger` | Use Chrome DevTools Protocol for console, runtime error, and configured body capture. |
| `tabs` | Discover tabs and coordinate capture content scripts. |
| `alarms` | Keep the MV3 service worker capture lifecycle active. |
| `downloads` | Save local export files. |
| `cookies` | Capture Cookie changes. |
| `<all_urls>` | Run the declared content script and observe authorized pages across origins. |

Capture data is stored in the extension's local IndexedDB database, `capture_all_db`. Settings are stored in `chrome.storage.local`. The Bridge transfers data only between the extension and authenticated local clients on `127.0.0.1`; using MCP may expose queried data to the connected AI agent.

Use the dashboard capture list for deletion and storage management. Removing the extension or clearing its site data also removes local extension storage. Exported files are independent copies and must be deleted separately.

## Known limitations

- `<all_urls>` and `all_frames: true` allow the declared content script to run in top-level pages and embedded third-party frames. Authorized captures may therefore include activity or metadata from payment, authentication, chat, advertising, and other embedded frames.
- `<all_urls>`, `debugger`, `tabs`, and `cookies` are high-impact permissions required by the current capture model.
- Redaction reduces risk but cannot guarantee removal of every secret or personal value.
- Input values and request/response body capture are enabled by default. These data can include credentials, tokens, private messages, or personal information. Review and disable these options before the first capture when they are not required.
- The Bridge accepts ordinary JSON bodies up to 1 MiB and extension result bodies up to 32 MiB. Use paginated `list_records` queries or local export for larger captures.
- One capture is limited to 500 MB and 24 hours; individual body capture is limited to 100 MB.
- MCP does not expose capture deletion or database clearing commands.
- This project has no Chrome Web Store package, npm release, compatibility guarantee, or support SLA yet.

See [PRIVACY.md](PRIVACY.md) for capture, storage, MCP/AI, export, and deletion behavior. See [SECURITY.md](SECURITY.md) for current private-reporting availability; never publish sensitive evidence in an issue.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Run `npm test`, `npm run build`, and `npm run test:e2e`; follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md); and never attach unredacted captures, tokens, request bodies, or browser data to a public issue. Release history is tracked in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [Apache-2.0 License](LICENSE).
