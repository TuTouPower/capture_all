# Record All Agent Skill

Connect to the Record All browser extension via MCP to query and analyze recorded web sessions.

## Prerequisites

1. Record All extension installed in Chrome
2. Local bridge running: `npm run bridge` in the project directory
3. Bridge token configured in extension popup (MCP Bridge section)
4. Extension shows "MCP Bridge: Enabled"

## Connection

```bash
# Start the bridge server (with your token)
RECORD_ALL_BRIDGE_TOKEN=<your-token> npm run bridge

# Start the MCP server (reads bridge URL + token from env)
RECORD_ALL_BRIDGE_URL=http://127.0.0.1:17831 \
RECORD_ALL_BRIDGE_TOKEN=<your-token> \
npm run mcp
```

## Available Tools

### Recording Control
- `recording_start` — Start a new recording session
- `recording_stop` — Stop the active recording

### Session Discovery
- `sessions_list` — List all sessions (paginated)
- `sessions_get` — Get session metadata

### Data Exploration
- `sources_list` — List available data sources for a session (events, network, console, errors)
- `records_list` — List records from a source (paginated, time-filtered, sorted)
- `records_get` — Get full record details by ID
- `timeline_list` — Merged timeline across all sources (paginated, time-filtered)
- `timeline_get` — Get a specific timeline item by ID
- `session_get_all_data` — Get complete session data (all sources)

### Export
- `session_export` — Export session as JSON, JSONL, HTML, or HAR

## Typical Workflow

1. `sessions_list` → find session of interest
2. `sources_list(session_id)` → see what data is available
3. `timeline_list(session_id, limit=20)` → get an overview
4. `records_get(session_id, source, record_id)` → drill into specific records
5. `session_export(session_id, format)` → export if needed

## Data Sources

| Source | Content |
|--------|---------|
| `record_events` | Mouse clicks, page loads, keyboard, tab events, DOM changes |
| `network_requests` | HTTP requests with headers, body, status, timing |
| `console_logs` | Console output (log/warn/error/info) with stack traces |
| `error_logs` | Uncaught exceptions and service worker errors |

## Privacy and Security Notes

- All data stays in the browser extension's IndexedDB; the bridge only transmits on demand
- Bridge binds to `127.0.0.1` only; no remote access
- Token authentication is required; empty token disables the bridge
- Network request/response bodies may contain sensitive data (passwords, tokens, PII)
- Console logs may contain application secrets
- The tool layer does NOT filter, redact, or summarize data by default
- It is your responsibility to handle sensitive data appropriately — do not log, store, or transmit it further without user consent

## Query Parameters

Most list endpoints accept:
- `offset` / `limit` — pagination
- `start_time` / `end_time` — time range filter (relative ms from session start)
- `order` — `asc` or `desc`
- `sources` — filter to specific sources (timeline only)
