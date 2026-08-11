// content/websocket_capture.ts
import type { CaptureEvent, WsMessageData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';
import { generate_nonce } from './content_nonce';
import { generate_secret, verify_payload, SYNC_HMAC_JS } from './content_hmac';

let is_capturing = false;
let capture_id = '';
let capture_start_epoch_ms = 0;
let tab_id = 0;
let send_event: (event: CaptureEvent) => void;
let current_nonce = '';
// T097 测试钩子：jsdom 下全局 crypto.randomUUID 被 DOM 内部调用污染，测试用显式 nonce 覆盖。
let _nonce_override: string | null = null;
export function _set_nonce_for_test(nonce: string | null): void {
    _nonce_override = nonce;
}
// T121: per-start secret（每次 start 旋转）；测试钩子显式注入确定性 secret。
let current_secret = '';
let _secret_override: string | null = null;
export function _set_secret_for_test(secret: string | null): void {
    _secret_override = secret;
}

let message_listener: ((e: MessageEvent) => void) | null = null;

const SIGNAL = '__capture_all_ws__';

// 注入页面脚本字符串（导出便于测试 eval 验证行为）
// secret 内联进注入脚本闭包（不写 window），页面脚本无法读取，构造不了合法签名。
export function build_page_script(secret: string): string {
    return `(function() {
    // T121: 重注入时先还原上次 hook 再重装（持最新 SECRET），stop→start 采集不断流。
    if (window.__capture_all_ws_installed__) {
        var prev_hook = window.__capture_all_ws_prev__;
        if (prev_hook) window.WebSocket = prev_hook;
    }
    window.__capture_all_ws_installed__ = true;
    var SIGNAL = '${SIGNAL}';
    var SECRET = '${secret}';
${SYNC_HMAC_JS}

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
            var payload = {
                source: SIGNAL,
                nonce: window.__capture_all_ws_nonce__,
                ws_url: ws_url,
                direction: direction,
                data_preview: data_preview,
                data_bytes: data_bytes,
                data_status: data_status
            };
            // T121: per-message HMAC 签名（secret 仅注入脚本闭包持有）
            payload.sig = sign_str(SECRET, payload);
            window.postMessage(payload, window.location.origin);
        } catch (e) {}
    }

    var OrigWP = window.WebSocket;
    // T121: 保存还原点供下次 start 重注入时还原
    window.__capture_all_ws_prev__ = OrigWP;
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
}

function update_page_nonce(nonce: string): void {
    // 每次 start 注入无 guard 的小脚本，更新页面 MAIN world 的 nonce 变量供注入脚本 post() 读取。
    try {
        const s = document.createElement('script');
        s.textContent = `window.__capture_all_ws_nonce__ = ${JSON.stringify(nonce)};`;
        (document.documentElement || document.head || document.body).appendChild(s);
        s.remove();
    } catch {
        // ignore
    }
}

function inject_page_script(): void {
    try {
        const s = document.createElement('script');
        s.textContent = build_page_script(current_secret);
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
    // T097: nonce 每次 start 旋转并写 window 变量；注入脚本 post() 动态读取，
    // 解耦 stop→start 与扩展重建路径（guard 阻止二次注入后脚本仍发最新 nonce）。
    current_nonce = _nonce_override ?? generate_nonce();
    // T121: secret 每次 start 旋转（内联进注入脚本闭包，不写 window）。
    current_secret = _secret_override ?? generate_secret();
    update_page_nonce(current_nonce);
    inject_page_script();

    message_listener = (e: MessageEvent) => {
        if (!is_capturing) return;
        if (e.origin !== window.location.origin) return;
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.source !== SIGNAL) return;
        if (d.nonce !== current_nonce) return;
        // T121: per-message HMAC 校验；签名缺失或不匹配的消息被拒收。
        if (!verify_payload(current_secret, d)) return;

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
