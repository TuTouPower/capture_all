# Extension content/UI intensive review

- Reviewed at: `2026-08-13T11:53:31+08:00`
- Reviewed commit: `03254fb2a9cc5e96fd2998355facde4fbebcfe06`
- Method: static source/spec/test/history review; no source modification, browser interaction, build, or test execution
- Severity totals: **High 2 / Medium 7 / Low 5 / Critical 0 / Info 0**

## Scope

Reviewed vertically across:

- `src/extension/content/**`
- `src/extension/popup/**`
- `src/extension/dashboard/**`
- `src/extension/devtools/**`
- `src/extension/shared/**`
- `src/extension/manifest.json`
- `src/extension/_locales/**`
- relevant background/storage callers and shared contracts
- corresponding unit tests
- current specs, blueprint decisions, archived task records, previous reviews, and line history

Relevant current specs included `content_postmessage_nonce`, `content_status_poll_tab_id`, `popup_category_capture_gates`, `dashboard_export_flush_save_as`, `detail_search_preserve_input`, `content_page_script`, `dead_code_shared_helper_cleanup`, and `user_config`.

## Seven-view coverage

1. **Correctness/state machines** — content start/stop/restart, status polling, SPA navigation, timeline pointer lifecycle.
2. **Security/privacy** — postMessage origin/HMAC boundary, password handling, redaction gates, isolated-world limitations.
3. **Data/protocol integrity** — export completeness, `frame_id`, network method/body metadata, event selectors.
4. **Performance/resources** — live-detail IndexedDB scans, array materialization, render cadence, listener cleanup.
5. **Error handling/observability** — export failures, ignored content send failures, best-effort detail loads.
6. **UI/i18n/accessibility** — keyboard operability, switch semantics, hardcoded locale-dependent strings, document language.
7. **Tests/docs/history** — regression coverage, vacuous guards, source-manifest path, ADR/task scope, blame/pre-existing status.

---

## Findings

### EXTUI-001 — ZIP exports silently truncate every source at 100,000 records

- Severity: **High**
- Confidence: **99**
- Locations:
  - `src/extension/shared/capture_data_reader.ts:24-35`
  - `src/extension/popup/popup.ts:263-302`
  - `src/extension/dashboard/dashboard_shared.ts:310-344`
  - `src/extension/background/storage.ts:508-531`
  - `docs/blueprint/decisions.md:95-100`

**Evidence / reproduction / call chain**

`read_capture_snapshot()` issues one query per category with `offset=0, limit=100000`; each storage query stops once `out.length >= limit`. Popup ZIP and Dashboard archive both pass those arrays directly to `build_archive()` and then download the result. There is no next-page loop, total-count comparison, `truncated` flag, warning, or export failure.

A capture with 100,001 network requests therefore produces a ZIP containing exactly the first 100,000. `manifest.json` and README counts are generated from the already-truncated arrays, so the archive appears internally consistent and complete.

This is reachable under the configured 500 MB session ceiling (`src/shared/constants.ts:20`); record count and byte ceiling are independent, and compact events can exceed 100,000 well below 500 MB.

The project already established the opposite architecture rule in ADR-012: fixed 100,000 truncation must be replaced by 5,000-record pagination until exhaustion. T043 implemented that rule only in `exporter.ts` and `agent_data_queries.ts`; its explicit scope omitted `capture_data_reader.ts`.

Tests reinforce rather than challenge the cap: `tests/unit/live_data_queries.test.ts:435-443` asserts `limit=100000`; `popup_export.test.ts`, `export_busy_guard.test.ts`, and `archive_builder.test.ts` do not create a source above the boundary or compare archive counts with persisted stats.

**Impact**

A user-requested “ZIP 完整包” can lose arbitrary tail data without any indication. This is irreversible at export-consumption time and undermines the primary debugging artifact.

**Recommendation**

