# Project Structure Reorganization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize Record All to match `<USER_HOME>/karson_ubuntu/project_manager/docs/project_structure.md` while preserving extension behavior, build output, tests, and existing feature code.

**Architecture:** Move source code under `src/`, static assets under `assets/`, design docs under `docs/design/`, and keep generated artifacts out of git. Do this in small commits: cleanup first, asset/docs moves second, source move last because it touches import paths, manifest paths, and Vite inputs.

**Tech Stack:** Chrome MV3 extension, TypeScript, Vite, `@crxjs/vite-plugin`, Vitest, Playwright, Node-based MCP/bridge code.

---

## Target Structure

```txt
record_all/
├─ src/
│  ├─ agent/
│  ├─ background/
│  ├─ content/
│  ├─ detail/
│  ├─ devtools/
│  ├─ popup/
│  └─ shared/
├─ assets/
│  └─ icons/
├─ docs/
│  ├─ archive/
│  ├─ design/
│  ├─ superpowers/
│  ├─ errors.md
│  ├─ review_gpt.md
│  └─ review_mimo.md
├─ tests/
├─ dist/
├─ TASKS.md
├─ manifest.json
├─ package.json
├─ package-lock.json
├─ tsconfig.json
├─ vite.config.ts
├─ vitest.config.ts
├─ playwright.config.ts
└─ .gitignore
```

## Files To Move

| Current | Target | Reason |
|---|---|---|
| `background/` | `src/background/` | Source code belongs under `src/` |
| `content/` | `src/content/` | Source code belongs under `src/` |
| `popup/` | `src/popup/` | Source code belongs under `src/` |
| `detail/` | `src/detail/` | Source code belongs under `src/` |
| `devtools/` | `src/devtools/` | Source code belongs under `src/` |
| `shared/` | `src/shared/` | Shared source code belongs under `src/` |
| `agent/` | `src/agent/` | MCP/bridge source code belongs under `src/` |
| `icons/` | `assets/icons/` | Static resources belong under `assets/` |
| empty `export_templates/` | remove | Empty unused directory is not tracked and should not be recreated |
| `docs/design_ai_brief.md` | `docs/design/design_ai_brief.md` | Design-facing docs belong under `docs/design/` |
| `record-all.zip` | remove from git | Build artifact should not be tracked |
| `test-results/` | remove from git if tracked; ignore always | Test report artifact should not be tracked |

## Files To Modify

| File | Change |
|---|---|
| `.gitignore` | Add `record-all.zip`, `*.zip`, `test-results/` |
| `manifest.json` | Change script/html/icon paths to `src/...` and `assets/icons/...` |
| `vite.config.ts` | Change Rollup inputs to `src/...` |
| `tsconfig.json` | Change include to `src/**/*.ts`, keep tests excluded from app build |
| `package.json` | Change bridge and MCP script paths to `src/agent/...` |
| `tests/*.test.ts` | Update imports from `../shared/...` etc. to `../src/shared/...` and agent imports to `../src/agent/...` |
| `playwright.config.ts` | Keep `testDir: './tests'`; no path change expected |
| `docs/design/design_ai_brief.md` | Move only; no content change required |

## Commit Plan

1. `chore: ignore generated artifacts`
2. `chore: move static assets and design docs`
3. `refactor: move extension source under src`
4. `refactor: move agent source under src`
5. `test: update imports for src layout`

---

### Task 1: Ignore Generated Artifacts

**Files:**
- Modify: `.gitignore`
- Remove from git index if tracked: `record-all.zip`
- Remove from git index if tracked: `test-results/.last-run.json`

- [ ] **Step 1: Verify artifact tracking state**

Run:

```bash
git status --short
git ls-files "record-all.zip" "test-results/.last-run.json" "dist"
```

Expected:

```txt
record-all.zip
```

or no output for already-untracked files. `dist/` should not be tracked.

- [ ] **Step 2: Update `.gitignore`**

Edit `.gitignore` to exactly include:

```gitignore
node_modules/
dist/
test-results/
*.log
*.zip
.DS_Store
```

- [ ] **Step 3: Remove generated artifacts from git index when tracked**

Run:

