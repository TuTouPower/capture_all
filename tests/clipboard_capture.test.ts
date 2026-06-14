// tests/clipboard_capture.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock document + navigator BEFORE importing module
const doc_listeners: Record<string, EventListener[]> = {};
const mock_document = {
    addEventListener: vi.fn((event: string, handler: EventListener) => {
        if (!doc_listeners[event]) doc_listeners[event] = [];
        doc_listeners[event].push(handler);
    }),
    removeEventListener: vi.fn((event: string, handler: EventListener) => {
        if (doc_listeners[event]) doc_listeners[event] = doc_listeners[event].filter(h => h !== handler);
    }),
};
const orig_write = vi.fn().mockResolvedValue(undefined);
const orig_read = vi.fn().mockResolvedValue('pasted text');
const mock_navigator = {
    clipboard: { writeText: orig_write, readText: orig_read },
};

vi.stubGlobal('document', mock_document);
vi.stubGlobal('navigator', mock_navigator);
vi.stubGlobal('window', { location: { href: 'https://example.com' } });

import { start_clipboard_capture, stop_clipboard_capture } from '../src/content/clipboard_capture';

function emit_doc(event_name: string) {
    (doc_listeners[event_name] || []).forEach(fn => fn(new Event(event_name)));
}

describe('clipboard_capture', () => {
    let sender: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sender = vi.fn();
        stop_clipboard_capture();
        vi.clearAllMocks();
        for (const k of Object.keys(doc_listeners)) delete doc_listeners[k];
        // restore after clearAllMocks
        mock_navigator.clipboard.writeText = orig_write;
        mock_navigator.clipboard.readText = orig_read;
    });

    afterEach(() => stop_clipboard_capture());

    it('copy 事件 → clipboard_write', () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        emit_doc('copy');
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('clipboard_write');
        expect(evt.category).toBe('user_action');
        expect(data.method).toBe('execCommand');
        expect(data.action).toBe('write');
    });

    it('paste 事件 → clipboard_read', () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        emit_doc('paste');
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('clipboard_read');
        expect(data.method).toBe('execCommand');
        expect(data.action).toBe('read');
    });

    it('stop 后不发送', () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        stop_clipboard_capture();
        emit_doc('copy');
        expect(sender).not.toHaveBeenCalled();
    });

    it('navigator.clipboard.writeText 被拦截', async () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        await navigator.clipboard.writeText('hello');
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('clipboard_write');
        expect(data.method).toBe('navigator.clipboard');
        expect(orig_write).toHaveBeenCalledWith('hello');
    });

    it('navigator.clipboard.readText 被拦截', async () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        const result = await navigator.clipboard.readText();
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(evt.type).toBe('clipboard_read');
        expect(data.method).toBe('navigator.clipboard');
        expect(result).toBe('pasted text');
    });

    it('stop 后 clipboard 恢复原方法', async () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        stop_clipboard_capture();
        await navigator.clipboard.writeText('test');
        expect(sender).not.toHaveBeenCalled();
    });

    it('重复 start 不重复注册', () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        const copy_calls = mock_document.addEventListener.mock.calls.filter(c => c[0] === 'copy');
        expect(copy_calls).toHaveLength(1);
    });
});
