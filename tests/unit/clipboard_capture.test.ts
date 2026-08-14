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

import { start_clipboard_capture, stop_clipboard_capture } from '../../src/extension/content/clipboard_capture';

function emit_doc(event_name: string, clipboard_text?: string) {
    const ev = new Event(event_name);
    if (clipboard_text !== undefined) {
        Object.defineProperty(ev, 'clipboardData', { value: { getData: () => clipboard_text } });
    }
    (doc_listeners[event_name] || []).forEach(fn => fn(ev));
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

    // B3-L7 + t195 AC-002: 同一操作（copy 事件 + writeText，内容一致）窗口期去重不双报
    it('copy 事件后紧接同内容 writeText 不双报（B3-L7 去重）', async () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        emit_doc('copy', 'hello');
        await navigator.clipboard.writeText('hello');
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(data.method).toBe('execCommand');
        expect(evt.type).toBe('clipboard_write');
    });

    // t195 AC-002: 窗口内不同内容的两次独立 writeText 均产生事件（原纯时间窗丢第二条，p043）
    it('窗口内不同内容两次 writeText 均上报（p043）', async () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        await navigator.clipboard.writeText('first');
        await navigator.clipboard.writeText('second');
        expect(sender).toHaveBeenCalledTimes(2);
    });

    // t195 AC-002: 窗口内同内容重复 writeText 仍去重
    it('窗口内同内容重复 writeText 去重', async () => {
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        await navigator.clipboard.writeText('same');
        await navigator.clipboard.writeText('same');
        expect(sender).toHaveBeenCalledTimes(1);
    });

    // t195 AC-002（f003）: read 路径内容去重——paste 事件同内容 + readText 不双报
    it('read 路径：paste 事件同内容 + readText 不双报（内容去重）', async () => {
        mock_navigator.clipboard.readText.mockImplementation(async () => 'pasted');
        start_clipboard_capture(sender, 'cap1', Date.now(), 1);
        emit_doc('paste', 'pasted');
        await navigator.clipboard.readText();
        expect(sender).toHaveBeenCalledTimes(1);
        const [evt, data] = sender.mock.calls[0];
        expect(data.method).toBe('execCommand');
        expect(evt.type).toBe('clipboard_read');
    });
});
