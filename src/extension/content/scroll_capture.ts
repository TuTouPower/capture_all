// content/scroll_capture.ts
import type { CaptureEvent, ScrollEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';
import { build_xpath } from '../shared/dom_utils';

const state = create_capture_state<ScrollEventData>();
let scroll_timer: ReturnType<typeof setTimeout> | null = null;

export function start_scroll_capture(
    sender: (event: CaptureEvent, data: ScrollEventData) => void,
    params: { capture_id: string; capture_start_epoch_ms: number; tab_id: number },
): void {
    if (!state.begin(sender, params)) return;

    // B3-L1: scroll 事件不冒泡；用 capture 才能在 document 捕获嵌套滚动容器的 scroll，
    // 再按 event.target 区分滚动源（文档 vs 嵌套容器）。
    document.addEventListener('scroll', handle_scroll, { capture: true, passive: true });
}

export function stop_scroll_capture(): void {
    if (!state.end()) return;

    document.removeEventListener('scroll', handle_scroll, { capture: true });

    if (scroll_timer) {
        clearTimeout(scroll_timer);
        scroll_timer = null;
    }
}

// B3-L1: 滚动事件可能来自嵌套滚动容器（scroll 事件不冒泡，但带 capture 的监听能收到）。
// 捕获 event.target：非 document 级目标时记录滚动容器，避免坐标不变的重复噪声。
const DOCUMENT_TARGETS = new Set(['HTML', 'BODY', 'DOCUMENT']);

type ScrollSource =
    | { is_document: true }
    | { is_document: false; el: HTMLElement };

function get_scroll_source(target: EventTarget | null): ScrollSource {
    if (!(target instanceof HTMLElement) || DOCUMENT_TARGETS.has(target.tagName)) {
        return { is_document: true };
    }
    return { is_document: false, el: target };
}

function handle_scroll(event: Event): void {
    if (!state.is_capturing) return;

    if (scroll_timer) clearTimeout(scroll_timer);

    scroll_timer = setTimeout(() => {
        if (!state.is_capturing) return;

        const source = get_scroll_source(event.target);

        const event_base = create_content_event({
            capture_id: state.capture_id,
            category: 'user_action',
            type: 'scroll_event',
            relative_time_ms: get_relative_time(state.capture_start_epoch_ms),
            tab_id: state.tab_id,
            source: 'content_script',
        });

        if (source.is_document) {
            const data: ScrollEventData = {
                scroll_x: window.scrollX,
                scroll_y: window.scrollY,
                scroll_height: document.documentElement.scrollHeight,
                scroll_width: document.documentElement.scrollWidth,
                viewport_height: window.innerHeight,
                viewport_width: window.innerWidth,
                target_selector: null,
                target_xpath: null,
                is_document_scroll: true,
            };
            state.sender?.(event_base, data);
            return;
        }

        const el = source.el;
        // 嵌套滚动容器：记录容器自身滚动坐标与目标（is_document_scroll=false）
        const data: ScrollEventData = {
            scroll_x: el.scrollLeft,
            scroll_y: el.scrollTop,
            scroll_height: el.scrollHeight,
            scroll_width: el.scrollWidth,
            viewport_height: el.clientHeight,
            viewport_width: el.clientWidth,
            target_selector: build_scroll_selector(el),
            target_xpath: build_xpath(el),
            is_document_scroll: false,
        };
        state.sender?.(event_base, data);
    }, 200);
}

function build_scroll_selector(el: HTMLElement): string {
    if (el.id) return `#${el.id}`;
    if (el.className && typeof el.className === 'string') {
        const first = el.className.trim().split(/\s+/)[0];
        if (first) return `.${first}`;
    }
    return el.tagName.toLowerCase();
}
