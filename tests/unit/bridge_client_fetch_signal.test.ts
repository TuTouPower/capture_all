// tests/unit/bridge_client_fetch_signal.test.ts
// t182: Extension Bridge client fetch 加 signal——stop 时 abort in-flight（AC-001）、
// 每请求超时 abort（AC-002）、restart 无 stale（AC-003）。
// mock fetch 返回永不 resolve 的 deferred，断言捕获的 AbortSignal 状态（fake timers）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    start_bridge_client,
    stop_bridge_client,
    set_bridge_session_for_tests,
    type AgentBridgeClientDeps,
} from '../../src/extension/background/agent_bridge_client';

const log_write = vi.hoisted(() => vi.fn());
const storage_get = vi.hoisted(() => vi.fn());
const storage_set = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: log_write,
        flush: vi.fn(),
        get_entries: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        clear: vi.fn(),
    }),
}));

Object.defineProperty(globalThis, 'chrome', {
    value: {
        runtime: { id: 'test-ext-id', getManifest: () => ({ version: '0.1.0' }) },
        storage: {
            local: {
                get: storage_get,
                set: storage_set,
                remove: vi.fn(),
            },
        },
    },
    writable: true,
    configurable: true,
});

const enabled_config = {
    agent_bridge_enabled: true,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '<TEST_BRIDGE_TOKEN>',
    agent_bridge_poll_interval_ms: 250,
};

function create_deps(): AgentBridgeClientDeps {
    return {
        get_user_config: vi.fn(async () => enabled_config),
        save_user_config: vi.fn(async () => {}),
        start_capture: vi.fn(async () => ({ success: true })),
        stop_capture: vi.fn(async () => ({ success: true })),
        get_status: vi.fn(() => ({ active_capture_id: null })),
        extension_version: '0.1.0',
    };
}

/** mock fetch：捕获每个请求的 (url, signal)，返回永不 resolve 的 deferred。 */
function mock_pending_fetch(captured: Array<{ url: string; signal: AbortSignal }>): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        captured.push({ url: String(input), signal: init?.signal ?? new AbortController().signal });
        return new Promise(() => { /* 永不 resolve */ });
    });
}

/** mock fetch：heartbeat 正常响应，其余（command fetch）pending 捕获 signal。 */
function mock_heartbeat_ok_command_pending(captured: Array<{ url: string; signal: AbortSignal }>): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(global, 'fetch').mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.endsWith('/extension/heartbeat')) {
            return new Response('{}', { status: 200 });
        }
        captured.push({ url, signal: init?.signal ?? new AbortController().signal });
        return new Promise(() => { /* 永不 resolve */ });
    });
}

beforeEach(() => {
    stop_bridge_client();
    set_bridge_session_for_tests({ instance_id: 'inst_sig_1', instance_token: 'ext_sig_token' });
    storage_get.mockResolvedValue({
        agent_bridge_session: { instance_id: 'inst_sig_1', instance_token: 'ext_sig_token' },
    });
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    stop_bridge_client();
    vi.restoreAllMocks();
});

describe('t182 AC-001: stop 后 in-flight 请求被 abort', () => {
    it('stop_bridge_client 使首个（heartbeat）请求 signal.aborted 为 true', async () => {
        const captured: Array<{ url: string; signal: AbortSignal }> = [];
        mock_pending_fetch(captured);
        start_bridge_client(create_deps());
        await vi.advanceTimersByTimeAsync(0); // poll_cycle 发起 heartbeat fetch
        expect(captured.length).toBeGreaterThanOrEqual(1);
        expect(captured[0].url).toContain('/extension/heartbeat');
        expect(captured[0].signal.aborted).toBe(false);
        stop_bridge_client();
        expect(captured[0].signal.aborted).toBe(true);
    });
});

