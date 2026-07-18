import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { parse as parse_yaml } from 'yaml';
import { DEFAULT_USER_CONFIG } from '../src/shared/constants';

interface ExtensionManifest {
    description: string;
    permissions: string[];
    host_permissions: string[];
}

const project_root = resolve(__dirname, '..');
const read_project_file = (path: string): string =>
    readFileSync(resolve(project_root, path), 'utf8');
const extension_manifest = JSON.parse(
    read_project_file('src/extension/manifest.json'),
) as ExtensionManifest;

function extract_documented_permissions(content: string): string[] {
    return [...content.matchAll(/^\| `([^`]+)` \|/gm)]
        .map((match) => match[1]);
}

function expect_local_markdown_links_to_exist(path: string): void {
    const content = read_project_file(path);
    const link_pattern = /\[[^\]]+\]\(([^)]+)\)/g;

    for (const match of content.matchAll(link_pattern)) {
        const target = match[1].trim();
        if (
            target.startsWith('#')
            || target.startsWith('https://')
            || target.startsWith('http://')
            || target.startsWith('mailto:')
        ) {
            continue;
        }

        const relative_path = decodeURIComponent(target.split('#')[0]);
        expect(
            existsSync(resolve(project_root, dirname(path), relative_path)),
            `${path} links to missing file: ${target}`,
        ).toBe(true);
    }
}

describe('public project entry points', () => {
    test('includes public project, policy, and community files', () => {
        for (const path of [
            'README.md',
            'README.en.md',
            'LICENSE',
            'PRIVACY.md',
            'SECURITY.md',
            'CONTRIBUTING.md',
            'CODE_OF_CONDUCT.md',
            'CHANGELOG.md',
            '.github/ISSUE_TEMPLATE/bug_report.yml',
            '.github/ISSUE_TEMPLATE/feature_request.yml',
            '.github/ISSUE_TEMPLATE/config.yml',
            '.github/pull_request_template.md',
        ]) {
            expect(existsSync(resolve(project_root, path)), path).toBe(true);
        }
    });

    test('documents installation, architecture, permissions, data, and limits', () => {
        const chinese_readme = read_project_file('README.md');
        const english_readme = read_project_file('README.en.md');

        for (const content of [english_readme, chinese_readme]) {
            expect(content).toContain('npm ci');
            expect(content).toContain('npm run build');
            expect(content).toContain('artifacts/dist');
            expect(content).toContain('chrome://extensions');
            expect(content).toContain('127.0.0.1');
            expect(content).toContain('Apache-2.0');
            expect(content).toContain('<all_urls>');
            expect(content).toContain('32 MiB');
        }

        expect(english_readme).toContain('Load unpacked');
        expect(english_readme).toContain('Known limitations');
        expect(chinese_readme).toContain('加载已解压的扩展程序');
        expect(chinese_readme).toContain('已知限制');
    });

    test('uses valid local links without private paths', () => {
        for (const path of ['README.md', 'README.en.md']) {
            const content = read_project_file(path);
            expect(content).not.toMatch(/\/home\//);
            expect(content).not.toContain('docs/archive');
            expect(content).not.toContain('.claude/settings.json');
            expect_local_markdown_links_to_exist(path);
        }
    });

    test('keeps the public permission list synchronized with the manifest', () => {
        const chinese_readme = read_project_file('README.md');
        const english_readme = read_project_file('README.en.md');
        const expected_permissions = [
            ...extension_manifest.permissions,
            ...extension_manifest.host_permissions,
        ];

        expect(extract_documented_permissions(english_readme)).toEqual(
            expected_permissions,
        );
        expect(extract_documented_permissions(chinese_readme)).toEqual(
            expected_permissions,
        );
        expect(extension_manifest.description).not.toMatch(/\brecord\b/i);
    });

    test('warns that sensitive capture options are enabled by default', () => {
        expect(DEFAULT_USER_CONFIG).toMatchObject({
            capture_input_values: true,
            capture_request_body: true,
            capture_response_body: true,
        });

        expect(read_project_file('README.en.md')).toContain(
            'Input values and request/response body capture are enabled by default.',
        );
        expect(read_project_file('README.md')).toContain(
            '输入值、请求 body、响应 body 采集默认开启',
        );
    });

    test('documents privacy behavior and security reporting', () => {
        const privacy = read_project_file('PRIVACY.md');
        const security = read_project_file('SECURITY.md');

        expect(privacy).toContain('enabled by default');
        expect(privacy).toContain('IndexedDB');
        expect(privacy).toContain('chrome.storage.local');
        expect(privacy).toContain('no telemetry');
        expect(privacy).toContain('MCP');
        expect(privacy).toContain('AI agent');
        expect(privacy).toContain('third-party iframes');
        expect(privacy).toContain('all_frames: true');
        expect(privacy).toContain('request and response bodies are not content-scanned');
        expect(privacy).toContain('Exported files are independent copies');

        expect(security).toContain('GitHub Private Vulnerability Reporting is enabled');
        expect(security).toContain('Report a vulnerability');
        expect(security).toContain('127.0.0.1');
        expect(security).toContain('Bearer token');
        expect(security).toContain('Do not open a public issue');
        expect(security).not.toContain('@example.com');
    });

    test('uses valid policy links without private paths', () => {
        for (const path of ['PRIVACY.md', 'SECURITY.md']) {
            const content = read_project_file(path);
            expect(content).not.toMatch(/\/home\//);
            expect(content).not.toContain('docs/archive');
            expect_local_markdown_links_to_exist(path);
        }
    });

    test('provides parseable issue forms with sensitive-data warnings', () => {
        for (const path of [
            '.github/ISSUE_TEMPLATE/bug_report.yml',
            '.github/ISSUE_TEMPLATE/feature_request.yml',
            '.github/ISSUE_TEMPLATE/config.yml',
        ]) {
            expect(() => parse_yaml(read_project_file(path)), path).not.toThrow();
        }

        const bug_form = parse_yaml(
            read_project_file('.github/ISSUE_TEMPLATE/bug_report.yml'),
        ) as { body: Array<{ id?: string; type: string }> };
        expect(bug_form.body.some((item) => item.id === 'sensitive_data')).toBe(true);
        expect(read_project_file('.github/ISSUE_TEMPLATE/bug_report.yml'))
            .toContain('Do not attach unredacted captures');
        expect(read_project_file('.github/pull_request_template.md'))
            .toContain('No real tokens, credentials, private browser data, or unredacted captures');
    });

    test('documents contribution rules and current changelog state', () => {
        const contributing = read_project_file('CONTRIBUTING.md');
        const conduct = read_project_file('CODE_OF_CONDUCT.md');
        const changelog = read_project_file('CHANGELOG.md');

        expect(contributing).toContain('RED');
        expect(contributing).toContain('GREEN');
        expect(contributing).toContain('npm test');
        expect(contributing).toContain('npm run build');
        expect(contributing).toContain('npm run scan:tracked-tree');
        expect(contributing).toContain('snake_case');
        expect(contributing).toContain('Never commit');
        expect(conduct).toContain('Contributor Covenant');
        expect(conduct).toContain('version 2.1');
        expect(conduct).toContain(
            'All complaints will be reviewed and investigated promptly and fairly.',
        );
        expect(conduct).not.toContain('[INSERT CONTACT METHOD]');
        expect(changelog).toContain('Keep a Changelog');
        expect(changelog).toContain('## [Unreleased]');
        expect(changelog).toContain('## [0.1.0]');
        expect(changelog).not.toContain('/compare/v0.1.0...HEAD');
        expect(changelog).not.toMatch(/## \[0\.1\.0\] - \d{4}-\d{2}-\d{2}/);
    });

    test('uses the official Apache License 2.0 text', () => {
        const license = read_project_file('LICENSE');
        const license_hash = createHash('sha256').update(license).digest('hex');

        expect(license_hash).toBe(
            'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
        );
    });
});
