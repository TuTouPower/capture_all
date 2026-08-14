// content/clipboard_capture.ts
import type { CaptureEvent, ClipboardEventData } from '../../shared/types';
import { create_content_event, get_relative_time, create_capture_state } from './content_event_utils';

const state = create_capture_state<ClipboardEventData>();

let original_write_text: ((text: string) => Promise<void>) | null = null;
let original_read_text: (() => Promise<string>) | null = null;
let copy_listener: ((e: Event) => void) | null = null;
let paste_listener: ((e: Event) => void) | null = null;

// B3-L7: 双路径（document copy/paste 事件 + navigator.clipboard 补丁）可能对同一操作双报。
// 例如页面 copy handler 内调 navigator.clipboard.writeText：copy 事件 + writeText 补丁各发一条。
// 同一 action 窗口期去重（保留先到者）。
const DEDUP_WINDOW_MS = 50;
// t195 AC-002: 去重叠加内容匹配——同 action 且同内容才视为同一操作去重；
// 窗口内不同内容的两次独立操作均产生事件（原纯时间窗丢第二条，p043）
const last_emit: Record<'write' | 'read', { ts: number; content: string | null }> = {
    write: { ts: 0, content: null },
    read: { ts: 0, content: null },
};

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
    // B3-L7: 新采集会话重置去重状态，避免上次采集的 emit 压制本次首事件
    last_emit.write = { ts: 0, content: null };
    last_emit.read = { ts: 0, content: null };

    // monkey-patch navigator.clipboard
    if (navigator?.clipboard) {
        original_write_text = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = async (text: string): Promise<void> => {
            emit_clipboard('navigator.clipboard', 'write', text);
            return original_write_text!(text);
        };

        original_read_text = navigator.clipboard.readText.bind(navigator.clipboard);
        navigator.clipboard.readText = async (): Promise<string> => {
            // t195 f003: 先读后 emit——读取抛错（权限拒绝）时不再发 clipboard_read 事件
            // （原补丁路径仅记录调用，错误时仍报 read；内容去重需真实内容，此代价必要）
            const content = await original_read_text!();
            emit_clipboard('navigator.clipboard', 'read', content);
            return content;
        };
    }

    // listen for copy/paste events (execCommand path)
    // t195 AC-002: 从 clipboardData 读内容——同操作（copy 事件 + 页面 handler writeText）
    // 内容一致可去重；不同内容的独立操作均上报
    copy_listener = (e: Event) => emit_clipboard('execCommand', 'write', read_clipboard_text(e));
    paste_listener = (e: Event) => emit_clipboard('execCommand', 'read', read_clipboard_text(e));
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

// t195 f002: clipboardData 不可读环境（如受限）返回 null——与补丁路径非空文本永不匹配，
// B3-L7 同操作双报在该环境退化双报（内容匹配方案固有边界，接受：双报无害、丢事件有损）
function read_clipboard_text(e: Event): string | null {
    try {
        const cd = (e as ClipboardEvent).clipboardData;
        const text = cd?.getData ? cd.getData('text/plain') : null;
        return typeof text === 'string' && text.length > 0 ? text : null;
    } catch {
        return null;
    }
}

function emit_clipboard(
    method: ClipboardEventData['method'],
    action: ClipboardEventData['action'],
    content: string | null = null,
): void {
    if (!state.is_capturing) return;

    const now = Date.now();
    // B3-L7 + t195 AC-002: 同一 action 窗口期内仅当内容相同才去重（防 execCommand 与
    // clipboard 补丁对同一操作的重复上报）；内容不同的独立操作均产生事件（p043）
    const prev = last_emit[action];
    if (now - prev.ts < DEDUP_WINDOW_MS && prev.content === content) return;
    last_emit[action] = { ts: now, content };

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
