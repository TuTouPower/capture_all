# Tests / Docs / Specs Intensive Review

Review baseline: `03254fb`

## Executive summary

This review found **12 actionable issues**: **1 High, 8 Medium, and 3 Low**. No Critical issue was confirmed.

The highest-risk issue is structural: CI's Playwright job runs only a static popup smoke test, while seven high-value E2E files are not selected by any Playwright project at all. Consequently, both `npm run test:e2e` and the nominally comprehensive `npm run test:e2e:all` can report green without executing capture gates, settings effects, CDP retry, multi-cycle integrity, or export-content scenarios. Several of the affected E2E files also contain assertions that would remain false-positive even after project wiring is fixed.

Documentation has two material contract drifts: the active `content_postmessage_nonce` spec still describes nonce-only authentication after t121 added per-message HMAC, and public English/privacy documentation still describes a user-supplied shared token despite the zero-config MCP-token/per-instance-token model. The testing and contributor guides also contain stale paths and commands that cannot exercise the current repository correctly.

All findings are pre-existing relative to the reviewed baseline. Git history was inspected for each High/Medium class issue; no finding is attributed to an unverified recent change.

## Review scope

Reviewed areas:

- `tests/`, with emphasis on Playwright project selection, CI execution, high-value E2E assertions, public-document contract tests, and active-spec regression tests.
- `playwright.config.ts`, `package.json`, and `.github/workflows/ci.yml` as the test execution contract.
- `docs/specs_index.md` and all 21 entries currently marked active, with targeted production/test tracing for their stated behavior.
- Public entry points: `README.md`, `README.en.md`, `PRIVACY.md`, and `SECURITY.md`.
- `docs/guides/*.md`, especially testing, contributor, and MCP guidance.
- Corresponding production paths under `src/extension`, `src/bridge`, `src/mcp`, and `src/shared` where needed to verify or disprove documentation and test claims.
- Relevant archived acceptance material and Git history only as evidence for intent and pre-existing status.

Validation method:

- Static source/configuration review and exact call/contract tracing.
- Targeted `git blame` / `git log` history inspection.
- Cross-checking documented commands and paths against current `package.json`, source entry points, and repository layout.
- No source, test, configuration, or existing documentation files were modified.

## Findings

### TD-001 — CI and `test:e2e:all` omit seven high-value E2E files

- **Severity:** High
- **Confidence:** 100%
- **Location:** `playwright.config.ts:41-48`, `playwright.config.ts:85-139`, `.github/workflows/ci.yml:31-42`, `package.json:34-35`, `tests/e2e/e2e.spec.ts:1-4`, `tests/e2e/e2e.spec.ts:21-29`, `docs/guides/test.md:156-168`, `docs/guides/test.md:201-215`

**Evidence / reproduction chain**

1. `package.json:34` defines `test:e2e` as `playwright test --project=e2e`.
2. CI invokes exactly that script at `.github/workflows/ci.yml:42`.
3. The `e2e` project matches only `e2e.spec.ts` (`playwright.config.ts:41-43`). That file explicitly says no extension is loaded and only renders static HTML (`tests/e2e/e2e.spec.ts:1-4`); its sole test checks the popup start button (`tests/e2e/e2e.spec.ts:21-29`).
4. The remaining projects use explicit `testMatch` patterns (`playwright.config.ts:46-139`). None matches these existing files:
   - `tests/e2e/e2e-capture-local.spec.ts`
   - `tests/e2e/e2e-capture-baidu.spec.ts`
   - `tests/e2e/e2e-toggle-effects.spec.ts`
   - `tests/e2e/e2e-cdp-retry.spec.ts`
   - `tests/e2e/e2e-settings-effects.spec.ts`
   - `tests/e2e/e2e-cycle-integrity.spec.ts`
   - `tests/e2e/e2e-export-content.spec.ts`
