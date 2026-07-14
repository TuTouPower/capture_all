# Contributing to Capture All

Capture All welcomes focused bug fixes, tests, documentation, and feature proposals. The project captures sensitive browser data, so privacy and security correctness take priority over convenience.

## Before starting

- Read [README.md](README.md), [PRIVACY.md](PRIVACY.md), and [SECURITY.md](SECURITY.md).
- Search existing issues before opening a duplicate.
- For substantial behavior or architecture changes, open a feature request before implementation.
- Report suspected vulnerabilities according to [SECURITY.md](SECURITY.md), not through a public issue.

## Development setup

Requirements:

- Node.js `^20.19.0` or `>=22.12.0`;
- npm; and
- Chrome or another Chromium browser with Manifest V3 support.

```bash
git clone https://github.com/TuTouPower/capture_all.git
cd capture_all
npm ci
npm test
npm run build
```

Load `artifacts/dist` from `chrome://extensions` using **Load unpacked**.

## Development workflow

Use test-driven development for fixes and features:

1. **RED** — add a test that demonstrates the missing or incorrect behavior and confirm it fails for the expected reason.
2. **GREEN** — implement the smallest change that makes the test pass.
3. **IMPROVE** — simplify without changing behavior, then rerun relevant tests.

Before submitting a pull request:

```bash
npm test
npm run build
npm run test:e2e
npm audit --omit=dev
npm run scan:tracked-tree
```

Run narrower tests while developing, but complete the full checks before review.

## Code conventions

- Match surrounding structure, naming, comments, and error-handling style.
- Use `snake_case` for variables, functions, files, and directories unless an established platform convention requires another form. Existing TypeScript components and public types keep their established names.
- Use 4 spaces, never tabs.
- Prefer immutable updates and explicit error handling.
- Do not add `console.log` debugging output.
- Keep changes focused; do not refactor unrelated code.
- Update relevant files under `docs/` and project instructions when behavior or public contracts change.

Product terminology uses **capture** / **采集**. Do not introduce session, record, recording, 录制, or 记录 as product-facing terms. Existing protocol or API identifiers remain unchanged unless their specification changes.

## Tests

Add behavior-focused tests, not source-string checks that can pass while behavior is broken. Cover error paths and asynchronous lifecycle boundaries when relevant.

The project uses Vitest for unit and integration tests and Playwright for E2E tests. New functionality should maintain at least 80% meaningful coverage in affected areas.

## Sensitive data rules

Never commit or attach:

- real Bridge tokens, credentials, cookies, API keys, or authorization headers;
- local `.mcp.json` or `.claude/` configuration;
- unredacted capture exports, browser screenshots, request or response bodies, or private URLs;
- local `data/`, `artifacts/`, `docs/archive/`, or `node_modules/`; or
- absolute workstation paths containing personal information.

Use synthetic, clearly invalid values in tests. Review diffs and generated files before staging them.

## Pull requests

Keep each pull request limited to one coherent change. Include:

- problem and scope;
- implementation summary;
- tests run and results;
- privacy, permission, or security impact; and
- screenshots only when they contain synthetic or fully redacted data.

A pull request is ready for review when tests and build pass, documentation is current, and no sensitive data appears in the diff.

By participating, contributors agree to follow [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
