// content/dom_capture.ts
import type { RecordConfig, DomChangeData } from '../shared/types';

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

function get_target_info(element: HTMLElement): { selector: string; tag: string } {
    return {
        selector: build_css_path(element),
        tag: element.tagName.toLowerCase()
    };
}

function get_input_value(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
    // Redact passwords only when redact_data enabled
    if (config.redact_data && element instanceof HTMLInputElement && element.type === 'password') {
        return '[REDACTED]';
    }

    // If capture disabled, return placeholder
    if (!config.capture_input_values) {
        return '[DISABLED]';
    }

    return element.value;
}

function handle_input(event: Event): void {
    if (!is_capturing) return;
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target) return;

    const info = get_target_info(target);
    const value = get_input_value(target);

    send_event('dom_change', {
        action: 'input',
        target_selector: info.selector,
        target_tag: info.tag,
        value
    } as DomChangeData);
}

function handle_change(event: Event): void {
    if (!is_capturing) return;
    const target = event.target as HTMLSelectElement | HTMLInputElement;
    if (!target) return;

    const info = get_target_info(target);
    const value = get_input_value(target);

    send_event('dom_change', {
        action: 'change',
        target_selector: info.selector,
        target_tag: info.tag,
        value
    } as DomChangeData);
}

function handle_focus(event: FocusEvent): void {
    if (!is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;

    const info = get_target_info(target);

    send_event('dom_change', {
        action: 'focus',
        target_selector: info.selector,
        target_tag: info.tag,
        value: ''
    } as DomChangeData);
}

function handle_blur(event: FocusEvent): void {
    if (!is_capturing) return;
    const target = event.target as HTMLElement;
    if (!target) return;

    const info = get_target_info(target);

    send_event('dom_change', {
        action: 'blur',
        target_selector: info.selector,
        target_tag: info.tag,
        value: ''
    } as DomChangeData);
}