5. `test:e2e:all` runs all configured projects, not unmatched files. Therefore those seven files remain omitted even from the command documented as “all Playwright projects.”
6. `docs/guides/test.md:156-168` labels several omitted files as core scenarios, while `docs/guides/test.md:201-215` says all P0 flows and all E2E are mandatory before release. Current automation does not enforce either statement.
7. Every extension-bearing project is configured `headless: false` (`playwright.config.ts:46-139`), but CI never invokes those projects. The Linux CI job therefore proves only the static headless smoke path.

**Impact**

CI can remain green while capture option gates, settings effects, restricted-URL CDP recovery, repeated capture isolation, or exported HAR body content are broken. The label `test:e2e:all` creates an additional false assurance because files outside every project are silently absent. This is release-gate coverage loss, not merely stale documentation.

**Recommendation**

- Add every intended E2E file to an explicit project, preferably by grouping deterministic extension tests under maintained glob patterns rather than enumerating an incomplete filename list.
- Add a discovery guard that enumerates `tests/e2e/**/*.spec.ts` and fails if any file is selected by zero projects (and optionally if selected unexpectedly by multiple projects).
- Change CI to run the actual release-gate project set. Provide a CI-compatible Chromium extension mode (for example, a virtual display for headed persistent contexts) rather than silently substituting static HTML.
- Make `test:e2e:all` semantically complete, or rename it if intentionally limited.

**History / pre-existing**

Pre-existing. The baseline `e2e` match dates to `98d3cf6` / `a8f6199` (2026-06-03); CI has invoked only `npm run test:e2e` since `a03ac6f` (2026-07-14). Current explicit extension match patterns predate the reviewed baseline. `docs/archive/tasks/t106_popup_category_capture_gates/review_test.md:119-134` already identified `e2e-toggle-effects.spec.ts` as unwired on 2026-08-11, but the configuration remains unchanged.

### TD-002 — CDP retry E2E cannot prove retry recovery even if wired

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `tests/e2e/e2e-cdp-retry.spec.ts:96-108`, `tests/e2e/e2e-cdp-retry.spec.ts:111-163`, `tests/e2e/e2e-cdp-retry.spec.ts:165-197`, `src/extension/background/service_worker.ts:1095-1134`, `src/extension/background/service_worker.ts:1208-1250`, `docs/archive/E2E_GAP.md:183-205`

**Evidence / reproduction chain**

- Scenario A explicitly accepts an empty `console_events` array (`tests/e2e/e2e-cdp-retry.spec.ts:96-104`). It then accepts `fallback_hook` as a valid `body_capture_mode` (`tests/e2e/e2e-cdp-retry.spec.ts:106-108`), although fallback mode does not establish that CDP retry recovered.
- Scenario B performs the restricted-to-normal URL transition but asserts only `capture.status === 'completed'` (`tests/e2e/e2e-cdp-retry.spec.ts:111-163`). It does not assert recovered console or response-body data.
- Scenario C computes `has_retry`, but missing retry logs only produce `console.log` and never fail (`tests/e2e/e2e-cdp-retry.spec.ts:189-197`).
- Production has explicit retry paths and success logs for tab activation and URL transition (`src/extension/background/service_worker.ts:1095-1134`, `src/extension/background/service_worker.ts:1208-1250`). These are deterministic observables the test can require.
- Original acceptance material requires non-empty console events, captured response bodies, and both console/body retry success messages (`docs/archive/E2E_GAP.md:183-205`). The current test does not enforce those outcomes.

**Impact**

A regression that disables CDP reattachment after starting on `chrome://` can pass all three scenarios. Once TD-001 is fixed, this file would still provide false-green coverage for the production retry path.

**Recommendation**

Use a deterministic local page that emits a unique console marker and returns a unique response body after the retry-triggering transition. Require:

- the marker in exported `console_events`;
- at least one matching request with `response_body_status === 'captured'` and expected content;
- a CDP-backed body mode (`extension_cdp` or the intentionally tested external CDP mode, not `fallback_hook`);
- the exact relevant success log for each trigger path.

