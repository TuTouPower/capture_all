// content/dom_capture.ts
import type { RecordConfig, InputEventData } from '../shared/types';
import { build_xpath } from '../shared/dom_utils';

let is_capturing = false;
let config: RecordConfig;
let send_event: (type: string, data: any) => void;

export function start_dom_capture(cfg: RecordConfig, sender: (type: string, data: any) => void): void {
    if (is_capturing) return;

    config = cfg;
    send_event = sender;
    is_capturing = true;

    document.addEventListener('input', handle_input, true);
    document.addEventListener('change', handle_change, true);
    document.addEventListener('focusin', handle_focus, true);
    document.addEventListener('focusout', handle_blur, true);
}

export function stop_dom_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;

    document.removeEventListener('input', handle_input, true);
    document.removeEventListener('change', handle_change, true);
    document.removeEventListener('focusin', handle_focus, true);
    document.removeEventListener('focusout', handle_blur, true);
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
    const class_part = cls ? `.${cls}` : '';
    return `${tag}${class_part}:nth-child(${n})`;
}

function build_css_path(element: Element): string {
    const segments: string[] = [];
    let current: Element | null = element;
    let depth = 0;

    while (current && current !== document.body && current.nodeType === 1 && depth < MAX_PATH_DEPTH) {
        if (current.id) {
            segments.unshift(`#${current.id}`);
            return segments.join(' > ');
        }
        segments.unshift(build_segment(current));
        current = current.parentElement;
        depth++;
    }

    return segments.join(' > ');
}

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
            value_preview: value || null,
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

    send_event('input_event', data);
}

function handle_input(event: Event): void {
    if (!is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;
    emit_input_event('input', target);
}

function handle_change(event: Event): void {
    if (!is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;
    emit_input_event('change', target);
}

function handle_focus(event: FocusEvent): void {
    if (!is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;
    emit_input_event('focus', target);
}

function handle_blur(event: FocusEvent): void {
    if (!is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;
    emit_input_event('blur', target);
}
