// background/cookie_capture.ts
// Records cookie name, domain, path, cause — never the cookie value (privacy).
// Uses chrome.cookies.onChanged (service-worker context).

import type { CaptureEvent, CookieChangeData } from '../shared/types';
import { create_base_event, get_relative_time } from '../shared/event_utils';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/cookie', get_app_log_transport());

type CookieCaptureEvent = CaptureEvent & { data: CookieChangeData };

let is_capturing = false;
let capture_id: string;
let capture_start_epoch_ms: number;
let send_to_background: (event: CookieCaptureEvent) => void;

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
        removed: info.removed,
        secure: info.cookie.secure ?? null,
        http_only: info.cookie.httpOnly ?? null,
        same_site: info.cookie.sameSite ?? null,
        expiration_date: info.cookie.expirationDate ?? null,
        store_id: info.cookie.storeId ?? null,
        value_status: 'not_captured',
        value_length: null,
        value_preview: null,
    };

    const base = create_base_event({
        capture_id,
        category: 'cookie',
        type: 'cookie_change',
        relative_time_ms: get_relative_time(capture_start_epoch_ms),
        tab_id: 0,
        source: 'background',
    });

    send_to_background({
        ...base,
        data,
    });
}

export function start_cookie_capture(
    cid: string,
    startTime: number,
    sender: (event: CookieCaptureEvent) => void
): void {
    if (is_capturing) return;
    capture_id = cid;
    capture_start_epoch_ms = startTime;
    send_to_background = sender;
    is_capturing = true;
    logger.info('Cookie capture started');

    cookies_api.onChanged.addListener(handle_cookie_changed);
}

export function stop_cookie_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    logger.info('Cookie capture stopped');
    cookies_api.onChanged.removeListener(handle_cookie_changed);
}