If the execution environment cannot support CDP, skip the entire project explicitly with a documented environment precondition instead of weakening the core assertions.

**History / pre-existing**

Pre-existing since `23a3728` (2026-06-11). Commit `aa444bf` (2026-06-13) narrowed the body-mode set but retained `fallback_hook`; it did not make recovery mandatory.

### TD-003 — HAR body assertion is true for both body-present and body-absent output

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `tests/e2e/e2e-export-content.spec.ts:235-242`, `docs/archive/E2E_GAP.md:236-244`

**Evidence / reproduction chain**

The test correctly computes whether any HAR entry contains non-empty `response.content.text` (`tests/e2e/e2e-export-content.spec.ts:235-240`), then asserts only that the result's type is boolean (`tests/e2e/e2e-export-content.spec.ts:241-242`). JavaScript `Array.prototype.some()` always returns a boolean, so both `true` and `false` pass. The archived acceptance contract explicitly requires non-empty `response.content.text` (`docs/archive/E2E_GAP.md:236-244`).

**Impact**

A HAR exporter regression that drops every response body remains green. This is independent of TD-001: wiring the file into Playwright would not restore meaningful coverage.

**Recommendation**

Create one deterministic response with known content, locate its HAR entry by URL or a unique request marker, and assert both `response.content.text` and the expected body value. If body capture is an environment prerequisite, fail setup or explicitly skip the project rather than converting the acceptance criterion into a type check.

**History / pre-existing**

Pre-existing since the test was introduced by `781caea` (2026-06-11).

### TD-004 — Realtime detail “growth” test permits zero growth

- **Severity:** Medium
- **Confidence:** 98%
- **Location:** `tests/e2e/e2e-realtime-detail.spec.ts:49-74`, `docs/guides/test.md:173-178`

**Evidence / reproduction chain**

The test title/comments state that it verifies t1-to-t2 realtime growth and waits across dashboard/SW refresh cycles (`tests/e2e/e2e-realtime-detail.spec.ts:49-69`). Its assertion is `toBeGreaterThanOrEqual(ev_count_t1)` (`tests/e2e/e2e-realtime-detail.spec.ts:70-73`), so an unchanged event count passes. The following comment incorrectly claims that quantity change has been verified (`tests/e2e/e2e-realtime-detail.spec.ts:74`). The project test guide itself says “increase” and “decrease” must use strict comparisons (`docs/guides/test.md:173-178`).

**Impact**

Stopping the dashboard refresh interval, SW flush propagation, or detail re-render after t1 can remain green as long as existing rows do not disappear.

**Recommendation**

After taking t1, trigger a deterministic new event carrying a unique marker. Poll the detail data/UI until that marker appears, then require both marker presence and `ev_count_t2 > ev_count_t1`. Avoid relying on incidental background activity from a public website.

**History / pre-existing**

Pre-existing. The non-strict assertion was introduced in `8b3c56f` (2026-06-14), whose commit message described it as “strict” despite implementing `>=`.

### TD-005 — Console/error separation E2E never asserts target records or categories

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `tests/e2e/e2e-console-errors.spec.ts:11-37`, `tests/e2e/e2e-console-errors.spec.ts:42-76`, `tests/e2e/e2e-console-errors.spec.ts:83-122`

**Evidence / reproduction chain**

- The first scenario injects explicit console and error markers (`tests/e2e/e2e-console-errors.spec.ts:19-37`), but the declared popup card locators are never asserted (`tests/e2e/e2e-console-errors.spec.ts:42-44`).
- If either target tab is invisible, its verification block is silently skipped (`tests/e2e/e2e-console-errors.spec.ts:59-76`). If visible, the test checks only whole-page HTML length, not marker presence or classification.
- The second scenario injects five distinct console levels (`tests/e2e/e2e-console-errors.spec.ts:91-98`) but again conditionally skips the console tab and only checks overall page text length (`tests/e2e/e2e-console-errors.spec.ts:114-122`).

