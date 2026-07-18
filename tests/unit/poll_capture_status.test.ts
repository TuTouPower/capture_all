// tests/poll_capture_status.test.ts
// BUG-004: content_script 加载后必须周期轮询 SW 采集状态
//
// 真实场景证据（data/.../2026-06-13_23-06-05.zip + capture_all_logs）：
// - 23:04:03 SW 采集开始，给 chatgpt.com tab (1793063899) 发 start → "Receiving end does not exist."
// - 整个采集期间 chatgpt.com content_script 既没收到 start 消息，也没主动启动
// - 直到 23:05:53 用户切到 xiaomimimo.com，新页面 content_script 加载，get_status 才显示 is_capturing=true，启动采集
// - 结果：458 个事件中只有 4 个来自 content_script（且都在最后 2 个页面），user_action_count=0, storage_change_count=0
//
// 根因：content_script.ts 加载时只调用一次 get_status；若 SW 此时未采集就退出，之后再不会重试。
// 修复：引入 start_status_poll，content_script 加载后周期性轮询直到采集开始。

import { describe, it, expect, vi } from 'vitest';
import { start_status_poll, POLL_INTERVAL_MS } from '../../src/extension/shared/poll_capture_status';

interface MockTimer {
    callback: () => void;
    id: number;
    ms: number;
}

function make_mocks() {
    const timers: MockTimer[] = [];
    let next_id = 1;
    const setInterval_mock = vi.fn((cb: () => void, ms: number) => {
        const entry = { callback: cb, id: next_id++, ms };
        timers.push(entry);
        return entry.id;
    });
    const clearInterval_mock = vi.fn((id: unknown) => {
        const idx = timers.findIndex((t) => t.id === id);
        if (idx >= 0) timers.splice(idx, 1);
    });

    return { timers, setInterval_mock, clearInterval_mock };
}

