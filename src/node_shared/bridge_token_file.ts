// node_shared/bridge_token_file.ts — t187: Bridge token 文件契约（Node-only 中立模块）。
// 从 bridge/config 移出：MCP 只读 token 文件不再依赖 Bridge 启动职责模块（架构依赖方向修复）。
// 放 node_shared 而非 shared：src/shared 被 extension 浏览器 bundle 引用，禁止 Node API。
import { chmod, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

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

export type TokenFileFailureReason = 'stat_failed' | 'chmod_failed' | 'read_failed' | 'empty';

export interface TokenFileLoadResult {
    token: string | null;
    reason: TokenFileFailureReason | null;
}

export async function load_bridge_token_file(file_path: string): Promise<TokenFileLoadResult> {
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
                return { token: null, reason: 'chmod_failed' };
            }
        }
        let content: string;
        try {
            content = await readFile(file_path, 'utf-8');
        } catch {
            return { token: null, reason: 'read_failed' };
        }
        const trimmed = content.trim();
        if (!trimmed) {
            return { token: null, reason: 'empty' };
        }
        return { token: trimmed, reason: null };
    } catch {
        // 主要覆盖 stat 失败（文件不存在）
        return { token: null, reason: 'stat_failed' };
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
