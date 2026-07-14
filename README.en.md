<div align="center">
  <img src="assets/icons/icon128.png" width="96" height="96" alt="Capture All icon">
  <h1>Capture All</h1>
  <p><strong>Local-first browser debugging black box for developers and AI Agents.</strong></p>
  <p>Capture browser evidence, visualize and inspect, export files, or query via MCP.</p>
  <p>
    <a href="README.md">简体中文</a> ·
    <a href="docs/mcp_usage.md">MCP Guide</a> ·
    <a href="PRIVACY.md">Privacy</a> ·
    <a href="SECURITY.md">Security</a>
  </p>
  <p>
    <a href="https://github.com/TuTouPower/capture_all/actions/workflows/ci.yml"><img src="https://github.com/TuTouPower/capture_all/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-blue.svg" alt="Apache-2.0 License"></a>
    <img src="https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4.svg" alt="Chrome Manifest V3">
  </p>
</div>

Capture All is a Chrome Manifest V3 extension that turns browser activity into local structured evidence, capturing user behavior, page navigation, network requests, console output, runtime exceptions, storage changes, and cookie changes on a single timeline.

Visualize and inspect via popup, main panel, and DevTools panel. For deeper analysis, connect the authorized local Bridge to an MCP client such as Claude Code, and let an AI Agent control capture, query individual records, or export results.

