// @vitest-environment jsdom
// tests/fullscreen_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { start_fullscreen_capture, stop_fullscreen_capture } from '../../src/extension/content/fullscreen_capture';

describe('fullscreen_capture', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
        stop_fullscreen_capture();
    });

    afterEach(() => stop_fullscreen_capture());

    it('进入全屏 → action=enter', () => {
        start_fullscreen_capture(sender, 'cap1', Date.now(), 1);
        const div = document.createElement('div');
        div.id = 'player';
        document.body.appendChild(div);
        Object.defineProperty(document, 'fullscreenElement', { value: div, configurable: true });
        document.dispatchEvent(new Event('fullscreenchange'));
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('fullscreen_change');
        expect(data.action).toBe('enter');
        expect(data.element_tag).toBe('DIV');
        expect(data.element_id).toBe('player');
    });

    it('退出全屏 → action=exit', () => {
        start_fullscreen_capture(sender, 'cap1', Date.now(), 1);
        Object.defineProperty(document, 'fullscreenElement', { value: null, configurable: true });
        document.dispatchEvent(new Event('fullscreenchange'));
        expect(sender).toHaveBeenCalledTimes(1);
        expect(sender.mock.calls[0][1].action).toBe('exit');
    });

    it('stop 后不发送', () => {
        start_fullscreen_capture(sender, 'cap1', Date.now(), 1);
        stop_fullscreen_capture();
        document.dispatchEvent(new Event('fullscreenchange'));
        expect(sender).not.toHaveBeenCalled();
    });
});
