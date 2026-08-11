// content/focus_capture.ts
import type { CaptureEvent, FocusEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';
import { build_xpath } from '../shared/dom_utils';

const FORM_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

const state = create_capture_state<FocusEventData>();
let focus_listener: ((e: FocusEvent) => void) | null = null;
let blur_listener: ((e: FocusEvent) => void) | null = null;

export function start_focus_capture(
    sender: (event: CaptureEvent, data: FocusEventData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;

    focus_listener = (e: FocusEvent) => handle_focus(e, 'focus');
    blur_listener = (e: FocusEvent) => handle_focus(e, 'blur');
    // useCapture=true so we catch focus/blur which don't bubble
    document.addEventListener('focus', focus_listener, true);
    document.addEventListener('blur', blur_listener, true);
}

export function stop_focus_capture(): void {
    if (!state.end()) return;

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
    if (!state.is_capturing) return;

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
        capture_id: state.capture_id,
        category: 'user_action',
        type: 'focus_event',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        source: 'content_script',
    });

    state.sender?.(event, data);
}
