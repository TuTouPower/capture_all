# Changelog

All notable changes to Capture All will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project intends to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html) after stable releases begin.

## [Unreleased]

### Added

- Apache-2.0 license and bilingual public project entry points.
- Privacy, security, contribution, and community policies.
- Project-level MCP configuration example and public MCP usage documentation.
- GitHub Actions CI, Dependabot configuration, and tracked-tree secret scanning.

### Changed

- Bridge access is restricted to authenticated localhost clients with explicit browser-origin checks and bounded request sizes.
- Input values are replaced with `[REDACTED]` when data redaction is enabled.
- Extension permissions and public permission documentation are synchronized.
- Build and test toolchains use current compatible Vite, CRXJS, Vitest, and esbuild versions.

### Fixed

- Stale capture state cleanup after extension service worker restarts.
- Large Bridge result handling now returns explicit size errors instead of command timeouts.
- Bridge polling lifecycle and error logging avoid stale asynchronous work and sensitive log output.

## [0.1.0]

Initial source version. Capture All provides a Chrome MV3 extension, local Bridge, and MCP server for capturing and querying browser debugging evidence. This source version has not been published to the Chrome Web Store or npm.
