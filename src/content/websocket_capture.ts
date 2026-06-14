// content/websocket_capture.ts
import type { CaptureEvent, WsMessageData } from '../shared/types';
import { create_base_event, get_relative_time } from '../shared/event_utils';

let is_capturing = false;
let capture_id = '';
let capture_start_epoch_ms = 0;
let send_event: (event: CaptureEvent) => void;
let message_listener: ((e: MessageEvent) => void) | null = null;

const SIGNAL = '__capture_all_ws__';

const PAGE_SCRIPT = `(function() {
    if (window.__capture_all_ws_installed__) return;
    window.__capture_all_ws_installed__ = true;
    var SIGNAL = '${SIGNAL}';

    function post(ws_url, direction, data) {
        try {
            var data_status, data_preview, data_bytes;
            if (typeof data === 'string') {
                data_bytes = data.length;
                if (data_bytes > 200) {
                    data_status = 'too_large';
                    data_preview = null;
                } else {
                    data_status = 'captured';
                    data_preview = data;
                }
            } else if (data instanceof ArrayBuffer || data instanceof Blob || ArrayBuffer.isView(data)) {
                data_bytes = data instanceof Blob ? data.size : data.byteLength;
                data_status = 'binary';
                data_preview = null;
            } else if (data === undefined || data === null) {
                data_bytes = 0;
                data_status = 'captured';
                data_preview = null;
            } else {
                var s = String(data);
                data_bytes = s.length;
                if (data_bytes > 200) {
                    data_status = 'too_large';
                    data_preview = null;
                } else {
                    data_status = 'captured';
                    data_preview = s;
                }
            }
            window.postMessage({
                source: SIGNAL,
                ws_url: ws_url,
                direction: direction,
                data_preview: data_preview,
                data_bytes: data_bytes,
                data_status: data_status
            }, '*');
        } catch (e) {}
    }

    var OrigWS = window.WebSocket;
    function PatchedWS() {
        var ws;
        if (arguments.length > 1) {
            ws = new OrigWS(arguments[0], arguments[1]);
        } else {
            ws = new OrigWS(arguments[0]);
        }
        var url = arguments[0];

        var orig_send = ws.send.bind(ws);
        ws.send = function(data) {
            try { post(url, 'sent', data); } catch (e) {}
            return orig_send(data);
        };

        var _onmessage = null;
        Object.defineProperty(ws, 'onmessage', {
            get: function() { return _onmessage; },
            set: function(handler) {
                _onmessage = handler;
                if (handler) {
                    orig_handler = function(ev) {
                        try { post(url, 'received', ev.data); } catch (e) {}
                        handler.call(ws, ev);
                    };
                    orig_addEventListener.call(ws, 'message', orig_handler);
                }
            }
        });

        var orig_addEventListener = ws.addEventListener.bind(ws);
        var message_wrappers = [];
        ws.addEventListener = function(type, listener, options) {
            if (type === 'message') {
                var wrapper = function(ev) {
                    try { post(url, 'received', ev.data); } catch (e) {}
                    if (listener && listener.handleEvent) {
                        listener.handleEvent.call(listener, ev);
                    } else if (listener) {
                        listener.call(ws, ev);
                    }
                };
                message_wrappers.push({ original: listener, wrapper: wrapper });
                return orig_addEventListener(type, wrapper, options);
            }
            return orig_addEventListener(type, listener, options);
        };

        return ws;
    }
    PatchedWS.prototype = OrigWS.prototype;
    PatchedWS.CONNECTING = OrigWS.CONNECTING;
    PatchedWS.OPEN = OrigWS.OPEN;
    PatchedWS.CLOSING = OrigWS.CLOSING;
    PatchedWS.CLOSED = OrigWS.CLOSED;
    window.WebSocket = PatchedWS;
})();`;

function inject_page_script(): void {
    try {
        const s = document.createElement('script');
        s.textContent = PAGE_SCRIPT;
        (document.documentElement || document.head || document.body).appendChild(s);
        s.remove();
    } catch {
        // ignore
    }
}

export function start_websocket_capture(
    sender: (event: CaptureEvent) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
): void {
    if (is_capturing) return;
    send_event = sender;
    capture_id = new_capture_id;
    capture_start_epoch_ms = new_capture_start_epoch_ms;
    is_capturing = true;

    inject_page_script();

    message_listener = (e: MessageEvent) => {
        if (!is_capturing) return;
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.source !== SIGNAL) return;

        const data: WsMessageData = {
            ws_url: d.ws_url ?? '',
            direction: d.direction === 'sent' ? 'sent' : 'received',
            data_preview: d.data_preview ?? null,
            data_bytes: typeof d.data_bytes === 'number' ? d.data_bytes : 0,
            data_status: d.data_status ?? 'captured',
        };

        const base = create_base_event({
            capture_id,
            category: 'network',
            type: 'ws_message',
            relative_time_ms: get_relative_time(capture_start_epoch_ms),
            tab_id: 0,
            source: 'content_script',
        });

        send_event({ ...base, ...data } as CaptureEvent & WsMessageData);
    };
    window.addEventListener('message', message_listener, true);
}

export function stop_websocket_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    if (message_listener) {
        window.removeEventListener('message', message_listener, true);
        message_listener = null;
    }
}
