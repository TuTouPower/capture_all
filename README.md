<div align="center">
  <img src="assets/icons/icon128.png" width="96" height="96" alt="Capture All logo">
  <h1>Capture All</h1>
  <p><strong>A local-first browser debugging black box for humans and AI agents.</strong></p>
  <p>Capture browser evidence, inspect it visually, export it, or query it through MCP.</p>
  <p>
    <a href="README.zh-CN.md">简体中文</a> ·
    <a href="docs/mcp_usage.md">MCP guide</a> ·
    <a href="PRIVACY.md">Privacy</a> ·
    <a href="SECURITY.md">Security</a>
  </p>
  <p>
    <a href="https://github.com/TuTouPower/capture_all/actions/workflows/ci.yml"><img src="https://github.com/TuTouPower/capture_all/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache-2.0 license"></a>
    <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg" alt="Chrome Manifest V3">
  </p>
</div>

Capture All is a Chrome Manifest V3 extension that turns browser activity into structured, local evidence. It captures user actions, navigation, network requests, console output, runtime errors, Storage changes, and Cookie changes in one timeline.

Use the popup, dashboard, and DevTools panel for visual inspection. When deeper analysis is needed, connect the authenticated localhost Bridge to an MCP client such as Claude Code and let an AI agent control captures, query individual records, or export results.