```bash
git rm --cached "record-all.zip" 2>/dev/null || true
git rm --cached "test-results/.last-run.json" 2>/dev/null || true
```

Expected: tracked artifacts are removed from git index; untracked or absent artifacts are ignored.

- [ ] **Step 4: Verify status**

Run:

```bash
git status --short
```

Expected: `.gitignore` modified; `record-all.zip` and `test-results/` not shown as untracked.

- [ ] **Step 5: Commit**

Run:

```bash
git add ".gitignore"
git commit -m "$(cat <<'EOF'
chore: ignore generated artifacts

Keep packaged zips and test reports out of git so the project root stays clean.
EOF
)"
```

Expected: commit succeeds.

---

### Task 2: Move Static Assets And Design Docs

**Files:**
- Move: `icons/` → `assets/icons/`
- Move: `export_templates/` → `assets/export_templates/`
- Move: `docs/design_ai_brief.md` → `docs/design/design_ai_brief.md`
- Modify: `manifest.json`

- [ ] **Step 1: Move asset directories**

Run:

```bash
mkdir -p "assets"
git mv "icons" "assets/icons"
git mv "export_templates" "assets/export_templates"
```

Expected: assets now live under `assets/`.

- [ ] **Step 2: Move design brief**

Run:

```bash
mkdir -p "docs/design"
git mv "docs/design_ai_brief.md" "docs/design/design_ai_brief.md"
```

Expected: design brief now lives under `docs/design/`.

- [ ] **Step 3: Update icon paths in `manifest.json`**

Change:

```json
"default_icon": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
},
...
"icons": {
  "16": "icons/icon16.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
}
```

To:

```json
"default_icon": {
  "16": "assets/icons/icon16.png",
  "48": "assets/icons/icon48.png",
  "128": "assets/icons/icon128.png"
},
...
"icons": {
  "16": "assets/icons/icon16.png",
  "48": "assets/icons/icon48.png",
  "128": "assets/icons/icon128.png"
}
```

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected:

```txt
✓ built
```

and `dist/manifest.json` contains `assets/icons/icon16.png`, `assets/icons/icon48.png`, and `assets/icons/icon128.png`.

- [ ] **Step 5: Commit**

Run:

```bash
git add "assets" "docs/design" "manifest.json"
git commit -m "$(cat <<'EOF'
chore: move assets and design docs

Place icons, export templates, and design handoff docs under the standard project directories.
EOF
)"
```

Expected: commit succeeds.

---

### Task 3: Move Extension Source Under `src/`

