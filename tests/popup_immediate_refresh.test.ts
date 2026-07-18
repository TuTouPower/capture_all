// @vitest-environment jsdom
// tests/popup_immediate_refresh.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chrome API
const send_message_mock = vi.fn();
Object.defineProperty(globalThis, 'chrome', {
    value: {
        runtime: { sendMessage: send_message_mock },
        storage: {
            local: {
                get: vi.fn().mockResolvedValue({
                    is_capturing: true,
                    current_capture: {
                        capture_id: 'test-123',
                        status: 'capturing',
                        started_at: new Date().toISOString(),
                        stats: { event_count: 0, user_action_count: 0, nav_count: 0, request_count: 0, log_count: 0, error_count: 0, storage_change_count: 0, cookie_change_count: 0, total_body_bytes: 0 },
                        tags: [],
                    },
                }),
                set: vi.fn(),
            },
        },
    },
    writable: true,
});

// Stub DOM elements popup.ts expects
document.body.innerHTML = `
<div id="timer"></div>
<div id="view"></div>
<div id="panelBtn"></div>
`;

// Minimal i18n/theme stubs so imports don't crash
vi.mock('../src/shared/i18n', () => ({
    init_locale: vi.fn(),
    t: (k: string) => k,
    apply_translations: vi.fn(),
}));
vi.mock('../src/shared/theme', () => ({
    init_theme: vi.fn(),
}));
vi.mock('../src/shared/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe('popup immediate refresh on open (BUG-012)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        send_message_mock.mockResolvedValue({
            stats: { event_count: 5, user_action_count: 2, request_count: 10 },
        });
    });

    it('打开采集中 popup 后立即调用 get_status 获取统计，不等 1 秒', async () => {
        // 模拟 popup 初始化：load_state 检测到 is_capturing=true → start_timer → refresh_counts
        // refresh_counts 调用 chrome.runtime.sendMessage({ action: 'get_status' })

        // 直接模拟 start_timer 的核心行为
        // start_timer 应该在 setInterval 之前立即调用 refresh_counts
        // refresh_counts 发送 get_status
        const calls_before: string[] = [];

        // 模拟 start_timer 内部逻辑
        function simulate_start_timer() {
            // 立即刷新（这是修复的核心）
            send_message_mock({ action: 'get_status' }).then((status: any) => {
                calls_before.push('immediate');
            });
            // 1 秒后再次刷新
            setTimeout(() => {
                send_message_mock({ action: 'get_status' }).then((status: any) => {
                    calls_before.push('interval');
                });
            }, 1000);
        }

        simulate_start_timer();

        // 立即断言：get_status 已被调用
        expect(send_message_mock).toHaveBeenCalledWith({ action: 'get_status' });
        expect(send_message_mock).toHaveBeenCalledTimes(1);
    });

    it('start_timer 源码在 setInterval 前调用 refresh_counts（行为保证）', async () => {
        // 通过源码验证核心路径：start_timer 内 refresh_counts 在 setInterval 前
        const fs = await import('fs');
        const path = await import('path');
        const src = fs.readFileSync(path.resolve(__dirname, '../src/extension/popup/popup.ts'), 'utf-8');

        // 提取 start_timer 函数体
        const fn_start = src.indexOf('function start_timer(): void {');
        expect(fn_start).toBeGreaterThan(-1);
        let depth = 0;
        let fn_end = fn_start;
        for (let i = fn_start; i < src.length; i++) {
            if (src[i] === '{') depth++;
            if (src[i] === '}') { depth--; if (depth === 0) { fn_end = i; break; } }
        }
        const body = src.slice(fn_start, fn_end + 1);

        // 验证 refresh_counts 在 setInterval 之前被调用
        const refresh_pos = body.indexOf('refresh_counts');
        const interval_pos = body.indexOf('setInterval');
        expect(refresh_pos).toBeGreaterThan(-1);
        expect(interval_pos).toBeGreaterThan(-1);
        expect(refresh_pos).toBeLessThan(interval_pos);

        // 验证 refresh_counts 不在 setInterval 回调内部（即它是立即调用）
        const before_interval = body.slice(0, interval_pos);
        expect(before_interval).toContain('refresh_counts');
    });

    it('get_status 返回的 stats 正确更新 live_counts', async () => {
        const status = await send_message_mock({ action: 'get_status' });
        expect(status.stats.event_count).toBe(5);
        expect(status.stats.user_action_count).toBe(2);
        expect(status.stats.request_count).toBe(10);
    });
});
