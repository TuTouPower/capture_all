// background/cookie_capture.ts
// Records cookie name, domain, path, cause — never the cookie value (privacy).
// Uses chrome.cookies.onChanged (service-worker context).

import type { CookieChangeData, RecordEvent } from '../shared/types';

let is_capturing = false;
let session_id: string;
let start_time: number;
let send_to_background: (event: RecordEvent) => void;

// chrome.cookies types are not in the ambient namespace for this project,
// so we use `any` for callback params (same pattern as network_capture.ts).
const cookies_api: any = (chrome as any).cookies;

function map_cause(info: any): CookieChangeData['cause'] {
    if (!info.removed) return 'explicit';
    const c = info.cause;
    switch (c) {
        case 'expired':       return 'expired';
        case 'evicted':       return 'evicted';
        case 'overwrite':     return 'overwrite';
        case 'explicit':      return 'explicit';
        default:              return 'unknown';
    }
}

function handle_cookie_changed(info: any): void {
    if (!is_capturing) return;

    const data: CookieChangeData = {
        name: info.cookie.name,
        domain: info.cookie.domain,
        path: info.cookie.path,
        cause: map_cause(info),
        removed: info.removed
    };

    const now = Date.now();
    send_to_background({
        session_id,
        relative_time: now - start_time,
        absolute_time: now,
        type: 'cookie_change',
        data,
        tab_id: 0,       // cookie changes are not tab-specific
        frame_id: 0,
        url: ''
    });
}

export function start_cookie_capture(
    sid: string,
    startTime: number,
    sender: (event: RecordEvent) => void
): void {
    if (is_capturing) return;
    session_id = sid;
    start_time = startTime;
    send_to_background = sender;
    is_capturing = true;

    cookies_api.onChanged.addListener(handle_cookie_changed);
}

export function stop_cookie_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    cookies_api.onChanged.removeListener(handle_cookie_changed);
}