> [!WARNING]
> Capture All requests high-impact browser permissions and may capture sensitive page content. Use only on browsers, profiles, and sites you are authorized to inspect. Read [Permissions, privacy, and security](#permissions-privacy-and-security) before first capture.

## What gets captured

| Data group | Examples |
|---|---|
| User behavior | Clicks, scrolls, keyboard shortcuts or keys, input changes, viewport changes |
| Page navigation | Page loads, URL changes, tab activation, visibility changes |
| Network | Request and response metadata, timing, headers, configured body |
| Console | `console.log`, `console.warn`, `console.error`, and other output |
| Errors and exceptions | Uncaught exceptions, unhandled Promise rejections |
| Storage | `localStorage`, `sessionStorage` changes |
| Cookies | Cookie creation, updates, and deletions |

## Core capabilities

- Correlate 7 browser data groups on a unified timeline.
- Inspect captures via popup, main panel, request inspector, and DevTools panel.
- Export JSON, JSONL, HTML, or HAR files.
- Control capture via MCP, and query data in pages and time ranges.
- Captured data stays in local IndexedDB by default; it only leaves extension storage on explicit export or MCP query.
- Authorize the local Bridge with a user-supplied token.
- Support redacting sensitive URL params and headers, with size limits always enforced.

## Architecture

```text
Chrome pages and iframes
        │
        ▼
Capture All extension
  ├─ Content Script           user behavior, navigation, storage
  ├─ Service Worker          network, cookies, capture lifecycle
  ├─ Chrome DevTools Protocol console, exceptions, configured body
  ├─ IndexedDB               local capture data
  └─ Popup / main panel / DevTools panel
        │ via 127.0.0.1 authorized polling
        ▼
Local Bridge
        │        ▼
MCP Server ──► Claude Code or other MCP clients
```

Bridge binds `127.0.0.1` only. The extension, Bridge, and MCP config must use the same token.

## Project status

Capture All is still early stage and has not been released to the Chrome Web Store or npm. The current install path is building from source and loading the unpacked extension. Compatibility guarantees and support SLA are not provided.

The repository does not publish product screenshots to avoid leaking private browser content being inspected during development.

## Install from source

### Requirements

- Chrome or Chromium that supports Manifest V3
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
2. Enable Developer mode.
3. Click "Load unpacked extension".
4. Select `artifacts/dist` in the repository.
5. Optional: pin Capture All to the toolbar to open the popup quickly.

After rebuilding, reload the extension in `chrome://extensions` if manifest or Service Worker changes do not take effect automatically.

## Basic usage

1. Open the Capture All popup.
2. Check capture options, especially input values, request bodies, and response bodies.
3. Start capture.
4. Reproduce the browser behavior under investigation.
5. Stop capture.
6. Open the capture from the popup or main panel and inspect the timeline and details.
7. Export files when portable evidence is needed.

A single capture is capped at 500 MB and 24 hours; a single body is capped at 100 MB.

## Connect Bridge and MCP

Build the project first, then copy the MCP example scoped to the current project:

```bash
cp .mcp.json.example .mcp.json
```

Generate a random token yourself and use the same value in all three places:

1. **Extension:** open Capture All settings, enable Agent Bridge, keep the default URL `http://127.0.0.1:17831`, then fill in the token.
2. **Bridge:** pass the token via environment variable and start the local Bridge.
3. **MCP client:** replace `<YOUR_BRIDGE_TOKEN>` in the local `.mcp.json` with the same token.

```bash
CAPTURE_ALL_BRIDGE_TOKEN='<your token>' \
    node artifacts/bridge/bridge.mjs --port 17831
```

Restart the MCP client after creating `.mcp.json`. In Claude Code, the typical flow is:

```text
get_status → start_recording → reproduce the issue → stop_recording
           → list_captures → get_timeline / list_records / export_capture
```

`.mcp.json` is gitignored and must stay on the local machine. Never write real tokens into source, documentation, issue threads, or capture exports. For full tools, parameters, limits, and troubleshooting, see the [MCP usage guide](docs/mcp_usage.md).

## Development

```bash
npm run dev                # Start Vite dev mode
npm test                   # Run unit and integration tests
npm run test:watch         # Run Vitest in watch mode
npm run build              # Build the extension, Bridge, and MCP artifacts
npm run test:e2e           # Run baseline headless Playwright tests
npm run test:e2e:all       # Run all Playwright projects
npm run scan:tracked-tree  # Scan tracked files for secrets and private paths
npm run bridge             # Start Bridge from TypeScript sources
npm run mcp                # Start MCP Server from TypeScript sources
```

Build outputs:

| Artifact | Path |
|---|---|
| Chrome extension | `artifacts/dist` |
| Bridge | `artifacts/bridge/bridge.mjs` |
| MCP Server | `artifacts/mcp/mcp.mjs` |

Implementation details in [technical architecture](docs/omni_powers/op_blueprint/architecture.md), [domain model](docs/omni_powers/op_blueprint/domain.md), and [test plan](docs/omni_powers/op_blueprint/test.md).

## Permissions, privacy, and security

| Permission | Purpose |
|---|---|
| `storage` | Persist user config in `chrome.storage.local` |
| `webRequest` | Observe request and response metadata |
| `debugger` | Capture console, runtime exceptions, and configured body via Chrome DevTools Protocol |
| `tabs` | Query tabs and coordinate Content Script capture |
| `alarms` | Maintain capture lifecycle tasks in the MV3 Service Worker |
| `downloads` | Save locally exported files |
| `cookies` | Capture cookie changes |
| `<all_urls>` | Run declarative Content Script and observe authorized pages across origins |

Captured data lives in the extension-local IndexedDB database `capture_all_db`, with settings in `chrome.storage.local`. Capture All does not include telemetry, analytics, ad SDKs, or remote application servers.

Important boundaries:

- Input values, request bodies, and response bodies are captured by default. Turn them off before first capture if not needed.
- `<all_urls>` and `all_frames: true` allow the Content Script to run on top-level pages and embedded third-party iframes.
- Redaction reduces exposure risk but does not guarantee removal of all credentials or personal data.
- MCP queries may forward selected capture data to the connected AI Provider or client environment.
- Exported files are standalone copies and need separate protection and deletion.
- MCP does not provide commands to delete captures or clear the database.

Delete captures from the main panel. Removing the extension or clearing extension site data deletes local extension storage. For full data practices, see [PRIVACY.md](PRIVACY.md). Read [SECURITY.md](SECURITY.md) before reporting vulnerabilities. Do not publish sensitive evidence in GitHub issues.

## Known limitations

- The current capture model requires high-impact browser permissions.
- Bridge JSON body limit is 1 MiB; extension result reply limit is 32 MiB.
- Large captures should use paginated `list_records` or local export, not rely on full-data MCP queries.
- Redaction does not scan all potential secrets inside arbitrary response body text.
- No Chrome Web Store package, npm release, compatibility guarantee, or support SLA yet.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Public issues and PRs must not contain unredacted captures, tokens, request bodies, private URLs, or personal browser data. Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Project changes are tracked in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the [Apache-2.0 License](LICENSE).