> [!WARNING]
> Capture All requests broad browser permissions and can collect sensitive page content. Use it only in browsers, profiles, and sites you are authorized to inspect. Review [Permissions, privacy, and safety](#permissions-privacy-and-safety) before the first capture.

## What it captures

| Data group | Examples |
|---|---|
| User actions | Clicks, scrolling, keyboard shortcuts or keys, input changes, viewport changes |
| Navigation | Page loads, URL changes, tab activation, visibility changes |
| Network | Request and response metadata, timing, headers, and configured bodies |
| Console | `console.log`, `console.warn`, `console.error`, and related output |
| Errors | Uncaught exceptions and unhandled promise rejections |
| Storage | `localStorage` and `sessionStorage` changes |
| Cookies | Cookie creation, updates, and deletion |

## Key capabilities

- Correlate seven browser data groups in a unified timeline.
- Inspect captures through the popup, dashboard, request inspector, and DevTools panel.
- Export JSON, JSONL, HTML, or HAR files.
- Control captures and query data through MCP with pagination and time filters.
- Keep capture data local in IndexedDB unless you explicitly export or query it through MCP.
- Authenticate local Bridge access with a user-provided token.
- Redact sensitive URL parameters and headers while enforcing unconditional size limits.

## Architecture

```text
Chrome pages and frames
        │
        ▼
Capture All extension
  ├─ Content scripts          user actions, navigation, Storage
  ├─ Service worker           network, Cookies, capture lifecycle
  ├─ Chrome DevTools Protocol console, errors, configured bodies
  ├─ IndexedDB                local capture data
  └─ Popup / dashboard / DevTools panel
        │ authenticated polling on 127.0.0.1
        ▼
Local Bridge
        │
        ▼
MCP server ──► Claude Code or another MCP client
```

The Bridge binds only to `127.0.0.1`. The extension, Bridge, and MCP configuration must use the same token.

## Project status

Capture All is early-stage software. It is not published to the Chrome Web Store or npm; install it as an unpacked extension from a local build. There is no compatibility guarantee or support SLA yet.

Public screenshots are intentionally omitted until they can be produced without exposing private browser content.

## Install from source

### Requirements

- Chrome or another Chromium browser with Manifest V3 support
- Node.js `^20.19.0` or `>=22.12.0`
- npm

### Build and load the extension

```bash
git clone https://github.com/TuTouPower/capture_all.git
cd capture_all
npm ci
npm run build
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose `artifacts/dist` from the repository.
5. Pin Capture All if you want quick access to the popup.

After rebuilding, reload the extension card on `chrome://extensions` if manifest or service worker changes are not picked up automatically.

## Basic use

1. Open the Capture All popup.
2. Review capture options, especially input values and request/response bodies.
3. Start a capture.
4. Reproduce the browser behavior you want to investigate.
5. Stop the capture.
6. Open the capture from the popup or dashboard to inspect its timeline and details.
7. Export it when a portable artifact is required.

A capture is limited to 500 MB and 24 hours. An individual captured body is limited to 100 MB.

## Connect Bridge and MCP

Build the project first, then copy the project-local MCP example:

```bash
cp .mcp.json.example .mcp.json
```

Generate a random token yourself, then use that same value in all three places:

1. **Extension:** open Capture All settings, enable the Agent Bridge, keep the default URL `http://127.0.0.1:17831`, and enter the token.
2. **Bridge:** start the local Bridge with the token supplied through the environment.
3. **MCP client:** replace `<YOUR_BRIDGE_TOKEN>` in the local `.mcp.json`.

```bash
CAPTURE_ALL_BRIDGE_TOKEN='<your token>' \
    node artifacts/bridge/bridge.mjs --port 17831
```

Restart the MCP client after creating `.mcp.json`. In Claude Code, the normal flow is:

```text
get_status → start_recording → reproduce behavior → stop_recording
           → list_captures → get_timeline / list_records / export_capture
```

`.mcp.json` is ignored by Git and must remain local. Never put real tokens in source files, documentation, issues, or capture exports. See the [MCP usage guide](docs/mcp_usage.md) for tools, parameters, limits, and troubleshooting.

## Development

```bash
npm run dev                # Start Vite development mode
npm test                   # Run unit and integration tests
npm run test:watch         # Run Vitest in watch mode
npm run build              # Build extension, Bridge, and MCP artifacts
npm run test:e2e           # Run the base headless Playwright suite
npm run test:e2e:all       # Run all configured Playwright projects
npm run scan:tracked-tree  # Scan candidate files for secrets and private paths
npm run bridge             # Run Bridge from TypeScript source
npm run mcp                # Run MCP server from TypeScript source
```

Build outputs:

| Artifact | Path |
|---|---|
| Chrome extension | `artifacts/dist` |
| Bridge | `artifacts/bridge/bridge.mjs` |
| MCP server | `artifacts/mcp/mcp.mjs` |

Implementation details live in the [architecture](docs/omni_powers/op_blueprint/architecture.md), [domain model](docs/omni_powers/op_blueprint/domain.md), and [test plan](docs/omni_powers/op_blueprint/test.md).

## Permissions, privacy, and safety

| Permission | Purpose |
|---|---|
| `storage` | Store user configuration in `chrome.storage.local` |
| `webRequest` | Observe request and response metadata |
| `debugger` | Use Chrome DevTools Protocol for console, runtime errors, and configured body capture |
| `tabs` | Discover tabs and coordinate capture content scripts |
| `alarms` | Maintain capture lifecycle work in an MV3 service worker |
| `downloads` | Save local export files |
| `cookies` | Capture Cookie changes |
| `<all_urls>` | Run the declared content script and observe authorized pages across origins |

Capture data is stored in the extension's IndexedDB database, `capture_all_db`. Settings are stored in `chrome.storage.local`. Capture All has no telemetry, analytics, advertising SDK, or remote application server.

Important boundaries:

- Input values and request/response body capture are enabled by default. Disable them before the first capture when they are unnecessary.
- `<all_urls>` and `all_frames: true` allow the content script to run in top-level pages and embedded third-party frames.
- Redaction reduces exposure but cannot guarantee removal of every credential or personal value.
- MCP queries may send selected capture data to the connected AI provider or client environment.
- Exported files are independent copies and must be protected and deleted separately.
- MCP does not expose capture deletion or database clearing commands.

Delete captures through the dashboard. Removing the extension or clearing its site data removes local extension storage. Read [PRIVACY.md](PRIVACY.md) for the complete data model and [SECURITY.md](SECURITY.md) before reporting a vulnerability. Never publish sensitive evidence in a GitHub issue.

## Known limitations

- Broad permissions are required by the current capture model.
- The Bridge accepts ordinary JSON bodies up to 1 MiB and extension result bodies up to 32 MiB.
- Large captures should use paginated `list_records` queries or extension-local export rather than an all-data MCP request.
- Redaction does not scan arbitrary response body text for every possible secret.
- No Chrome Web Store package, npm release, compatibility guarantee, or support SLA is available yet.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes. Public issues and pull requests must not contain unredacted captures, tokens, request bodies, private URLs, or personal browser data. Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md), and project changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [Apache-2.0 License](LICENSE).
