import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    default_token_file_path,
    generate_bridge_token,
    load_bridge_token_file,
    parse_bridge_cli_args,
    parse_bridge_config,
    persist_bridge_token,
    resolve_bridge_token,
} from '../src/agent/bridge/config';

describe('parse_bridge_config', () => {
    it('parses valid user config', () => {
        expect(parse_bridge_config({
            port: 17831,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toEqual({
            host: '127.0.0.1',
            port: 17831,
            token: '<TEST_BRIDGE_TOKEN>',
            command_timeout_ms: 120000,
            full_data_timeout_ms: 300000,
        });
    });

    it('rejects non-local host', () => {
        expect(() => parse_bridge_config({
            host: '0.0.0.0',
            port: 17831,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toThrow('Bridge host must be 127.0.0.1');
    });

    it('rejects invalid port', () => {
        expect(() => parse_bridge_config({
            port: 0,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toThrow('Invalid bridge port');
        expect(() => parse_bridge_config({
            port: 70000,
            token: '<TEST_BRIDGE_TOKEN>',
        })).toThrow('Invalid bridge port');
    });

    it('rejects empty token', () => {
        expect(() => parse_bridge_config({ port: 17831, token: '' })).toThrow('Bridge token is required');
    });

    it('rejects whitespace-only token', () => {
        expect(() => parse_bridge_config({
            port: 17831,
            token: '   ',
        })).toThrow('Bridge token is required');
    });

    it('reads token from environment when CLI token is absent', () => {
        expect(parse_bridge_cli_args(
            ['--port', '17831'],
            { CAPTURE_ALL_BRIDGE_TOKEN: '<TEST_ENV_BRIDGE_TOKEN>' },
        )).toEqual({
            port: 17831,
            token: '<TEST_ENV_BRIDGE_TOKEN>',
        });
    });

    it('prefers CLI token over environment token', () => {
        expect(parse_bridge_cli_args(
            ['--port', '17831', '--token', '<TEST_CLI_BRIDGE_TOKEN>'],
            { CAPTURE_ALL_BRIDGE_TOKEN: '<TEST_ENV_BRIDGE_TOKEN>' },
        )).toEqual({
            port: 17831,
            token: '<TEST_CLI_BRIDGE_TOKEN>',
        });
    });

    it('does not use an empty environment token', () => {
        const raw_config = parse_bridge_cli_args(
            ['--port', '17831'],
            { CAPTURE_ALL_BRIDGE_TOKEN: '' },
        );

        expect(() => parse_bridge_config(raw_config)).toThrow(
            'Bridge token is required',
        );
    });
});

describe('generate_bridge_token', () => {
    it('returns a string with mcp_ prefix', () => {
        const token = generate_bridge_token();

        expect(token).toMatch(/^mcp_[A-Za-z0-9_-]+$/);
    });

    it('returns tokens of sufficient length', () => {
        const token = generate_bridge_token();

        expect(token.length).toBeGreaterThanOrEqual(36);
    });

    it('returns unique tokens on each call', () => {
        const token_a = generate_bridge_token();
        const token_b = generate_bridge_token();

        expect(token_a).not.toBe(token_b);
    });
});

describe('default_token_file_path', () => {
    it('returns CAPTURE_ALL_BRIDGE_TOKEN_FILE when set', () => {
        process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE = '/custom/token/path';

        expect(default_token_file_path()).toBe('/custom/token/path');

        delete process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE;
    });

    it('returns XDG path when XDG_RUNTIME_DIR is set', () => {
        process.env.XDG_RUNTIME_DIR = '/run/user/1000';
        delete process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE;

        expect(default_token_file_path()).toBe('/run/user/1000/capture-all/bridge_token');

        delete process.env.XDG_RUNTIME_DIR;
    });

    it('falls back to project .local path when no env vars', () => {
        delete process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE;
        delete process.env.XDG_RUNTIME_DIR;

        const path = default_token_file_path();

        expect(path).toContain('.local/bridge_token');
        expect(path.endsWith('bridge_token')).toBe(true);
    });
});

describe('bridge token file persistence', () => {
    let temp_dir: string;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), 'capture-all-token-test-'));
    });

    afterEach(async () => {
        await rm(temp_dir, { recursive: true, force: true });
    });

    it('persists token to file and loads it back', async () => {
        const file_path = join(temp_dir, 'bridge_token');
        const token = generate_bridge_token();

        await persist_bridge_token(token, file_path);
        const loaded = await load_bridge_token_file(file_path);

        expect(loaded).toBe(token);
    });

    it('returns null when file does not exist', async () => {
        const file_path = join(temp_dir, 'nonexistent_token');

        const result = await load_bridge_token_file(file_path);

        expect(result).toBeNull();
    });

    it('returns null when file is empty', async () => {
        const file_path = join(temp_dir, 'empty_token');

        await persist_bridge_token('', file_path);
        const result = await load_bridge_token_file(file_path);

        expect(result).toBeNull();
    });
});

describe('resolve_bridge_token', () => {
    let temp_dir: string;

    beforeEach(async () => {
        temp_dir = await mkdtemp(join(tmpdir(), 'capture-all-token-resolve-'));
    });

    afterEach(async () => {
        await rm(temp_dir, { recursive: true, force: true });
    });

    it('uses CLI token when provided', async () => {
        const result = await resolve_bridge_token('<CLI_TOKEN>');

        expect(result.token).toBe('<CLI_TOKEN>');
        expect(result.source).toBe('cli');
    });

    it('uses env token when CLI is absent', async () => {
        const result = await resolve_bridge_token(undefined, '<ENV_TOKEN>');

        expect(result.token).toBe('<ENV_TOKEN>');
        expect(result.source).toBe('env');
    });

    it('prefers CLI token over env token', async () => {
        const result = await resolve_bridge_token('<CLI_TOKEN>', '<ENV_TOKEN>');

        expect(result.token).toBe('<CLI_TOKEN>');
        expect(result.source).toBe('cli');
    });

    it('trims whitespace from CLI token', async () => {
        const result = await resolve_bridge_token('  <TOKEN>  ');

        expect(result.token).toBe('<TOKEN>');
    });

    it('reads token from file when CLI and env are absent', async () => {
        const file_path = join(temp_dir, 'bridge_token');
        await persist_bridge_token('<FILE_TOKEN>', file_path);

        const result = await resolve_bridge_token(undefined, undefined, file_path);

        expect(result.token).toBe('<FILE_TOKEN>');
        expect(result.source).toBe('file');
        expect(result.file_path).toBe(file_path);
    });

    it('generates and persists new token when all sources are absent', async () => {
        const file_path = join(temp_dir, 'bridge_token');

        const result = await resolve_bridge_token(undefined, undefined, file_path);

        expect(result.token).toMatch(/^mcp_[A-Za-z0-9_-]+$/);
        expect(result.source).toBe('generated');
        expect(result.file_path).toBe(file_path);

        const loaded = await load_bridge_token_file(file_path);
        expect(loaded).toBe(result.token);
    });

    it('prefers env token over file token', async () => {
        const file_path = join(temp_dir, 'bridge_token');
        await persist_bridge_token('<FILE_TOKEN>', file_path);

        const result = await resolve_bridge_token(undefined, '<ENV_TOKEN>', file_path);

        expect(result.token).toBe('<ENV_TOKEN>');
        expect(result.source).toBe('env');
    });
});