Add shared paginated readers using the ADR-012 `PAGE_SIZE=5000` contract, or stream cursor batches directly into archive generation. Before download, compare persisted category stats/DB counts with exported counts. If an intentional cap remains, abort with a localized error or include explicit `truncated` metadata and per-source totals.

**History / pre-existing**

Pre-existing since `08b9d130` (`2026-06-13`). Previously recorded as a pre-stored architecture item, but still active. T043/ADR-012 fixed sibling paths, leaving this UI reader inconsistent with the accepted decision.

---

### EXTUI-002 — Live detail polling rereads and rematerializes the full capture every two seconds

- Severity: **High**
- Confidence: **96**
- Locations:
  - `src/extension/dashboard/dashboard.ts:118-152`
  - `src/extension/dashboard/dashboard_shared.ts:288-303`
  - `src/extension/shared/capture_data_reader.ts:24-35`
  - `src/extension/dashboard/dashboard_shared.ts:242-285`

**Evidence / reproduction / call chain**

While a detail page is open for a capturing session, the two-second interval always calls `load_detail()`. `load_detail()` first clears all detail state, requests capture metadata, then launches eight IndexedDB reads in `Promise.all`, each allowing up to 100,000 records. It then creates additional network/console event objects, concatenates the arrays, copies with `.slice()`, and sorts the full merged list.

The t144 “incremental render” change only compares signatures **after** this full reread and merge. It avoids DOM replacement when unchanged, but does not avoid database scans, object allocation, array copies, or sorting. A quiet large capture still pays the full cost every two seconds.

The single-flight guard prevents overlapping intervals, but when one pass takes more than two seconds it merely drops timer ticks; it does not reduce the cost of each pass. No unit test asserts that unchanged stats skip `read_capture_snapshot()`.

**Impact**

Large live captures can repeatedly allocate hundreds of thousands of records and freeze or exhaust the Dashboard renderer. This competes with ongoing capture/storage work and can make the live detail page unusable precisely when data volume is highest.

**Recommendation**

Poll only lightweight metadata/counters first. Fetch deltas using per-source cursor/offset after counters advance, append them to in-memory state, and sort only the new merge boundary. Prefer SW change notifications over polling. Keep a bounded/virtualized render window for timeline and tables.

**History / pre-existing**

The full polling path predates the current review. Commit `17cde0d` (t144) improved render gating and drag protection but left the expensive full read before the signature comparison. `dashboard.ts:119-120` still contains a TODO acknowledging push notifications as the intended replacement.

---

### EXTUI-003 — Content status polling is one-shot across sessions and permits stop/in-flight restart races

- Severity: **Medium**
- Confidence: **94**
- Locations:
  - `src/extension/content/content_script.ts:64-86`
  - `src/extension/content/content_script.ts:223-245`
  - `src/extension/shared/poll_capture_status.ts:38-82`
  - `src/extension/background/service_worker.ts:51-76`
  - `tests/unit/poll_capture_status.test.ts:42-188`

**Evidence / reproduction / call chain**

`content_script.ts` creates one poll controller at module load. Once active capture is found, its timer is cleared; on stop, `stop_status_poll()` permanently sets the closure's `stopped=true`. A later capture does not create a new controller. Recovery then depends entirely on the three-attempt `tabs.sendMessage` path. Any later missed start notification has no BUG-004 polling fallback.

Separately, `check_once()` does not test `stopped` after `await get_status()`. If `stop_status_poll()` runs while a status request is in flight, an already-produced active response can still call `on_active()`, which invokes `start_capture()` after stop. `clearInterval` cannot cancel that promise continuation.

The tests cover initial activation, rejection retry, and clearing an interval, but not `stop -> new session`, stop while `get_status` is pending, or overlapping interval checks.

**Impact**

A reused page can either miss a later session or restart hooks/listeners after stop. The former recreates silent user/storage capture gaps; the latter leaves page instrumentation active while SW no longer accepts the session.

**Recommendation**

