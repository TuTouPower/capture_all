// content/form_submit_capture.ts
import type { CaptureConfig, CaptureEvent, FormSubmitData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';
import { build_xpath } from '../shared/dom_utils';
import { redact_url } from '../../shared/redaction';

const state = create_capture_state<FormSubmitData>();
let config: CaptureConfig;
let submit_listener: ((e: Event) => void) | null = null;

export function start_form_submit_capture(
    sender: (event: CaptureEvent, data: FormSubmitData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
    new_config: CaptureConfig,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;
    config = new_config;

    submit_listener = handle_submit;
    document.addEventListener('submit', submit_listener, true);
}

export function stop_form_submit_capture(): void {
    if (!state.end()) return;

    if (submit_listener) {
        document.removeEventListener('submit', submit_listener, true);
        submit_listener = null;
    }
}

function get_target_selector(el: Element): string | null {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
        return `.${el.className.split(' ')[0]}`;
    }
    return el.tagName.toLowerCase();
}

function handle_submit(e: Event): void {
    if (!state.is_capturing) return;

    const target = e.target;
    if (!(target instanceof HTMLFormElement)) return;

    const form = target;
    const redact_q = Boolean(config.redact_data) && Boolean(config.redact_url_query);
    const action_raw = form.action || '';
    const action_redacted = action_raw ? redact_url(action_raw, redact_q).url : '';
    const data: FormSubmitData = {
        form_action: action_redacted || null,
        form_method: form.method || 'get',
        form_id: form.id || null,
        form_name: form.name || null,
        field_count: form.elements.length,
        target_selector: get_target_selector(form),
        target_xpath: build_xpath(form),
    };

    const event = create_content_event({
        capture_id: state.capture_id,
        category: 'user_action',
        type: 'form_submit',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        source: 'content_script',
    });

    state.sender?.(event, data);
}
