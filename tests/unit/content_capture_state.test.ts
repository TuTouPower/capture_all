// tests/unit/content_capture_state.test.ts
// 验证 content_event_utils.create_capture_state 工厂：begin/end 守卫与状态复位。
import { describe, it, expect, vi } from 'vitest';
import type { CaptureEvent } from '../../src/shared/types';
import { create_capture_state } from '../../src/extension/content/content_event_utils';

describe('create_capture_state', () => {
    it('begin 写入运行参数并激活', () => {
        const state = create_capture_state<{ n: number }>();
        const sender = vi.fn();
        const ok = state.begin(sender, { capture_id: 'cap1', capture_start_epoch_ms: 100, tab_id: 7 });

        expect(ok).toBe(true);
        expect(state.is_capturing).toBe(true);
        expect(state.capture_id).toBe('cap1');
        expect(state.capture_start_epoch_ms).toBe(100);
        expect(state.tab_id).toBe(7);
        expect(state.sender).toBe(sender);
    });

    it('重复 begin 被守卫拦截，不覆盖已有状态', () => {
        const state = create_capture_state<{ n: number }>();
        const sender_a = vi.fn();
        const sender_b = vi.fn();
        state.begin(sender_a, { capture_id: 'cap1', capture_start_epoch_ms: 100, tab_id: 7 });

        const second = state.begin(sender_b, { capture_id: 'cap2', capture_start_epoch_ms: 200, tab_id: 8 });

        expect(second).toBe(false);
        expect(state.capture_id).toBe('cap1');
        expect(state.sender).toBe(sender_a);
    });

    it('end 复位后可再次 begin', () => {
        const state = create_capture_state<{ n: number }>();
        const sender_a = vi.fn();
        const sender_b = vi.fn();
        state.begin(sender_a, { capture_id: 'cap1', capture_start_epoch_ms: 100, tab_id: 7 });

        expect(state.end()).toBe(true);
        expect(state.is_capturing).toBe(false);
        expect(state.sender).toBe(null);

        const ok = state.begin(sender_b, { capture_id: 'cap2', capture_start_epoch_ms: 200, tab_id: 8 });
        expect(ok).toBe(true);
        expect(state.capture_id).toBe('cap2');
        expect(state.sender).toBe(sender_b);
    });

    it('未激活时 end 返回 false', () => {
        const state = create_capture_state<{ n: number }>();
        expect(state.end()).toBe(false);
        expect(state.is_capturing).toBe(false);
    });

    it('sender 透传事件与数据', () => {
        const state = create_capture_state<{ n: number }>();
        const sender = vi.fn();
        state.begin(sender, { capture_id: 'cap1', capture_start_epoch_ms: 0, tab_id: 1 });
        const evt = {} as CaptureEvent;
        state.sender?.(evt, { n: 42 });
        expect(sender).toHaveBeenCalledWith(evt, { n: 42 });
    });
});
