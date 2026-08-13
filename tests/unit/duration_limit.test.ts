// tests/unit/duration_limit.test.ts
// t159 AC-001/002/005: 采集 24h 时长上限执行（chrome.alarms 优先 + fallback timer）
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    arm_duration_limit,
    disarm_duration_limit,
    is_duration_alarm,
    DURATION_ALARM_NAME,
} from '../../src/extension/background/duration_limit';
import { MAX_SESSION_DURATION_MS } from '../../src/shared/constants';

function install_alarms_mock() {
    const create = vi.fn();
    const clear = vi.fn();
    const onAlarm = { addListener: vi.fn() };
    vi.stubGlobal('chrome', {
        alarms: { create, clear, onAlarm },
    });
    return { create, clear };
}

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
});

afterEach(() => {
    disarm_duration_limit();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('duration_limit', () => {
    it('AC-001: arm 注册 alarm，when = now + MAX_SESSION_DURATION_MS（24h）', async () => {
        const { create } = install_alarms_mock();
        const now = Date.now();
        const on_expired = vi.fn();

        await arm_duration_limit(now + MAX_SESSION_DURATION_MS, on_expired);

        expect(create).toHaveBeenCalledWith(DURATION_ALARM_NAME, { when: now + MAX_SESSION_DURATION_MS });
        expect(MAX_SESSION_DURATION_MS).toBe(24 * 60 * 60 * 1000);
    });

    it('AC-001b: is_duration_alarm 识别本 alarm，忽略其他 alarm', () => {
        expect(is_duration_alarm(DURATION_ALARM_NAME)).toBe(true);
        expect(is_duration_alarm('capture_all_keepalive')).toBe(false);
        expect(is_duration_alarm('other')).toBe(false);
    });

    it('AC-001c: chrome.alarms 不可用时 fallback timer 到期触发 on_expired', async () => {
        // 不装 alarms mock：chrome 无 alarms → fallback setTimeout
        const on_expired = vi.fn();
        await arm_duration_limit(Date.now() + 1000, on_expired);

        await vi.advanceTimersByTimeAsync(999);
        expect(on_expired).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        expect(on_expired).toHaveBeenCalledTimes(1);
    });

    it('AC-002: disarm 取消 alarm 与 fallback timer，后续不再触发', async () => {
        const { clear } = install_alarms_mock();
        const on_expired = vi.fn();
        await arm_duration_limit(Date.now() + 1000, on_expired);

        disarm_duration_limit();
        expect(clear).toHaveBeenCalledWith(DURATION_ALARM_NAME);

        // fallback timer 分支：arm（无 alarms）→ disarm → 到期不触发
        vi.unstubAllGlobals();
        const on_expired2 = vi.fn();
        await arm_duration_limit(Date.now() + 1000, on_expired2);
        disarm_duration_limit();
        await vi.advanceTimersByTimeAsync(2000);
        expect(on_expired2).not.toHaveBeenCalled();
    });

    it('AC-001d: 到期延迟为负数（deadline 已过）时立即触发', async () => {
        const on_expired = vi.fn();
        // 无 alarms 环境走 fallback timer：deadline 已过 → 立即触发
        await arm_duration_limit(Date.now() - 5000, on_expired);
        await vi.advanceTimersByTimeAsync(0);
        expect(on_expired).toHaveBeenCalledTimes(1);
    });
});