**Impact**

Missing tabs, dropped console records, dropped runtime errors, or swapped console/error routing can all pass. The test name promises category separation but verifies only that a non-trivial dashboard document rendered.

**Recommendation**

Require both tab controls to be visible. Assert each unique marker in the expected tab and absent from the wrong tab, using data-backed selectors or exported records if virtualized UI makes text assertions unstable. Assert console levels and error event category/type explicitly.

**History / pre-existing**

Pre-existing since `eda22a3` (2026-06-09); all cited weak assertions trace to the original file.

### TD-006 — Active nonce security spec contradicts t121 HMAC behavior

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `docs/specs_index.md:12`, `docs/specs/content_postmessage_nonce.md:3-18`, `docs/specs/content_postmessage_nonce.md:20-23`, `src/extension/content/network_hook.ts:430-452`, `src/extension/content/websocket_capture.ts:189-205`, `src/extension/content/storage_capture.ts:159-175`, `src/extension/content/content_hmac.ts:1-5`, `src/extension/content/content_hmac.ts:128-145`, `tests/unit/content_hmac_vectors.test.ts:29-77`, `tests/unit/content_postmessage_nonce.test.ts:94-124`

**Evidence / reproduction chain**

- `docs/specs_index.md:12` marks `content_postmessage_nonce` as the current active spec for both t097 and t121.
- The spec describes nonce equality as the receiver's authentication check (`docs/specs/content_postmessage_nonce.md:7-12`) and says stronger per-message HMAC is outside the spec (`docs/specs/content_postmessage_nonce.md:18`). Its implementation/test references list only nonce behavior (`docs/specs/content_postmessage_nonce.md:20-23`).
- Current production creates a per-start secret that is not written to `window`, then requires both nonce equality and `verify_payload(...)` for network, WebSocket, and storage messages (`network_hook.ts:430-452`, `websocket_capture.ts:189-205`, `storage_capture.ts:159-175`).
- `content_hmac.ts:1-5` states the actual security model; `content_hmac.ts:128-145` signs canonical payloads and performs constant-time signature comparison.
- Tests use standard HMAC vectors, check the TS and injected-JS implementations agree, and reject missing/tampered signatures (`tests/unit/content_hmac_vectors.test.ts:29-77`, `tests/unit/content_postmessage_nonce.test.ts:94-124`).

**Impact**

The active requirements source materially understates protection and misstates the current trust boundary. Future maintenance based on the spec could remove HMAC as “out of scope,” omit signature lifecycle requirements, or create tests that accept nonce-only messages.

**Recommendation**

Update the active spec to define the combined nonce + per-start secret + per-message HMAC contract, including:

- secret generation and non-exposure via `window`;
- canonical payload and signature coverage;
- rejection of missing, malformed, mismatched, or stale signatures;
- stop/start and extension-reload lifecycle behavior;
- all three channel implementations and both HMAC/nonce test suites.

If the slug remains nonce-oriented, explicitly state that t121 supersedes its nonce-only threat model rather than leaving the prior model as current truth.

**History / pre-existing**

The spec is unchanged from `6774a80` (t097, 2026-08-11). Commit `849b739` (t121, 2026-08-11) added HMAC implementation/tests and associated the task with this spec in `docs/specs_index.md`, but did not update the spec body.

### TD-007 — Public English/privacy docs retain obsolete shared user-token model

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `README.en.md:38-46`, `README.en.md:60-67`, `README.en.md:134-160`, `PRIVACY.md:39-45`, `SECURITY.md:34-42`, `src/bridge/config.ts:137-157`, `src/extension/background/service_worker.ts:1259-1275`, `.mcp.json.example:1-14`

**Evidence / reproduction chain**

