# Security Policy

## Supported versions

Capture All is an early-stage project. Security fixes currently target the latest code on the default branch and the latest published source version. Version `0.1.0` is the current project version; older revisions may not receive fixes.

The project does not currently provide a compatibility guarantee, long-term support schedule, or security response SLA.

## Reporting a vulnerability

GitHub Private Vulnerability Reporting is enabled for this public repository. Submit vulnerability details through the repository's **Security** tab using **Report a vulnerability**.

Do not open a public issue for a suspected vulnerability. Do not post real capture data, Bridge tokens, browser content, request or response bodies, credentials, proof-of-concept data from third parties, or unredacted logs in public discussions.

A useful private report includes:

- affected version or commit;
- affected component: extension, Bridge, MCP server, or export;
- reproduction steps using synthetic data;
- expected and observed behavior;
- impact and prerequisites; and
- a minimal proof of concept with all secrets removed.

If GitHub Private Vulnerability Reporting is temporarily unavailable, retain the report privately and share only a non-sensitive notice that the private channel is unavailable. No public security email is currently designated.

## Security boundaries

### Extension

The extension requests high-impact browser permissions to capture authorized browser activity. Its Content Security Policy permits scripts only from the extension itself and blocks plugin objects.

Redaction reduces accidental disclosure but is not a complete data-loss-prevention system. Review [PRIVACY.md](PRIVACY.md) before capturing sensitive sites.

### Bridge

The Bridge is restricted to `127.0.0.1`. It rejects other bind addresses, requires a user-provided Bearer token on every non-health data endpoint, and restricts browser origins to Chrome extension origins. CORS preflight requests are checked by origin but do not carry application data. Authentication comparison uses a timing-safe hash comparison.

Localhost binding does not protect against every process running on the same machine. Treat the Bridge token as a secret, use a random value supplied by the user, keep `.mcp.json` local, and stop the Bridge when it is not needed.

Ordinary Bridge JSON bodies are limited to 1 MiB. Extension result bodies are limited to 64 MiB. These are availability limits, not confidentiality controls.

### MCP and AI agents

The MCP server communicates over stdio and uses the local Bridge for commands. MCP can return stored capture data to the connected AI agent without a second redaction pass. Only connect agents and services authorized to receive that data.

MCP intentionally does not expose capture deletion or database clearing commands.

## Secrets and public reports

Never commit or publish:

- a real Bridge token or local `.mcp.json`;
- credentials, API keys, cookies, authorization headers, or private URLs;
- unredacted capture exports or browser screenshots containing private data;
- request or response bodies from real users; or
- absolute local paths that reveal private workstation details.

Use clearly invalid synthetic values in tests and reports.

## Dependency and build security

Install dependencies with `npm ci` from the committed lockfile. Before proposing a security-sensitive change, run:

```bash
npm test
npm run build
npm audit --omit=dev
npm audit
```

A passing dependency audit does not prove the application is free from vulnerabilities.

## Disclosure expectations

Allow maintainers reasonable time to reproduce, fix, test, and release a correction before public disclosure. Do not test against systems, accounts, browser profiles, or data without authorization.