**Files:**
- Move: `background/` → `src/background/`
- Move: `content/` → `src/content/`
- Move: `popup/` → `src/popup/`
- Move: `detail/` → `src/detail/`
- Move: `devtools/` → `src/devtools/`
- Move: `shared/` → `src/shared/`
- Modify: `manifest.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Move extension source directories**

Run:

```bash
mkdir -p "src"
git mv "background" "src/background"
git mv "content" "src/content"
git mv "popup" "src/popup"
git mv "detail" "src/detail"
git mv "devtools" "src/devtools"
git mv "shared" "src/shared"
```

Expected: all extension source directories live under `src/`.

- [ ] **Step 2: Update extension entry paths in `manifest.json`**

Change:

```json
"background": {
  "service_worker": "background/service_worker.ts",
  "type": "module"
},
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content/content_script.ts"],
    "run_at": "document_start",
    "all_frames": true
  }
],
"action": {
  "default_popup": "popup/popup.html",
  "default_icon": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
},
"devtools_page": "devtools/devtools.html"
```

To:

```json
"background": {
  "service_worker": "src/background/service_worker.ts",
  "type": "module"
},
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["src/content/content_script.ts"],
    "run_at": "document_start",
    "all_frames": true
  }
],
"action": {
  "default_popup": "src/popup/popup.html",
  "default_icon": {
    "16": "assets/icons/icon16.png",
    "48": "assets/icons/icon48.png",
    "128": "assets/icons/icon128.png"
  }
},
"devtools_page": "src/devtools/devtools.html"
```

- [ ] **Step 3: Update Vite inputs in `vite.config.ts`**

Change:

```ts
input: {
    background: 'background/service_worker.ts',
    content: 'content/content_script.ts',
    popup: 'popup/popup.html',
    detail: 'detail/detail.html',
    devtools: 'devtools/devtools.html',
    devtools_panel: 'devtools/devtools_panel.html'
}
```

To:

```ts
input: {
    background: 'src/background/service_worker.ts',
    content: 'src/content/content_script.ts',
    popup: 'src/popup/popup.html',
    detail: 'src/detail/detail.html',
    devtools: 'src/devtools/devtools.html',
    devtools_panel: 'src/devtools/devtools_panel.html'
}
```

- [ ] **Step 4: Update TypeScript app include in `tsconfig.json`**

Change:

```json
"include": ["**/*.ts"],
"exclude": ["node_modules", "dist", "tests"]
```

To:

```json
"include": ["src/**/*.ts", "vite.config.ts", "vitest.config.ts", "playwright.config.ts"],
"exclude": ["node_modules", "dist", "tests"]
```

- [ ] **Step 5: Run build and capture import errors**

Run:

```bash
npm run build
```

Expected before Task 5: build may fail because tests and scripts still import old paths, but extension-internal relative imports should remain valid because moved directories kept their relative sibling layout under `src/`.

If build fails for a moved source import, update that import path in the moved source file before continuing. Example:

```ts
import { escape_for_html_embed } from '../shared/escape';
```

should remain unchanged in `src/background/exporter.ts` because `src/background` and `src/shared` are still siblings.

- [ ] **Step 6: Commit**

Run:

```bash
git add "src/background" "src/content" "src/popup" "src/detail" "src/devtools" "src/shared" "manifest.json" "vite.config.ts" "tsconfig.json"
git commit -m "$(cat <<'EOF'
refactor: move extension source under src

Relocate extension runtime, UI, and shared modules into src while preserving their relative module layout.
EOF
)"
```

Expected: commit succeeds.

---

### Task 4: Move Agent Source Under `src/agent/`

**Files:**
- Move: `agent/` → `src/agent/`
- Modify: `package.json`

- [ ] **Step 1: Move agent source directory**

Run:

```bash
git mv "agent" "src/agent"
```

Expected: MCP/bridge source lives under `src/agent/`.

- [ ] **Step 2: Update package scripts in `package.json`**

Change:

```json
"bridge": "tsx agent/bridge/main.ts",
"mcp": "tsx agent/mcp/main.ts"
```

To:

```json
"bridge": "tsx src/agent/bridge/main.ts",
"mcp": "tsx src/agent/mcp/main.ts"
```

- [ ] **Step 3: Run agent-related tests and capture import errors**

Run:

```bash
npm test -- --run tests/agent_protocol.test.ts tests/agent_bridge_queue.test.ts tests/agent_bridge_config.test.ts tests/agent_bridge_server.test.ts tests/agent_mcp_client.test.ts
```

Expected before Task 5: tests may fail because imports still reference `../agent/...`. Task 5 updates those imports.

- [ ] **Step 4: Commit**

Run:

```bash
git add "src/agent" "package.json"
git commit -m "$(cat <<'EOF'
refactor: move agent source under src

