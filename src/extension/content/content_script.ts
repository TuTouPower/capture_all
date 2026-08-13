// content/content_script.ts
import type { CaptureConfig, CaptureEvent, EventType, RouteChangeData, DomReadyData, PageLoadData, LogLevel } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';
import { start_mouse_capture, stop_mouse_capture } from './mouse_capture';
import { start_keyboard_capture, stop_keyboard_capture } from './keyboard_capture';
import { start_scroll_capture, stop_scroll_capture } from './scroll_capture';
import { start_dom_capture, stop_dom_capture } from './dom_capture';
import { start_storage_capture, stop_storage_capture } from './storage_capture';
import { start_network_hook, stop_network_hook } from './network_hook';
import { start_clipboard_capture, stop_clipboard_capture } from './clipboard_capture';
import { start_form_submit_capture, stop_form_submit_capture } from './form_submit_capture';
import { start_focus_capture, stop_focus_capture } from './focus_capture';
import { start_visibility_capture, stop_visibility_capture } from './visibility_capture';
import { start_resize_capture, stop_resize_capture } from './resize_capture';
import { start_fullscreen_capture, stop_fullscreen_capture } from './fullscreen_capture';
import { start_print_capture, stop_print_capture } from './print_capture';
import { start_websocket_capture, stop_websocket_capture } from './websocket_capture';
import { DEFAULT_CONFIG } from '../../shared/constants';
import { Logger, MessageLogTransport } from '../../shared/logger';
import { start_status_poll, type CaptureStatusResponse } from '../shared/poll_capture_status';
// t189 f003: 复用公共注入诊断（B3-M3）——CSP 拦截/注入失败不再静默
import { inject_script_element } from './content_page_script';

/** Unified sender type accepted by all content capture modules. */
type ContentSender = (event: CaptureEvent, data?: unknown) => void;

const log_transport = new MessageLogTransport();
const logger = new Logger('content/script', log_transport);

let is_capturing = false;
let frame_id = 0;
let last_url = window.location.href;
let capture_id = '';
let capture_start_epoch_ms = 0;
let tab_id = 0;
let nav_enabled = true; // T106: 导航类别开关（handler 内判）

// Determine frame ID
if (window !== window.top) {
    frame_id = Math.floor(Math.random() * 1000000);
}

// t172 SEC-004: 删除模块加载时的 URL 日志（未开始 capture 访问页面不得产生含页面 URL 的
// app log 条目；含 iframe/hash/fragment credential）。URL 相关日志仅 active capture 后记录。

chrome.runtime.onMessage.addListener((message: any, sender: any, sendResponse: (response: any) => void) => {
    logger.debug('Content received message', { action: message.action });
    if (message.action === 'start') {
        // t172 AC-002: log level 由 SW/user config 下发，Logger 创建后应用（silent/warn 时不写 info）
        if (typeof message.log_level === 'string') {
            Logger.set_level(message.log_level as LogLevel);
        }
        capture_id = message.capture_id ?? '';
        capture_start_epoch_ms = message.capture_start_epoch_ms ?? Date.now();
        tab_id = message.tab_id ?? 0;
        // t189 AC-002: 用平台 sender.frameId（主 frame=0，子 frame>0）替代随机数，
        // iframe 事件携带真实 frame_id（sender.frameId 平台保证可用，spike s010 结论）
        if (typeof sender?.frameId === 'number') {
            frame_id = sender.frameId;
        }
        start_capture(message.config || DEFAULT_CONFIG);
        sendResponse({ success: true });
    } else if (message.action === 'stop') {
        stop_capture();
        sendResponse({ success: true });
    } else if (message.action === 'ping') {
        sendResponse({ is_capturing, frame_id });
    } else {
        // B3-M8: 未知 action 显式回错误响应，避免 return true 后通道永不 resolve 挂起发送端
        logger.warn('Content received unknown action', { action: message?.action });
        sendResponse({ success: false, error: 'unknown_action' });
    }
    return true;
});

