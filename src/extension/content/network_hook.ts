// content/network_hook.ts
// Fallback response body capture via fetch/XHR hooks.
// Activated when extension CDP and external bridge are both unavailable.
//
// Phase 2: unified network_request type with NetworkRequestData

import { MAX_BODY_CAPTURE_BYTES } from '../../shared/constants';
import type { CaptureEvent, NetworkRequestData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';
import { generate_nonce } from './content_nonce';
import { generate_secret, verify_payload, SYNC_HMAC_JS } from './content_hmac';

const SIGNAL = '__capture_all_network_hook__';

// 注入脚本构造器（导出便于测试 eval 验证行为）
// secret 内联进注入脚本闭包（不写 window），页面脚本无法读取，构造不了合法签名。
export function build_page_script(capture_response_body: boolean, secret: string): string {
    return `(function() {
    // T121: 重注入时先还原上次 hook 再重装（持最新 SECRET），stop→start 采集不断流；
    // 原 guard 语义从「阻止重注入」改为「还原后重装」，hook 链不叠加。
    if (window.__capture_all_network_hook_installed__) {
        var prev_hook = window.__capture_all_network_hook_prev__;
        if (prev_hook) {
            window.fetch = prev_hook.fetch;
            XMLHttpRequest.prototype.open = prev_hook.open;
            XMLHttpRequest.prototype.send = prev_hook.send;
        }
    }
    window.__capture_all_network_hook_installed__ = true;
    var SIGNAL = '${SIGNAL}';
    var CAPTURE_BODY = ${capture_response_body};
    var SECRET = '${secret}';
${SYNC_HMAC_JS}
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

let is_capturing = false;
let capture_id = '';
let capture_start_epoch_ms = 0;
let tab_id = 0;
let current_nonce = '';
let capture_response_body = true;
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

let send_event: (event: CaptureEvent, data: NetworkRequestData) => void;
let message_listener: ((e: MessageEvent) => void) | null = null;

function update_page_nonce(nonce: string): void {
    // 每次 start 注入无 guard 的小脚本，更新页面 MAIN world 的 nonce 变量供注入脚本 post() 读取。
    try {
        const s = document.createElement('script');
        s.textContent = `window.__capture_all_network_nonce__ = ${JSON.stringify(nonce)};`;
        (document.documentElement || document.head || document.body).appendChild(s);
        s.remove();
    } catch {
        // ignore
    }
}

function inject_page_script(): void {
    try {
        const s = document.createElement('script');
        s.textContent = build_page_script(capture_response_body, current_secret);
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
    capture_response_body = new_capture_response_body;
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

        const data: NetworkRequestData = {
            request_id: `hook_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            method: d.method || 'GET',
            url: d.url || '',
            url_status: 'captured',
            status_code: typeof d.status === 'number' ? d.status : 0,
            status_text: null,
            protocol: null,
            resource_type: 'fetch',
            initiator: null,
            duration_ms: typeof d.duration_ms === 'number' ? Math.round(d.duration_ms * 100) / 100 : 0,
            start_time_ms: null,
            end_time_ms: null,
            request_headers: null,
            response_headers: null,
            headers_status: 'captured',
            request_body: d.request_body ?? null,
            request_body_status: d.request_body_status || 'not_enabled',
            request_body_encoding: null,
            request_body_bytes: null,
            request_body_mime: null,
            response_body: d.response_body ?? null,
            response_preview: typeof d.response_body === 'string' ? d.response_body.slice(0, 200) : null,
            response_body_status: d.response_body_status || 'failed',
            response_body_encoding: null,
            response_body_bytes: null,
            mime_type: null,
            request_size_bytes: null,
            response_size_bytes: null,
            transfer_size_bytes: null,
            from_cache: null,
            cache_status: null,
            error_text: null,
            capture_method: 'fallback_hook',
            body_capture_mode: 'fallback_hook',
        };

        send_event(
            create_content_event({
                capture_id,
                category: 'network',
                type: 'network_request',
                relative_time_ms: get_relative_time(capture_start_epoch_ms),
                tab_id,
                url: location.href,
                source: 'content_script',
            }),
            data,
        );
    };
    window.addEventListener('message', message_listener, true);
}

export function stop_network_hook(): void {
    if (!is_capturing) return;
    is_capturing = false;
    if (message_listener) {
        window.removeEventListener('message', message_listener, true);
        message_listener = null;
    }
}

export function is_network_hook_active(): boolean {
    return is_capturing;
}
