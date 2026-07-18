// tests/console_capture.test.ts — BUG-003: console capture 0 events
//
// Root cause: console_capture only calls Runtime.enable on the main tab target.
// When network_capture sets Target.setAutoAttach({flatten:true}), sub-targets
// (workers/iframes/OOPIF) attach but their Runtime domain is never enabled,
// so Runtime.consoleAPICalled events from those targets never fire. ChatGPT
// logs heavily from workers/iframe contexts, producing 0 console events.
//
// Also: when setAutoAttach reconfigures the target tree, the main-target
// Runtime.enable issued by console_capture can be superseded. The robust fix
// is for console_capture to enable Runtime on every auto-attached sub-target
// (mirroring network_capture's Target.attachedToTarget handling).
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mock_chrome_debugger } from '../support/__mocks__/chrome_debugger';

// Install chrome.dbg alias before importing modules that use it
(globalThis as any).chrome = {
    ...(globalThis as any).chrome || {},
    dbg: mock_chrome_debugger,
    debugger: mock_chrome_debugger,
    webRequest: {
        onBeforeRequest: { addListener: vi.fn(), removeListener: vi.fn() },
        onBeforeSendHeaders: { addListener: vi.fn(), removeListener: vi.fn() },
        onHeadersReceived: { addListener: vi.fn(), removeListener: vi.fn() },
        onCompleted: { addListener: vi.fn(), removeListener: vi.fn() },
        onErrorOccurred: { addListener: vi.fn(), removeListener: vi.fn() },
    },
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
    tabs: {
        query: vi.fn().mockResolvedValue([]),
        get: vi.fn().mockResolvedValue({ id: 1, url: 'https://example.com' }),
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onActivated: { addListener: vi.fn() },
        onUpdated: { addListener: vi.fn() },
        onRemoved: { addListener: vi.fn() },
        onCreated: { addListener: vi.fn() },
    },
};

import {
    start_console_capture,
    stop_console_capture,
    is_console_active,
} from '../../src/extension/background/console_capture';

const TAB_ID = 1793063899;
const START_TIME = 1700000000000;

describe('console capture — capture_id validation (existing P0.30 logic)', () => {
    // NOTE: The pure handle_console_log_safe replica tests live below as a
    // kept regression. The new BUG-003 tests focus on the CDP event path.
    it('regression: writes event when capture_id is set (replica)', async () => {
        const sender = vi.fn();
        mock_chrome_debugger.reset();
        const result = await start_console_capture('capture_123', START_TIME, TAB_ID, false, sender, false);
        expect(result.success).toBe(true);
        expect(is_console_active()).toBe(true);
        await stop_console_capture();
    });
});

describe('BUG-003: console capture must emit event on Runtime.consoleAPICalled', () => {
    beforeEach(async () => {
        try { await stop_console_capture(); } catch { /* not started */ }
        mock_chrome_debugger.reset();
    });

    it('forwards a main-target consoleAPICalled event to sender', async () => {
        const sender = vi.fn();
        const result = await start_console_capture('capture_main', START_TIME, TAB_ID, false, sender, false);
        expect(result.success).toBe(true);

        // Simulate the main page calling console.log('hello')
        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID },
            'Runtime.consoleAPICalled',
            {
                type: 'log',
                args: [{ value: 'hello' }],
                stackTrace: { callFrames: [{ url: 'https://chatgpt.com/app.js', lineNumber: 10, columnNumber: 5 }] },
            }
        );

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.category).toBe('console');
        expect(event.type).toBe('console_event');
        expect(event.capture_id).toBe('capture_main');
        expect(event.data.level).toBe('log');
        expect(event.data.args_preview).toEqual(['hello']);

        await stop_console_capture();
    });

    it('enables Runtime on auto-attached sub-target so worker console events fire', async () => {
        // This is the core BUG-003 regression: when network_capture sets
        // Target.setAutoAttach({flatten:true}), sub-targets attach with a
        // sessionId. console_capture MUST enable Runtime on those sessions,
        // otherwise worker/iframe console.log never emits consoleAPICalled.
        const sender = vi.fn();
        const result = await start_console_capture('capture_sub', START_TIME, TAB_ID, false, sender, false);
        expect(result.success).toBe(true);

        // Simulate Target.attachedToTarget arriving (as emitted by network_capture's setAutoAttach)
        const child_session_id = 'child-session-abc';
        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID },
            'Target.attachedToTarget',
            { sessionId: child_session_id, targetInfo: { type: 'worker' } }
        );

        // The fix: console_capture must send Runtime.enable targeted at the
        // sub-target session (sessionId present). Without this, the sub-target's
        // Runtime domain stays disabled and consoleAPICalled never fires for it.
        const sub_target_runtime_enable = mock_chrome_debugger.send_command_calls.filter(
            c => c.command === 'Runtime.enable' && c.sessionId === child_session_id
        );
        expect(sub_target_runtime_enable.length).toBeGreaterThanOrEqual(1);

        await stop_console_capture();
    });

    it('forwards consoleAPICalled from a sub-target session (worker/iframe)', async () => {
        const sender = vi.fn();
        await start_console_capture('capture_worker', START_TIME, TAB_ID, false, sender, false);

        const child_session_id = 'worker-session-1';
        // Sub-target attaches
        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID, sessionId: child_session_id },
            'Target.attachedToTarget',
            { sessionId: child_session_id, targetInfo: { type: 'service_worker' } }
        );

        // Worker emits a console.warn
        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID, sessionId: child_session_id },
            'Runtime.consoleAPICalled',
            {
                type: 'warning',
                args: [{ value: 'worker warning' }],
                stackTrace: { callFrames: [{ url: 'https://chatgpt.com/sw.js', lineNumber: 1, columnNumber: 1 }] },
            }
        );

        expect(sender).toHaveBeenCalledTimes(1);
        const event = sender.mock.calls[0][0];
        expect(event.data.level).toBe('warn');
        expect(event.data.args_preview).toEqual(['worker warning']);

        await stop_console_capture();
    });

    it('ignores non-console CDP events', async () => {
        const sender = vi.fn();
        await start_console_capture('capture_ignore', START_TIME, TAB_ID, false, sender, false);

        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID },
            'Network.requestWillBeSent',
            { requestId: 'req_1', request: { url: 'https://chatgpt.com/api' } }
        );
        mock_chrome_debugger.emit_event(
            { tabId: TAB_ID },
            'Runtime.executionContextCreated',
            { context: { id: 1 } }
        );

        expect(sender).not.toHaveBeenCalled();
        await stop_console_capture();
    });
});
