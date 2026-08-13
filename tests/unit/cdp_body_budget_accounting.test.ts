// tests/unit/cdp_body_budget_accounting.test.ts
// t157 AC-001~005: CDP 会话 body 预算账本与淘汰语义（走 MockWebSocket 生产路径）
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    handle_cdp_events,
    handle_cdp_start,
    handle_cdp_stop,
    _get_session_for_test,
    _set_max_session_body_bytes_for_test,
    _set_max_session_events_for_test,
    _set_max_evicted_events_for_test,
} from '../../src/bridge/cdp_handler';

class MockWebSocket {
    static instance: MockWebSocket | null = null;

    onopen: (() => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    send = vi.fn();

    constructor(_url: string) {
        MockWebSocket.instance = this;
    }

    emit(message: Record<string, unknown>): void {
        this.onmessage?.({ data: JSON.stringify(message) });
    }
}

async function start_session(max_body_capture_bytes = 10 * 1024 * 1024): Promise<string> {
    const p = handle_cdp_start({} as never, {
        port: 9222,
        tab_url: 'https://example.com',
        redact_data: false,
        max_body_capture_bytes,
    });
    await vi.advanceTimersByTimeAsync(0);
    MockWebSocket.instance?.onopen?.();
    const result = await p;
    const body = result.body as { ok: boolean; session_key: string };
    expect(result.status).toBe(200);
    expect(body.ok).toBe(true);
    return body.session_key;
}

function emit_request_start(socket: MockWebSocket, req_id: string): void {
    socket.emit({
        method: 'Network.requestWillBeSent',
        params: {
            requestId: req_id,
            type: 'Fetch',
            request: { url: `https://example.com/${req_id}`, method: 'GET', headers: {} },
        },
    });
}

function emit_response(socket: MockWebSocket, req_id: string): void {
    socket.emit({
        method: 'Network.responseReceived',
        params: {
            requestId: req_id,
            type: 'Fetch',
            response: { url: `https://example.com/${req_id}`, status: 200, headers: {} },
        },
    });
}

function emit_loading_finished(socket: MockWebSocket, req_id: string): void {
    socket.emit({
        method: 'Network.loadingFinished',
        params: { requestId: req_id },
    });
}

/** 对最后一次 send（getResponseBody 命令）回 body 响应 */
function emit_body_response(socket: MockWebSocket, body: string): void {
    const sent = socket.send.mock.calls.at(-1)?.[0] as string;
    const parsed = JSON.parse(sent) as { id: number };
    socket.emit({ id: parsed.id, result: { body, base64Encoded: false } });
}

/** 完成一条带 body 请求的全流程 */
function emit_completed_with_body(socket: MockWebSocket, req_id: string, body: string): void {
    emit_request_start(socket, req_id);
    emit_response(socket, req_id);
    emit_loading_finished(socket, req_id);
    emit_body_response(socket, body);
}

async function poll_session(session_key: string) {
    const result = await handle_cdp_events(
        {} as never,
        new URL(`http://127.0.0.1/cdp/events?session_key=${session_key}`),
    );
    return (result.body as { events: Array<Record<string, unknown>> }).events;
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        json: async () => [{
            id: 'target-1',
            url: 'https://example.com',
            title: 'Example',
            type: 'page',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/target-1',
        }],
    }));
    MockWebSocket.instance = null;
    _set_max_session_body_bytes_for_test(200 * 1024 * 1024);
    _set_max_session_events_for_test(5000);
    _set_max_evicted_events_for_test(5000);
});

afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('CDP body budget accounting', () => {
    test('AC-001: poll 返回两条带 body 事件后 body_bytes 回到 0', async () => {
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;
        emit_completed_with_body(socket, 'r1', 'hello world'); // 11 bytes
        emit_completed_with_body(socket, 'r2', 'foobar');      // 6 bytes

        const session = _get_session_for_test(session_key)!;
        expect(session.body_bytes).toBe(17);

        const first = await poll_session(session_key);
        expect(first.length).toBe(2);
        expect(session.body_bytes).toBe(0);
        // 第二页为空：事件已全部返回且账本不再挂账
        expect((await poll_session(session_key)).length).toBe(0);
        expect(session.body_bytes).toBe(0);

        await handle_cdp_stop({ session_key });
    });

    test('AC-002: poll 移除后写入新 body 事件，预算内全部返回，不因 stale body_bytes 误淘汰', async () => {
        _set_max_session_body_bytes_for_test(800);
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;
        emit_completed_with_body(socket, 'r1', 'x'.repeat(200));
        emit_completed_with_body(socket, 'r2', 'y'.repeat(200));

        expect((await poll_session(session_key)).length).toBe(2);

        // 新写入 3 条各 200 字节（共 600 < 800），预算内应全部返回
        emit_completed_with_body(socket, 'r3', 'a'.repeat(200));
        emit_completed_with_body(socket, 'r4', 'b'.repeat(200));
        emit_completed_with_body(socket, 'r5', 'c'.repeat(200));

        const events = await poll_session(session_key);
        expect(events.length).toBe(3);
        expect(events.map(e => e.request_id).sort()).toEqual(['r3', 'r4', 'r5']);

        await handle_cdp_stop({ session_key });
    });

    test('AC-003: 最旧事件为 pending 无 body 时，body 预算淘汰不删 pending，迟到 body 响应仍能更新', async () => {
        _set_max_session_body_bytes_for_test(400);
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;

        // 最旧位置先放 pending（无 body）
        emit_request_start(socket, 'rA');
        // 后到两条带 body 事件（各 300B），共 600B 超 400 预算触发淘汰：
        // 淘汰跳过最旧 pending，选最旧带 body 的 rB
        emit_completed_with_body(socket, 'rB', 'B'.repeat(300));
        emit_completed_with_body(socket, 'rC', 'C'.repeat(300));

        const session = _get_session_for_test(session_key)!;
        // pending rA 未被删除；被淘汰的是带 body 的 rB；rC 留在预算内
        expect(session.events.map(e => e.request_id)).toEqual(['rA', 'rC']);
        expect(session.events[0].response_body_status).toBe('pending');
        expect(session.events[1].response_body).toBe('C'.repeat(300));
        expect(session.body_bytes).toBe(300);

        // rA 迟到 body 响应仍能重建事件
        emit_loading_finished(socket, 'rA');
        emit_body_response(socket, 'A'.repeat(50));
        const events = await poll_session(session_key);
        const a_evt = events.find(e => e.request_id === 'rA');
        expect(a_evt).toBeDefined();
        expect(a_evt!.response_body_status).toBe('captured');
        expect(a_evt!.response_body).toBe('A'.repeat(50));

        await handle_cdp_stop({ session_key });
    });

    test('AC-004: 仅剩单个超大 body 事件无法淘汰降到预算内时，元数据保留、body 置 null 标 too_large', async () => {
        _set_max_session_body_bytes_for_test(100);
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;

        emit_completed_with_body(socket, 'rX', 'X'.repeat(200));

        const events = await poll_session(session_key);
        expect(events.length).toBe(1);
        expect(events[0].request_id).toBe('rX');
        expect(events[0].response_body).toBeNull();
        expect(events[0].response_body_status).toBe('too_large');

        await handle_cdp_stop({ session_key });
    });

    test('AC-004b: 数组含 pending 时，唯一带 body 事件同样置 null 标 too_large 而非删除', async () => {
        _set_max_session_body_bytes_for_test(100);
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;

        // rY 先入为 pending（最旧），rZ 是唯一带 body 事件（200B 超预算）
        emit_request_start(socket, 'rY');
        emit_completed_with_body(socket, 'rZ', 'Z'.repeat(200));

        const session = _get_session_for_test(session_key)!;
        // rZ 元数据保留（未 splice），body 置 null 标 too_large；rY pending 保留
        expect(session.events.map(e => e.request_id)).toEqual(['rY', 'rZ']);
        expect(session.events[1].response_body).toBeNull();
        expect(session.events[1].response_body_status).toBe('too_large');
        expect(session.body_bytes).toBe(0);

        const events = await poll_session(session_key);
        expect(events.length).toBe(1);
        expect(events[0].request_id).toBe('rZ');
        expect(events[0].response_body).toBeNull();
        expect(events[0].response_body_status).toBe('too_large');

        await handle_cdp_stop({ session_key });
    });

    test('AC-005b: evicted 待返回队列有界，超限丢最旧已终态', async () => {
        _set_max_session_events_for_test(2);
        _set_max_evicted_events_for_test(2);
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;

        // 连续 5 个 pending：前 2 个驻留，后 3 个触发事件数淘汰（各转 evicted）
        for (let i = 0; i < 5; i++) {
            emit_request_start(socket, `r${i}`);
        }

        const session = _get_session_for_test(session_key)!;
        // evicted 队列封顶 2（最旧 r0 被挤出），events 严格 ≤ 2
        expect(session.evicted_events.length).toBe(2);
        expect(session.events.length).toBe(2);

        const events = await poll_session(session_key);
        expect(events.length).toBe(2);
        expect(events.every(e => e.response_body_status === 'evicted')).toBe(true);
        // poll 后 evicted 队列清空
        expect(session.evicted_events.length).toBe(0);

        await handle_cdp_stop({ session_key });
    });

    test('AC-005: 事件数上限淘汰 pending 时产生可观察 evicted 终态且清理 command 映射', async () => {
        _set_max_session_events_for_test(2);
        const session_key = await start_session();
        const socket = MockWebSocket.instance!;

        // rA 先发 loadingFinished，建立 getResponseBody 命令映射（仍为 pending）
        emit_request_start(socket, 'rA');
        emit_response(socket, 'rA');
        emit_loading_finished(socket, 'rA');
        const get_body_calls = socket.send.mock.calls
            .map(c => c[0] as string)
            .filter(s => s.includes('getResponseBody'));
        expect(get_body_calls.length).toBe(1);
        const seq_of_a = (JSON.parse(get_body_calls[0]) as { id: number }).id;

        emit_request_start(socket, 'rB');
        // 第三个事件写入触发事件数淘汰，最旧 rA 为 pending → 转 evicted 而非静默消失
        emit_request_start(socket, 'rC');

        // rA 的 command 映射已被清理
        const session = _get_session_for_test(session_key)!;
        expect(session.body_seq_to_req_id.size).toBe(0);

        const events = await poll_session(session_key);
        const a_evt = events.find(e => e.request_id === 'rA');
        expect(a_evt).toBeDefined();
        expect(a_evt!.response_body_status).toBe('evicted');
        // rB/rC 仍为 pending，不返回
        expect(events.filter(e => e.request_id !== 'rA').length).toBe(0);

        // 迟到 rA 的 getResponseBody 响应不再匹配任何事件，不抛异常且无新终态
        socket.emit({ id: seq_of_a, result: { body: 'late', base64Encoded: false } });
        expect(session.events.filter(e => e.response_body_status !== 'pending').length).toBe(0);

        await handle_cdp_stop({ session_key });
    });
});
