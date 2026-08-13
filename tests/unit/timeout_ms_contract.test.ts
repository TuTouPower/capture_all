// tests/unit/timeout_ms_contract.test.ts
// t175 AC-001~004: timeout_ms 契约统一——Zod max、get_status/list_browsers 传参、默认值一致
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MCP_TOOL_SCHEMAS } from '../../src/mcp/schemas';
import { MAX_COMMAND_TIMEOUT_MS } from '../../src/shared/constants';
import { execute_mcp_tool } from '../../src/mcp/tools';
import { BridgeMcpClient } from '../../src/mcp/client';

describe('timeout_ms 契约', () => {
    it('AC-001: timeout_ms 300001 在 Zod 层被拒绝', () => {
        expect(() => MCP_TOOL_SCHEMAS.get_status.parse({ timeout_ms: 300001 })).toThrow();
        expect(() => MCP_TOOL_SCHEMAS.list_browsers.parse({ timeout_ms: 300001 })).toThrow();
        // 上限值本身通过
        expect(MCP_TOOL_SCHEMAS.get_status.parse({ timeout_ms: 300000 }).timeout_ms).toBe(300000);
        // MAX_COMMAND_TIMEOUT_MS 与 Bridge 校验一致（300000）
        expect(MAX_COMMAND_TIMEOUT_MS).toBe(300000);
    });

    it('AC-002a: get_status({timeout_ms:1}) AbortSignal 实际 1ms', async () => {
        const client = new BridgeMcpClient('http://127.0.0.1:17831', 'tok');
        // 直接 spy AbortSignal.timeout 捕获参数
        const original_timeout = AbortSignal.timeout;
        const timeout_fn = vi.fn((ms: number) => original_timeout.call(AbortSignal, ms));
        Object.defineProperty(AbortSignal, 'timeout', { value: timeout_fn, configurable: true, writable: true });

        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { bridge_version: 'x', online_count: 0, extensions: [] } }),
        });

        await client.get_status(1);
        expect(timeout_fn).toHaveBeenCalledWith(1);

        Object.defineProperty(AbortSignal, 'timeout', { value: original_timeout, configurable: true, writable: true });
    });

    it('AC-002b: execute_mcp_tool get_status 把 timeout_ms 传给 client', async () => {
        const original_timeout = AbortSignal.timeout;
        const timeout_fn = vi.fn((ms: number) => original_timeout.call(AbortSignal, ms));
        Object.defineProperty(AbortSignal, 'timeout', { value: timeout_fn, configurable: true, writable: true });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { bridge_version: 'x', online_count: 0, extensions: [] } }),
        });

        const client = new BridgeMcpClient('http://127.0.0.1:17831', 'tok');
        await execute_mcp_tool(client, { name: 'get_status', arguments: { timeout_ms: 1 } });
        expect(timeout_fn).toHaveBeenCalledWith(1);
        Object.defineProperty(AbortSignal, 'timeout', { value: original_timeout, configurable: true, writable: true });
    });

    it('AC-002c: list_browsers 同样传 timeout_ms', async () => {
        const original_timeout = AbortSignal.timeout;
        const timeout_fn = vi.fn((ms: number) => original_timeout.call(AbortSignal, ms));
        Object.defineProperty(AbortSignal, 'timeout', { value: timeout_fn, configurable: true, writable: true });
        globalThis.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ ok: true, data: { bridge_version: 'x', online_count: 0, extensions: [] } }),
        });

        const client = new BridgeMcpClient('http://127.0.0.1:17831', 'tok');
        await execute_mcp_tool(client, { name: 'list_browsers', arguments: { timeout_ms: 1 } });
        expect(timeout_fn).toHaveBeenCalledWith(1);
        Object.defineProperty(AbortSignal, 'timeout', { value: original_timeout, configurable: true, writable: true });
    });

    it('AC-003: 默认值一致——client get_status 缺省 30s、bridge 校验上限共享常量', () => {
        // client 默认 30s（对齐 domain 查询类）
        const src = require('fs').readFileSync('src/mcp/client.ts', 'utf8');
        expect(src).toContain('GET_STATUS_TIMEOUT_MS = 30 * 1000');
        // bridge 复用共享常量（不再字面 300000）
        const bridge_src = require('fs').readFileSync('src/bridge/server.ts', 'utf8');
        expect(bridge_src).toContain('MAX_COMMAND_TIMEOUT_MS');
        expect(bridge_src).not.toContain('> 300000)');
    });
});
