import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BridgeMcpClient } from './client';
import { execute_mcp_tool, MCP_TOOL_NAMES } from './tools';

const bridge_url = process.env.RECORD_ALL_BRIDGE_URL;
const bridge_token = process.env.RECORD_ALL_BRIDGE_TOKEN;

if (!bridge_url || !bridge_token) {
    throw new Error('RECORD_ALL_BRIDGE_URL and RECORD_ALL_BRIDGE_TOKEN are required');
}

const client = new BridgeMcpClient(bridge_url, bridge_token);
const server = new McpServer({ name: 'capture-all', version: '0.1.0' });
const input_schema = z.object({}).passthrough();

function register_tool(name: string): void {
    server.registerTool(
        name,
        { inputSchema: input_schema },
        async (input) => {
            const result = await execute_mcp_tool(client, { name, arguments: input });
            return {
                content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            };
        },
    );
}

MCP_TOOL_NAMES.forEach(register_tool);

await server.connect(new StdioServerTransport());
