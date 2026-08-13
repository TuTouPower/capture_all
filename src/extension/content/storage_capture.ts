// content/storage_capture.ts
import type { CaptureEvent, StorageChangeData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';
import { generate_nonce } from './content_nonce';
import { generate_secret, verify_payload, SYNC_HMAC_JS } from './content_hmac';
import { inject_script_element, page_script_restore, report_injection_failure } from './content_page_script';
import { Logger, MessageLogTransport } from '../../shared/logger';

const logger = new Logger('content/storage', new MessageLogTransport());

const state = create_capture_state<StorageChangeData>();
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

// B3-L5: 敏感 key 名是隐私外延——token/secret/password 匹配的 key 名置 [REDACTED]。
const SENSITIVE_KEY_RE = /token|secret|password|passwd|credential|api[-_]?key|jwt/i;

function redact_storage_key(key: string | null): string | null {
    if (key === null) return null;
    return SENSITIVE_KEY_RE.test(key) ? '[REDACTED]' : key;
}

// secret 内联进注入脚本闭包（不写 window，普通页面无法读取构造签名）；t174：注入脚本文本可被观察注入过程的对抗页面读取（ADR-020 威胁模型排除，见 content_page_script.ts 注释）。
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
    } catch (err) {
        // t150-f003: nonce 更新失败静默降级（注入脚本用旧 nonce → 消息被拒），debug 级记录
        logger.debug('update_page_nonce injection failed', { error: String(err) });
    }
}

function inject_page_script(): void {
    // B3-M3: 注入失败（CSP 拦截 / DOM 异常）诊断——warn 日志 + capture_error 事件
    inject_script_element(build_page_script(current_secret), (reason) => {
        logger.warn('Storage page script injection failed', { reason });
        report_injection_failure('storage', reason, state, state.sender);
    });
}

// t142: stop 时还原 localStorage/sessionStorage hook——注入脚本在 MAIN world，content script 无法直接改。
function restore_page_script(): void {
    try {
        const s = document.createElement('script');
        s.textContent = page_script_restore('storage',
            '            if (prev.local_setItem) window.localStorage.setItem = prev.local_setItem;\n'
            + '            if (prev.local_removeItem) window.localStorage.removeItem = prev.local_removeItem;\n'
            + '            if (prev.local_clear) window.localStorage.clear = prev.local_clear;\n'
            + '            if (prev.session_setItem) window.sessionStorage.setItem = prev.session_setItem;\n'
            + '            if (prev.session_removeItem) window.sessionStorage.removeItem = prev.session_removeItem;\n'
            + '            if (prev.session_clear) window.sessionStorage.clear = prev.session_clear;');
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
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;
    // T097: nonce 每次 start 旋转并写 window 变量；注入脚本 post() 动态读取，
    // 解耦 stop→start 与扩展重建路径（guard 阻止二次注入后脚本仍发最新 nonce）。
    current_nonce = _nonce_override ?? generate_nonce();
    // T121: secret 每次 start 旋转（内联进注入脚本闭包，不写 window）。
    current_secret = _secret_override ?? generate_secret();
    update_page_nonce(current_nonce);
    inject_page_script();

    message_listener = (e: MessageEvent) => {
        if (!state.is_capturing) return;
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
            key: redact_storage_key(d.key ?? null),
            old_value_length: null,
            new_value_length: action === 'set' ? value_length : 0,
            value_status: 'not_captured',
            value_preview: null,
            origin: window.location.origin,
            source_stack: null,
        };

        const base = create_content_event({
            capture_id: state.capture_id,
            category: 'storage',
            type: 'storage_change',
            relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
            tab_id: state.tab_id,
            source: 'content_script',
        });

        // t152 AC-004: payload 放 event.data（与 mouse/keyboard 等模块一致，sender 第二参数合并进 data）
        state.sender?.(base, data);
    };
    window.addEventListener('message', message_listener, true);
}

export function stop_storage_capture(): void {
    // t142: 无条件还原页面 hook（state.end 可能在状态丢失时返回 false，但 MAIN world hook 仍残留）
    restore_page_script();
    if (!state.end()) return;
    if (message_listener) {
        window.removeEventListener('message', message_listener, true);
        message_listener = null;
    }
}
