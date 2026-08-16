import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
    get_bridge_connection_state,
    is_bridge_client_running,
    start_bridge_client,
    stop_bridge_client,
    set_bridge_session_for_tests,
    type AgentBridgeClientDeps,
} from '../../src/extension/background/agent_bridge_client';
import { clear_bridge_session, save_bridge_session } from '../../src/shared/agent_bridge_config';

const log_write = vi.hoisted(() => vi.fn());
const storage_get = vi.hoisted(() => vi.fn());
const storage_set = vi.hoisted(() => vi.fn());
const storage_remove = vi.hoisted(() => vi.fn());

vi.mock('../../src/extension/background/app_log_storage', () => ({
    get_app_log_transport: () => ({
        write: log_write,
        flush: vi.fn(),
        get_entries: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
        clear: vi.fn(),
    }),
}));

const chrome_mock = {
    runtime: {
        id: 'test-ext-id',
        getManifest: () => ({ version: '0.1.0' }),
    },
    storage: {
        local: {
            get: storage_get,
            set: storage_set,
            remove: storage_remove,
        },
    },
};

Object.defineProperty(globalThis, 'chrome', {
    value: chrome_mock,
    writable: true,
    configurable: true,
});

const enabled_config = {
    agent_bridge_enabled: true,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '<TEST_BRIDGE_TOKEN>',
    agent_bridge_poll_interval_ms: 250,
};

const disabled_config = {
    agent_bridge_enabled: false,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '',
    agent_bridge_poll_interval_ms: 250,
    browser_label: '',
};

const browser_enrolled_config = {
    agent_bridge_enabled: true,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: 'bridge_token_test',
    agent_bridge_poll_interval_ms: 250,
    browser_label: '',
};

function create_deps(
    get_user_config: AgentBridgeClientDeps['get_user_config'] = vi.fn(
        async () => enabled_config,
    ),
): AgentBridgeClientDeps {
    return {
        get_user_config,
        save_user_config: vi.fn(async () => {}),
        start_capture: vi.fn(async () => ({ success: true })),
        stop_capture: vi.fn(async () => ({ success: true })),
        get_status: vi.fn(() => ({ active_capture_id: null })),
        extension_version: '0.1.0',
    };
}

function mock_idle_bridge(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(global, 'fetch').mockImplementation(
        async (input: string | URL | Request) => {
            const url = input.toString();
            if (url.endsWith('/extension/enroll')) {
                return new Response(JSON.stringify({
                    ok: true,
                    data: {
                        instance_id: 'inst_test_session',
                        instance_token: 'ext_test_session_token',
                        browser_label: null,
                    },
                }), { status: 200 });
            }
            if (url.endsWith('/extension/command')) {
                return new Response(null, { status: 204 });
            }

            return new Response('{}', { status: 200 });
        },
    );
}

function get_error_entries(): Array<Record<string, unknown>> {
    return log_write.mock.calls
        .map(([entry]) => entry as Record<string, unknown>)
        .filter((entry) => entry.level === 'error');
}

async function run_initial_poll(): Promise<void> {
    await vi.advanceTimersByTimeAsync(0);
}

function create_deferred<T>(): {
    promise: Promise<T>;
    resolve: (value: T) => void;
} {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((promise_resolve) => {
        resolve = promise_resolve;
    });

    return { promise, resolve };
}

beforeEach(() => {
    stop_bridge_client();
    set_bridge_session_for_tests({ instance_id: 'inst_test_session', instance_token: 'ext_test_session_token' });
    storage_get.mockResolvedValue({
        agent_bridge_session: { instance_id: 'inst_test_session', instance_token: 'ext_test_session_token' },
    });
    vi.useFakeTimers();
    log_write.mockClear();
    storage_get.mockClear();
    storage_set.mockClear();
    storage_remove.mockClear();
    storage_get.mockResolvedValue({
        agent_bridge_session: { instance_id: 'inst_test_session', instance_token: 'ext_test_session_token' },
    });
    storage_set.mockResolvedValue(undefined);
    storage_remove.mockResolvedValue(undefined);
});

