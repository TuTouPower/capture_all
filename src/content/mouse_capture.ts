// content/mouse_capture.ts
import type { RecordConfig, MouseEventData } from '../shared/types';
import { truncate_target_text } from '../shared/redaction';
import { build_xpath } from '../shared/dom_utils';

let is_capturing = false;
let config: RecordConfig;
let send_event: (type: string, data: any) => void;
let raf_id: number | null = null;
let last_mouse_time = 0;

export function start_mouse_capture(cfg: RecordConfig, sender: (type: string, data: any) => void): void {
    if (is_capturing) return;

    config = cfg;
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

function get_target_info(event: MouseEvent): { selector: string; xpath: string; tag: string; text: string } {
    const target = event.target as HTMLElement;
    return {
        selector: get_selector(target),
        xpath: build_xpath(target),
        tag: target.tagName.toLowerCase(),
        text: truncate_target_text(target.textContent || '', config.redact_data)
    };
}

function get_selector(element: HTMLElement): string {
    if (element.id) return `#${element.id}`;
    if (element.className && typeof element.className === 'string') {
        return `.${element.className.split(' ')[0]}`;
    }
    return element.tagName.toLowerCase();
}

function handle_click(event: MouseEvent): void {
    if (!is_capturing) return;
    const target = get_target_info(event);
    send_event('mouse', {
        action: 'click',
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        target_selector: target.selector,
        target_xpath: target.xpath,
        target_tag: target.tag,
        target_text: target.text
    } as MouseEventData);
}

function handle_dblclick(event: MouseEvent): void {
    if (!is_capturing) return;
    const target = get_target_info(event);
    send_event('mouse', {
        action: 'dblclick',
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        target_selector: target.selector,
        target_xpath: target.xpath,
        target_tag: target.tag,
        target_text: target.text
    } as MouseEventData);
}

function handle_contextmenu(event: MouseEvent): void {
    if (!is_capturing) return;
    const target = get_target_info(event);
    send_event('mouse', {
        action: 'contextmenu',
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        target_selector: target.selector,
        target_xpath: target.xpath,
        target_tag: target.tag,
        target_text: target.text
    } as MouseEventData);
}

function handle_wheel(event: WheelEvent): void {
    if (!is_capturing) return;
    const el = event.target as HTMLElement;
    send_event('mouse', {
        action: 'wheel',
        x: event.clientX,
        y: event.clientY,
        button: 0,
        target_selector: get_selector(el),
        target_xpath: build_xpath(el),
        target_tag: el.tagName.toLowerCase(),
        target_text: ''
    } as MouseEventData);
}

function handle_dragstart(event: DragEvent): void {
    if (!is_capturing) return;
    const el = event.target as HTMLElement;
    send_event('mouse', {
        action: 'dragstart',
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        target_selector: get_selector(el),
        target_xpath: build_xpath(el),
        target_tag: el.tagName.toLowerCase(),
        target_text: ''
    } as MouseEventData);
}

function handle_dragend(event: DragEvent): void {
    if (!is_capturing) return;
    const el = event.target as HTMLElement;
    send_event('mouse', {
        action: 'dragend',
        x: event.clientX,
        y: event.clientY,
        button: event.button,
        target_selector: get_selector(el),
        target_xpath: build_xpath(el),
        target_tag: el.tagName.toLowerCase(),
        target_text: ''
    } as MouseEventData);
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
        send_event('mouse', {
            action: 'mousemove',
            x: event.clientX,
            y: event.clientY,
            button: 0,
            target_selector: get_selector(el),
            target_xpath: build_xpath(el),
            target_tag: el.tagName.toLowerCase(),
            target_text: ''
        } as MouseEventData);
    });
}
