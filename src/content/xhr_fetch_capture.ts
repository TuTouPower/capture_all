// content/xhr_fetch_capture.ts
// Intercepts fetch() and XMLHttpRequest from the page's perspective.
// Reports method, url, status, duration. Does NOT capture bodies.
// Complements background webRequest capture (which has headers/body).
// Uses page-script injection + postMessage, same pattern as storage_capture.ts.

const SIGNAL = '__record_all_xhr_fetch__';

const PAGE_SCRIPT = `(function() {
    if (window.__record_all_xhr_fetch_installed__) return;
    window.__record_all_xhr_fetch_installed__ = true;
    var SIGNAL = '${SIGNAL}';

    function post(type, method, url, status, duration) {
        try {
            window.postMessage({
                source: SIGNAL,
                request_type: type,
                method: method,
                url: url,
                status: status,
                duration_ms: duration
            }, '*');
        } catch (e) {}
    }

    // --- fetch wrapper ---
    var orig_fetch = window.fetch;
    window.fetch = function(input, init) {
        var method = (init && init.method) || 'GET';
        var url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
        var start = performance.now();
        return orig_fetch.apply(this, arguments).then(function(response) {
            try { post('fetch', method, url, response.status, performance.now() - start); } catch (e) {}
            return response;
        }).catch(function(err) {
            try { post('fetch', method, url, 0, performance.now() - start); } catch (e) {}
            throw err;
        });
    };

    // --- XMLHttpRequest wrapper ---
    var orig_open = XMLHttpRequest.prototype.open;
    var orig_send = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__record_all = { method: method, url: url, start: 0 };
        return orig_open.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        var self = this;
        var meta = this.__record_all;
        if (!meta) return orig_send.apply(this, arguments);
        meta.start = performance.now();

        var on_done = function() {
            try {
                post('xhr', meta.method, meta.url, self.status || 0, performance.now() - meta.start);
            } catch (e) {}
        };

        this.addEventListener('load', on_done, { once: true });
        this.addEventListener('error', on_done, { once: true });
        this.addEventListener('abort', on_done, { once: true });
        this.addEventListener('timeout', on_done, { once: true });

        return orig_send.apply(this, arguments);
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

export function start_xhr_fetch_capture(sender: (type: string, data: any) => void): void {
    if (is_capturing) return;
    send_event = sender;
    is_capturing = true;

    inject_page_script();

    message_listener = (e: MessageEvent) => {
        if (!is_capturing) return;
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.source !== SIGNAL) return;

        if (d.request_type === 'fetch') {
            send_event('fetch_request', {
                method: d.method || 'GET',
                url: d.url || '',
                status: typeof d.status === 'number' ? d.status : 0,
                duration_ms: typeof d.duration_ms === 'number' ? Math.round(d.duration_ms * 100) / 100 : 0
            });
        } else if (d.request_type === 'xhr') {
            send_event('xhr_request', {
                method: d.method || 'GET',
                url: d.url || '',
                status: typeof d.status === 'number' ? d.status : 0,
                duration_ms: typeof d.duration_ms === 'number' ? Math.round(d.duration_ms * 100) / 100 : 0
            });
        }
    };
    window.addEventListener('message', message_listener, true);
}

export function stop_xhr_fetch_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    if (message_listener) {
        window.removeEventListener('message', message_listener, true);
        message_listener = null;
    }
}
