import { execFileSync, spawnSync } from 'node:child_process';
import {
    mkdtempSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { parse as parse_yaml } from 'yaml';

interface WorkflowStep {
    'continue-on-error'?: boolean;
    if?: string | boolean;
    run?: string;
    uses?: string;
    with?: Record<string, string>;
}

interface WorkflowJob {
    'continue-on-error'?: boolean;
    if?: string | boolean;
    needs?: string | string[];
    steps: WorkflowStep[];
}

interface WorkflowConfig {
    on: Record<string, unknown>;
    permissions: Record<string, string>;
    jobs: Record<string, WorkflowJob>;
}

interface DependabotUpdate {
    'package-ecosystem': string;
    directory: string;
    schedule: {
        interval: string;
        timezone?: string;
    };
    'open-pull-requests-limit'?: number;
}

interface DependabotConfig {
    version: number;
    updates: DependabotUpdate[];
}

const checkout_action = 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0';
const setup_node_action = 'actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e';
const project_root = resolve(__dirname, '..');
const scanner_path = resolve(project_root, 'scripts/scan_tracked_tree.mjs');
const temporary_directories: string[] = [];

function read_project_file(path: string): string {
    return readFileSync(resolve(project_root, path), 'utf8');
}

function create_git_fixture(files: Record<string, string>): string {
    const fixture_root = mkdtempSync(resolve(tmpdir(), 'capture-all-scan-'));
    temporary_directories.push(fixture_root);
    execFileSync('git', ['init', '--quiet'], { cwd: fixture_root });

    for (const [path, content] of Object.entries(files)) {
        write_fixture_file(fixture_root, path, content);
    }

    execFileSync('git', ['add', '--', ...Object.keys(files)], {
        cwd: fixture_root,
    });
    return fixture_root;
}

function write_fixture_file(
    fixture_root: string,
    path: string,
    content: string,
): void {
    const absolute_path = resolve(fixture_root, path);
    mkdirSync(dirname(absolute_path), { recursive: true });
    writeFileSync(absolute_path, content);
}

function run_scanner(fixture_root: string) {
    return spawnSync(process.execPath, [scanner_path, '--root', fixture_root], {
        cwd: project_root,
        encoding: 'utf8',
    });
}

afterEach(() => {
    for (const path of temporary_directories.splice(0)) {
        rmSync(path, { recursive: true, force: true });
    }
});

describe('open-source automation configuration', () => {
    test('defines a read-only CI workflow with separate quality and base E2E jobs', () => {
        const workflow_text = read_project_file('.github/workflows/ci.yml');
        const workflow = parse_yaml(workflow_text) as WorkflowConfig;
        const quality_steps = workflow.jobs.quality.steps;
        const e2e_steps = workflow.jobs.e2e.steps;
        const quality_commands = quality_steps.flatMap((step) => step.run ?? []);
        const e2e_commands = e2e_steps.flatMap((step) => step.run ?? []);

        expect(workflow.on).toHaveProperty('push');
        expect(workflow.on).toHaveProperty('pull_request');
        expect(workflow.permissions).toEqual({ contents: 'read' });
        expect(Object.keys(workflow.jobs)).toEqual(['quality', 'e2e']);
        expect(quality_commands).toEqual([
            'npm ci',
            'npm run scan:tracked-tree',
            'npm test',
            'npm run build',
            'npm audit --omit=dev',
            'npm audit',
        ]);
        expect(e2e_commands).toEqual([
            'npm ci',
            'npx playwright install --with-deps chromium',
            'npm run test:e2e',
        ]);

        for (const [job_name, job] of Object.entries(workflow.jobs)) {
            expect(job.if, `${job_name} job must not have a conditional`)
                .toBeUndefined();
            expect(
                job['continue-on-error'],
                `${job_name} job must block on failure`,
            ).toBeUndefined();

            for (const step of job.steps) {
                expect(step.if, `${job_name} step must not have a conditional`)
                    .toBeUndefined();
                expect(
                    step['continue-on-error'],
                    `${job_name} step must block on failure`,
                ).toBeUndefined();
            }
        }

        for (const steps of [quality_steps, e2e_steps]) {
            expect(steps.some((step) => step.uses === checkout_action)).toBe(true);
            expect(steps.some((step) => (
                step.uses === setup_node_action
                && step.with?.['node-version-file'] === '.nvmrc'
                && step.with?.cache === 'npm'
            ))).toBe(true);
        }

        const external_actions = Object.values(workflow.jobs)
            .flatMap((job) => job.steps)
            .flatMap((step) => step.uses ?? []);
        expect(external_actions).toEqual(expect.arrayContaining([
            checkout_action,
            setup_node_action,
        ]));
        expect(external_actions.every((action) => (
            action === checkout_action || action === setup_node_action
        ))).toBe(true);
        expect(workflow_text).not.toContain('secrets.');
    });

    test('configures weekly npm and GitHub Actions dependency updates', () => {
        const dependabot_text = read_project_file('.github/dependabot.yml');
        const dependabot = parse_yaml(dependabot_text) as DependabotConfig;

        expect(dependabot.version).toBe(2);
        expect(dependabot.updates.map((update) => update['package-ecosystem']))
            .toEqual(['npm', 'github-actions']);

        for (const update of dependabot.updates) {
            expect(update.directory).toBe('/');
            expect(update.schedule).toMatchObject({
                interval: 'weekly',
                timezone: 'Asia/Shanghai',
            });
            expect(update['open-pull-requests-limit']).toBe(5);
        }

        expect(dependabot_text).not.toContain('secrets.');
        expect(dependabot_text).not.toMatch(/auto.?merge/i);
    });

    test('exposes the tracked-tree scanner as an npm command', () => {
        const package_json = JSON.parse(read_project_file('package.json')) as {
            scripts: Record<string, string>;
        };

        expect(package_json.scripts['scan:tracked-tree'])
            .toBe('node scripts/scan_tracked_tree.mjs');
    });
});

describe('tracked-tree scanner behavior', () => {
    test('ignores files excluded by Git', () => {
        const fixture_root = create_git_fixture({
            '.gitignore': '.mcp.json\n',
            'README.md': 'safe content\n',
        });
        const untracked_path = resolve(fixture_root, '.mcp.json');
        writeFileSync(untracked_path, 'not scanned because this file is ignored\n');

        const result = run_scanner(fixture_root);

        expect(result.status).toBe(0);
        expect(result.stdout).toContain('tracked-tree scan passed');
    });

    test('rejects forbidden tracked paths without printing file contents', () => {
        const fixture_root = create_git_fixture({
            '.mcp.json': 'synthetic local configuration\n',
        });

        const result = run_scanner(fixture_root);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('.mcp.json');
        expect(result.stderr).toContain('forbidden-path');
        expect(result.stderr).not.toContain('synthetic local configuration');
    });

    test('rejects personal absolute paths without printing the matched value', () => {
        const personal_path = '/' + ['home', 'example', 'private', 'file'].join('/');
        const fixture_root = create_git_fixture({
            'notes.txt': `path=${personal_path}\n`,
        });

        const result = run_scanner(fixture_root);

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('notes.txt:1');
        expect(result.stderr).toContain('personal-absolute-path');
        expect(result.stderr).not.toContain(personal_path);
    });

    test('allows URL paths that contain a home segment', () => {
        const fixture_root = create_git_fixture({
            'README.md': 'https://example.test/home/account/preferences\n',
        });

        const result = run_scanner(fixture_root);

        expect(result.status).toBe(0);
    });

    test('scans staged content instead of later working-tree edits', () => {
        const staged_value = 'local-' + 'x'.repeat(24);
        const fixture_root = create_git_fixture({
            '.env': `CAPTURE_ALL_BRIDGE_TOKEN=${staged_value}\n`,
        });
        write_fixture_file(fixture_root, '.env', 'CAPTURE_ALL_BRIDGE_TOKEN=<LOCAL_ONLY>\n');

        const result = run_scanner(fixture_root);
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('.env:1');
        expect(result.stderr).toContain('credential-assignment');
        expect(output).not.toContain(staged_value);
    });

    test('allows environment placeholders for credential keys', () => {
        const fixture_root = create_git_fixture({
            '.env.example': [
                'API_KEY=${API_KEY}',
                'CAPTURE_ALL_BRIDGE_TOKEN=<YOUR_BRIDGE_TOKEN>',
            ].join('\n'),
        });

        const result = run_scanner(fixture_root);

        expect(result.status).toBe(0);
    });

    test('does not treat credential-looking prefixes as placeholders', () => {
        const credential_values = [
            'token-prod!value@with#symbols$2026',
            'secret-production-password-2026!',
            'env-production-key-123456789',
            'example-live-secret!2026',
            'secret[value]',
            'token[prod]',
        ];
        const fixture_root = create_git_fixture({
            '.env': [
                `AUTH_TOKEN="${credential_values[0]}"`,
                `PASSWORD=${credential_values[1]}`,
                `API_KEY=${credential_values[4]}`,
                `ACCESS_TOKEN=${credential_values[5]}`,
            ].join('\n'),
            'api.json': JSON.stringify({
                [['api', 'key'].join('_')]: credential_values[2],
            }),
            'client.json': JSON.stringify({
                [['client', 'secret'].join('_')]: credential_values[3],
            }),
        });

        const result = run_scanner(fixture_root);
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(1);
        expect(result.stderr.match(/credential-assignment/g)).toHaveLength(6);
        for (const value of credential_values) {
            expect(output).not.toContain(value);
        }
    });

    test('rejects credential-like prefixes in source string literals', () => {
        const fixture_value = 'fake-production-token-2026';
        const fixture_root = create_git_fixture({
            'config.ts': [
                'export const config = {',
                `    auth_token: "${fixture_value}",`,
                '};',
            ].join('\n'),
        });

        const result = run_scanner(fixture_root);
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('config.ts:2 credential-assignment');
        expect(output).not.toContain(fixture_value);
    });

    test('does not let assertion calls hide later source credentials', () => {
        const credential_key = ['auth', 'token'].join('_');
        const fixture_value = 'production-secret-after-assertion';
        const fixture_root = create_git_fixture({
            'config.ts': [
                `expect(true); const config = { ${credential_key}: "${fixture_value}" };`,
            ].join('\n'),
        });

        const result = run_scanner(fixture_root);
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('config.ts:1 credential-assignment');
        expect(output).not.toContain(fixture_value);
    });

    test('scans complete YAML block scalar credential values', () => {
        const first_value = 'production-secret-first';
        const block_value = 'production-secret-after-blank-line';
        const password_key = ['db', 'password'].join('_').toUpperCase();
        const fixture_root = create_git_fixture({
            'config.yml': [
                `API_KEY: ${first_value}`,
                `${password_key}: |`,
                '',
                `    ${block_value}`,
            ].join('\n'),
        });

        const result = run_scanner(fixture_root);
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(1);
        expect(result.stderr.match(/credential-assignment/g)).toHaveLength(2);
        expect(result.stderr).toContain('config.yml:4 credential-assignment');
        expect(output).not.toContain(first_value);
        expect(output).not.toContain(block_value);
    });

    test('rejects credential-like test prefixes and multiline structured values', () => {
        const credential_values = [
            'fake-production-token-2026',
            'test-database-password-2026',
            'invalid-but-live-secret-2026',
        ];
        const credential_key = ['api', 'key'].join('_');
        const fixture_root = create_git_fixture({
            '.env': `AUTH_TOKEN=${credential_values[0]}\n`,
            'config.yml': `DB_PASSWORD: ${credential_values[1]}\n`,
            'config.json': [
                '{',
                `  "${credential_key}":`,
                `    "${credential_values[2]}"`,
                '}',
            ].join('\n'),
        });

        const result = run_scanner(fixture_root);
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(1);
        expect(result.stderr.match(/credential-assignment/g)).toHaveLength(3);
        for (const value of credential_values) {
            expect(output).not.toContain(value);
        }
    });

    test('rejects common credential patterns using obviously invalid fixtures', () => {
        const invalid_github_fixture = ['ghp_', 'x'.repeat(36)].join('');
        const synthetic_value = 'local-' + 'x'.repeat(24);
        const fixture_root = create_git_fixture({
            'config.json': JSON.stringify({
                name: 'example',
                api_key: synthetic_value,
            }),
            'config.yml': `bridge_token: ${synthetic_value}\n`,
            '.env': [
                `CAPTURE_ALL_BRIDGE_TOKEN=${synthetic_value}`,
                ['SPECIAL_TOKEN', '"local!value@with#symbols$2026"'].join('='),
            ].join('\n'),
            'token.txt': `${invalid_github_fixture}\n`,
        });

        const result = run_scanner(fixture_root);
        const output = `${result.stdout}${result.stderr}`;

        expect(result.status).toBe(1);
        expect(result.stderr).toContain('github-token');
        expect(result.stderr.match(/credential-assignment/g)).toHaveLength(4);
        expect(output).not.toContain(invalid_github_fixture);
        expect(output).not.toContain(synthetic_value);
    });
});