afterEach(() => {
    stop_bridge_client();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('agent bridge client', () => {
    test('starts and stops', () => {
        const deps = create_deps();

        expect(is_bridge_client_running()).toBe(false);
        start_bridge_client(deps);
        expect(is_bridge_client_running()).toBe(true);
        stop_bridge_client();
        expect(is_bridge_client_running()).toBe(false);
    });

    test('t202: get_bridge_connection_state 反映 running/enrolled', () => {
        const deps = create_deps();
        // beforeEach 已设 session → enrolled=true;未启动 running=false
        expect(get_bridge_connection_state()).toEqual({ running: false, enrolled: true });
        start_bridge_client(deps);
        expect(get_bridge_connection_state().running).toBe(true);
        expect(get_bridge_connection_state().enrolled).toBe(true);
        stop_bridge_client();
    });

    test('double start is no-op', () => {
        const deps = create_deps();

        start_bridge_client(deps);
        start_bridge_client(deps);

        expect(is_bridge_client_running()).toBe(true);
        expect(log_write.mock.calls.filter(
            ([entry]) => entry.message === 'Bridge client started',
        )).toHaveLength(1);
    });

    test('stops when config disables bridge', async () => {
        start_bridge_client(create_deps(vi.fn(async () => disabled_config)));
        await run_initial_poll();

        expect(is_bridge_client_running()).toBe(false);
    });

    test('polls heartbeat and fetches command', async () => {
        const fetch_spy = mock_idle_bridge();

        start_bridge_client(create_deps());
        await run_initial_poll();
        stop_bridge_client();

        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/heartbeat'),
        )).toHaveLength(1);
        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/command'),
        )).toHaveLength(1);
    });

    test('fetches command, dispatches, and posts result', async () => {
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();

                if (url.endsWith('/extension/command')) {
                    return new Response(JSON.stringify({
                        command_id: 'cmd_1',
                        type: 'capture.stop',
                        payload: {},
                        created_at: 1,
                    }), { status: 200 });
                }

                if (url.endsWith('/extension/result')) {
                    expect(JSON.parse(init?.body as string).command_id).toBe(
                        'cmd_1',
                    );
                }

                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_deps());
        await run_initial_poll();
        stop_bridge_client();

        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/result'),
        )).toHaveLength(1);
    });

    test('logs heartbeat network errors without sensitive details and keeps polling', async () => {
        const sensitive_error = new Error(
            'failed http://127.0.0.1:17831 Bearer test-token-abc capture-secret',
        );
        const fetch_spy = vi.spyOn(global, 'fetch')
            .mockRejectedValueOnce(sensitive_error)
            .mockImplementation(async (input: string | URL | Request) => {
                if (input.toString().endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                return new Response('{}', { status: 200 });
            });

        start_bridge_client(create_deps());
        await run_initial_poll();
        await vi.advanceTimersByTimeAsync(250);
        stop_bridge_client();

        expect(fetch_spy).toHaveBeenCalledTimes(3);
        expect(get_error_entries()).toEqual([
            expect.objectContaining({
                message: 'Bridge polling failed',
                details: {
                    stage: 'heartbeat',
                    failure_kind: 'exception',
                },
            }),
        ]);
        expect(JSON.stringify(get_error_entries())).not.toContain(
            sensitive_error.message,
        );
    });

    test('logs command fetch HTTP status with controlled details', async () => {
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                if (input.toString().endsWith('/extension/command')) {
                    return new Response('{}', { status: 500 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_deps());
        await run_initial_poll();
        stop_bridge_client();

        expect(get_error_entries()).toEqual([
            expect.objectContaining({
                message: 'Bridge polling failed',
                details: {
                    stage: 'command_fetch',
                    failure_kind: 'http',
                    http_status: 500,
                },
            }),
        ]);
    });

    test('logs result delivery 413 once and continues polling without another result post', async () => {
        let command_count = 0;
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();

                if (url.endsWith('/extension/command')) {
                    command_count += 1;
                    if (command_count === 1) {
                        return new Response(JSON.stringify({
                            command_id: 'cmd_sensitive',
                            type: 'capture.stop',
                            payload: { capture_id: 'capture_sensitive' },
                            created_at: 1,
                        }), { status: 200 });
                    }
                    return new Response(null, { status: 204 });
                }

                if (url.endsWith('/extension/result')) {
                    return new Response('{}', { status: 413 });
                }

                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_deps());
        await run_initial_poll();
        await vi.advanceTimersByTimeAsync(250);
        stop_bridge_client();

        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/result'),
        )).toHaveLength(1);
        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/heartbeat'),
        )).toHaveLength(2);
        expect(get_error_entries()).toEqual([
            expect.objectContaining({
                message: 'Bridge result delivery failed',
                details: {
                    stage: 'result_delivery',
                    failure_kind: 'http',
                    http_status: 413,
                },
            }),
        ]);
        expect(JSON.stringify(get_error_entries())).not.toMatch(
            /cmd_sensitive|capture_sensitive/,
        );
    });

    test('logs result delivery network errors without serializing the exception', async () => {
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();

                if (url.endsWith('/extension/command')) {
                    return new Response(JSON.stringify({
                        command_id: 'cmd_1',
                        type: 'capture.stop',
                        payload: {},
                        created_at: 1,
                    }), { status: 200 });
                }

                if (url.endsWith('/extension/result')) {
                    throw new Error('Bearer secret-token result-secret');
                }

                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_deps());
        await run_initial_poll();
        // T046: send_result_with_retry 有 setTimeout 重试，推进 fake timers 让重试跑完
        await vi.advanceTimersByTimeAsync(2000);
        stop_bridge_client();

        expect(get_error_entries()).toEqual([
            expect.objectContaining({
                message: 'Bridge result delivery failed',
                details: {
                    stage: 'result_delivery',
                    failure_kind: 'exception',
                },
            }),
        ]);
        expect(JSON.stringify(get_error_entries())).not.toMatch(
            /secret-token|result-secret/,
        );
    });

    test('rate limits repeated polling errors for 60 seconds', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));

        start_bridge_client(create_deps());
        await run_initial_poll();
        await vi.advanceTimersByTimeAsync(59_750);

        expect(get_error_entries()).toHaveLength(1);

        await vi.advanceTimersByTimeAsync(250);

        expect(get_error_entries()).toHaveLength(2);
    });

    test('uses independent rate limits for polling and result delivery errors', async () => {
        let poll_count = 0;
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();

                if (url.endsWith('/extension/heartbeat')) {
                    poll_count += 1;
                    if (poll_count === 2) {
                        throw new Error('offline');
                    }
                    return new Response('{}', { status: 200 });
                }

                if (url.endsWith('/extension/command')) {
                    return new Response(JSON.stringify({
                        command_id: 'cmd_1',
                        type: 'capture.stop',
                        payload: {},
                        created_at: 1,
                    }), { status: 200 });
                }

                return new Response('{}', { status: 413 });
            },
        );

        start_bridge_client(create_deps());
        await run_initial_poll();
        await vi.advanceTimersByTimeAsync(250);
        stop_bridge_client();

        expect(get_error_entries().map((entry) => entry.message)).toEqual([
            'Bridge result delivery failed',
            'Bridge polling failed',
        ]);
    });

    test('resets error rate limits for a new client lifecycle', async () => {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('offline'));
        const deps = create_deps();

        start_bridge_client(deps);
        await run_initial_poll();
        stop_bridge_client();
        start_bridge_client(deps);
        await run_initial_poll();
        stop_bridge_client();

        expect(get_error_entries()).toHaveLength(2);
    });

    test('does not let stale config stop a restarted client', async () => {
        const first_config = create_deferred<typeof disabled_config>();
        let config_count = 0;
        const deps = create_deps(vi.fn(async () => {
            config_count += 1;
            if (config_count === 1) {
                return first_config.promise;
            }
            return enabled_config;
        }));

        start_bridge_client(deps);
        await vi.advanceTimersByTimeAsync(0);
        stop_bridge_client();
        start_bridge_client(deps);

        first_config.resolve(disabled_config);
        await Promise.resolve();
        await Promise.resolve();

        expect(is_bridge_client_running()).toBe(true);
    });

    test('does not continue an in-flight poll after stop', async () => {
        const heartbeat = create_deferred<Response>();
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                if (input.toString().endsWith('/extension/heartbeat')) {
                    return heartbeat.promise;
                }
                return new Response(null, { status: 204 });
            },
        );

        start_bridge_client(create_deps());
        await vi.advanceTimersByTimeAsync(0);
        stop_bridge_client();
        heartbeat.resolve(new Response('{}', { status: 200 }));
        await vi.advanceTimersByTimeAsync(0);

        expect(fetch_spy).toHaveBeenCalledTimes(1);
    });

    test('does not let a stopped lifecycle join a restarted client', async () => {
        const first_heartbeat = create_deferred<Response>();
        let heartbeat_count = 0;
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();

                if (url.endsWith('/extension/heartbeat')) {
                    heartbeat_count += 1;
                    if (heartbeat_count === 1) {
                        return first_heartbeat.promise;
                    }
                    return new Response('{}', { status: 200 });
                }

                return new Response(null, { status: 204 });
            },
        );
        const deps = create_deps();

        start_bridge_client(deps);
        await vi.advanceTimersByTimeAsync(0);
        stop_bridge_client();
        start_bridge_client(deps);
        await vi.advanceTimersByTimeAsync(0);

        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/command'),
        )).toHaveLength(1);

        first_heartbeat.resolve(new Response('{}', { status: 200 }));
        await vi.advanceTimersByTimeAsync(0);

        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/command'),
        )).toHaveLength(1);
    });

    test('ignores stale result delivery failures after restart', async () => {
        const first_result = create_deferred<Response>();
        let result_count = 0;
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();

                if (url.endsWith('/extension/command')) {
                    return new Response(JSON.stringify({
                        command_id: 'cmd_1',
                        type: 'capture.stop',
                        payload: {},
                        created_at: 1,
                    }), { status: 200 });
                }

                if (url.endsWith('/extension/result')) {
                    result_count += 1;
                    if (result_count === 1) {
                        return first_result.promise;
                    }
                    return new Response('{}', { status: 413 });
                }

                return new Response('{}', { status: 200 });
            },
        );
        const deps = create_deps();

        start_bridge_client(deps);
        await vi.advanceTimersByTimeAsync(0);
        stop_bridge_client();
        start_bridge_client(deps);

        first_result.resolve(new Response('{}', { status: 413 }));
        await Promise.resolve();
        await Promise.resolve();

        expect(get_error_entries()).toHaveLength(0);

        await vi.advanceTimersByTimeAsync(0);
        stop_bridge_client();

        expect(fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/result'),
        )).toHaveLength(2);
        expect(get_error_entries()).toEqual([
            expect.objectContaining({
                message: 'Bridge result delivery failed',
                details: {
                    stage: 'result_delivery',
                    failure_kind: 'http',
                    http_status: 413,
                },
            }),
        ]);
    });

    test('does not poll again after stop', async () => {
        const fetch_spy = mock_idle_bridge();

        start_bridge_client(create_deps());
        await run_initial_poll();
        stop_bridge_client();
        await vi.advanceTimersByTimeAsync(60_000);

        expect(fetch_spy).toHaveBeenCalledTimes(2);
    });
});