// Check if recording is already active when content script loads.
// BUG-004 修复：原实现只在加载时调用一次 get_status；若 SW 此时未采集就退出，
// 之后 SW 开始采集时给本 tab 发 sendMessage 会失败（"Receiving end does not exist"），
// 导致用户行为 / storage 事件 0 条。改为周期轮询，直到 SW 采集开始或脚本被卸载。
//
// t189 AC-005: 轮询实例的 in-flight 响应在 stopped 后不触发 on_active（stop→restart 竞态防护）；
// start_capture 停轮询并置空。轮询在脚本加载时启动一次（每 frame 一份 content script）；
// stop 后由 SW 重新下发 start 消息重建采集（不依赖轮询重启）。
//
// 详见 tests/poll_capture_status.test.ts。
let stop_status_poll: (() => void) | null = null;

function ensure_status_poll(): void {
    if (stop_status_poll) return;
    stop_status_poll = start_status_poll({
        get_status: (): Promise<CaptureStatusResponse | null> =>
            chrome.runtime.sendMessage({ action: 'get_status' })
                .then((r: { success?: boolean; data?: CaptureStatusResponse | null } | null) =>
                    r?.success ? (r.data ?? null) : null)
                .catch(() => null),
        on_active: (resp: CaptureStatusResponse): void => {
            if (is_capturing) return;
            // t172 f001: 重载恢复路径应用 log level
            if (typeof resp.log_level === 'string') {
                Logger.set_level(resp.log_level as LogLevel);
            }
            capture_id = resp.capture_id ?? '';
            capture_start_epoch_ms = resp.start_time ?? Date.now();
            tab_id = resp.tab_id ?? 0;
            logger.info('Recording already active (detected via poll), starting capture');
            start_capture((resp.config as CaptureConfig) || DEFAULT_CONFIG);
        },
        setInterval: (handler: () => void, ms: number) => window.setInterval(handler, ms),
        clearInterval: (id: unknown) => window.clearInterval(id as number),
    });
}

ensure_status_poll();

function start_capture(config: CaptureConfig): void {
    if (is_capturing) return;

    // t189 AC-005: 采集已开始——停止状态轮询（避免空转；on_active 路径 poll 已自清）
    if (stop_status_poll) {
        stop_status_poll();
        stop_status_poll = null;
    }

    is_capturing = true;
    nav_enabled = config.nav_count_enabled !== false;
    logger.info('Content capture started');

    // Send page load event（T106: 导航类别开关关闭时不发导航事件）
    if (config.nav_count_enabled !== false) {
        // B3-L6: loadEventEnd 未触发时为 0，减 navigationStart 得负值；`|| null` 只拦 0 拦不住负值。
        // 显式 >0 判断：未触发 → null，不落负值。
        const load_ms = performance.timing.loadEventEnd - performance.timing.navigationStart;
        const dom_ms = performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart;
        const page_load_data: PageLoadData = {
            url: window.location.href,
            title: document.title,
            load_event_time_ms: load_ms > 0 ? load_ms : null,
            dom_content_loaded_time_ms: dom_ms > 0 ? dom_ms : null,
            navigation_start_time: performance.timeOrigin ? new Date(performance.timeOrigin).toISOString() : null,
        };
        send_capture_event('navigation', 'page_load', page_load_data);
    }

    // Start capture modules based on config
    // Wrapper adapts send_event's union-param signature to the typed sender each module expects.
    const sender: ContentSender = (event, data) => send_event(event, data);
    // T106: 用户行为开关关闭时不启动任何 user_action 生产者
    if (config.event_count_enabled !== false) {
        start_mouse_capture(config, capture_id, capture_start_epoch_ms, tab_id, sender);
        start_keyboard_capture(config, capture_id, capture_start_epoch_ms, tab_id, sender);
        start_scroll_capture(sender, { capture_id, capture_start_epoch_ms, tab_id });
        start_dom_capture(config, capture_id, capture_start_epoch_ms, tab_id, sender);
        start_clipboard_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
        start_form_submit_capture(sender, capture_id, capture_start_epoch_ms, tab_id, config);
        start_focus_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
        start_resize_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
        start_fullscreen_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
        start_print_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    }
    if (config.storage_change_count_enabled !== false) {
        start_storage_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    }
    // T098: network_hook / websocket_capture 仅当 capture_network 开启时注入；
    // 关闭时显式停用，防先前注入的 hook 继续转发事件。
    if (config.capture_network) {
        start_network_hook(sender, capture_id, capture_start_epoch_ms, tab_id, config.capture_response_body, {
            redact_data: config.redact_data,
            redact_url_query: config.redact_url_query,
            // t153 AC-005: 把配置的 body 上限传入 fallback hook（默认 100MB，行为等价）
            max_body_capture_bytes: config.max_body_capture_bytes,
        });
        start_websocket_capture(sender, capture_id, capture_start_epoch_ms, tab_id, {
            redact_data: config.redact_data,
            redact_url_query: config.redact_url_query,
        });
    } else {
        stop_network_hook();
        stop_websocket_capture();
    }
    // T106: 导航类别开关关闭时不启动 visibility（navigation 类别）
    if (config.nav_count_enabled !== false) {
        start_visibility_capture(sender, capture_id, capture_start_epoch_ms, tab_id);
    }

    logger.debug('All capture modules started', {
        modules: ['mouse', 'keyboard', 'scroll', 'dom', 'storage', 'network_hook', 'clipboard', 'form_submit', 'focus', 'visibility', 'resize', 'fullscreen', 'print', 'websocket'],
        config: {
            capture_network: config.capture_network,
            capture_console: config.capture_console,
            capture_response_body: config.capture_response_body,
        }
    });

    // SPA navigation — popstate + hashchange + pushState/replaceState patch（t189 AC-001）
    window.addEventListener('popstate', handle_popstate_navigation);
    window.addEventListener('hashchange', handle_hashchange_navigation);
    window.addEventListener('message', handle_navigation_message, true);
    inject_navigation_page_script();

    // DOMContentLoaded (may have already fired)
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', handle_dom_ready);
    } else {
        handle_dom_ready();
    }
}

