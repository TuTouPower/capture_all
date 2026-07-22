import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeMcpClient } from './client';
import { resolve_client_token } from './token_resolver';
import { execute_mcp_tool, MCP_TOOL_NAMES } from './tools';
import { MCP_TOOL_SCHEMAS } from './schemas';

const bridge_url = process.env.CAPTURE_ALL_BRIDGE_URL;
const bridge_token = await resolve_client_token(process.env.CAPTURE_ALL_BRIDGE_TOKEN);

if (!bridge_url) {
    throw new Error('CAPTURE_ALL_BRIDGE_URL is required');
}
if (!bridge_token) {
    throw new Error(
        'CAPTURE_ALL_BRIDGE_TOKEN required: set env, or ensure Bridge has persisted its self-generated token '
            + '(default: $XDG_RUNTIME_DIR/capture-all/bridge_token, mode 0600)',
    );
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
