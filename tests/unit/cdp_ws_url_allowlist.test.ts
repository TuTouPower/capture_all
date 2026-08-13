// tests/unit/cdp_ws_url_allowlist.test.ts
// t170 SEC-002 AC-001~004: CDP WebSocket URL allowlist——ws: + loopback + 请求 port；
// 拒远端 host/wss:/userinfo/不同端口；校验后用 target ID 构造 loopback URL。
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { handle_cdp_start } from '../../src/bridge/cdp_handler';

class MockWebSocket {
    static instances: MockWebSocket[] = [];
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send = vi.fn();
    close = vi.fn();
    constructor(public url: string) {
        MockWebSocket.instances.push(this);
    }
}

function mock_discovery(targets: Array<Record<string, unknown>>): void {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: async () => targets,
    }));
}

async function call_start(port = 9222): Promise<{ status: number; body: { ok: boolean; error?: { code: string } } }> {
    const p = handle_cdp_start({} as never, {
        port,
        tab_url: 'https://example.com',
        redact_data: false,
        max_body_capture_bytes: 1024,
    }) as Promise<{ status: number; body: { ok: boolean; error?: { code: string } } }>;
    // flush fetch mock 微任务链（list → json → target 选择 → new WebSocket）
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // 放行路径：触发 onopen 使 ws_connect resolve（拒路径不创建 WebSocket，直接 await 返回）
    const inst = MockWebSocket.instances.at(-1);
    inst?.onopen?.();
    return await p;
}

beforeEach(() => {
    MockWebSocket.instances = [];
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('CDP WebSocket URL allowlist', () => {
    test('AC-001: ws://127.0.0.1:{port} 端口匹配 → 建立 WebSocket（用 target ID 构造 loopback URL）', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-1',
        }]);
        const result = await call_start();
        expect(result.status).toBe(200);
        expect(result.body.ok).toBe(true);
        expect(MockWebSocket.instances.length).toBe(1);
        // 不信任 discovery authority：用 target ID 自行构造
        expect(MockWebSocket.instances[0].url).toBe('ws://127.0.0.1:9222/devtools/page/target-1');
    });

    test('AC-001b: localhost host 放行且构造为 127.0.0.1 URL（判别「构造 vs 信任 discovery」）', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://localhost:9222/custom/path/ignored',
        }]);
        const result = await call_start();
        expect(result.status).toBe(200);
        expect(MockWebSocket.instances.length).toBe(1);
        // 不信任 discovery authority：即使 discovery 给非标准路径，也构造标准 loopback URL
        expect(MockWebSocket.instances[0].url).toBe('ws://127.0.0.1:9222/devtools/page/target-1');
    });

    test('AC-002: 远端 host 拒绝，不建立 WebSocket', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://evil.example.com/devtools/page/target-1',
        }]);
        const result = await call_start();
        expect(result.status).toBe(400);
        expect(result.body.error?.code).toBe('cdp_invalid_ws_url');
        expect(MockWebSocket.instances.length).toBe(0);
    });

    test('AC-003a: 不同端口拒绝', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9999/devtools/page/target-1',
        }]);
        const result = await call_start(9222);
        expect(result.status).toBe(400);
        expect(MockWebSocket.instances.length).toBe(0);
    });

    test('AC-003b: wss: scheme 拒绝', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'wss://127.0.0.1:9222/devtools/page/target-1',
        }]);
        const result = await call_start();
        expect(result.status).toBe(400);
        expect(MockWebSocket.instances.length).toBe(0);
    });

    test('AC-003c: 含 userinfo 拒绝', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://user:pass@127.0.0.1:9222/devtools/page/target-1',
        }]);
        const result = await call_start();
        expect(result.status).toBe(400);
        expect(MockWebSocket.instances.length).toBe(0);
    });


    test('AC-003d: 含 fragment 拒绝（f002）', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-1#section',
        }]);
        const result = await call_start();
        expect(result.status).toBe(400);
        expect(MockWebSocket.instances.length).toBe(0);
    });

    test('AC-003e: 默认端口（port 空）不匹配请求 port 拒绝（f001 严格化）', async () => {
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/target-1',
        }]);
        const result = await call_start(9222);
        expect(result.status).toBe(400);
        expect(MockWebSocket.instances.length).toBe(0);
    });
    test('AC-004: 组合负向——畸形 URL / 空 id 拒绝', async () => {
        // 畸形 URL（不可解析）
        mock_discovery([{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'not a url',
        }]);
        expect((await call_start()).status).toBe(400);

        // target 无 id
        mock_discovery([{
            id: '',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/x',
        }]);
        expect((await call_start()).status).toBe(400);
        expect(MockWebSocket.instances.length).toBe(0);
    });
});
