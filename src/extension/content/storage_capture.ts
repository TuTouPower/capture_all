// content/storage_capture.ts
import type { CaptureEvent, StorageChangeData } from '../../shared/types';
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

const SIGNAL = '__capture_all_storage__';

// secret 内联进注入脚本闭包（不写 window），页面脚本无法读取，构造不了合法签名。
// 导出便于测试 eval 验证注入脚本级重注入（与 websocket_capture 一致）。
export function build_page_script(secret: string): string {
    return `(function() {
    // T121: 重注入时先还原上次 hook 再重装（持最新 SECRET），stop→start 采集不断流。
    if (window.__capture_all_storage_installed__) {
        var prev_hook = window.__capture_all_storage_prev__;
        if (prev_hook) {
            window.localStorage.setItem = prev_hook.local_setItem;
            window.localStorage.removeItem = prev_hook.local_removeItem;
            window.localStorage.clear = prev_hook.local_clear;
            window.sessionStorage.setItem = prev_hook.session_setItem;
            window.sessionStorage.removeItem = prev_hook.session_removeItem;
            window.sessionStorage.clear = prev_hook.session_clear;
        }
    }
    window.__capture_all_storage_installed__ = true;
    var SIGNAL = '${SIGNAL}';
    var SECRET = '${secret}';
${SYNC_HMAC_JS}
    function post(storage_type, action, key, value_length) {
        try {
            var payload = {
                source: SIGNAL,
                nonce: window.__capture_all_storage_nonce__,
                storage_type: storage_type,
                action: action,
                key: key,
                value_length: value_length
            };
            // T121: per-message HMAC 签名（secret 仅注入脚本闭包持有）
            payload.sig = sign_str(SECRET, payload);
            window.postMessage(payload, window.location.origin);
        } catch (e) {}
    }

    function wrap(storage, storage_type) {
        var orig_set = storage.setItem.bind(storage);
        var orig_remove = storage.removeItem.bind(storage);
        var orig_clear = storage.clear.bind(storage);
        // T121: 保存还原点供下次 start 重注入时还原
        if (storage_type === 'local') {
            window.__capture_all_storage_prev__ = window.__capture_all_storage_prev__ || {};
            window.__capture_all_storage_prev__.local_setItem = storage.setItem;
            window.__capture_all_storage_prev__.local_removeItem = storage.removeItem;
            window.__capture_all_storage_prev__.local_clear = storage.clear;
        } else {
            window.__capture_all_storage_prev__ = window.__capture_all_storage_prev__ || {};
            window.__capture_all_storage_prev__.session_setItem = storage.setItem;
            window.__capture_all_storage_prev__.session_removeItem = storage.removeItem;
            window.__capture_all_storage_prev__.session_clear = storage.clear;
        }

        storage.setItem = function(key, value) {
            try { post(storage_type, 'set', String(key), String(value == null ? '' : value).length); } catch (e) {}
            return orig_set(key, value);
        };
        storage.removeItem = function(key) {
            try { post(storage_type, 'remove', String(key), 0); } catch (e) {}
            return orig_remove(key);
        };
        storage.clear = function() {
            try { post(storage_type, 'clear', null, 0); } catch (e) {}
            return orig_clear();
        };
    }

    try { wrap(window.localStorage, 'local'); } catch (e) {}
    try { wrap(window.sessionStorage, 'session'); } catch (e) {}
})();`;
}

function update_page_nonce(nonce: string): void {
    // 每次 start 注入无 guard 的小脚本，更新页面 MAIN world 的 nonce 变量供注入脚本 post() 读取。
    try {
        const s = document.createElement('script');
        s.textContent = `window.__capture_all_storage_nonce__ = ${JSON.stringify(nonce)};`;
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

export function start_storage_capture(
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

        const value_length = typeof d.value_length === 'number' ? d.value_length : 0;
        const action: StorageChangeData['action'] = d.action;

        const data: StorageChangeData = {
            storage_type: d.storage_type,
            action,
            key: d.key ?? null,
            old_value_length: null,
            new_value_length: action === 'set' ? value_length : 0,
            value_status: 'not_captured',
            value_preview: null,
            origin: window.location.origin,
            source_stack: null,
        };

        const base = create_content_event({
            capture_id,
            category: 'storage',
            type: 'storage_change',
            relative_time_ms: get_relative_time(capture_start_epoch_ms),
            tab_id,
            source: 'content_script',
        });

        send_event({ ...base, ...data } as CaptureEvent & StorageChangeData);
    };
    window.addEventListener('message', message_listener, true);
}

export function stop_storage_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    if (message_listener) {
        window.removeEventListener('message', message_listener, true);
        message_listener = null;
    }
}