describe('t182 AC-002: fetch 超过各自 timeout 被 abort（真实 timers——AbortSignal.timeout 内部定时器不受 fake timers 控制）', () => {
    it('heartbeat fetch 超注入 timeout（20ms，< Bridge TTL 5s 语义）被 abort', async () => {
        const { _set_bridge_client_timeouts_for_test } = await import('../../src/extension/background/agent_bridge_client');
        _set_bridge_client_timeouts_for_test({ heartbeat_ms: 20 });
        vi.useRealTimers();
        try {
            const captured: Array<{ url: string; signal: AbortSignal }> = [];
            mock_pending_fetch(captured);
            start_bridge_client(create_deps());
            await new Promise((r) => setTimeout(r, 20)); // poll_cycle 发起 heartbeat fetch
            expect(captured.length).toBeGreaterThanOrEqual(1);
            expect(captured[0].url).toContain('/extension/heartbeat');
            expect(captured[0].signal.aborted).toBe(false);
            await new Promise((r) => setTimeout(r, 50)); // 超过 20ms 注入 timeout
            expect(captured[0].signal.aborted).toBe(true);
        } finally {
            _set_bridge_client_timeouts_for_test({ heartbeat_ms: 4000 });
        }
    });

    it('enroll 请求超注入 timeout 被 abort（token 缺失时首请求为 enroll）', async () => {
        const { _set_bridge_client_timeouts_for_test } = await import('../../src/extension/background/agent_bridge_client');
        _set_bridge_client_timeouts_for_test({ enroll_ms: 20 });
        set_bridge_session_for_tests(null);
        storage_get.mockResolvedValue({});
        vi.useRealTimers();
        try {
            const captured: Array<{ url: string; signal: AbortSignal }> = [];
            mock_pending_fetch(captured);
            start_bridge_client(create_deps());
            await new Promise((r) => setTimeout(r, 20));
            expect(captured.length).toBeGreaterThanOrEqual(1);
            // 锚定被测请求确为 enroll（session mock 失效时不误测 heartbeat）
            expect(captured[0].url).toContain('/extension/enroll');
            await new Promise((r) => setTimeout(r, 50));
            expect(captured[0].signal.aborted).toBe(true);
        } finally {
            _set_bridge_client_timeouts_for_test({ enroll_ms: 5000 });
        }
    });

    it('command fetch 超注入 timeout 被 abort（heartbeat 正常后）', async () => {
        const { _set_bridge_client_timeouts_for_test } = await import('../../src/extension/background/agent_bridge_client');
        _set_bridge_client_timeouts_for_test({ command_fetch_ms: 20 });
        vi.useRealTimers();
        try {
            const captured: Array<{ url: string; signal: AbortSignal }> = [];
            mock_heartbeat_ok_command_pending(captured);
            start_bridge_client(create_deps());
            await new Promise((r) => setTimeout(r, 20)); // heartbeat 200 → command fetch pending
            expect(captured.length).toBeGreaterThanOrEqual(1);
            expect(captured[0].url).toContain('/extension/command');
            await new Promise((r) => setTimeout(r, 50));
            expect(captured[0].signal.aborted).toBe(true);
        } finally {
            _set_bridge_client_timeouts_for_test({ command_fetch_ms: 5000 });
        }
    });
});

describe('t182 AC-003: restart 后无 stale in-flight 请求残留', () => {
    it('stop 旧 lifecycle abort 其 fetch；新 lifecycle 的 fetch 不被误 abort', async () => {
        const captured: Array<{ url: string; signal: AbortSignal }> = [];
        mock_pending_fetch(captured);

        start_bridge_client(create_deps());
        await vi.advanceTimersByTimeAsync(0); // fetch1（旧 lifecycle heartbeat）
        expect(captured.length).toBe(1);

        stop_bridge_client();
        expect(captured[0].signal.aborted).toBe(true);

        start_bridge_client(create_deps());
        await vi.advanceTimersByTimeAsync(0); // fetch2（新 lifecycle heartbeat）
        expect(captured.length).toBe(2);
        expect(captured[1].signal.aborted).toBe(false); // 新 controller 未 abort
    });
});