function handle_popstate_navigation(): void {
    if (!is_capturing) return;
    if (!nav_enabled) return; // T106: 导航类别关闭时不发 route_change
    const new_url = window.location.href;
    if (new_url === last_url) return;
    const from = last_url;
    last_url = new_url;

    // t189 AC-001: popstate 由 back/forward 触发（push/replace 不派发 popstate），
    // 不再标为 push_state
    const data: RouteChangeData = {
        from_url: from,
        to_url: new_url,
        route_action: 'back_forward',
        from_path: new URL(from).pathname,
        to_path: new URL(new_url).pathname,
        title: document.title,
        is_spa: true,
    };
    send_capture_event('navigation', 'route_change', data);
}

// t189 AC-001: MAIN world page script patch history.pushState/replaceState 后 postMessage 通知。
// 消息无 HMAC（导航事件与 popstate/hashchange 同权，页面自身可伪造；威胁模型一致）。
const NAV_SIGNAL = '__capture_all_nav__';

function inject_navigation_page_script(): void {
    // t189 f003: 经 inject_script_element（B3-M3）注入——CSP 拦截/注入失败诊断 warn（非静默）
    inject_script_element(navigation_page_script_text(), (reason) => {
        logger.warn('Navigation page script injection failed', { reason });
    });
}

function navigation_page_script_text(): string {
    return `(function(){
        if (window.__capture_all_nav_installed__) return;
        var signal = ${JSON.stringify(NAV_SIGNAL)};
        var orig_push = history.pushState;
        var orig_replace = history.replaceState;
        history.pushState = function(state, title, url) {
            var r = orig_push.apply(this, arguments);
            window.postMessage({ source: signal, action: 'push_state', url: url ? new URL(String(url), location.href).href : location.href }, location.origin);
            return r;
        };
        history.replaceState = function(state, title, url) {
            var r = orig_replace.apply(this, arguments);
            window.postMessage({ source: signal, action: 'replace_state', url: url ? new URL(String(url), location.href).href : location.href }, location.origin);
            return r;
        };
        window.__capture_all_nav_prev__ = { push: orig_push, replace: orig_replace };
        window.__capture_all_nav_installed__ = true;
    })();`;
}

function restore_navigation_page_script(): void {
    try {
        const s = document.createElement('script');
        s.textContent = `(function(){
            if (!window.__capture_all_nav_installed__) return;
            var prev = window.__capture_all_nav_prev__;
            if (prev) {
                history.pushState = prev.push;
                history.replaceState = prev.replace;
            }
            delete window.__capture_all_nav_installed__;
            delete window.__capture_all_nav_prev__;
        })();`;
        (document.documentElement || document.head || document.body).appendChild(s);
        s.remove();
    } catch {
        // ignore
    }
}

