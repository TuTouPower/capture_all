// content/focus_capture.ts
import type { CaptureEvent, FocusEventData } from '../../shared/types';
import { create_content_event, get_relative_time } from './content_event_utils';
import { build_xpath } from '../../shared/dom_utils';

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

let is_capturing = false;
let capture_id = '';
let capture_start_epoch_ms = 0;
let tab_id = 0;
let send_event: (event: CaptureEvent, data: FocusEventData) => void;
let focus_listener: ((e: FocusEvent) => void) | null = null;
let blur_listener: ((e: FocusEvent) => void) | null = null;

export function start_focus_capture(
    sender: (event: CaptureEvent, data: FocusEventData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (is_capturing) return;
    send_event = sender;
    capture_id = new_capture_id;
    capture_start_epoch_ms = new_capture_start_epoch_ms;
    tab_id = new_tab_id;
    is_capturing = true;

    focus_listener = (e: FocusEvent) => handle_focus(e, 'focus');
    blur_listener = (e: FocusEvent) => handle_focus(e, 'blur');
    // useCapture=true so we catch focus/blur which don't bubble
    document.addEventListener('focus', focus_listener, true);
    document.addEventListener('blur', blur_listener, true);
}

export function stop_focus_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;

    if (focus_listener) {
        document.removeEventListener('focus', focus_listener, true);
        focus_listener = null;
    }
    if (blur_listener) {
        document.removeEventListener('blur', blur_listener, true);
        blur_listener = null;
    }
}

function get_target_selector(el: Element): string | null {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
        return `.${el.className.split(' ')[0]}`;
    }
    return el.tagName.toLowerCase();
}

function handle_focus(e: FocusEvent, action: 'focus' | 'blur'): void {
    if (!is_capturing) return;

    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    if (!FORM_TAGS.has(target.tagName)) return;

    const data: FocusEventData = {
        action,
        target_selector: get_target_selector(target),
        target_xpath: build_xpath(target),
        target_tag: target.tagName.toLowerCase(),
        target_input_type: target instanceof HTMLInputElement
            ? target.type || null
            : null,
    };

    const event = create_content_event({
        capture_id,
        category: 'user_action',
        type: 'focus_event',
        relative_time_ms: get_relative_time(capture_start_epoch_ms),
        tab_id,
        source: 'content_script',
    });

    send_event(event, data);
}
