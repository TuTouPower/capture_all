// background/cookie_capture.ts
// Captures cookie name, domain, path, cause — never the cookie value (privacy).
// Uses chrome.cookies.onChanged (service-worker context).

import type { CaptureEvent, CookieChangeData } from '../../shared/types';
import { create_base_event, get_relative_time } from '../../shared/event_utils';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/cookie', get_app_log_transport());

type CookieCaptureEvent = CaptureEvent & { data: CookieChangeData };

let is_capturing = false;
let capture_id: string;
let capture_start_epoch_ms: number;
let tab_id: number;
let target_domains: Set<string>; // 目标 tab domain 及其父域（cookie.domain 形式）
let send_to_background: (event: CookieCaptureEvent) => void;

// chrome.cookies types are now declared in shared/chrome.d.ts
const cookies_api = chrome.cookies;

// 从目标 URL 提取需要匹配的 cookie domain 集合
// 如 tab_url='https://sub.example.com/path'，匹配 'sub.example.com'/'.sub.example.com'/'example.com'/'.example.com'
function extract_target_domains(tab_url: string): Set<string> {
    const result = new Set<string>();
    try {
        const hostname = new URL(tab_url).hostname;
        if (!hostname) return result;
        const parts = hostname.split('.');
        for (let i = parts.length - 1; i >= 0; i--) {
            const domain = parts.slice(i).join('.');
            if (!domain) continue;
            result.add(domain);
            result.add(`.${domain}`);
        }
    } catch {
        // ignore
    }
    return result;
}

function matches_target(cookie_domain: string): boolean {
    if (target_domains.size === 0) return true; // 未指定目标 → 不过滤
    return target_domains.has(cookie_domain);
}

function map_cause(info: { cookie: { name: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite?: string; expirationDate?: number; storeId?: string }; removed: boolean; cause: string }): CookieChangeData['cause'] {
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

function handle_cookie_changed(info: { cookie: { name: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite?: string; expirationDate?: number; storeId?: string }; removed: boolean; cause: string }): void {
    if (!is_capturing) return;

    // T051: 按目标 tab domain 过滤，避免全浏览器 cookie 变更都被采入当前 capture
    if (!matches_target(info.cookie.domain)) return;

    const data: CookieChangeData = {
        name: info.cookie.name,
        domain: info.cookie.domain,
        path: info.cookie.path,
        cause: map_cause(info),
        removed: info.removed,
        secure: info.cookie.secure ?? null,
        http_only: info.cookie.httpOnly ?? null,
        same_site: (info.cookie.sameSite as 'unspecified' | 'no_restriction' | 'lax' | 'strict' | undefined) ?? null,
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
        tab_id,
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
    sender: (event: CookieCaptureEvent) => void,
    target_tab_url: string | null = null,
    target_tab_id: number = 0
): void {
    if (is_capturing) return;
    capture_id = cid;
    capture_start_epoch_ms = startTime;
    send_to_background = sender;
    tab_id = target_tab_id;
    target_domains = target_tab_url ? extract_target_domains(target_tab_url) : new Set();
    is_capturing = true;
    logger.info('Cookie capture started', { target_domains_count: target_domains.size });

    cookies_api.onChanged.addListener(handle_cookie_changed);
}

export function stop_cookie_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;
    logger.info('Cookie capture stopped');
    cookies_api.onChanged.removeListener(handle_cookie_changed);
}
