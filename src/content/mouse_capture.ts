// content/mouse_capture.ts
import type { RecordConfig, CaptureEvent, MouseEventData } from '../shared/types';
import { create_base_event, get_relative_time } from '../shared/event_utils';
import { truncate_target_text } from '../shared/redaction';
import { build_xpath } from '../shared/dom_utils';

let is_capturing = false;
let config: RecordConfig;
let capture_id: string;
let capture_start_epoch_ms: number;
let tab_id: number;
let send_event: (event: CaptureEvent, data: MouseEventData) => void;
let raf_id: number | null = null;
let last_mouse_time = 0;

export function start_mouse_capture(
    cfg: RecordConfig,
    cid: string,
    start_ms: number,
    tid: number,
    sender: (event: CaptureEvent, data: MouseEventData) => void
): void {
    if (is_capturing) return;

    config = cfg;
    capture_id = cid;
    capture_start_epoch_ms = start_ms;
    tab_id = tid;
    send_event = sender;
    is_capturing = true;

    document.addEventListener('click', handle_click);
    document.addEventListener('dblclick', handle_dblclick);
    document.addEventListener('contextmenu', handle_contextmenu);

    if (config.mouse_precision === 'clicks_scroll_drag' || config.mouse_precision === 'full_trajectory') {
        document.addEventListener('wheel', handle_wheel);
        document.addEventListener('dragstart', handle_dragstart);
        document.addEventListener('dragend', handle_dragend);
    }

    if (config.mouse_precision === 'full_trajectory') {
        document.addEventListener('mousemove', handle_mousemove);
    }
}

export function stop_mouse_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;

    document.removeEventListener('click', handle_click);
    document.removeEventListener('dblclick', handle_dblclick);
    document.removeEventListener('contextmenu', handle_contextmenu);
    document.removeEventListener('wheel', handle_wheel);
    document.removeEventListener('dragstart', handle_dragstart);
    document.removeEventListener('dragend', handle_dragend);
    document.removeEventListener('mousemove', handle_mousemove);

    if (raf_id) {
        cancelAnimationFrame(raf_id);
        raf_id = null;
    }
}

function get_target_info(event: MouseEvent): { selector: string | null; xpath: string | null; tag: string | null; text: string | null } {
    const target = event.target as HTMLElement | null;
    if (!target) return { selector: null, xpath: null, tag: null, text: null };
    return {
        selector: get_selector(target),
        xpath: build_xpath(target),
        tag: target.tagName.toLowerCase(),
        text: truncate_target_text(target.textContent || '', config.redact_data),
    };
}

function get_selector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    if (element.className && typeof element.className === 'string') {
        return `.${element.className.split(' ')[0]}`;
    }
    return element.tagName.toLowerCase();
}

function build_mouse_event(
    event: MouseEvent | WheelEvent | DragEvent,
    action: MouseEventData['action'],
    target_override?: { selector: string | null; xpath: string | null; tag: string | null; text: string | null }
): void {
    const target = target_override ?? get_target_info(event as MouseEvent);

    const base_event = create_base_event({
        capture_id,
        category: 'user_action',
        type: 'mouse_event',
        relative_time_ms: get_relative_time(capture_start_epoch_ms),
        tab_id,
        url: location.href,
        source: 'content_script',
    });

    const mouse_data: MouseEventData = {
        action,
        x: event.clientX,
        y: event.clientY,
        button: event.button ?? null,
        target_selector: target.selector,
        target_xpath: target.xpath,
        target_tag: target.tag,
        target_text_preview: target.text,
        target_role: null,
        target_label: null,
        target_rect: null,
        is_trusted: null,
    };

    send_event(base_event, mouse_data);
}

function handle_click(event: MouseEvent): void {
    if (!is_capturing) return;
    build_mouse_event(event, 'click');
}

function handle_dblclick(event: MouseEvent): void {
    if (!is_capturing) return;
    build_mouse_event(event, 'dblclick');
}

function handle_contextmenu(event: MouseEvent): void {
    if (!is_capturing) return;
    build_mouse_event(event, 'contextmenu');
}

function handle_wheel(event: WheelEvent): void {
    if (!is_capturing) return;
    const el = event.target as HTMLElement;
    build_mouse_event(event, 'wheel', {
        selector: get_selector(el),
        xpath: build_xpath(el),
        tag: el.tagName.toLowerCase(),
        text: null,
    });
}

function handle_dragstart(event: DragEvent): void {
    if (!is_capturing) return;
    const el = event.target as HTMLElement;
    build_mouse_event(event, 'dragstart', {
        selector: get_selector(el),
        xpath: build_xpath(el),
        tag: el.tagName.toLowerCase(),
        text: null,
    });
}

function handle_dragend(event: DragEvent): void {
    if (!is_capturing) return;
    const el = event.target as HTMLElement;
    build_mouse_event(event, 'dragend', {
        selector: get_selector(el),
        xpath: build_xpath(el),
        tag: el.tagName.toLowerCase(),
        text: null,
    });
}

function handle_mousemove(event: MouseEvent): void {
    if (!is_capturing) return;

    const now = performance.now();
    if (now - last_mouse_time < config.sample_rate_ms) return;
    last_mouse_time = now;

    if (raf_id) cancelAnimationFrame(raf_id);

    const el = event.target as HTMLElement;
    raf_id = requestAnimationFrame(() => {
        if (!is_capturing) return;
        build_mouse_event(event, 'mousemove', {
            selector: get_selector(el),
            xpath: build_xpath(el),
            tag: el.tagName.toLowerCase(),
            text: null,
        });
    });
}
