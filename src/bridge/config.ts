import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { AgentBridgeConfig } from '../shared/protocol';

interface RawBridgeConfig {
    host?: string;
    port?: number;
    token?: string;
    command_timeout_ms?: number;
    full_data_timeout_ms?: number;
}

export function parse_bridge_config(raw: RawBridgeConfig): AgentBridgeConfig {
    const host = raw.host || '127.0.0.1';

    if (host !== '127.0.0.1') {
        throw new Error('Bridge host must be 127.0.0.1');
    }

    const port = raw.port;

    if (port === undefined || !Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error('Invalid bridge port');
    }

    if (!raw.token?.trim()) {
        throw new Error('Bridge token is required');
    }

    return {
        host,
        port,
        token: raw.token,
        command_timeout_ms: raw.command_timeout_ms ?? 120000,
        full_data_timeout_ms: raw.full_data_timeout_ms ?? 300000,
    };
}

export function parse_bridge_cli_args(
    argv: string[],
    env: { CAPTURE_ALL_BRIDGE_TOKEN?: string } = process.env,
): RawBridgeConfig {
    const raw: RawBridgeConfig = {
        token: env.CAPTURE_ALL_BRIDGE_TOKEN || undefined,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        const value = argv[index + 1];

        if (arg === '--port') {
            raw.port = Number(value);
            index += 1;
        }

        if (arg === '--token') {
            raw.token = value;
            index += 1;
        }
    }

    return raw;
}

export function default_token_file_path(): string {
    if (process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE) {
        return process.env.CAPTURE_ALL_BRIDGE_TOKEN_FILE;
    }
    const xdg = process.env.XDG_RUNTIME_DIR;
    if (xdg) {
        return join(xdg, 'capture-all', 'bridge_token');
    }
    return join(process.env.CAPTURE_ALL_PROJECT_DIR || process.cwd(), '.local', 'bridge_token');
}

export function generate_bridge_token(): string {
    return `mcp_${randomBytes(24).toString('base64url')}`;
}

export async function load_bridge_token_file(file_path: string): Promise<string | null> {
    try {
        // T064: 检查文件权限；非 0600 拒绝读取并记录
        const stat_result = await stat(file_path);
        const mode = stat_result.mode & 0o777;
        if (mode !== 0o600) {
            // 尝试收紧权限
            try {
                await chmod(file_path, 0o600);
            } catch {
                // 无法收紧权限，拒绝读取避免泄露
                return null;
            }
        }
        const content = await readFile(file_path, 'utf-8');
        return content.trim() || null;
    } catch {
        return null;
    }
}

export async function persist_bridge_token(token: string, file_path: string): Promise<string> {
    await mkdir(dirname(file_path), { recursive: true });
    await writeFile(file_path, token, { mode: 0o600 });
    // T064: 显式 chmod 确保（writeFile mode 对已存在文件可能不收紧）
    try {
        await chmod(file_path, 0o600);
    } catch {
        // best-effort
    }
    return file_path;
}

interface BridgeTokenResolution {
    token: string;
    source: 'cli' | 'env' | 'file' | 'generated';
    file_path?: string;
}

export async function resolve_bridge_token(
    cli_token?: string,
    env_token?: string,
    token_file_path?: string,
): Promise<BridgeTokenResolution> {
    if (cli_token?.trim()) {
        return { token: cli_token.trim(), source: 'cli' };
    }
    if (env_token?.trim()) {
        return { token: env_token.trim(), source: 'env' };
    }

    const file_path = token_file_path ?? default_token_file_path();
    const existing = await load_bridge_token_file(file_path);
    if (existing) {
        return { token: existing, source: 'file', file_path };
    }

    const generated = generate_bridge_token();
    await persist_bridge_token(generated, file_path);
    return { token: generated, source: 'generated', file_path };
}

export async function is_bridge_healthy(bridge_url: string): Promise<boolean> {
    try {
        const response = await fetch(`${bridge_url}/health`);
        return response.ok;
    } catch {
        return false;
    }
}
