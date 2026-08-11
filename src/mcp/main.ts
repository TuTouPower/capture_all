import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeMcpClient } from './client';
import { resolve_client_token } from './token_resolver';
import { execute_mcp_tool, MCP_TOOL_NAMES } from './tools';
import { MCP_TOOL_SCHEMAS } from './schemas';

const bridge_url = process.env.CAPTURE_ALL_BRIDGE_URL;
const token_result = await resolve_client_token(process.env.CAPTURE_ALL_BRIDGE_TOKEN);
const bridge_token = token_result.token;

if (!bridge_url) {
    throw new Error('CAPTURE_ALL_BRIDGE_URL is required');
}
if (!bridge_token) {
    const reason = token_result.reason;
    const hint = reason === 'stat_failed'
        ? 'token 文件不存在（默认：$XDG_RUNTIME_DIR/capture-all/bridge_token）'
        : reason === 'chmod_failed'
            ? 'token 文件存在但权限非 0600 且无法自动收紧'
            : reason === 'read_failed'
                ? 'token 文件存在但读取失败'
                : reason === 'empty'
                    ? 'token 文件为空'
                    : 'set env CAPTURE_ALL_BRIDGE_TOKEN，或确认 Bridge 已持久化自生成 token';
    throw new Error(`CAPTURE_ALL_BRIDGE_TOKEN required: ${hint}`);
}

const client = new BridgeMcpClient(bridge_url, bridge_token);
const server = new McpServer({ name: 'capture-all', version: '0.1.0' });

function register_tool(name: string): void {
    const schema = MCP_TOOL_SCHEMAS[name] ?? z.object({}).passthrough();
    server.registerTool(
        name,
        { inputSchema: schema },
        async (input) => {
            const result = await execute_mcp_tool(client, { name, arguments: input as Record<string, unknown> });
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        },
    );
}

MCP_TOOL_NAMES.forEach(register_tool);

await server.connect(new StdioServerTransport());
