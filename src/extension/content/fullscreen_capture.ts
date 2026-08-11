// content/fullscreen_capture.ts
import type { CaptureEvent, FullscreenChangeData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<FullscreenChangeData>();

export function start_fullscreen_capture(
    sender: (event: CaptureEvent, data: FullscreenChangeData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;
    document.addEventListener('fullscreenchange', handle_fullscreen);
}

export function stop_fullscreen_capture(): void {
    if (!state.end()) return;
    document.removeEventListener('fullscreenchange', handle_fullscreen);
}

function handle_fullscreen(): void {
    if (!state.is_capturing) return;
    const fs_element = document.fullscreenElement;
    const event = create_content_event({
        capture_id: state.capture_id,
        category: 'user_action',
        type: 'fullscreen_change',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        source: 'content_script',
    });
    const data: FullscreenChangeData = {
        action: fs_element ? 'enter' : 'exit',
        element_tag: fs_element?.tagName ?? null,
        element_id: fs_element?.id ?? null,
    };
    state.sender?.(event, data);
}
