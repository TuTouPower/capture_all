// tests/unit/keepalive.test.ts — B2-M16: keepalive handler 执行真实工作（flush），非纯 debug 日志
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';

let on_alarm_listener: ((a: { name: string }) => void) | null = null;
// vi.hoisted：vi.mock 被提升到文件顶部，mock 工厂只能引用 hoisted 值
const { flush_all_mock } = vi.hoisted(() => ({ flush_all_mock: vi.fn(async () => {}) }));

vi.mock('../../src/extension/background/storage', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/extension/background/storage')>();
    return { ...actual, flush_all: flush_all_mock };
});

import { setup_keepalive_listener, start_keepalive, stop_keepalive } from '../../src/extension/background/keepalive';

beforeEach(() => {
    flush_all_mock.mockClear();
    (globalThis as any).chrome = {
        alarms: {
            create: vi.fn(),
            clear: vi.fn(),
            onAlarm: { addListener: vi.fn((fn: (a: { name: string }) => void) => { on_alarm_listener = fn; }) },
        },
    };
});

describe('keepalive real work (B2-M16)', () => {
    it('setup registers the alarm listener exactly once (幂等)', () => {
        setup_keepalive_listener();
        setup_keepalive_listener();
        const add_listener = (globalThis as any).chrome.alarms.onAlarm.addListener as ReturnType<typeof vi.fn>;
        expect(add_listener).toHaveBeenCalledTimes(1);
    });

    it('handler triggers real work (flush_all) on keepalive alarm', async () => {
        setup_keepalive_listener();
        expect(on_alarm_listener).not.toBeNull();
        on_alarm_listener!({ name: 'capture_all_keepalive' });
        // 等 handler 的 async 工作完成（flush_all + app_log flush）
        await new Promise((r) => setTimeout(r, 20));
        expect(flush_all_mock).toHaveBeenCalled();
    });

    it('ignores unrelated alarms (不做真实工作)', async () => {
        setup_keepalive_listener();
        on_alarm_listener!({ name: 'some_other_alarm' });
        await new Promise((r) => setTimeout(r, 20));
        expect(flush_all_mock).not.toHaveBeenCalled();
    });

    it('start/stop create/clear the alarm', () => {
        start_keepalive();
        expect((globalThis as any).chrome.alarms.create).toHaveBeenCalledWith('capture_all_keepalive', { periodInMinutes: 0.5 });
        stop_keepalive();
        expect((globalThis as any).chrome.alarms.clear).toHaveBeenCalledWith('capture_all_keepalive');
    });
});
