// shared/message_contract.ts
// 三端（popup / dashboard / devtools）与 Service Worker 之间 chrome.runtime.sendMessage 的消息契约。
//
// 请求统一 { action, payload? }，响应统一 { success, data?, error? }。
// UI 侧一律经 send_ui_message 类型化收发，不直接裸调 chrome.runtime.sendMessage。
// 内容脚本的内部消息（event / app_log_batch）保持扁平（非 { action, payload }），不走本契约；
// content→SW 的 get_status 请求响应同样遵循 { success, data }，由 content_script 解包 data。
import type { CaptureConfig, CaptureRecord } from './types';

/** UI 可发送的 action 清单。SW 的 handle_message case 必须覆盖全部（sw_action_contract 测试门禁）。 */
export const UI_ACTIONS = [
    'start',
    'stop',
    'get_status',
    'get_capture_data',
    'list_captures',
    'delete_capture',
    'export_json',
    'export_jsonl',
    'export_html',
    'export_har',
    'flush',
    'set_log_level',
    'get_app_log_size',
    'export_app_logs',
    'clear_app_logs',
    'flush_app_logs',
    'restart_bridge',
    'test_bridge_fetch',
] as const;

export type UiAction = (typeof UI_ACTIONS)[number];

/** 各 action 的请求 payload 形状（无参 action 为空对象）。 */
export interface UiPayloadMap {
    start: { capture_id: string; config: CaptureConfig };
    stop: Record<string, never>;
    get_status: Record<string, never>;
    get_capture_data: { capture_id: string };
    list_captures: Record<string, never>;
    delete_capture: { capture_id: string };
    export_json: { capture_id: string };
    export_jsonl: { capture_id: string };
    export_html: { capture_id: string };
    export_har: { capture_id: string };
    flush: Record<string, never>;
    set_log_level: { level: string };
    get_app_log_size: Record<string, never>;
    export_app_logs: { options?: unknown };
    clear_app_logs: Record<string, never>;
    flush_app_logs: Record<string, never>;
    restart_bridge: Record<string, never>;
    test_bridge_fetch: Record<string, never>;
}

/** get_status 响应 data：状态对象（含 sender.tab.id 权威回填的 tab_id）。 */
export interface CaptureStatusData {
    is_capturing: boolean;
    capture_id: string | null;
    current_capture: CaptureRecord | null;
    config: CaptureConfig;
    start_time: number;
    tab_id: number;
    body_capture: unknown;
}

/** 各 action 的响应 data 形状。 */
export interface UiDataMap {
    start: { success: boolean };
    stop: { success: boolean };
    get_status: CaptureStatusData;
    get_capture_data: CaptureRecord;
    list_captures: CaptureRecord[];
    delete_capture: { success: boolean; error?: string };
    export_json: string;
    export_jsonl: string;
    export_html: string;
    export_har: string;
    flush: { success: boolean };
    set_log_level: { success: boolean };
    get_app_log_size: { size_bytes: number };
    export_app_logs: string;
    clear_app_logs: { success: boolean };
    flush_app_logs: { success: boolean };
    restart_bridge: { success: boolean };
    test_bridge_fetch: { success: boolean; bridge_url?: string; health?: unknown };
}

export type UiPayload<A extends UiAction> = UiPayloadMap[A];
export type UiData<A extends UiAction> = UiDataMap[A];

export interface UiRequest<A extends UiAction = UiAction> {
    action: A;
    payload?: UiPayload<A>;
}

export interface UiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

/**
 * UI 侧类型化 sendMessage：请求 { action, payload }，返回 Promise<UiResponse<T>>，消除 any 返回。
 * 非 async 包装（直接返回 sendMessage promise），避免额外微任务层改变调用方时序假设。
 * SW 不可达时 reject，由调用方 try/catch 兜底。
 */
export function send_ui_message<A extends UiAction>(
    action: A,
    payload: UiPayload<A>,
): Promise<UiResponse<UiData<A>>> {
    return chrome.runtime.sendMessage({ action, payload } satisfies UiRequest<A>) as Promise<UiResponse<UiData<A>>>;
}