function flush_promises(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('start_status_poll', () => {
    it('POLL_INTERVAL_MS is configured (not zero, not minutes)', () => {
        expect(POLL_INTERVAL_MS).toBeGreaterThan(500);
        expect(POLL_INTERVAL_MS).toBeLessThan(10_000);
    });

    it('immediately calls get_status once on start', async () => {
        const get_status = vi.fn().mockResolvedValue({ is_capturing: false });
        const on_active = vi.fn();
        const { setInterval_mock } = make_mocks();

        start_status_poll({ get_status, on_active, setInterval: setInterval_mock, clearInterval: () => {} });
        await flush_promises();

        expect(get_status).toHaveBeenCalledTimes(1);
        expect(on_active).not.toHaveBeenCalled();
        expect(setInterval_mock).toHaveBeenCalledTimes(1);
    });

    it('starts capture immediately when SW is already capturing on first check (no polling needed)', async () => {
        const get_status = vi.fn().mockResolvedValue({
            is_capturing: true,
            capture_id: 'cap_123',
            start_time: 1000,
            tab_id: 42,
            config: { mouse_precision: 'clicks_scroll_drag' },
        });
        const on_active = vi.fn();
        const { setInterval_mock } = make_mocks();

        start_status_poll({ get_status, on_active, setInterval: setInterval_mock, clearInterval: () => {} });
        await flush_promises();

        expect(get_status).toHaveBeenCalledTimes(1);
        expect(on_active).toHaveBeenCalledWith(expect.objectContaining({
            is_capturing: true,
            capture_id: 'cap_123',
            tab_id: 42,
        }));
        // 关键：SW 已在采集时不再轮询（节省资源）
        expect(setInterval_mock).not.toHaveBeenCalled();
    });

    it('REGRESSION BUG-004: when first get_status returns not_capturing, keeps polling and fires on_active once SW starts', async () => {
        // 模拟真实场景：content_script 加载时 SW 未采集；几轮轮询后 SW 开始采集
        let sw_capturing = false;
        const get_status = vi.fn().mockImplementation(async () => ({
            is_capturing: sw_capturing,
            capture_id: sw_capturing ? 'cap_late' : undefined,
            start_time: sw_capturing ? 5000 : undefined,
            tab_id: 99,
            config: sw_capturing ? { mouse_precision: 'clicks_scroll_drag' } : undefined,
        }));
        const on_active = vi.fn();
        const { timers, setInterval_mock, clearInterval_mock } = make_mocks();

        start_status_poll({ get_status, on_active, setInterval: setInterval_mock, clearInterval: clearInterval_mock });
        await flush_promises();

        // 首次检查：未采集
        expect(get_status).toHaveBeenCalledTimes(1);
        expect(on_active).not.toHaveBeenCalled();
        expect(setInterval_mock).toHaveBeenCalledTimes(1);
        expect(timers).toHaveLength(1);

        // 第一轮轮询：仍未采集
        timers[0].callback();
        await flush_promises();
        expect(get_status).toHaveBeenCalledTimes(2);
        expect(on_active).not.toHaveBeenCalled();

        // SW 现在开始采集
        sw_capturing = true;

        // 第二轮轮询：检测到采集，触发 on_active，清除定时器
        timers[0].callback();
        await flush_promises();

        expect(get_status).toHaveBeenCalledTimes(3);
        expect(on_active).toHaveBeenCalledTimes(1);
        expect(on_active).toHaveBeenCalledWith(expect.objectContaining({
            is_capturing: true,
            capture_id: 'cap_late',
            tab_id: 99,
        }));
        expect(clearInterval_mock).toHaveBeenCalled();
    });

    it('REGRESSION BUG-004: get_status rejection does not break the polling loop (SW temporarily unreachable)', async () => {
        // 模拟 content_script 比 SW 早加载，sendMessage 失败几轮后才成功。
        // 首次 check_once + N 轮 timer callback 都可能 reject；轮询必须继续。
        let call_count = 0;
        const get_status = vi.fn().mockImplementation(async () => {
            call_count++;
            if (call_count < 3) {
                throw new Error('Extension context not ready');
            }
            return { is_capturing: true, capture_id: 'cap_after_ready', tab_id: 7 };
        });
        const on_active = vi.fn();
        const { timers, setInterval_mock, clearInterval_mock } = make_mocks();

        start_status_poll({ get_status, on_active, setInterval: setInterval_mock, clearInterval: clearInterval_mock });
        await flush_promises();

        // 首次 check_once（call_count=1）：reject
        expect(get_status).toHaveBeenCalledTimes(1);
        expect(on_active).not.toHaveBeenCalled();

        // 第 1 轮 timer（call_count=2）：reject
        timers[0].callback();
        await flush_promises();
        expect(get_status).toHaveBeenCalledTimes(2);
        expect(on_active).not.toHaveBeenCalled();

        // 第 2 轮 timer（call_count=3）：成功，触发 on_active 并清定时器
        timers[0].callback();
        await flush_promises();

        expect(get_status).toHaveBeenCalledTimes(3);
        expect(on_active).toHaveBeenCalledTimes(1);
        expect(on_active).toHaveBeenCalledWith(expect.objectContaining({
            capture_id: 'cap_after_ready',
            tab_id: 7,
        }));
        expect(clearInterval_mock).toHaveBeenCalled();
    });

    it('stop function clears interval', async () => {
        const get_status = vi.fn().mockResolvedValue({ is_capturing: false });
        const on_active = vi.fn();
        const { timers, setInterval_mock, clearInterval_mock } = make_mocks();

        const stop = start_status_poll({
            get_status,
            on_active,
            setInterval: setInterval_mock,
            clearInterval: clearInterval_mock,
        });
        await flush_promises();

        expect(timers).toHaveLength(1);
        const timer_id = timers[0].id;
        stop();
        expect(clearInterval_mock).toHaveBeenCalledWith(timer_id);
    });
});
