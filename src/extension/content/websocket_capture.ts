// content/websocket_capture.ts
import type { CaptureEvent, WsMessageData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

let is_capturing = false;
let capture_id = '';
let capture_start_epoch_ms = 0;
let tab_id = 0;
let send_event: (event: CaptureEvent) => void;
let message_listener: ((e: MessageEvent) => void) | null = null;

const SIGNAL = '__capture_all_ws__';

// 注入页面脚本字符串（导出便于测试 eval 验证行为）
export const PAGE_SCRIPT = `(function() {
    if (window.__capture_all_ws_installed__) return;
    window.__capture_all_ws_installed__ = true;
    var SIGNAL = '${SIGNAL}';

    // UTF-8 字节长度（兼容老浏览器，TextEncoder 不存在时用近似）
    function utf8_byte_len(s) {
        if (typeof TextEncoder !== 'undefined') {
            return new TextEncoder().encode(s).length;
        }
        var n = 0;
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x80) n += 1;
            else if (c < 0x800) n += 2;
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
                n += 4; i++;
            } else n += 3;
        }
        return n;
    }

    function post(ws_url, direction, data) {
        try {
            var data_status, data_preview, data_bytes;
            if (typeof data === 'string') {
                data_bytes = utf8_byte_len(data);
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
                data_bytes = utf8_byte_len(s);
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
            }, window.location.origin);
        } catch (e) {}
    }

    var OrigWP = window.WebSocket;
    function PatchedWP() {
        var ws;
        if (arguments.length > 1) {
            ws = new OrigWP(arguments[0], arguments[1]);
        } else {
            ws = new OrigWP(arguments[0]);
        }
        var url = arguments[0];

        // 仅在 ws.send 时 post 一次 'sent'
        var orig_send = ws.send.bind(ws);
        ws.send = function(data) {
            try { post(url, 'sent', data); } catch (e) {}
            return orig_send(data);
        };

        // 单一内部 listener 负责 'received' 采集；页面 onmessage/addEventListener/
        // removeEventListener 保持原生语义，不重写、不包装、不重复 post。
        ws.addEventListener('message', function(ev) {
            try { post(url, 'received', ev.data); } catch (e) {}
        });

        return ws;
    }
    PatchedWP.prototype = OrigWP.prototype;
    PatchedWP.CONNECTING = OrigWP.CONNECTING;
    PatchedWP.OPEN = OrigWP.OPEN;
    PatchedWP.CLOSING = OrigWP.CLOSING;
    PatchedWP.CLOSED = OrigWP.CLOSED;
    window.WebSocket = PatchedWP;
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
    new_tab_id: number,
): void {
    if (is_capturing) return;
    send_event = sender;
    capture_id = new_capture_id;
    capture_start_epoch_ms = new_capture_start_epoch_ms;
    tab_id = new_tab_id;
    is_capturing = true;

    inject_page_script();

    message_listener = (e: MessageEvent) => {
        if (!is_capturing) return;
        if (e.origin !== window.location.origin) return;
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

        const base = create_content_event({
            capture_id,
            category: 'network',
            type: 'ws_message',
            relative_time_ms: get_relative_time(capture_start_epoch_ms),
            tab_id,
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
