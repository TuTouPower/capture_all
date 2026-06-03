// content/keyboard_capture.ts
import type { RecordConfig, KeyboardEventData } from '../shared/types';
import { build_xpath } from '../shared/dom_utils';

let is_capturing = false;
let config: RecordConfig;
let send_event: (type: string, data: any) => void;

export function start_keyboard_capture(cfg: RecordConfig, sender: (type: string, data: any) => void): void {
    if (is_capturing) return;
    if (cfg.keyboard_capture_mode === 'none') return;

    config = cfg;
    send_event = sender;
    is_capturing = true;

    document.addEventListener('keydown', handle_keydown);
    document.addEventListener('keyup', handle_keyup);
}

export function stop_keyboard_capture(): void {
    if (!is_capturing) return;
    is_capturing = false;

    document.removeEventListener('keydown', handle_keydown);
    document.removeEventListener('keyup', handle_keyup);
}

function get_target_info(event: KeyboardEvent): { selector: string; xpath: string } {
    const target = event.target as HTMLElement;
    let selector: string;
    if (target.id) {
        selector = `#${target.id}`;
    } else if (target.className && typeof target.className === 'string') {
        selector = `.${target.className.split(' ')[0]}`;
    } else {
        selector = target.tagName.toLowerCase();
    }
    return { selector, xpath: build_xpath(target) };
}

function has_modifier(event: KeyboardEvent): boolean {
    return event.ctrlKey || event.altKey || event.metaKey || event.shiftKey;
}

function handle_keydown(event: KeyboardEvent): void {
    if (!is_capturing) return;

    // In shortcuts mode, only capture modifier combinations
    if (config.keyboard_capture_mode === 'shortcuts' && !has_modifier(event)) {
        return;
    }

    const target = get_target_info(event);
    send_event('keyboard', {
        action: 'keydown',
        key: event.key,
        code: event.code,
        target_selector: target.selector,
        target_xpath: target.xpath,
        modifiers: {
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey
        }
    } as KeyboardEventData);
}

function handle_keyup(event: KeyboardEvent): void {
    if (!is_capturing) return;

    // In shortcuts mode, only capture modifier combinations
    if (config.keyboard_capture_mode === 'shortcuts' && !has_modifier(event)) {
        return;
    }

    const target = get_target_info(event);
    send_event('keyboard', {
        action: 'keyup',
        key: event.key,
        code: event.code,
        target_selector: target.selector,
        target_xpath: target.xpath,
        modifiers: {
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            alt: event.altKey,
            meta: event.metaKey
        }
    } as KeyboardEventData);
}
