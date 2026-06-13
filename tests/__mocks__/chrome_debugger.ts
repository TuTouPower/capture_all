// tests/__mocks__/chrome_debugger.ts
// Mock chrome.debugger API for unit testing CDP-based capture modules.
//
// Usage:
//   import { mock_chrome_debugger } from '../__mocks__/chrome_debugger';
//   beforeEach(() => mock_chrome_debugger.reset());
//
//   // Simulate attach failure:
//   mock_chrome_debugger.attach_should_fail = true;
//
//   // Simulate Network.getResponseBody response:
//   mock_chrome_debugger.set_command_response('Network.getResponseBody', { body: '{}', base64Encoded: false });
//
//   // Simulate CDP event:
//   mock_chrome_debugger.emit_event({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'req_1' });

export interface CdpCommandResult {
    [command: string]: any;
}

interface EventListener {
    (source: { tabId: number }, method: string, params: any): void;
}

class MockChromeDebugger {
    private listeners: EventListener[] = [];
    private command_responses: Map<string, any> = new Map();
    private command_errors: Map<string, Error> = new Map();
    private _attach_count = 0;
    private _detach_count = 0;
    private _send_command_calls: Array<{ tabId: number; command: string; params: any }> = [];
    private _last_attached_tab_id: number | null = null;
    private _last_detached_tab_id: number | null = null;

    // Config
    attach_should_fail = false;
    attach_error = new Error('Another debugger is already attached');

    // ─── public API (mirrors chrome.debugger) ───

    attach(target: { tabId: number }, _protocolVersion: string): Promise<void> {
        this._attach_count++;
        this._last_attached_tab_id = target.tabId;
        if (this.attach_should_fail) {
            return Promise.reject(this.attach_error);
        }
        return Promise.resolve();
    }

    detach(target: { tabId: number }): Promise<void> {
        this._detach_count++;
        this._last_detached_tab_id = target.tabId;
        return Promise.resolve();
    }

    sendCommand(target: { tabId: number; sessionId?: string }, command: string, params?: any): Promise<any> {
        this._send_command_calls.push({ tabId: target.tabId, command, params: params || {} });

        if (this.command_errors.has(command)) {
            return Promise.reject(this.command_errors.get(command)!);
        }

        if (this.command_responses.has(command)) {
            return Promise.resolve(this.command_responses.get(command));
        }

        // Default responses for common commands
        if (command === 'Network.enable' || command === 'Runtime.enable') {
            return Promise.resolve({});
        }

        return Promise.resolve(undefined);
    }

    get onEvent(): { addListener: (fn: EventListener) => void; removeListener: (fn: EventListener) => void } {
        return {
            addListener: (fn: EventListener) => {
                this.listeners.push(fn);
            },
            removeListener: (fn: EventListener) => {
                const idx = this.listeners.indexOf(fn);
                if (idx !== -1) this.listeners.splice(idx, 1);
            },
        };
    }

    // ─── test helpers ───

    emit_event(source: { tabId: number }, method: string, params: any): void {
        for (const fn of this.listeners) {
            fn(source, method, params);
        }
    }

    set_command_response(command: string, response: any): void {
        this.command_responses.set(command, response);
    }

    set_command_error(command: string, error: Error): void {
        this.command_errors.set(command, error);
    }

    reset(): void {
        this.listeners = [];
        this.command_responses.clear();
        this.command_errors.clear();
        this._attach_count = 0;
        this._detach_count = 0;
        this._send_command_calls = [];
        this._last_attached_tab_id = null;
        this._last_detached_tab_id = null;
        this.attach_should_fail = false;
    }

    // ─── inspection ───

    get attach_count(): number { return this._attach_count; }
    get detach_count(): number { return this._detach_count; }
    get send_command_calls(): Array<{ tabId: number; command: string; params: any }> { return [...this._send_command_calls]; }
    get last_attached_tab_id(): number | null { return this._last_attached_tab_id; }
    get last_detached_tab_id(): number | null { return this._last_detached_tab_id; }
    get listener_count(): number { return this.listeners.length; }
}

export const mock_chrome_debugger = new MockChromeDebugger();