Model polling as a restartable lifecycle owned by content capture state. Re-arm it after each stop, or run a low-rate lifetime status watcher keyed by capture generation. Add an in-flight guard and check `stopped` immediately after every await and before `on_active`. Test deferred promises for stop/restart and interval overlap.

**History / pre-existing**

Pre-existing since BUG-004 implementation commit `30771e30` (`2026-06-14`). Previous review evidence remains applicable.

---

### EXTUI-004 — SPA navigation misses `pushState`/`replaceState` and labels back/forward as `push_state`

- Severity: **Medium**
- Confidence: **99**
- Locations:
  - `src/extension/content/content_script.ts:161-210`
  - `src/shared/types.ts:266-274`
  - `tests/unit/tab_events.test.ts:239-288`

**Evidence / reproduction / call chain**

The content script listens only for `popstate` and `hashchange`. Native `history.pushState()` and `history.replaceState()` do not dispatch `popstate`, so normal client-side SPA route changes produce no `route_change` event. Conversely, actual `popstate` events from browser back/forward are emitted with `route_action: 'push_state'`, which is semantically false.

A direct reproduction is a capturing page calling `history.pushState({}, '', '/next')`: URL changes, neither registered handler fires, and no route event is sent. Calling `history.back()` later invokes `handle_popstate_navigation()` and stores the action as `push_state`.

The data contract supports only `push_state | replace_state | hash_change`, leaving no honest back/forward value. Existing navigation tests exercise a detached URL-reference helper, not production event listeners or history API calls.

**Impact**

Modern SPA timelines omit primary route transitions and misdescribe history traversal, weakening causal debugging around route-triggered network/UI activity.

**Recommendation**

Patch `history.pushState` and `history.replaceState` in MAIN world using the existing authenticated page-script channel pattern; restore patches on stop. Extend `RouteChangeData.route_action` with a back/forward value, or use a separate navigation trigger field. Add browser/jsdom behavior tests for push, replace, back, duplicate URL, stop, and restart.

**History / pre-existing**

Pre-existing since `c76d228f` (`2026-06-08`); previously reported and not covered by t155.

---

### EXTUI-005 — `all_frames` capture collapses most iframe events to `frame_id=0`

- Severity: **Medium**
- Confidence: **99**
- Locations:
  - `src/extension/manifest.json:21-27`
  - `src/extension/content/content_script.ts:28-39`
  - `src/extension/content/content_script.ts:111-149`
  - `src/extension/content/content_event_utils.ts:20-35`
  - `src/shared/event_utils.ts:32-64`
  - representative producer: `src/extension/content/mouse_capture.ts:85-93`

**Evidence / reproduction / call chain**

The manifest injects content scripts into all frames. `content_script.ts` creates a nonzero random ID for an iframe, but only its own navigation/lifecycle `send_capture_event()` supplies that value. Capture modules receive capture ID, epoch, tab ID, and sender—not frame ID. Their `create_content_event()` calls omit `frame_id`, and `create_base_event()` defaults it to zero.

Thus an iframe click, key, input, focus, storage-hook event, or fallback network event is stored with the same frame ID as the top document. `top_frame_url` helps only when same-origin access succeeds and does not provide frame identity.

No corresponding unit test creates an iframe and asserts a nonzero/stable producer event frame ID.

**Impact**

Events from multiple frames cannot be reliably attributed or ordered by frame. Selectors/XPaths are ambiguous across frames, and agent queries that expose `frame_id` return misleading data.

**Recommendation**

Use Chrome's authoritative `sender.frameId` where possible, or assign one per content-script instance and pass it through the shared capture-state parameters into every `create_content_event()`. Do not use random IDs when platform frame IDs are available. Add top-frame, same-origin iframe, and cross-origin iframe tests.

**History / pre-existing**

Pre-existing from the original content implementation; previously reported as H1/Info in earlier reviews and still unresolved.

---

### EXTUI-006 — Captured CSS selectors are syntactically invalid or point to the wrong element

