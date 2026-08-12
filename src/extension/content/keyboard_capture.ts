// content/keyboard_capture.ts
import type { CaptureConfig, CaptureEvent, KeyboardEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';
import { build_xpath } from '../shared/dom_utils';

const state = create_capture_state<KeyboardEventData>();
let config: CaptureConfig;

export function start_keyboard_capture(
    cfg: CaptureConfig,
    cid: string,
    start_ms: number,
    tid: number,
    sender: (event: CaptureEvent, data: KeyboardEventData) => void
): void {
    if (cfg.keyboard_capture_mode === 'none') return;
    if (!state.begin(sender, {
        capture_id: cid,
        capture_start_epoch_ms: start_ms,
        tab_id: tid,
    })) return;

    config = cfg;

    document.addEventListener('keydown', handle_keydown);
    document.addEventListener('keyup', handle_keyup);
}

export function stop_keyboard_capture(): void {
    if (!state.end()) return;

    document.removeEventListener('keydown', handle_keydown);
    document.removeEventListener('keyup', handle_keyup);
}

function get_target_info(event: KeyboardEvent): { selector: string | null; xpath: string | null } {
    const target = event.target as HTMLElement | null;
    if (!target) return { selector: null, xpath: null };
    let selector: string;
    if (target.id) {
        selector = `#${target.id}`;
    } else if (target.className && typeof target.className === 'string') {
        selector = `.${target.className.split(' ')[0]}`;
    } else {
        selector = target.tagName.toLowerCase();
    }
    return { selector, xpath: build_xpath(target) };
}

function has_modifier(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
}

function is_shortcut_mode(): boolean {
    return config.keyboard_capture_mode === 'shortcuts';
}

// type=password 输入框永不采集击键值（不变量，见 domain.md），不受 redact_data 影响。
// 用 composedPath 取实际目标：shadow DOM 内密码框触发时 event.target 被 retarget 为 host。
function is_password_input(event: KeyboardEvent): boolean {
    const t = event.composedPath()[0];
    return t instanceof HTMLInputElement && t.type === 'password';
}

function build_key_event(
    event: KeyboardEvent,
    action: 'keydown' | 'keyup'
): void {
    if (!state.is_capturing) return;

    // In shortcuts mode, only capture modifier combinations
    if (is_shortcut_mode() && !has_modifier(event)) {
        return;
    }

    const target = get_target_info(event);

    const masked = config.redact_data || is_password_input(event);

    const base_event = create_content_event({
        capture_id: state.capture_id,
        category: 'user_action',
        type: 'keyboard_event',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        url: location.href,
        source: 'content_script',
    });

    const key_data: KeyboardEventData = {
        action,
        key: masked ? null : event.key,
        code: masked ? null : event.code,
        key_status: masked ? 'masked' : 'captured',
        modifiers: {
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey,
        },
        target_selector: target.selector,
        target_xpath: target.xpath,
        target_tag: (event.target as HTMLElement)?.tagName?.toLowerCase() ?? null,
        target_input_type: (event.target as HTMLInputElement)?.type ?? null,
    };

    state.sender?.(base_event, key_data);
}

function handle_keydown(event: KeyboardEvent): void {
    build_key_event(event, 'keydown');
}

function handle_keyup(event: KeyboardEvent): void {
    build_key_event(event, 'keyup');
}
