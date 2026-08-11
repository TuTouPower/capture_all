// extension/background/cdp_handler.ts — CDP 事件生命周期处理已并入 network_capture（t119）。
// 本文件保留生产仍引用的辅助：类型、cdp_request_key、脱敏/自origin 判定、超时常量。
// 历史：事件路径（handle_cdp_event/CdpHandlerState）自 t092 起无生产调用方（仅测试直驱），
// 且与 network_capture 自建 handler 双点维护；t119 显式废弃，测试迁移至 network_capture 路径。
import type { CaptureEvent, NetworkRequestData, BodyCaptureStatus, WsFrameData } from '../../shared/types';
export interface NetworkCaptureConfig {
    redact_sensitive_headers: boolean;
    redact_url_query: boolean;
    redact_data: boolean;
    capture_request_body: boolean;
    capture_response_body: boolean;
    max_body_capture_bytes: number;
    inline_text_max_bytes: number;
}

export interface NetworkEventPayload {
    event: CaptureEvent;
    data: NetworkRequestData | WsFrameData;
}

export interface PendingRequest {
    cdp_request_id: string;
    tab_id: number;
    method: string;
    url: string;
    timestamp: number;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    resource_type: string;
    mime_type: string | null;
}

export interface CdpRequestMeta {
    url: string;
    method: string;
    status_code: number;
    resource_type: string;
    response_headers: Record<string, string>;
    request_headers: Record<string, string>;
    timestamp: number;
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    request_body_mime: string | null;
    mime_type: string | null;
    response_body?: string | null;
    response_body_status?: BodyCaptureStatus;
    stream_mode?: 'none' | 'sse' | 'chunked';
    redirect_count?: number;
    session_id?: string | null;
}

export interface CdpBodyResult {
    body: string | null;
    status: BodyCaptureStatus;
    timestamp: number;
    preview: string | null;
    encoding: 'utf8' | 'base64' | null;
    byte_size: number | null;
}

export interface WsConnectionMeta {
    url: string;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
    status_code: number;
    ws_status: 'connecting' | 'open' | 'closed' | 'error';
    created_ts: number;
}

export interface DeferredEntry {
    pending: PendingRequest;
    details: any;
    timer: ReturnType<typeof setTimeout>;
    pending_cdp_ids: Set<string>;
}


export function cdp_request_key(source: { sessionId?: string } | undefined, req_id: string): string {
    const sid = source?.sessionId;
    return sid ? `${sid}:${req_id}` : `root:${req_id}`;
}


export function base64_decoded_size(b64: string | undefined | null): number {
    if (typeof b64 !== 'string' || b64.length === 0) return 0;
    const trimmed = b64.replace(/\s/g, '');
    const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
    return Math.floor(trimmed.length * 3 / 4) - padding;
}


let _self_origin_excludes: Set<string> = new Set();

/** 设置额外需要排除的自身 origin（如 Bridge origin），格式 `scheme://host:port` */
export function set_self_origin_excludes(origins: string[]): void {
    _self_origin_excludes = new Set(origins.map((o) => {
        try { return new URL(o).origin; } catch { return o; }
    }));
}

export function is_self_origin_url(raw_url: string): boolean {
    if (!raw_url || typeof raw_url !== 'string') return false;
    // 扩展自身 origin（MV3 content/background 内部跳转）
    if (raw_url.startsWith('chrome-extension://')) return true;
    // 仅排除显式配置的 Bridge origin，不再按 hostname 笼统排除所有本地端口
    try {
        const parsed = new URL(raw_url);
        return _self_origin_excludes.has(parsed.origin);
    } catch {
        return false;
    }
}

export const ORPHAN_TIMEOUT_MS = 3000;
export const DEFERRED_TIMEOUT_MS = 1500;
