// content/storage_capture.ts
import type { CaptureEvent, StorageChangeData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';

let is_capturing = false;
let capture_id = '';
let capture_start_epoch_ms = 0;
let send_event: (event: CaptureEvent) => void;
let message_listener: ((e: MessageEvent) => void) | null = null;

const SIGNAL = '__capture_all_storage__';

const PAGE_SCRIPT = `(function() {
    if (window.__capture_all_storage_installed__) return;
    window.__capture_all_storage_installed__ = true;
    var SIGNAL = '${SIGNAL}';

    function post(storage_type, action, key, value_length) {
        try {
            window.postMessage({
                source: SIGNAL,
                storage_type: storage_type,
                action: action,
                key: key,
                value_length: value_length
            }, window.location.origin);
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

export function start_storage_capture(
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
        if (e.origin !== window.location.origin) return;
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.source !== SIGNAL) return;

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
            tab_id: 0,
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
