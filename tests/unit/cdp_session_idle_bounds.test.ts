// tests/unit/cdp_session_idle_bounds.test.ts
// 验证 CDP session idle TTL、events 上限、detect/start HTTP 超时
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    handle_cdp_detect,
    handle_cdp_start,
    handle_cdp_events,
    handle_cdp_stop,
} from '../../src/bridge/cdp_handler';

class MockWebSocket {
    static instance: MockWebSocket | null = null;
    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send = vi.fn();
    constructor(_url: string) { MockWebSocket.instance = this; }
    emit(message: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

const fetch_mock = vi.fn();

beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('fetch', fetch_mock);
    MockWebSocket.instance = null;
    fetch_mock.mockReset();
    fetch_mock.mockResolvedValue({
        json: async () => [{
            id: 'target-1', url: 'https://example.com', title: 'E',
            type: 'page', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/page/target-1',
        }],
    });
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

async function start_session(): Promise<string> {
    const p = handle_cdp_start({} as never, {
        port: 9222, tab_url: 'https://example.com',
        redact_data: false, max_body_capture_bytes: 1024,
    });
    // 等 fetch(list) resolve、WS 创建后触发 onopen
    await vi.advanceTimersByTimeAsync(0);
    MockWebSocket.instance?.onopen?.();
    const result = await p;
    return (result.body as { ok: boolean; session_key: string }).session_key;
}

describe('CDP session idle TTL (T101 AC-001)', () => {
    test('AC-001: 持续活动时 session 在固定误杀窗口后仍存活（idle 才销毁）', async () => {
        const session_key = await start_session();
        // 推进 4 分钟（< 误杀窗口），发一次事件活动
        await vi.advanceTimersByTimeAsync(4 * 60 * 1000);
        MockWebSocket.instance?.emit({
            method: 'Network.requestWillBeSent',
            params: { requestId: 'r1', type: 'Fetch', request: { url: 'https://e.com/1', method: 'GET', headers: {} } },
        });
        MockWebSocket.instance?.emit({
            method: 'Network.loadingFailed',
            params: { requestId: 'r1' },
        });
        // 再推进 2 分钟：若仍固定 5 分钟墙钟已销毁；idle TTL 下活动刷新后仍存活
        await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
        const poll = await handle_cdp_events({} as never, new URL(`http://x/cdp/events?session_key=${session_key}`));
        // 事件仍在（session 未被销毁）
        expect((poll.body as { events: unknown[] }).events.length).toBeGreaterThanOrEqual(1);
    });

    test('AC-001b: 无活动持续 idle 超过 TTL 后 session 销毁', async () => {
        const session_key = await start_session();
        await vi.advanceTimersByTimeAsync(6 * 60 * 1000);
        const poll = await handle_cdp_events({} as never, new URL(`http://x/cdp/events?session_key=${session_key}`));
        expect((poll as { status: number }).status).toBe(404);
    });
});

describe('CDP events 上限 (T101 AC-002)', () => {
    test('AC-002: 超过上限条数时旧数据按策略丢弃', async () => {
        const { _set_max_session_events_for_test, _eviction_count } = await import('../../src/bridge/cdp_handler');
        _set_max_session_events_for_test(10);
        try {
            const session_key = await start_session();
            // 灌入 30 事件（> cap 10），触发淘汰
            for (let i = 0; i < 30; i++) {
                MockWebSocket.instance?.emit({
                    method: 'Network.requestWillBeSent',
                    params: { requestId: `r${i}`, type: 'Fetch', request: { url: `https://e.com/${i}`, method: 'GET', headers: {} } },
                });
                MockWebSocket.instance?.emit({
                    method: 'Network.loadingFailed',
                    params: { requestId: `r${i}` },
                });
            }
            const poll = await handle_cdp_events({} as never, new URL(`http://x/cdp/events?session_key=${session_key}`));
            const events = (poll.body as { events: Array<{ request_id: string }> }).events;
            // 淘汰发生：最旧（r0）被丢弃，新事件保留
            expect(events.length).toBeGreaterThan(0);
            expect(events.length).toBeLessThanOrEqual(10);
            expect(events.some(e => e.request_id === 'r0')).toBe(false);
            // 淘汰指标递增（f002：记日志/指标）
            expect(_eviction_count.value).toBeGreaterThan(0);
        } finally {
            _set_max_session_events_for_test(5000);
        }
    });
});

describe('CDP detect/start 超时 (T101 AC-003)', () => {
    test('AC-003: /json/list 永不响应时 detect 在超时后返回失败', async () => {
        // version 响应，list 挂起且响应 abort signal
        fetch_mock.mockResolvedValueOnce({ json: async () => ({ browser: 'x', 'webSocketDebuggerUrl': 'ws://x' }) });
        fetch_mock.mockImplementationOnce((_u: string, opts: { signal?: AbortSignal }) => new Promise((_r, rej) => {
            opts.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }));
        const promise = handle_cdp_detect({} as never, { port: 9222 });
        await vi.advanceTimersByTimeAsync(4000);
        const result = await promise;
        expect(result.body).toEqual(expect.objectContaining({ ok: false }));
    });

    test('AC-003c: CDP WS 永不 onopen 时 start 在超时后返回失败', async () => {
        // list 正常，但 WS 不触发 onopen
        const promise = handle_cdp_start({} as never, { port: 9222, tab_url: 'https://example.com' });
        await vi.advanceTimersByTimeAsync(4000);
        const result = await promise;
        expect(result.body).toEqual(expect.objectContaining({ ok: false }));
    });

    test('AC-003b: /json/list 永不响应时 start 在超时后返回失败', async () => {
        fetch_mock.mockImplementationOnce((_u: string, opts: { signal?: AbortSignal }) => new Promise((_r, rej) => {
            opts.signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }));
        const promise = handle_cdp_start({} as never, { port: 9222, tab_url: 'https://example.com' });
        await vi.advanceTimersByTimeAsync(4000);
        const result = await promise;
        expect(result.body).toEqual(expect.objectContaining({ ok: false }));
    });
});
