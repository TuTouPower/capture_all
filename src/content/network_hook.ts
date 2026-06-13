// content/network_hook.ts
// Fallback response body capture via fetch/XHR hooks.
// Activated when extension CDP and external bridge are both unavailable.
//
// Phase 2: unified network_request type with NetworkRequestData

import { MAX_BODY_CAPTURE_BYTES } from '../shared/constants';

const SIGNAL = '__capture_all_network_hook__';

const PAGE_SCRIPT = `(function() {
    if (window.__capture_all_network_hook_installed__) return;
    window.__capture_all_network_hook_installed__ = true;
    var SIGNAL = '${SIGNAL}';

    function post(data) {
        try {
            window.postMessage(data, window.location.origin || '*');
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
                var body_status = 'captured';
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

let is_capturing = false;
let send_event: (type: string, data: any) => void;
let message_listener: ((e: MessageEvent) => void) | null = null;

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

export function start_network_hook(
    sender: (type: string, data: any) => void
): void {
    if (is_capturing) return;
    send_event = sender;
    is_capturing = true;

    inject_page_script();

    message_listener = (e: MessageEvent) => {
        if (!is_capturing) return;
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.source !== SIGNAL) return;

        send_event('network_body_hook', {
            category: 'network',
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
            response_body: d.response_body ?? null,
            response_preview: typeof d.response_body === 'string' ? d.response_body.slice(0, 200) : null,
            response_body_status: d.response_body_status || 'failed',
            mime_type: null,
            request_size_bytes: null,
            response_size_bytes: null,
            transfer_size_bytes: null,
            from_cache: null,
            cache_status: null,
            error_text: null,
            capture_method: 'fallback_hook',
            body_capture_mode: 'fallback_hook',
        });
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
