// @vitest-environment jsdom
// tests/unit/scroll_capture.test.ts — B3-L1: scroll 滚动源判定
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ScrollEventData } from '../../src/shared/types';
import { start_scroll_capture, stop_scroll_capture } from '../../src/extension/content/scroll_capture';

describe('scroll_capture', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
        vi.useFakeTimers();
        stop_scroll_capture();
    });

    afterEach(() => {
        stop_scroll_capture();
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    it('document scroll → is_document_scroll=true，无目标', () => {
        start_scroll_capture(sender, { capture_id: 'cap', capture_start_epoch_ms: Date.now(), tab_id: 1 });
        document.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(250);
        expect(sender).toHaveBeenCalledTimes(1);
        const data = sender.mock.calls[0][1] as ScrollEventData;
        expect(data.is_document_scroll).toBe(true);
        expect(data.target_selector).toBeNull();
    });

    // B3-L1: 嵌套滚动容器不产生坐标不变的文档级噪声——记录容器自身坐标与目标
    it('nested scroll container → is_document_scroll=false + target', () => {
        start_scroll_capture(sender, { capture_id: 'cap', capture_start_epoch_ms: Date.now(), tab_id: 1 });
        const container = document.createElement('div');
        container.id = 'scroller';
        container.style.overflow = 'auto';
        document.body.appendChild(container);
        // scroll 不冒泡；capture 监听在 document 捕获期收到
        container.dispatchEvent(new Event('scroll'));
        vi.advanceTimersByTime(250);
        expect(sender).toHaveBeenCalledTimes(1);
        const data = sender.mock.calls[0][1] as ScrollEventData;
        expect(data.is_document_scroll).toBe(false);
        expect(data.target_selector).toBe('#scroller');
    });

    it('scroll 事件捕获阶段监听（stop 后移除）', () => {
        const spy = vi.spyOn(document, 'addEventListener');
        start_scroll_capture(sender, { capture_id: 'cap', capture_start_epoch_ms: Date.now(), tab_id: 1 });
        const calls = spy.mock.calls.filter((c) => c[0] === 'scroll');
        expect(calls.length).toBe(1);
        expect(calls[0][2]).toEqual({ capture: true, passive: true });
        spy.mockRestore();
    });
});