- Severity: **Medium**
- Confidence: **99**
- Locations:
  - `src/extension/content/dom_capture.ts:39-80`
  - `src/extension/content/mouse_capture.ts:59-75`
  - `src/extension/content/keyboard_capture.ts:36-47`
  - `src/extension/content/focus_capture.ts:44-49`
  - `tests/unit/dom_utils.test.ts:1-39`

**Evidence / reproduction / call chain**

`dom_capture.get_nth_of_type()` counts only siblings with the same tag but emits `:nth-child(n)`, which counts all element children. For `<div><span></span><input></div>`, the input is the first input but second child; generated `input:nth-child(1)` does not match it.

IDs and class tokens are interpolated without `CSS.escape()` in DOM, mouse, keyboard, focus, form, and scroll selector helpers. IDs such as `a:b` or classes containing CSS punctuation produce a selector with different meaning or a `querySelector` syntax error.

Tests only validate XPath single-quote escaping. They do not execute generated CSS selectors against mixed sibling tags or special-character identifiers.

**Impact**

Recorded target metadata cannot reliably locate the original element for debugging, replay, or agent explanation. This is especially harmful for iframe data already lacking frame identity.

**Recommendation**

Use `:nth-of-type(n)` with the current counter or compute the all-child index for `:nth-child`. Escape identifier components with `CSS.escape()`. Consolidate selector generation into one tested helper consumed by all producers. Round-trip test `document.querySelector(generated) === target`.

**History / pre-existing**

The DOM bug dates to `ccfdd6be` (`2026-06-03`); unescaped selectors are similarly pre-existing. Previous M6 remains valid.

---

### EXTUI-007 — Fallback fetch records `Request` objects with the wrong HTTP method

- Severity: **Medium**
- Confidence: **99**
- Locations:
  - `src/extension/content/network_hook.ts:232-270`
  - `src/extension/content/network_hook.ts:444-492`

**Evidence / reproduction / call chain**

The MAIN-world wrapper computes method solely from `init.method || 'GET'`. For `fetch(new Request('/api', { method: 'POST' }))`, `init` is undefined, so the emitted fallback record says `GET` even though the browser sends `POST`. The receiver accepts that value and persists it as a `fallback_hook` network request.

Tests cover response body gates/caps and authenticated postMessage delivery, but no test invokes `build_page_script` with a `Request` carrying its own method.

**Impact**

Fallback network records can contradict the real request, misleading method-based filtering, archive inspection, and request/response debugging.

**Recommendation**

Resolve method as `init?.method ?? (input instanceof Request ? input.method : 'GET')`, normalize case if required, and add GET/POST `Request` plus `init.method` override tests.

**History / pre-existing**

Pre-existing since fallback hook commit `c4e98514` (`2026-06-07`).

---

### EXTUI-008 — Timeline lane drags lack cancellation cleanup; blank-area drag updates detached DOM

- Severity: **Medium**
- Confidence: **97**
- Locations:
  - `src/extension/dashboard/dashboard_detail.ts:663-729`
  - `src/extension/dashboard/dashboard.ts:136-145`
  - `tests/unit/dashboard_timeline_marker.test.ts:299-345,485-497`

**Evidence / reproduction / call chain**

Marker drag sets global `_tl_dragging=true`, but cleanup is registered only for `pointerup`. `pointercancel`, `lostpointercapture`, blur, or leaving the window never removes the `pointermove` listener or resets `_tl_dragging`. Dashboard live-detail polling then permanently skips refresh because it gates on `!router.is_tl_dragging()`.

The minimap path has robust pointer capture and cancellation cleanup, and its test covers `pointercancel`; the lane-marker path does not. The existing cancellation test therefore proves only the separate minimap implementation.

For non-marker lane drag, code calls `router.render_content()` before registering the move callback. The callback closes over the old overlay/playhead nodes replaced by that render, so subsequent pointer moves update state and detached DOM rather than providing visible drag feedback. The repository already has pending `p035_timeline_blank_area_drag.md` for this interaction.