- `README.en.md:45` says Bridge authorization uses a user-supplied token, and `README.en.md:67` says extension, Bridge, and MCP must use the same token.
- `PRIVACY.md:41` repeats that Bridge requires a user-provided Bearer token.
- The same English README later correctly documents zero-config operation: Bridge generates/persists an MCP token, extension auto-enrolls, and MCP reads the token file (`README.en.md:134-160`). The document therefore contradicts itself.
- `SECURITY.md:38-42` defines the current two-token model: MCP token protects MCP/CDP routes; per-extension `instance_token` protects extension routes.
- Bridge token resolution is CLI → env → file → generated (`src/bridge/config.ts:137-157`). The extension starts the bridge client from default-backed user config (`src/extension/background/service_worker.ts:1259-1275`). `.mcp.json.example:1-14` supplies only the Bridge URL and no token.

**Impact**

Users may search for a token they do not need, place the MCP token into extension settings unnecessarily, or misunderstand route isolation and privacy boundaries. Contradictory authentication documentation is particularly harmful in a local data-capture product because it affects threat-model and secret-handling decisions.

**Recommendation**

Replace the obsolete sentences with the same two-token, zero-config model used by `SECURITY.md` and the later README section. Clarify that explicit shared configuration is an advanced override, not the default, and that extension `instance_token` is issued by enrollment rather than manually copied from MCP configuration.

**History / pre-existing**

The stale README sentence dates to `9c9833f` and the privacy statement to `a03ac6f` (both 2026-07-14). Zero-config was introduced by `d8970e7` (2026-07-22); later documentation updates synchronized the detailed setup and `SECURITY.md` but left these earlier summary statements unchanged.

### TD-008 — Test guide describes obsolete layout, authentication, tool names, and E2E selection

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `docs/guides/test.md:48-64`, `docs/guides/test.md:77-94`, `docs/guides/test.md:96-126`, `docs/guides/test.md:140-163`, `package.json:22-39`, `.mcp.json.example:1-14`, `src/mcp/tools.ts:9-31`, `playwright.config.ts:95-102`

**Evidence / reproduction chain**

- The guide says unit and E2E tests are flat under `tests/`, with `tests/fixtures` and `tests/helpers` (`docs/guides/test.md:48-64`). Current layout is `tests/unit`, `tests/e2e`, and `tests/support`; `package.json:36` starts `tests/support/fixtures/server.ts`.
- It says MCP requires `CAPTURE_ALL_BRIDGE_TOKEN`, is registered through `.claude/settings.json`, and exposes internal command names such as `capture.start`, `captures.list`, and `data.list` among “12 tools” (`docs/guides/test.md:96-126`). Current `.mcp.json.example` omits a token and loads the MCP artifact; public MCP names are defined in `src/mcp/tools.ts:9-31` and total 17 (`get_status`, `list_browsers`, plus 15 mapped tools). Internal protocol command names are not client-facing tool names.
- The project table says `e2e-mcp` matches `e2e-mcp*.spec.ts` (`docs/guides/test.md:149-151`), while config matches only `e2e-mcp.spec.ts` (`playwright.config.ts:105-107`).
- The guide claims `e2e-cdp-retry` is folded into the `e2e-cdp-capture` project (`docs/guides/test.md:163`), but that project matches only `e2e-cdp-capture.spec.ts` (`playwright.config.ts:95-102`).

**Impact**

Developers following the guide hit missing paths, configure obsolete credentials, call non-existent MCP tool names, and believe critical E2E scenarios run when they do not. This directly impairs reproducible verification and can conceal TD-001.

**Recommendation**

Regenerate the guide's repository tree and command table from current `package.json` and Playwright config. Replace MCP setup with `.mcp.json.example`, zero-config token resolution, and the public tool names from `MCP_TOOL_NAMES`. Remove claims that unmatched files are included; ideally link to an automated E2E coverage manifest produced by the discovery guard recommended in TD-001.

**History / pre-existing**

Most stale sections came from archived omni documentation (`5d15d01` / `ac8800a`, 2026-07). Commit `6af4a44` (2026-07-20) fixed selected guide details but left these layout, token, tool, and project-match statements stale.