function handle_navigation_message(e: MessageEvent): void {
    if (!is_capturing) return;
    if (e.origin !== window.location.origin) return;
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== NAV_SIGNAL) return;
    const action = d.action as 'push_state' | 'replace_state' | undefined;
    if (action !== 'push_state' && action !== 'replace_state') return;
    if (!nav_enabled) return; // T106: 导航类别关闭时不发 route_change
    // t189 f002: 畸形 url 不抛未捕获异常（监听器内安全忽略）
    let new_url: string;
    try {
        new_url = typeof d.url === 'string' && d.url.length > 0 ? d.url : window.location.href;
        new URL(new_url); // 校验可解析
    } catch {
        return;
    }
    if (new_url === last_url) return;
    const from = last_url;
    last_url = new_url;
    const data: RouteChangeData = {
        from_url: from,
        to_url: new_url,
        route_action: action,
        from_path: new URL(from).pathname,
        to_path: new URL(new_url).pathname,
        title: document.title,
        is_spa: true,
    };
    send_capture_event('navigation', 'route_change', data);
}

function handle_hashchange_navigation(event: HashChangeEvent): void {
    if (!is_capturing) return;
    if (!nav_enabled) return; // T106: 导航类别关闭时不发 route_change
    const from = event.oldURL;
    const to = event.newURL;
    last_url = to;

    const data: RouteChangeData = {
        from_url: from,
        to_url: to,
        route_action: 'hash_change',
        from_path: new URL(from).pathname,
        to_path: new URL(to).pathname,
        title: document.title,
        is_spa: true,
    };
    send_capture_event('navigation', 'route_change', data);
}

function handle_dom_ready(): void {
    if (!is_capturing) return;
    if (!nav_enabled) return; // T106: 导航类别关闭时不发 dom_ready
    const data: DomReadyData = {
        url: window.location.href,
        title: document.title,
        ready_state: document.readyState as 'loading' | 'interactive' | 'complete',
    };
    send_capture_event('navigation', 'dom_ready', data);
}

function stop_capture(): void {
    if (!is_capturing) return;

    is_capturing = false;
    logger.info('Content capture stopped');

    stop_mouse_capture();
    stop_keyboard_capture();
    stop_scroll_capture();
    stop_dom_capture();
    stop_storage_capture();
    stop_network_hook();
    stop_clipboard_capture();
    stop_form_submit_capture();
    stop_focus_capture();
    stop_visibility_capture();
    stop_resize_capture();
    stop_fullscreen_capture();
    stop_print_capture();
    stop_websocket_capture();

    // BUG-004: 停止轮询（避免 stop 后仍触发 start_capture）
    // t189 AC-005: 停轮询并置空——轮询为加载时一次性（每 frame 一份 content script），
    // stop 后由 SW 重新下发 start 消息重建采集
    if (stop_status_poll) {
        stop_status_poll();
        stop_status_poll = null;
    }

    window.removeEventListener('popstate', handle_popstate_navigation);
    window.removeEventListener('hashchange', handle_hashchange_navigation);
    window.removeEventListener('message', handle_navigation_message, true);
    // t189 AC-001: stop 还原 MAIN world history patch（沿用 page-script 恢复模式）
    restore_navigation_page_script();

    // Flush remaining log entries before shutdown
    log_transport.flush().catch(() => {});
}

/** Send a fully-typed CaptureEvent for navigation/lifecycle events */
function send_capture_event(category: 'navigation' | 'capture_lifecycle', type: EventType, data: unknown): void {
    const event = create_content_event({
        capture_id,
        category,
        type,
        relative_time_ms: get_relative_time(capture_start_epoch_ms),
        tab_id,
        frame_id,
        url: window.location.href,
        source: 'content_script',
    });
    chrome.runtime.sendMessage({
        action: 'event',
        event: { ...event, data }
    }).catch((_err: unknown) => {
        // Ignore errors (e.g., extension context invalidated)
    });
}

function send_event(event: CaptureEvent, data?: unknown): void {
    if (!is_capturing) return;

    chrome.runtime.sendMessage({
        action: 'event',
        event: data === undefined ? event : { ...event, data }
    }).catch((_err: unknown) => {
        // Ignore errors (e.g., extension context invalidated)
    });
}