**Impact**

A normal OS/browser pointer cancellation can stop live detail refresh for the rest of the page lifetime. Blank-area dragging appears broken or discontinuous and may leak window listeners until pointerup.

**Recommendation**

Use pointer capture and one idempotent `finish_drag()` for `pointerup`, `pointercancel`, `lostpointercapture`, and window blur. Set/reset `_tl_dragging` for both lane branches. Do not re-render before drag completion; update live nodes, then render once on finish. Add lane-specific cancellation and visual playhead movement tests.

**History / pre-existing**

Base lane logic is pre-existing (`36be1fb9`/`ac8fefe9`). Commit `17cde0d` added the global drag gate without cancellation cleanup, increasing impact. Minimap cancellation was fixed separately in t154.

---

### EXTUI-009 — Core Popup and Settings switches are pointer-only custom controls

- Severity: **Medium**
- Confidence: **99**
- Locations:
  - `src/extension/popup/popup.ts:130-143,148-170,308-325`
  - `src/extension/dashboard/dashboard_settings.ts:18-23,55-80,95-109,190-196`
  - `tests/unit/wcag_contrast.test.ts:1-97`

**Evidence / reproduction / call chain**

Popup category gates are clickable `<div class="mcard-toggle">` elements with no `role`, `tabindex`, keyboard listener, accessible name, or `aria-pressed`. Recent capture rows and “View All” are `<a>` elements without `href`, also wired only to click.

Dashboard settings switches are clickable `<span class="switch" data-sw>` elements with the same omissions. These include sensitive capture, response body, input values, redaction, export save-as, and Bridge enablement settings.

Tabbing through either page cannot focus these controls; Enter/Space cannot activate them. Existing WCAG tests validate color math utilities only and do not inspect production focus/semantics/keyboard behavior.

**Impact**

Keyboard-only and assistive-technology users cannot operate primary capture gates or settings. Visual state is not announced, including privacy-sensitive switches.

**Recommendation**

Render native `<button type="button" aria-pressed>` or checkbox/switch inputs with labels. Use real `<button>` for recent rows/View All unless navigation uses a real `href`. Preserve visible focus styles and test Tab + Enter/Space plus announced state.

**History / pre-existing**

Popup controls predate current review (`4d01d430`); Dashboard switches date to `ac8fefe9`. No active task found for this accessibility gap.

---

### EXTUI-010 — Fallback network hook ignores `capture_request_body`

- Severity: **Low**
- Confidence: **98**
- Locations:
  - `src/extension/content/content_script.ts:130-142`
  - `src/extension/content/network_hook.ts:120-229`
  - `src/extension/content/network_hook.ts:417-440`
  - `src/shared/constants.ts:30-43`

**Evidence / reproduction / call chain**

`capture_request_body` defaults true and is exposed in Popup/Settings configuration, but `start_network_hook()` receives only response-body, redaction, and size options. Every fetch/XHR fallback message hardcodes `request_body:null` and `request_body_status:'not_enabled'`.

Other network paths may capture a matching body, so this is not guaranteed total loss, but the fallback record itself falsely says request-body capture was not enabled rather than unavailable on this path.

**Impact**

When fallback data is the surviving diagnostic path, request bodies are absent despite user configuration. Duplicate/mixed network records also expose inconsistent body status semantics.

**Recommendation**

Pass `capture_request_body` into the page hook and capture supported string/URLSearchParams/FormData metadata under the same size/redaction policy, or explicitly document fallback limitations and use a distinct status such as `unsupported`/`not_available` rather than `not_enabled`.

**History / pre-existing**

Pre-existing from fallback hook implementation; previous L2 remains applicable.

---

### EXTUI-011 — Clipboard API interception is installed in the isolated world, not the page world

- Severity: **Low**
- Confidence: **96**
- Locations:
  - `src/extension/content/clipboard_capture.ts:18-53`
  - `tests/unit/clipboard_capture.test.ts:74-92`