### TD-009 — Contributor guide contains contradictory source layout and unusable Bridge/test commands

- **Severity:** Medium
- **Confidence:** 100%
- **Location:** `docs/guides/contributing_dev.md:51-99`, `docs/guides/contributing_dev.md:142-163`, `docs/guides/contributing_dev.md:198-213`, `docs/guides/contributing_dev.md:216-226`, `src/bridge/main.ts:4-14`, `package.json:32-38`

**Evidence / reproduction chain**

- The tree lists `src/agent`, `src/background`, `src/content`, `src/dashboard`, `src/devtools`, and `src/popup` (`docs/guides/contributing_dev.md:53-65`), then immediately claims it describes the current `src/{extension,bridge,mcp,shared}` structure (`docs/guides/contributing_dev.md:78`). The module summary continues using old `background/`, `content/`, and `agent/` locations (`docs/guides/contributing_dev.md:80-99`).
- The Bridge command omits required `--port`, while its health check targets port 3000 (`docs/guides/contributing_dev.md:142-150`). `src/bridge/main.ts:7-12` throws `Invalid bridge port` when no valid port is supplied; current standard usage is port 17831.
- Single-test and example paths use the migrated-away `tests/*.test.ts` layout (`docs/guides/contributing_dev.md:152-156`, `docs/guides/contributing_dev.md:198-213`, `docs/guides/contributing_dev.md:223-226`). Current files live under `tests/unit/`.

**Impact**

A new contributor cannot start Bridge with the documented command, probes the wrong port, and receives file-not-found/no-test results from copied test commands. The contradictory tree also encourages new code in paths that no longer own those responsibilities.

**Recommendation**

