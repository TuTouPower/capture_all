// content/dom_capture.ts
import type { CaptureConfig, CaptureEvent, InputEventData } from '../../shared/types';
import { build_xpath } from '../shared/dom_utils';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<InputEventData>();
let config: CaptureConfig;

export function start_dom_capture(
    cfg: CaptureConfig,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
    sender: (event: CaptureEvent, data: InputEventData) => void,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;

    config = cfg;

    document.addEventListener('input', handle_input, true);
    document.addEventListener('change', handle_change, true);
    // B3-M6: focus 事件由 focus_capture 单一采集（focus_event），此处不再监听 focusin/focusout，
    // 避免同一元素获焦双报（dom_capture input_event 与 focus_capture focus_event 各发一条）。
}

export function stop_dom_capture(): void {
    if (!state.end()) return;

    document.removeEventListener('input', handle_input, true);
    document.removeEventListener('change', handle_change, true);
}

const MAX_PATH_DEPTH = 5;

function get_first_meaningful_class(element: Element): string | null {
    if (!element.className || typeof element.className !== 'string') return null;
    const classes = element.className.trim().split(/\s+/).filter(c => c.length > 0);
    return classes.length > 0 ? classes[0] : null;
}

function get_nth_of_type(element: Element): number {
    const parent = element.parentElement;
    if (!parent) return 1;
    let index = 1;
    const tag = element.tagName;
    for (const sibling of Array.from(parent.children)) {
        if (sibling === element) return index;
        if (sibling.tagName === tag) index++;
    }
    return index;
}

function build_segment(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const cls = get_first_meaningful_class(element);
    const n = get_nth_of_type(element);
    // t189 AC-003: :nth-of-type 按同 tag 兄弟计数（与 get_nth_of_type 语义一致），
    // 原 :nth-child 把同 tag 位置误当全部子元素位置；class 用 CSS.escape 防特殊字符
    const class_part = cls ? `.${CSS.escape(cls)}` : '';
    return `${tag}${class_part}:nth-of-type(${n})`;
}

function build_css_path(element: Element): string {
    const segments: string[] = [];
    let current: Element | null = element;
    let depth = 0;

    while (current && current !== document.body && current.nodeType === 1 && depth < MAX_PATH_DEPTH) {
        if (current.id) {
            // t189 AC-003: id 含特殊字符（冒号/点/空格等）时 CSS.escape，querySelector round-trip 成立
            segments.unshift(`#${CSS.escape(current.id)}`);
            return segments.join(' > ');
        }
        segments.unshift(build_segment(current));
        current = current.parentElement;
        depth++;
    }

    return segments.join(' > ');
}

// t189 AC-003: 测试导出——jsdom round-trip 验证 querySelector(generated) === target
export const _build_css_path_for_test = build_css_path;

function get_target_info(element: HTMLElement): { selector: string; xpath: string; tag: string } {
    return {
        selector: build_css_path(element),
        xpath: build_xpath(element),
        tag: element.tagName.toLowerCase()
    };
}

function compute_value_fields(target: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): {
    value_status: InputEventData['value_status'];
    value_preview: string | null;
    value_length: number | null;
} {
    const is_password = target instanceof HTMLInputElement && target.type === 'password';

    if (is_password) {
        return { value_status: 'not_captured', value_preview: null, value_length: null };
    }

    if (!config.capture_input_values) {
        return { value_status: 'not_captured', value_preview: null, value_length: null };
    }

    const value = target.value;

    if (config.redact_data) {
        return {
            value_status: 'redacted',
            value_preview: value ? '[REDACTED]' : null,
            value_length: value ? value.length : null,
        };
    }

    return {
        value_status: 'captured',
        value_preview: value || null,
        value_length: value ? value.length : null,
    };
}

function emit_input_event(action: InputEventData['action'], target: HTMLElement): void {
    const info = get_target_info(target);
    const input_target = target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

    const { value_status, value_preview, value_length } = compute_value_fields(input_target);

    const is_checkable = target instanceof HTMLInputElement
        && (target.type === 'checkbox' || target.type === 'radio');

    const data: InputEventData = {
        action,
        target_selector: info.selector,
        target_xpath: info.xpath,
        target_tag: info.tag,
        target_input_type: (target as HTMLInputElement).type ?? null,
        field_name: (target as HTMLInputElement).name ?? null,
        field_label: null,
        value_status,
        value_preview,
        value_length,
        checked: is_checkable ? (target as HTMLInputElement).checked : null,
        selected_count: null,
    };

    state.sender?.(
        create_content_event({
            capture_id: state.capture_id,
            category: 'user_action',
            type: 'input_event',
            relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
            tab_id: state.tab_id,
            url: location.href,
            source: 'content_script',
        }),
        data,
    );
}

function handle_input(event: Event): void {
    if (!state.is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;
    emit_input_event('input', target);
}

function handle_change(event: Event): void {
    if (!state.is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;
    emit_input_event('change', target);
}
