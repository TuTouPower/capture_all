import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
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
    browser_no: 0,
    browser_label: '',
};

const browser_enrolled_config = {
    agent_bridge_enabled: true,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '',
    agent_bridge_poll_interval_ms: 250,
    browser_no: 2,
    browser_label: '',
};

function create_deps(
    get_user_config: AgentBridgeClientDeps['get_user_config'] = vi.fn(
        async () => enabled_config,
    ),
): AgentBridgeClientDeps {
    return {
        get_user_config,
        start_capture: vi.fn(async () => ({ success: true })),
        stop_capture: vi.fn(async () => ({ success: true })),
        get_status: vi.fn(() => ({ active_capture_id: null })),
        extension_version: '0.1.0',
    };
}

function mock_idle_bridge(): ReturnType<typeof vi.spyOn> {
    return vi.spyOn(global, 'fetch').mockImplementation(
        async (input: string | URL | Request) => {
            if (input.toString().endsWith('/extension/command')) {
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
    set_bridge_session_for_tests(null);
    vi.useFakeTimers();
    log_write.mockClear();
    storage_get.mockClear();
    storage_set.mockClear();
    storage_remove.mockClear();
    storage_get.mockResolvedValue({});
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
    function create_enroll_deps(
        get_user_config: AgentBridgeClientDeps['get_user_config'] = vi.fn(
            async () => browser_enrolled_config,
        ),
    ): AgentBridgeClientDeps {
        return {
            get_user_config,
            start_capture: vi.fn(async () => ({ success: true })),
            stop_capture: vi.fn(async () => ({ success: true })),
            get_status: vi.fn(() => ({ active_capture_id: null })),
            extension_version: '0.1.0',
        };
    }

    function mock_enroll_response(ok: boolean): ReturnType<typeof vi.spyOn> {
        return vi.spyOn(global, 'fetch').mockImplementation(
            async (input: string | URL | Request, init?: RequestInit) => {
                const url = input.toString();
                if (url.endsWith('/extension/enroll') && init?.method === 'POST') {
                    if (!ok) return new Response('{}', { status: 400 });
                    return new Response(JSON.stringify({
                        ok: true,
                        data: {
                            instance_id: 'inst_test_uuid_001',
                            instance_token: 'ext_test_token_001',
                            browser_no: 2,
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
                            browser_no: 2,
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
});
