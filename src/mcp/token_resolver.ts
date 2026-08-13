import { default_token_file_path, load_bridge_token_file } from '../node_shared/bridge_token_file';
import type { TokenFileLoadResult } from '../node_shared/bridge_token_file';

/**
 * T091: MCP 客户端 token 解析。env 优先，缺省时从 Bridge 持久化文件读。
 * 与 Bridge main.ts 的 resolve_bridge_token 不同 —— 客户端不生成 token，只读。
 *
 * 抽到独立模块是为了让测试可以 import 而不触发 main.ts 的顶层 server 启动。
 * 返回携带失败原因（p026），供 MCP 启动报错细分。
 */
export async function resolve_client_token(
    env_token: string | undefined,
    file_path: string = default_token_file_path(),
): Promise<TokenFileLoadResult> {
    if (env_token?.trim()) return { token: env_token.trim(), reason: null };
    return load_bridge_token_file(file_path);
}