Relocate MCP and bridge source into src/agent and update package script entrypoints.
EOF
)"
```

Expected: commit succeeds.

---

### Task 5: Update Test Imports For `src/` Layout

**Files:**
- Modify: `tests/agent_protocol.test.ts`
- Modify: `tests/agent_bridge_queue.test.ts`
- Modify: `tests/agent_bridge_config.test.ts`
- Modify: `tests/agent_bridge_server.test.ts`
- Modify: `tests/agent_mcp_client.test.ts`
- Modify: `tests/capture_modes.test.ts`
- Modify: `tests/escape.test.ts`
- Modify: `tests/export_settings.test.ts`
- Modify: `tests/network_capture.test.ts`
- Modify: `tests/redaction.test.ts`
- Modify: `tests/storage.test.ts`
- Modify: `tests/system_time.test.ts`
- Modify: `tests/tab_events.test.ts`

- [ ] **Step 1: Replace shared imports in tests**

For every test import that starts with:

```ts
'../shared/
```

change it to:

```ts
'../src/shared/
```

Concrete examples:

```ts
import { build_export_filename } from '../shared/export_settings';
```

becomes:

```ts
import { build_export_filename } from '../src/shared/export_settings';
```

```ts
import { add_system_times_to_session_data, format_system_time } from '../shared/system_time';
```

becomes:

```ts
import { add_system_times_to_session_data, format_system_time } from '../src/shared/system_time';
```

- [ ] **Step 2: Replace background imports in tests**

For every test import that starts with:

```ts
'../background/
```

change it to:

```ts
'../src/background/
```

Concrete example:

```ts
import { export_json } from '../background/exporter';
```

becomes:

```ts
import { export_json } from '../src/background/exporter';
```

- [ ] **Step 3: Replace content imports in tests**

For every test import that starts with:

```ts
'../content/
```

change it to:

```ts
'../src/content/
```

Concrete example:

```ts
import { build_css_path } from '../content/dom_capture';
```

becomes:

```ts
import { build_css_path } from '../src/content/dom_capture';
```

- [ ] **Step 4: Replace agent imports in tests**

For every test import that starts with:

```ts
'../agent/
```

change it to:

```ts
'../src/agent/
```

Concrete examples:

```ts
import { AgentCommandQueue } from '../agent/bridge/command_queue';
```

becomes:

```ts
import { AgentCommandQueue } from '../src/agent/bridge/command_queue';
```

```ts
import { build_record_id, parse_record_id } from '../agent/shared/protocol';
```

becomes:

```ts
import { build_record_id, parse_record_id } from '../src/agent/shared/protocol';
```

- [ ] **Step 5: Run all tests**

Run:

```bash
npm test
```

Expected:

```txt
Test Files  14 passed (14)
Tests  108 passed (108)
```

- [ ] **Step 6: Run build**

Run:

```bash
npm run build
```

Expected:

```txt
✓ built
```

- [ ] **Step 7: Commit**

Run:

```bash
git add "tests"
git commit -m "$(cat <<'EOF'
test: update imports for src layout

Point unit and integration tests at the relocated source modules under src.
EOF
)"
```

Expected: commit succeeds.

---

### Task 6: Final Structure Verification

**Files:**
- Read-only verification

- [ ] **Step 1: Verify root directory is clean**

Run:

```bash
find . -maxdepth 1 -mindepth 1 -printf '%f\n' | sort
```

Expected root entries should be limited to project files and first-level directories like:

```txt
.git
.gitignore
TASKS.md
assets
docs
manifest.json
node_modules
package-lock.json
package.json
playwright.config.ts
src
tests
tsconfig.json
vite.config.ts
vitest.config.ts
```

`background`, `content`, `popup`, `detail`, `devtools`, `shared`, `agent`, `icons`, `export_templates`, `record-all.zip`, and `test-results` should not appear at root.

- [ ] **Step 2: Verify ignored generated artifacts stay ignored**

Run:

```bash
npm run build
rm -f "record-all.zip"
(cd "dist" && zip -qr "../record-all.zip" .)
git status --short
```

Expected: `dist/` and `record-all.zip` do not appear in `git status --short`.

- [ ] **Step 3: Verify final tests**

Run:

```bash
npm test
npm run build
```

Expected:

```txt
Test Files  14 passed (14)
Tests  108 passed (108)
✓ built
```

- [ ] **Step 4: Commit final verification docs only if needed**

If no files changed, do not create a commit.

If `.gitignore` or docs require a small correction from verification, commit only those files:

```bash
git add ".gitignore" "docs"
git commit -m "$(cat <<'EOF'
docs: document project structure cleanup

Record the final structure rules after reorganizing project files.
EOF
)"
```

Expected: either no commit is needed, or a small docs/config-only commit succeeds.

---

## Self-Review

- Spec coverage: The plan covers root cleanup, generated artifact policy, asset relocation, docs relocation, extension source relocation, agent source relocation, config updates, tests, and final verification.
- Placeholder scan: No unspecified implementation steps remain; exact paths, commands, expected outputs, and commit grouping are included.
- Type/path consistency: The target path is consistently `src/` for source, `assets/` for resources, `docs/design/` for design docs, and `dist/` for generated output.
