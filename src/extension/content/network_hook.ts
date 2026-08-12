// content/network_hook.ts
// Fallback response body capture via fetch/XHR hooks.
// Activated when extension CDP and external bridge are both unavailable.
//
// Phase 2: unified network_request type with NetworkRequestData

import { MAX_BODY_CAPTURE_BYTES } from '../../shared/constants';
import type { CaptureEvent, NetworkRequestData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';
import { generate_nonce } from './content_nonce';
import { generate_secret, verify_payload } from './content_hmac';
import { inject_script_element, page_script_reinstall_guard, page_script_preamble, page_script_restore, report_injection_failure } from './content_page_script';
import { build_network_data } from '../../shared/network_builder';
import { redact_url } from '../../shared/redaction';
import { Logger, MessageLogTransport } from '../../shared/logger';

const logger = new Logger('content/network_hook', new MessageLogTransport());

const state = create_capture_state<NetworkRequestData>();
const SIGNAL = '__capture_all_network_hook__';

// 注入脚本构造器（导出便于测试 eval 验证行为）
// secret 内联进注入脚本闭包（不写 window），页面脚本无法读取，构造不了合法签名。
export function build_page_script(capture_response_body: boolean, secret: string): string {
    return `(function() {
    // T121: 重注入先还原上次 hook 再重装（持最新 SECRET），stop→start 采集不断流；
    // 原 guard 语义从「阻止重注入」改为「还原后重装」，hook 链不叠加。
    ${page_script_reinstall_guard('network_hook', '            window.fetch = prev_hook.fetch;\n            XMLHttpRequest.prototype.open = prev_hook.open;\n            XMLHttpRequest.prototype.send = prev_hook.send;')}
    ${page_script_preamble('network_hook', secret)}
    var CAPTURE_BODY = ${capture_response_body};
    function post(data) {
        try {
            // T097: 每次发送从 window 动态读 nonce，content 每次 start 更新，解耦扩展重建/restart
            data.nonce = window.__capture_all_network_nonce__;
            // T121: per-message HMAC 签名（secret 仅注入脚本闭包持有）
            data.sig = sign_str(SECRET, data);
            window.postMessage(data, window.location.origin);
        } catch (e) {}
    }

    function capture_text(response_clone) {
        try {
            return response_clone.text();
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function process_response(response, method, url, start) {
        var duration = performance.now() - start;
        var status = response.status;
        var clone = null;

        try { clone = response.clone(); } catch (e) {}

        if (!clone) {
            post({
                source: SIGNAL,
                method: method,
                url: url,
                status: status,
                response_body: null,
                response_body_status: 'failed',
                duration_ms: duration,
                resource_type: 'xhr',
                request_body: null,
                request_body_status: 'not_enabled',
                timestamp: Date.now()
            });
            return;
        }

        try {
            var content_type = response.headers.get('content-type') || '';
            if (content_type.includes('application/octet-stream') ||
                content_type.includes('image/') ||
                content_type.includes('audio/') ||
                content_type.includes('video/') ||
                content_type.includes('font/')) {
                post({
                    source: SIGNAL,
                    method: method,
                    url: url,
                    status: status,
                    response_body: null,
                    response_body_status: 'unsupported',
                    duration_ms: duration,
                    resource_type: 'xhr',
                    request_body: null,
                    request_body_status: 'not_enabled',
                    timestamp: Date.now()
                });
                return;
            }

            if (!CAPTURE_BODY) {
                post({
                    source: SIGNAL,
                    method: method,
                    url: url,
                    status: status,
                    response_body: null,
                    response_body_status: 'not_enabled',
                    duration_ms: duration,
                    resource_type: 'xhr',
                    request_body: null,
                    request_body_status: 'not_enabled',
                    timestamp: Date.now()
                });
                return;
            }
            clone.text().then(function(text) {
                var bytes = new TextEncoder().encode(text);
                var truncated = text;
                var body_status = 'captured';
                if (bytes.length > ${MAX_BODY_CAPTURE_BYTES}) {
                    truncated = new TextDecoder().decode(bytes.slice(0, ${MAX_BODY_CAPTURE_BYTES})) + '...[TRUNCATED]';
                    body_status = 'too_large';
                }
                post({
                    source: SIGNAL,
                    method: method,
                    url: url,
                    status: status,
                    response_body: truncated,
                    response_body_status: body_status,
                    duration_ms: duration,
                    resource_type: 'xhr',
                    request_body: null,
                    request_body_status: 'not_enabled',
                    timestamp: Date.now()
                });
            }).catch(function() {
                post({
                    source: SIGNAL,
                    method: method,
                    url: url,
                    status: status,
                    response_body: null,
                    response_body_status: 'failed',
                    duration_ms: duration,
                    resource_type: 'xhr',
                    request_body: null,
                    request_body_status: 'not_enabled',
                    timestamp: Date.now()
                });
            });
        } catch (e) {
            post({
                source: SIGNAL,
                method: method,
                url: url,
                status: status,
                response_body: null,
                response_body_status: 'failed',
                duration_ms: duration,
                resource_type: 'xhr',
                request_body: null,
                request_body_status: 'not_enabled',
                timestamp: Date.now()
            });
        }
    }

    // --- fetch wrapper with body capture ---
    var orig_fetch = window.fetch;
    // T121: 保存还原点供下次 start 重注入时还原（防 hook 链叠加）
    window.__capture_all_network_hook_prev__ = {
        fetch: orig_fetch,
        open: XMLHttpRequest.prototype.open,
        send: XMLHttpRequest.prototype.send,
    };
    window.fetch = function(input, init) {
        var method = (init && init.method) || 'GET';
        var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
        var start = performance.now();

        try {
            return orig_fetch.apply(this, arguments).then(function(response) {
                try { process_response(response, method, url, start); } catch (e) {}
                return response;
            }).catch(function(err) {
                try {
                    post({
                        source: SIGNAL,
                        method: method,
                        url: url,
                        status: 0,
                        response_body: null,
                        response_body_status: 'failed',
                        duration_ms: performance.now() - start,
                        resource_type: 'xhr',
                        request_body: null,
                        request_body_status: 'not_enabled',
                        timestamp: Date.now()
                    });
                } catch (e) {}
                throw err;
            });
        } catch (e) {
            return orig_fetch.apply(this, arguments);
        }
    };

    // --- XMLHttpRequest wrapper with body capture ---
    var orig_open = XMLHttpRequest.prototype.open;
    var orig_send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__capture_all_hook = { method: method, url: url };

        return orig_open.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        var self = this;
        var meta = this.__capture_all_hook;
        if (!meta) return orig_send.apply(this, arguments);
        meta.start = performance.now();

        this.addEventListener('loadend', function() {
            try {
                var body = null;
                // T098: 默认 not_enabled，CAPTURE_BODY 采集路径内才标 captured/too_large/failed
                var body_status = CAPTURE_BODY ? 'captured' : 'not_enabled';
                if (CAPTURE_BODY) {
                try {
                    var text = self.responseText;
                    if (typeof text === 'string') {
                        var bytes = new TextEncoder().encode(text);
                        if (bytes.length > ${MAX_BODY_CAPTURE_BYTES}) {
                            body = new TextDecoder().decode(bytes.slice(0, ${MAX_BODY_CAPTURE_BYTES})) + '...[TRUNCATED]';
                            body_status = 'too_large';
                        } else {
                            body = text;
                        }
                    }
                } catch (e) {
                    body_status = 'failed';
                }
                }
                post({
                    source: SIGNAL,
                    method: meta.method,
                    url: meta.url,
                    status: self.status || 0,
                    response_body: body,
                    response_body_status: body_status,
                    duration_ms: performance.now() - meta.start,
                    resource_type: 'xhr',
                    request_body: null,
                    request_body_status: 'not_enabled',
                    timestamp: Date.now()
                });
            } catch (e) {}
        });

        try {
            return orig_send.apply(this, arguments);
        } catch (e) {
            post({
                source: SIGNAL,
                method: meta.method,
                url: meta.url,
                status: 0,
                response_body: null,
                response_body_status: 'failed',
                duration_ms: performance.now() - meta.start,
                resource_type: 'xhr',
                request_body: null,
                request_body_status: 'not_enabled',
                timestamp: Date.now()
            });
            throw e;
        }
    };
})();`;
}

let current_nonce = '';
let capture_response_body = true;
// H3: fallback 路径 URL 按配置脱敏（与 background CDP/web_request 路径一致）
let redact_data = false;
let redact_url_query = false;
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

function update_page_nonce(nonce: string): void {
    // 每次 start 注入无 guard 的小脚本，更新页面 MAIN world 的 nonce 变量供注入脚本 post() 读取。
    try {
        const s = document.createElement('script');
        s.textContent = `window.__capture_all_network_nonce__ = ${JSON.stringify(nonce)};`;
        (document.documentElement || document.head || document.body).appendChild(s);
        s.remove();
    } catch (err) {
        // t150-f003: nonce 更新失败静默降级（注入脚本用旧 nonce → 消息被拒），debug 级记录
        logger.debug('update_page_nonce injection failed', { error: String(err) });
    }
}

function inject_page_script(): void {
    // B3-M3: 注入失败（CSP 拦截 / DOM 异常）诊断——warn 日志 + capture_error 事件
    inject_script_element(build_page_script(capture_response_body, current_secret), (reason) => {
        logger.warn('Network hook page script injection failed', { reason });
        report_injection_failure('network_hook', reason, state, state.sender);
    });
}

// t142: stop 时还原 window API——注入脚本在 MAIN world，content script 无法直接改 window。
function restore_page_script(): void {
    try {
        const s = document.createElement('script');
        s.textContent = page_script_restore('network_hook',
            '            window.fetch = prev.fetch;\n            XMLHttpRequest.prototype.open = prev.open;\n            XMLHttpRequest.prototype.send = prev.send;');
        (document.documentElement || document.head || document.body).appendChild(s);
        s.remove();
    } catch {
        // ignore
    }
}

export function start_network_hook(
    sender: (event: CaptureEvent, data: NetworkRequestData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
    new_capture_response_body = true,
    cfg?: { redact_data: boolean; redact_url_query: boolean },
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
    capture_response_body = new_capture_response_body;
    // H3: 记录脱敏配置供接收侧处理
    redact_data = cfg?.redact_data ?? false;
    redact_url_query = cfg?.redact_url_query ?? false;
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

        // H3: fallback 路径 URL 按配置脱敏，url_status 反映结果（不再恒 captured）
        const redacted_url = redact_url(d.url || '', redact_data && redact_url_query);
        const data = build_network_data({
            request_id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            method: d.method || 'GET',
            url: redacted_url.url,
            url_status: redacted_url.url_status,
            status_code: typeof d.status === 'number' ? d.status : 0,
            resource_type: 'fetch',
            duration_ms: typeof d.duration_ms === 'number' ? Math.round(d.duration_ms * 100) / 100 : 0,
            request_headers: null,
            response_headers: null,
            headers_status: 'captured',
            request_body: d.request_body ?? null,
            request_body_status: d.request_body_status || 'not_enabled',
            response_body: d.response_body ?? null,
            response_preview: typeof d.response_body === 'string' ? d.response_body.slice(0, 200) : null,
            response_body_status: d.response_body_status || 'failed',
            capture_method: 'fallback_hook',
            body_capture_mode: 'fallback_hook',
            derive_body: false,
            // t144: fallback 路径 data 带相对时间，供 dashboard timeline 定位
            relative_time: get_relative_time(state.capture_start_epoch_ms),
        });

        state.sender?.(
            create_content_event({
                capture_id: state.capture_id,
                category: 'network',
                type: 'network_request',
                relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
                tab_id: state.tab_id,
                url: location.href,
                source: 'content_script',
            }),
            data,
        );
    };
    window.addEventListener('message', message_listener, true);
}

export function stop_network_hook(): void {
    // t142: 无条件还原页面 hook（state.end 可能在扩展刷新/状态丢失时返回 false，但 MAIN world hook 仍残留）
    restore_page_script();
    if (!state.end()) return;
    if (message_listener) {
        window.removeEventListener('message', message_listener, true);
        message_listener = null;
    }
}
