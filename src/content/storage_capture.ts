// content/storage_capture.ts
import type { StorageChangeData } from '../shared/types';

let is_capturing = false;
let send_event: (type: string, data: any) => void;
let message_listener: ((e: MessageEvent) => void) | null = null;

const SIGNAL = '__record_all_storage__';

const PAGE_SCRIPT = `(function() {
    if (window.__record_all_storage_installed__) return;
    window.__record_all_storage_installed__ = true;
    var SIGNAL = '${SIGNAL}';

    function post(storage_type, action, key, value_length) {
        try {
            window.postMessage({
                source: SIGNAL,
                storage_type: storage_type,
                action: action,
                key: key,
                value_length: value_length
            }, '*');
        } catch (e) {}
    }

    function wrap(storage, storage_type) {
        var orig_set = storage.setItem.bind(storage);
        var orig_remove = storage.removeItem.bind(storage);
        var orig_clear = storage.clear.bind(storage);

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

export function start_storage_capture(sender: (type: string, data: any) => void): void {
    if (is_capturing) return;
    send_event = sender;
    is_capturing = true;

    inject_page_script();

    message_listener = (e: MessageEvent) => {
        if (!is_capturing) return;
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.source !== SIGNAL) return;

        const data: StorageChangeData = {
            storage_type: d.storage_type,
            action: d.action,
            key: d.key,
            value_length: typeof d.value_length === 'number' ? d.value_length : 0
        };
        send_event('storage_change', data);
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