describe('T0006: auto-enroll and session management', () => {
    beforeEach(() => {
        // These tests exercise the enroll path itself; clear any preset session
        // so the client must enroll rather than reuse storage.
        set_bridge_session_for_tests(null);
        storage_get.mockResolvedValue({});
    });

    function create_enroll_deps(
        get_user_config: AgentBridgeClientDeps['get_user_config'] = vi.fn(
            async () => browser_enrolled_config,
        ),
        save_user_config: AgentBridgeClientDeps['save_user_config'] = vi.fn(async () => {}),
    ): AgentBridgeClientDeps {
        return {
            get_user_config,
            save_user_config,
            start_capture: vi.fn(async () => ({ success: true })),
            stop_capture: vi.fn(async () => ({ success: true })),
            get_status: vi.fn(() => ({ active_capture_id: null })),
            extension_version: '0.1.0',
        };
    }

    function mock_enroll_response(ok: boolean, browser_label: string | null = null): ReturnType<typeof vi.spyOn> {
        return vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                if (url.endsWith('/pair/status')) {
                    // t169: 无 token 时扩展自动读取 pairing code（MCP 客户端 open 后有效）
                    return new Response(JSON.stringify({
                        ok: true,
                        data: { open: true, code: '123456', expires_at: Date.now() + 60000 },
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/enroll') && init?.method === 'POST') {
                    if (!ok) return new Response('{}', { status: 400 });
                    return new Response(JSON.stringify({
                        ok: true,
                        data: {
                            instance_id: 'inst_test_uuid_001',
                            instance_token: 'ext_test_token_001',
                            browser_label,
                        },
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                return new Response('{}', { status: 200 });
            },
        );
    }

    test('AC-4: logs enroll error when bridge is not reachable', async () => {
        const fetch_spy = vi.spyOn(global, 'fetch').mockRejectedValue(
            new Error('fetch failed'),
        );

        start_bridge_client(create_enroll_deps());
        await run_initial_poll();
        stop_bridge_client();

        expect(fetch_spy.mock.calls.some(
            ([input]) => input.toString().endsWith('/extension/enroll'),
        )).toBe(true);
        expect(get_error_entries().some(
            (e) => e.message === 'Bridge polling failed' && e.details?.stage === 'enroll',
        )).toBe(true);
    });

    test('AC-2: enroll succeeds, session saved, heartbeat uses instance_token', async () => {
        mock_enroll_response(true);

        start_bridge_client(create_enroll_deps());
        await run_initial_poll();
        stop_bridge_client();

        expect(storage_set).toHaveBeenCalledWith(
            expect.objectContaining({
                agent_bridge_session: expect.objectContaining({
                    instance_id: 'inst_test_uuid_001',
                    instance_token: 'ext_test_token_001',
                }),
            }),
        );

        const heartbeat_calls = vi.spyOn(global, 'fetch').mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/heartbeat'),
        );
        expect(heartbeat_calls.length).toBeGreaterThanOrEqual(1);
    });

    test('AC-3: restart recovers session from storage, no re-enroll needed', async () => {
        storage_get.mockResolvedValue({
            agent_bridge_session: {
                instance_id: 'inst_restored_001',
                instance_token: 'ext_restored_token_001',
            },
        });

        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();
                if (url.endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_enroll_deps());
        await run_initial_poll();
        stop_bridge_client();

        const enroll_calls = fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/enroll'),
        );
        expect(enroll_calls).toHaveLength(0);

        const heartbeat_calls = fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/heartbeat'),
        );
        expect(heartbeat_calls.length).toBeGreaterThanOrEqual(1);
    });

    test('401 on enrolled session triggers re-enroll', async () => {
        storage_get.mockResolvedValue({
            agent_bridge_session: {
                instance_id: 'inst_old_001',
                instance_token: 'ext_old_token_001',
            },
        });

        let enroll_count = 0;
        let call_count = 0;
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                call_count += 1;
                if (url.endsWith('/extension/enroll') && init?.method === 'POST') {
                    enroll_count += 1;
                    return new Response(JSON.stringify({
                        ok: true,
                        data: {
                            instance_id: 'inst_new_001',
                            instance_token: 'ext_new_token_001',
                            browser_label: null,
                        },
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                if (call_count === 1) {
                    return new Response('{}', { status: 401 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_enroll_deps());
        await run_initial_poll();

        expect(storage_remove).toHaveBeenCalledWith('agent_bridge_session');
        expect(enroll_count).toBeGreaterThanOrEqual(1);

        stop_bridge_client();
    });

    // ─── T091: 零配置 —— 无 agent_bridge_token 时依赖 loopback origin 直通 enroll ───

    test('T091 (t169): enroll without agent_bridge_token auto-reads pairing code and sends it', async () => {
        const no_token_config = {
            agent_bridge_enabled: true,
            agent_bridge_url: 'http://127.0.0.1:17831',
            agent_bridge_token: '',
            agent_bridge_poll_interval_ms: 250,
            browser_label: '',
        };
        const fetch_spy = mock_enroll_response(true);

        start_bridge_client(create_enroll_deps(vi.fn(async () => no_token_config)));
        await run_initial_poll();
        stop_bridge_client();

        // 1. 无 token 时先读 /pair/status（自动获取 pairing code）
        const pair_calls = fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/pair/status'),
        );
        expect(pair_calls.length).toBeGreaterThan(0);

        // 2. enroll 请求不带 Authorization（零配置），但 body 携带自动获取的 pairing_code
        const enroll_calls = fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/enroll'),
        );
        expect(enroll_calls.length).toBeGreaterThan(0);
        const enroll_init = enroll_calls[0][1] as RequestInit | undefined;
        const headers = enroll_init?.headers as Record<string, string> | undefined;
        expect(headers?.Authorization).toBeUndefined();
        const enroll_body = JSON.parse(String(enroll_init?.body)) as { pairing_code?: string };
        expect(enroll_body.pairing_code).toBe('123456');

        // 3. session 仍被保存（Bridge 颁发的 instance_token 持久化）
        expect(storage_set).toHaveBeenCalledWith(
            expect.objectContaining({
                agent_bridge_session: expect.objectContaining({
                    instance_id: 'inst_test_uuid_001',
                    instance_token: 'ext_test_token_001',
                }),
            }),
        );
    });

    // ─── 默认编号回填:本地未设 label 时,enroll/重 enroll 将 Bridge 分配编号写入本地配置 ───

    test('AC: enroll 返回默认编号且本地未设 label 时回填到本地配置', async () => {
        const save = vi.fn(async () => {});
        mock_enroll_response(true, '1 号');

        start_bridge_client(create_enroll_deps(undefined, save));
        await run_initial_poll();
        stop_bridge_client();

        expect(save).toHaveBeenCalledWith({ browser_label: '1 号' });
    });

    test('AC: 本地已设 label 时不回填', async () => {
        const save = vi.fn(async () => {});
        mock_enroll_response(true, '默认编号');

        start_bridge_client(create_enroll_deps(
            vi.fn(async () => ({ ...browser_enrolled_config, browser_label: '我的浏览器' })),
            save,
        ));
        await run_initial_poll();
        stop_bridge_client();

        expect(save).not.toHaveBeenCalled();
    });

    test('AC: bridge 未返回编号时不回填', async () => {
        const save = vi.fn(async () => {});
        mock_enroll_response(true, null);

        start_bridge_client(create_enroll_deps(undefined, save));
        await run_initial_poll();
        stop_bridge_client();

        expect(save).not.toHaveBeenCalled();
    });

    test('AC: 401 重 enroll 返回编号且本地未设 label 时回填', async () => {
        const save = vi.fn(async () => {});
        storage_get.mockResolvedValue({
            agent_bridge_session: {
                instance_id: 'inst_old_001',
                instance_token: 'ext_old_token_001',
            },
        });

        let call_count = 0;
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                call_count += 1;
                if (url.endsWith('/extension/enroll') && init?.method === 'POST') {
                    return new Response(JSON.stringify({
                        ok: true,
                        data: {
                            instance_id: 'inst_new_001',
                            instance_token: 'ext_new_token_001',
                            browser_label: '1 号',
                        },
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                if (call_count === 1) {
                    return new Response('{}', { status: 401 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_enroll_deps(undefined, save));
        await run_initial_poll();
        stop_bridge_client();

        expect(save).toHaveBeenCalledWith({ browser_label: '1 号' });
    });

    // ─── 心跳回填:已 enroll 实例(复用 session 不再 enroll)经心跳回带编号回填本地配置 ───

    test('AC: 心跳回带编号且本地未设 label 时回填', async () => {
        // 已有持久化 session → resolve_token 复用,不 enroll,只走心跳
        storage_get.mockResolvedValue({
            agent_bridge_session: {
                instance_id: 'inst_test_session',
                instance_token: 'ext_test_session_token',
            },
        });
        const save = vi.fn(async () => {});
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                if (url.endsWith('/extension/heartbeat') && init?.method === 'POST') {
                    return new Response(JSON.stringify({
                        ok: true,
                        data: { browser_label: '1 号' },
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_enroll_deps(undefined, save));
        await run_initial_poll();
        stop_bridge_client();

        expect(save).toHaveBeenCalledWith({ browser_label: '1 号' });
    });

    test('AC: 心跳回带编号但本地已设 label 时不回填', async () => {
        storage_get.mockResolvedValue({
            agent_bridge_session: {
                instance_id: 'inst_test_session',
                instance_token: 'ext_test_session_token',
            },
        });
        const save = vi.fn(async () => {});
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                if (url.endsWith('/extension/heartbeat') && init?.method === 'POST') {
                    return new Response(JSON.stringify({
                        ok: true,
                        data: { browser_label: '1 号' },
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_enroll_deps(
            vi.fn(async () => ({ ...browser_enrolled_config, browser_label: '我的浏览器' })),
            save,
        ));
        await run_initial_poll();
        stop_bridge_client();

        expect(save).not.toHaveBeenCalled();
    });

    test('AC: 心跳回带 null 编号时不回填', async () => {
        storage_get.mockResolvedValue({
            agent_bridge_session: {
                instance_id: 'inst_test_session',
                instance_token: 'ext_test_session_token',
            },
        });
        const save = vi.fn(async () => {});
        vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                if (url.endsWith('/extension/heartbeat') && init?.method === 'POST') {
                    return new Response(JSON.stringify({
                        ok: true,
                        data: { browser_label: null },
                    }), { status: 200 });
                }
                if (url.endsWith('/extension/command')) {
                    return new Response(null, { status: 204 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        start_bridge_client(create_enroll_deps(undefined, save));
        await run_initial_poll();
        stop_bridge_client();

        expect(save).not.toHaveBeenCalled();
    });
});


describe('T102: lifecycle 失效仍投递 result', () => {
    test('AC-001: dispatch 返回 result 后 lifecycle 失效，仍投递 result 一次', async () => {
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();
                if (url.endsWith('/extension/command')) {
                    return new Response(JSON.stringify({
                        command_id: 'cmd_1',
                        type: 'capture.stop',
                        payload: {},
                        created_at: 1,
                    }), { status: 200 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        // 挂起 dispatch：stop_capture 返回 pending，poll_cycle 停在 dispatch
        const stop_deferred = create_deferred<{ success: boolean }>();
        const deps = create_deps();
        deps.stop_capture = vi.fn(() => stop_deferred.promise);

        start_bridge_client(deps);
        await run_initial_poll();

        // dispatch 已开始（stop_capture 挂起），此时 lifecycle 失效
        stop_bridge_client();

        // 放行 dispatch，产生 result
        stop_deferred.resolve({ success: true });
        await vi.advanceTimersByTimeAsync(0);

        // 旧代码在 dispatch 后遇失效 return，result 不投递；新代码仍投递一次
        const result_calls = fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/result'),
        );
        expect(result_calls.length).toBe(1);
    });

    test('AC-002: 投递路径在 lifecycle 失效后不抛未捕获异常且不继续轮询', async () => {
        let command_count = 0;
        const fetch_spy = vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request) => {
                const url = input.toString();
                if (url.endsWith('/extension/command')) {
                    command_count += 1;
                    if (command_count === 1) {
                        return new Response(JSON.stringify({
                            command_id: 'cmd_1',
                            type: 'capture.stop',
                            payload: {},
                            created_at: 1,
                        }), { status: 200 });
                    }
                    return new Response(null, { status: 204 });
                }
                if (url.endsWith('/extension/result')) {
                    return new Response('{}', { status: 413 });
                }
                return new Response('{}', { status: 200 });
            },
        );

        const stop_deferred = create_deferred<{ success: boolean }>();
        const deps = create_deps();
        deps.stop_capture = vi.fn(() => stop_deferred.promise);

        start_bridge_client(deps);
        await run_initial_poll();
        stop_bridge_client();
        stop_deferred.resolve({ success: true });
        await vi.advanceTimersByTimeAsync(0);

        // lifecycle 失效后投递仍被尝试（result fetch 发生），413 异常被捕获不抛未捕获
        const result_calls = fetch_spy.mock.calls.filter(
            ([input]) => input.toString().endsWith('/extension/result'),
        );
        expect(result_calls.length).toBe(1);
        // 不抛未捕获异常（若抛出会 fail 测试）；stop 后投递异常经 lifecycle 检查静默不 log
        // lifecycle 已失效，不再调度下一轮 poll
        expect(is_bridge_client_running()).toBe(false);
    });
});
