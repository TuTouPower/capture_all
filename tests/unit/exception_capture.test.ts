// tests/exception_capture.test.ts — 子目标 Runtime.enable（对齐 console BUG-003）
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

(globalThis as any).chrome = {
    ...(globalThis as any).chrome || {},
    dbg: mock_chrome_debugger,
    debugger: mock_chrome_debugger,
    storage: {
        local: {
            get: vi.fn().mockResolvedValue({}),
            set: vi.fn().mockResolvedValue(undefined),
        },
    },
    runtime: {
        getManifest: vi.fn().mockReturnValue({ version: '1.0.0' }),
        onInstalled: { addListener: vi.fn() },
        onMessage: { addListener: vi.fn() },
    },
};

import {
    start_exception_capture,
    stop_exception_capture,
    is_exception_active,
} from '../../src/extension/background/exception_capture';

const TAB_ID = 42;
const START_TIME = 1700000000000;

describe('exception capture — sub-target Runtime.enable', () => {
    beforeEach(async () => {
        try { await stop_exception_capture(); } catch { /* */ }
        mock_chrome_debugger.reset();
    });

    it('starts and enables Runtime on main target', async () => {
        const sender = vi.fn();
        const result = await start_exception_capture('cap_ex', START_TIME, TAB_ID, sender, false);
        expect(result.success).toBe(true);
        expect(is_exception_active()).toBe(true);
        const main_enable = mock_chrome_debugger.send_command_calls.filter(
            (c) => c.command === 'Runtime.enable' && !c.sessionId
        );
        expect(main_enable.length).toBeGreaterThanOrEqual(1);
        await stop_exception_capture();
    });

    it('enables Runtime on auto-attached sub-target (worker/iframe)', async () => {
        const sender = vi.fn();
        await start_exception_capture('cap_sub', START_TIME, TAB_ID, sender, false);

        const child_session_id = 'ex-child-1';
        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID },
            'Target.attachedToTarget',
            { sessionId: child_session_id, targetInfo: { type: 'worker' } }
        );

        const sub_enable = mock_chrome_debugger.send_command_calls.filter(
            (c) => c.command === 'Runtime.enable' && c.sessionId === child_session_id
        );
        expect(sub_enable.length).toBeGreaterThanOrEqual(1);
        await stop_exception_capture();
    });

    it('forwards Runtime.exceptionThrown from main target', async () => {
        const sender = vi.fn();
        await start_exception_capture('cap_throw', START_TIME, TAB_ID, sender, false);

        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID },
            'Runtime.exceptionThrown',
            {
                exceptionDetails: {
                    text: 'Uncaught',
                    exception: { description: 'TypeError: x is not a function', className: 'TypeError' },
                    url: 'https://example.com/app.js',
                    lineNumber: 10,
                    columnNumber: 2,
                },
            }
        );

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.type).toBe('runtime_exception');
        expect(event.category).toBe('error');
        expect(event.message).toContain('TypeError');
        await stop_exception_capture();
    });

    it('forwards Runtime.exceptionThrown from sub-target session', async () => {
        const sender = vi.fn();
        await start_exception_capture('cap_worker_ex', START_TIME, TAB_ID, sender, false);

        const child_session_id = 'worker-ex-1';
        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID, sessionId: child_session_id },
            'Target.attachedToTarget',
            { sessionId: child_session_id, targetInfo: { type: 'worker' } }
        );

        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID, sessionId: child_session_id },
            'Runtime.exceptionThrown',
            {
                exceptionDetails: {
                    exception: { description: 'Error: worker boom', className: 'Error' },
                    url: 'https://example.com/w.js',
                    lineNumber: 1,
                    columnNumber: 1,
                },
            }
        );

        expect(sender).toHaveBeenCalledTimes(1);
        expect(sender.mock.calls[0][0].message).toContain('worker boom');
        await stop_exception_capture();
    });

    it('过滤其他 tab 的 exception 事件', async () => {
        const sender = vi.fn();
        await start_exception_capture('cap_filter', START_TIME, TAB_ID, sender, false);

        mock_chrome_debugger.emit_event(
            { tabId: 9999 },
            'Runtime.exceptionThrown',
            { exceptionDetails: { text: 'x', exception: { description: 'a' } } }
        );

        expect(sender).not.toHaveBeenCalled();
        await stop_exception_capture();
    });

    it('过滤未登记 session 的 sub-target exception 事件', async () => {
        const sender = vi.fn();
        await start_exception_capture('cap_unreg', START_TIME, TAB_ID, sender, false);

        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID, sessionId: 'unknown-session' },
            'Runtime.exceptionThrown',
            { exceptionDetails: { text: 'x', exception: { description: 'a' } } }
        );

        expect(sender).not.toHaveBeenCalled();
        await stop_exception_capture();
    });

    it('Runtime.enable 失败且 attached_by_us 时 best-effort detach', async () => {
        const sender = vi.fn();
        const detach_spy = vi.spyOn(mock_chrome_debugger, 'detach');
        const original_send = mock_chrome_debugger.sendCommand.bind(mock_chrome_debugger);
        mock_chrome_debugger.sendCommand = vi.fn(async (target: any, command: string) => {
            if (command === 'Runtime.enable') {
                throw new Error('Runtime.enable failed');
            }
            return original_send(target, command);
        });

        const result = await start_exception_capture('cap_fail', START_TIME, TAB_ID, sender, false);

        expect(result.success).toBe(false);
        expect(detach_spy).toHaveBeenCalled();
        mock_chrome_debugger.sendCommand = original_send;
        detach_spy.mockRestore();
    });
});