**Evidence / reproduction / call chain**

The content script assigns `navigator.clipboard.writeText/readText` directly. Chrome content scripts execute in an isolated JavaScript world, so page scripts retain their own MAIN-world `navigator.clipboard` methods. Programmatic page calls therefore do not pass through these wrappers. Only DOM `copy`/`paste` events remain observable.

The test stubs a single global `navigator`, so it cannot represent Chrome's world separation and gives false confidence that page API calls are intercepted.

**Impact**

Programmatic clipboard reads/writes can be absent while data claims `navigator.clipboard` capture support.

**Recommendation**

Either inject a restorable MAIN-world wrapper and authenticate messages through the established page-script channel, or narrow the product/test claim to user copy/paste events and remove the ineffective isolated-world patch.

**History / pre-existing**

Pre-existing since `1c893136` (`2026-06-14`).

---

### EXTUI-012 — Dashboard export exceptions are logged but not shown to the user

- Severity: **Low**
- Confidence: **99**
- Locations:
  - `src/extension/dashboard/dashboard_shared.ts:310-362`
  - `src/extension/dashboard/dashboard_settings.ts:241-252`
  - `tests/unit/export_busy_guard.test.ts:66-195`

**Evidence / reproduction / call chain**

Explicit unsuccessful SW responses produce alerts, but thrown failures from `read_capture_snapshot`, `build_archive`, `Blob`, file picker/download API, or log download are caught and only written to the diagnostic logger. The UI remains unchanged, so a click can appear to do nothing. `download_blob` is tested to reject on errors, while callers have no user-facing catch behavior test.

**Impact**

Disk-full, denied picker, IndexedDB, compression, and downloads API failures are invisible to users unless they inspect diagnostic logs.

**Recommendation**

In catch blocks, log full detail and show localized `exportFailed` feedback containing a safe reason. Consider disabling the active export button and restoring it with an inline status rather than alerts.

**History / pre-existing**

Pre-existing Dashboard behavior from `ac8fefe9`; not addressed by t150 because explicit error responses were improved while thrown UI download failures remained silent.

---

### EXTUI-013 — Locale switching leaves hardcoded English/Chinese strings and a stale document language

- Severity: **Low**
- Confidence: **99**
- Locations:
  - `src/extension/dashboard/dashboard.html:2-6`
  - `src/extension/popup/popup.html:1-19`
  - `src/extension/shared/i18n.ts:785-834`
  - `src/extension/popup/popup.ts:112-114,148-170,370-373`
  - `src/extension/dashboard/dashboard_shared.ts:112-113,188-218`
  - `src/extension/dashboard/dashboard_detail.ts:350-384`

**Evidence / reproduction / call chain**

`init_locale()` changes only an in-memory enum. It never updates `<html lang>` or document title. Dashboard is hardcoded `lang="zh"` and Chinese title even when locale is English; Popup has no `lang` and a Chinese initial title/button tooltip.

Runtime strings bypass `t()`: Popup forces `en-US` number formatting and renders `"events"`; capture names use the host default locale. Dashboard event detail emits `scroll`, `loaded in`, and `changed`; network inspector emits `from ...`, `no cache`, raw body-status enums, and `... (truncated)`. The t143 guard scans hardcoded CJK in Dashboard TypeScript only, so English leakage under Chinese locale is undetected.

**Impact**

Mixed-language UI appears under both locales, and screen readers receive the wrong/absent document language, affecting pronunciation and navigation.

**Recommendation**

Add i18n keys for all user-visible status/detail strings, format numbers/dates using the selected locale, and set `document.documentElement.lang` plus localized `document.title` during locale initialization/change. Expand guards to rendered English literals and HTML attributes.

**History / pre-existing**

Mixed provenance. Much of the text predates t143; `dashboard_detail.ts:372` was last touched by t154 (`d849681`) but still introduced untranslated text. The current CJK-only guard allowed these remnants.

