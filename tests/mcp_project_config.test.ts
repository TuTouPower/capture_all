import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const project_root = resolve(__dirname, '..');
const gitignore = readFileSync(resolve(project_root, '.gitignore'), 'utf8');
const example_path = resolve(project_root, '.mcp.json.example');
const example_text = readFileSync(example_path, 'utf8');
const example = JSON.parse(example_text) as {
    mcpServers: {
        'capture-all': {
            command: string;
            args: string[];
            env: Record<string, string>;
        };
    };
};

describe('project MCP example', () => {
    it('ignores and does not track the local MCP configuration', () => {
        expect(gitignore.split('\n')).toContain('.mcp.json');
        expect(execFileSync('git', ['ls-files', '--', '.mcp.json'], {
            cwd: project_root,
            encoding: 'utf8',
        })).toBe('');
    });

    it('launches the project artifact from a different working directory', () => {
        const server = example.mcpServers['capture-all'];
        const project_dir = mkdtempSync(resolve(tmpdir(), 'capture-all-mcp-project-'));
        const other_dir = mkdtempSync(resolve(tmpdir(), 'capture-all-mcp-cwd-'));
        const artifact_dir = resolve(project_dir, 'artifacts/mcp');
        const marker_path = resolve(project_dir, 'launched');

        try {
            mkdirSync(artifact_dir, { recursive: true });
            writeFileSync(
                resolve(artifact_dir, 'mcp.mjs'),
                `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker_path)}, 'ok');`,
            );

            execFileSync(server.command, server.args, {
                cwd: other_dir,
                env: {
                    ...process.env,
                    ...server.env,
                    CLAUDE_PROJECT_DIR: project_dir,
                },
            });

            expect(readFileSync(marker_path, 'utf8')).toBe('ok');
        } finally {
            rmSync(project_dir, { recursive: true, force: true });
            rmSync(other_dir, { recursive: true, force: true });
        }
    });

    it('contains no absolute local paths', () => {
        const server = example.mcpServers['capture-all'];
        const config_values = [server.command, ...server.args, ...Object.values(server.env)];
        const local_path = /(?:^|['"`\s])(?:\/(?!\/)|[A-Za-z]:[\\/]|\\\\)/;

        expect(config_values).not.toContain(expect.stringMatching(local_path));
        expect(server.env.CAPTURE_ALL_BRIDGE_URL).toBe('http://127.0.0.1:17831');
        expect(server.env.CAPTURE_ALL_BRIDGE_TOKEN).toBe('<YOUR_BRIDGE_TOKEN>');
    });
});
