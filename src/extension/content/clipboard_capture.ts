// content/clipboard_capture.ts
import type { CaptureEvent, ClipboardEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<ClipboardEventData>();

let original_write_text: ((text: string) => Promise<void>) | null = null;
let original_read_text: (() => Promise<string>) | null = null;
let copy_listener: ((e: Event) => void) | null = null;
let paste_listener: ((e: Event) => void) | null = null;

export function start_clipboard_capture(
    sender: (event: CaptureEvent, data: ClipboardEventData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;

    // monkey-patch navigator.clipboard
    if (navigator?.clipboard) {
        original_write_text = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = async (text: string): Promise<void> => {
            emit_clipboard('navigator.clipboard', 'write');
            return original_write_text!(text);
        };

        original_read_text = navigator.clipboard.readText.bind(navigator.clipboard);
        navigator.clipboard.readText = async (): Promise<string> => {
            emit_clipboard('navigator.clipboard', 'read');
            return original_read_text!();
        };
    }

    // listen for copy/paste events (execCommand path)
    copy_listener = () => emit_clipboard('execCommand', 'write');
    paste_listener = () => emit_clipboard('execCommand', 'read');
    document.addEventListener('copy', copy_listener);
    document.addEventListener('paste', paste_listener);
}

export function stop_clipboard_capture(): void {
    if (!state.end()) return;

    // restore monkey-patched methods
    if (navigator?.clipboard && original_write_text) {
        navigator.clipboard.writeText = original_write_text;
        original_write_text = null;
    }
    if (navigator?.clipboard && original_read_text) {
        navigator.clipboard.readText = original_read_text;
        original_read_text = null;
    }

    // remove event listeners
    if (copy_listener) {
        document.removeEventListener('copy', copy_listener);
        copy_listener = null;
    }
    if (paste_listener) {
        document.removeEventListener('paste', paste_listener);
        paste_listener = null;
    }
}

function emit_clipboard(
    method: ClipboardEventData['method'],
    action: ClipboardEventData['action'],
): void {
    if (!state.is_capturing) return;

    const event = create_content_event({
        capture_id: state.capture_id,
        category: 'user_action',
        type: action === 'write' ? 'clipboard_write' : 'clipboard_read',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        source: 'content_script',
    });

    const data: ClipboardEventData = { method, action };
    state.sender?.(event, data);
}
