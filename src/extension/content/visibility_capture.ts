// content/visibility_capture.ts
import type { CaptureEvent, VisibilityChangeData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<VisibilityChangeData>();

export function start_visibility_capture(
    sender: (event: CaptureEvent, data: VisibilityChangeData) => void,
    new_capture_id: string,
    new_capture_start_epoch_ms: number,
    new_tab_id: number,
): void {
    if (!state.begin(sender, {
        capture_id: new_capture_id,
        capture_start_epoch_ms: new_capture_start_epoch_ms,
        tab_id: new_tab_id,
    })) return;

    document.addEventListener('visibilitychange', handle_visibility_change);
}

export function stop_visibility_capture(): void {
    if (!state.end()) return;

    document.removeEventListener('visibilitychange', handle_visibility_change);
}

function handle_visibility_change(): void {
    if (!state.is_capturing) return;

    const vis_state = document.visibilityState === 'visible' ? 'visible' : 'hidden';

    const event = create_content_event({
        capture_id: state.capture_id,
        category: 'navigation',
        type: 'visibility_change',
        relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
        tab_id: state.tab_id,
        source: 'content_script',
    });

    const data: VisibilityChangeData = {
        state: vis_state,
        url: window.location.href,
    };

    state.sender?.(event, data);
}
