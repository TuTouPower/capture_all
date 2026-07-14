# Privacy Policy

Capture All is a local browser debugging extension. This document describes what it captures, where data is stored, how data can leave the browser, and the controls available to users.

## Data collected

Capture All can collect seven data groups during a capture:

- user actions, including clicks, scrolling, keyboard metadata, and configured input values;
- page navigation and lifecycle events;
- network request and response metadata, headers, timing, and configured bodies;
- console output;
- runtime errors;
- Storage changes; and
- Cookie changes.

Capture All can collect from the top-level page and embedded frames, including third-party iframes, because its declared content script runs with `all_frames: true`. Embedded payment, authentication, chat, advertising, and other third-party frames may therefore contribute user actions or page metadata during a capture.

Input values, request bodies, and response bodies are enabled by default. These data can contain credentials, tokens, private messages, personal information, or other sensitive content. Review the capture defaults before the first capture and disable data not needed for the investigation.

Password input values are never captured. Storage values and Cookie values are not captured; their changes and metadata may still be stored.

## Redaction limits

Redaction is enabled by default. It masks known sensitive headers, selected URL query parameters, password inputs, and configured text previews.

Redaction is rule-based and cannot guarantee removal of every secret or personal value. In particular, request and response bodies are not content-scanned for credentials or personal information; they are limited by size only. Disabling redaction can expose headers, URL queries, and input values without these protections.

Redaction happens when data is captured. Export and MCP queries do not apply a second redaction pass to data already stored.

## Local storage

Capture data is stored in the extension's local IndexedDB database, `capture_all_db`. User settings, Bridge configuration, and current capture state are stored in `chrome.storage.local`.

Capture All has no telemetry, analytics, crash-reporting service, advertising integration, or cloud synchronization. The extension does not send capture data to a Capture All-operated server.

A capture is limited to 500 MB and 24 hours. An individual request or response body is limited to 100 MB. These limits reduce resource use; they are not privacy filters.

## Bridge, MCP, and AI agents

The optional Bridge binds to `127.0.0.1` and requires a user-provided Bearer token. It transfers commands and results between the extension and authenticated local clients.

The MCP server can query captured data and return it to a connected AI agent. MCP does not automatically redact or summarize stored results. Data returned through MCP is then subject to the privacy and retention practices of the selected AI service or agent environment.

Keep the project-local `.mcp.json` file private. Never commit a real Bridge token.

## Exports

Capture All can create JSON, JSONL, HTML, HAR, ZIP, and log files. Exports can contain sensitive browser data and may be saved outside extension storage.

Exported files are independent copies. Deleting a capture from the extension does not delete its exports. Delete exported files separately and do not attach unredacted exports to public issues.

## Deletion and retention

Delete individual captures from the dashboard capture list. Diagnostic logs can be cleared from settings. Removing the extension or clearing its extension site data removes local IndexedDB and `chrome.storage.local` data.

Capture data is not automatically deleted after a fixed retention period. Exported files remain until deleted through the operating system or other storage provider.

MCP does not expose capture deletion or database clearing commands.

## Browser permissions

Capture All requires broad permissions, including `<all_urls>`, `debugger`, `tabs`, and `cookies`, to implement the current capture model. Use it only in browser profiles and sites authorized for inspection. See [README.md](README.md#permissions-and-data) for the permission list.

## Changes

Privacy behavior may change as the project evolves. Material changes should be documented in this file and the project changelog before release.