---

### EXTUI-014 — UI string tests contain a vacuous assertion and skip the actual source manifest

- Severity: **Low**
- Confidence: **100**
- Locations:
  - `tests/unit/ui_strings.test.ts:185-216`
  - `src/extension/manifest.json:1-48`
  - comparison: `tests/unit/manifest_permissions.test.ts:8-22`

**Evidence / reproduction / call chain**

The tests-directory audit ends with:

```ts
expect(real_hits.length).toBeLessThanOrEqual(real_hits.length)
```

which is true for every finite array length and can never fail on violations. It also contains the same `.not.toContain(` filter twice.

The manifest terminology test resolves `${ROOT}/manifest.json`; that file does not exist after the manifest moved to `src/extension/manifest.json`, so `if (!fs.existsSync(...)) return` silently skips the assertion. `manifest_permissions.test.ts` demonstrates the correct source path.

**Impact**

Two named regression checks can remain green while the conditions they claim to inspect regress. This is a test-trust issue rather than a current production failure.

**Recommendation**

Either make the tests-directory audit assert zero after a documented allowlist, or remove the pseudo-test and implement reporting outside Vitest. Point the manifest test at `src/extension/manifest.json` and fail if the required file is absent.

**History / pre-existing**

Pre-existing since `24882590` (`2026-06-09`); manifest skip became effective after the source move and was not updated in this test.

---

## High/critical falsification notes

- No Critical finding survived review.
- EXTUI-001 was checked against the storage cursor implementation, session byte ceiling, ZIP call sites, archive tests, ADR-012, and T043 scope. There is no hidden pagination or truncation marker in the UI path.
- EXTUI-002 was checked against t144 history. t144 gates DOM rendering after a signature comparison but still performs the full snapshot read/merge first; therefore the resource finding remains High, while the prior claim of unconditional DOM rerender is no longer valid.
- The prior candidate “Popup ZIP does not flush before reading” was falsified: Popup calls `get_capture_data`, and SW `get_capture_data()` awaits `flush_all()` before returning (`service_worker.ts:384-393`). It is not reported.
- The prior candidate “minimap pointercancel leaks dragging state” was falsified: t154 added pointer capture plus `pointercancel/lostpointercapture` cleanup and a regression test. EXTUI-008 is restricted to the separate lane-marker/blank-area path.

## Uncovered / not executed

- No manual Chrome interaction, DevTools panel interaction, screen-reader run, keyboard walkthrough, or cross-origin iframe runtime reproduction.
- No unit, integration, E2E, build, lint, or typecheck command was run; parent review orchestration owns validation.
- Background/Bridge/MCP code was read only where needed to verify Extension UI call chains; it was not independently exhaustively reviewed in this bundle.
- Browser-specific IndexedDB memory profiles and 100,000+ record archives were not generated during this read-only pass.

## Strengths

- Content page-script channels use explicit origin/source checks, rotating nonce, and per-message HMAC verification; stop paths restore network/WebSocket page hooks.
- Password keyboard values remain masked independently of general redaction configuration.
- Popup category gates are correctly propagated into content/SW capture configuration, including nav/storage/cookie/error gates.
- UI-to-SW messages use the typed `{action,payload}` / `{success,data?,error?}` contract; content internal event messages remain intentionally flat.
- Popup ZIP flush semantics are sound through `get_capture_data`; Dashboard archive explicitly flushes and aborts on an unsuccessful flush response.
- Archive construction uses async compression, output filename helpers, and save-as configuration consistently.
- Dashboard polling has a single-flight guard and t144/t154 fixed several earlier render and minimap drag races.
- Dynamic Dashboard detail values reviewed in high-risk inspector/table paths use `esc()`; t151 added meaningful XSS rendering tests.
- Manifest permissions avoid redundant `activeTab`/`scripting`, and DevTools reuses the Dashboard page rather than maintaining a divergent panel implementation.