Replace the tree and module map with actual `src/extension/{background,content,dashboard,devtools,popup}`, `src/bridge`, `src/mcp`, and `src/shared` paths. Use `npm run bridge -- --port 17831` (or the project's exact supported syntax) and probe `http://127.0.0.1:17831/health`. Update all test examples to `tests/unit/...` and ensure imports match current relative paths.

**History / pre-existing**

The stale structure and commands originate mainly from `0d73bcc` (2026-07-16). `6af4a44` (2026-07-20) updated the tests subtree and added the current-layout note but did not replace the contradictory source tree or commands.

### TD-010 — Detail-tab E2E silently passes when the content container is absent

- **Severity:** Low
- **Confidence:** 100%
- **Location:** `tests/e2e/e2e-detail-tabs.spec.ts:48-70`

**Evidence / reproduction chain**

For each critical detail tab, the test requires the tab button, clicks it, then checks content only if `.dt-body, .simple-pad, .dt-overview` has a match (`tests/e2e/e2e-detail-tabs.spec.ts:58-70`). A render regression that removes the content container yields `body_count === 0` and skips every content assertion.

**Impact**

Tab controls may remain visible while their panels render nothing, and the suite still passes. This weakens a core dashboard detail-flow check that is already advertised as release-critical.

**Recommendation**

Require the active content container to be visible after every click, then assert a deterministic tab-specific heading, data element, or explicit empty state. Avoid a union locator that can select stale content from another tab.

**History / pre-existing**

Pre-existing since `b6b6040` (2026-06-14) introduced the conditional content assertion.

### TD-011 — Theme/i18n suite contains a permanent true placeholder with stale product claim

- **Severity:** Low
- **Confidence:** 100%
- **Location:** `tests/e2e/e2e-theme-i18n.spec.ts:348-352`

**Evidence / reproduction chain**

The test says the old detail page was removed and claims dashboard detail tabs are still hard-coded Chinese, then executes only `expect(true).toBe(true)` (`tests/e2e/e2e-theme-i18n.spec.ts:348-352`). Commit `1098bc3` (`refactor(t143): dashboard 全量迁移 i18n 国际化`) makes that explanatory claim stale, while the test remains permanently green.

**Impact**

The suite reports an additional passing i18n case without exercising any product behavior, and its comment directs maintainers toward an already-completed prerequisite.

**Recommendation**

Delete the placeholder or rebuild it against the real dashboard detail route. Change locale, open a capture detail view, and assert translated tab labels/content without page reload assumptions not guaranteed by production.

**History / pre-existing**

The placeholder dates to `8f48c92` (2026-06-14). Its comment became stale after t143 dashboard i18n migration; no subsequent test update replaced it.

### TD-012 — Privacy document links to a nonexistent README fragment, and doc tests ignore fragments

- **Severity:** Low
- **Confidence:** 100%
- **Location:** `PRIVACY.md:61-64`, `README.md:190`, `tests/unit/public_docs.test.ts:26-46`

**Evidence / reproduction chain**

`PRIVACY.md:63` links to `README.md#permissions-and-data`. The Chinese README's relevant heading is `## 权限、隐私与安全` (`README.md:190`), so it does not generate the English `permissions-and-data` anchor. The public-doc link test strips everything after `#` and checks only that `README.md` exists (`tests/unit/public_docs.test.ts:26-46`), allowing broken local fragments to pass.

**Impact**

Readers land at the top of a long README instead of the promised permission list. More broadly, public documentation tests can be green while any same-file or cross-file anchor is broken.

**Recommendation**

Point the privacy link to a stable existing heading (or add an explicit compatible anchor). Extend `expect_local_markdown_links_to_exist` to parse Markdown headings/explicit anchors and validate fragments after applying the renderer's slug rules; retain file-existence checking for fragmentless links.

**History / pre-existing**

Both the link and fragment-blind helper date to `a03ac6f` (2026-07-14). Later README edits changed surrounding public documentation without adding the referenced English anchor.

## Strengths

- `docs/specs_index.md:1-27` provides a compact, explicit list of current requirements. Most t092-t126 entries have identifiable production changes and focused regression tests rather than relying only on broad integration coverage.
- Public-document tests do enforce useful repository contracts: required public files, manifest permission synchronization, sensitive-default checks, and local target file existence (`tests/unit/public_docs.test.ts`). TD-012 is a narrow fragment-validation gap, not an absence of doc testing.
- HMAC coverage is unusually strong: `tests/unit/content_hmac_vectors.test.ts:29-77` uses known vectors, exercises block/key boundaries and UTF-8 data, compares TypeScript and injected-JavaScript implementations, and verifies tamper rejection.
- Several asynchronous lifecycle specs and tests explicitly cover race-prone behavior such as external body polling stop, deferred network timers, stale-cleanup mutex handling, generation guards, and agent-result delivery. These are high-value concurrency tests tied to concrete production state transitions.
- `README.md` gives a coherent zero-config setup, `SECURITY.md:34-50` accurately separates MCP and extension instance tokens, and `docs/guides/mcp_usage.md` is substantially aligned with current public MCP usage.
- The test guide already states sound assertion discipline at `docs/guides/test.md:171-178`: no conditional skip for core ACs and strict comparisons for growth/decline. Applying those written rules to the older E2E files would resolve several findings directly.

## Uncovered areas

- No Vitest, Playwright, build, TypeScript, coverage, or full validation command was run. Runtime behavior and test pass/fail status were not independently executed; the parent review process should own shared verification.
- The review did not inspect every line of every unit test or every production module. It prioritized active-spec paths, test/CI wiring, high-value E2E scenarios, public documents, and commands users are expected to run.
- Browser behavior was not validated in a real Chrome profile. Extension loading, headed CI feasibility, Chrome Web Store presentation, and OS-specific save/export behavior remain outside this report.
- External links were not fetched, and rendered Markdown anchors were not checked through GitHub's renderer; TD-012 is based on source heading/fragment mismatch and the repository test's explicit fragment stripping.
- Archived specs and task records were not reviewed comprehensively. Archived files were consulted only when they supplied acceptance intent or historical attribution for a current finding.
