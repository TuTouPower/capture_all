// background/external_cdp_bridge_client.ts
// Client for external CDP bridge — fetches CDP body events from the bridge server.

import type { BodyCaptureStatus } from '../../shared/types';

export interface ExternalCdpBridgeConfig {
    bridge_url: string;
    bridge_token: string;
    cdp_ports: number[];
}

// T052: 仅允许 http(s)://127.0.0.1 或 http(s)://localhost 的 Bridge URL
// 防止配置错误/篡改时 token、tab URL、CDP 控制请求泄漏到远端
export function is_allowed_bridge_url(raw_url: string): { ok: boolean; reason?: string } {
    let parsed: URL;
    try {
        parsed = new URL(raw_url);
    } catch {
        return { ok: false, reason: 'invalid URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, reason: 'scheme must be http/https' };
    }
    const host = parsed.hostname;
    // 仅允许 127.0.0.1、localhost、[::1]
    if (host !== '127.0.0.1' && host !== 'localhost' && host !== '[::1]') {
        return { ok: false, reason: 'host must be 127.0.0.1 / localhost / [::1]' };
    }
    if (parsed.username || parsed.password) {
        return { ok: false, reason: 'credentials in URL not allowed' };
    }
    if (parsed.hash) {
        return { ok: false, reason: 'fragment not allowed' };
    }
    if (parsed.pathname !== '/' && parsed.pathname !== '') {
        return { ok: false, reason: 'path not allowed (use root)' };
    }
    return { ok: true };
}

// 验证 Bridge URL，无效时抛错；返回规范化的 base URL（去 query/hash/cred）
function validate_bridge_url(raw_url: string): string {
    const check = is_allowed_bridge_url(raw_url);
    if (!check.ok) {
        throw new Error(`Bridge URL rejected: ${check.reason}`);
    }
    // 返回 origin（scheme://host:port），不带 path/query/hash
    const parsed = new URL(raw_url);
    return parsed.origin;
}

export interface BridgeBodyEvent {
    request_id: string;
    tab_id: number;
    url: string;
    method: string;
    status_code: number;
    timestamp: number;
    resource_type: string;
    response_body: string | null;
    response_body_status: BodyCaptureStatus;
    request_body: string | null;
    request_body_status: BodyCaptureStatus;
    request_headers: Record<string, string>;
    response_headers: Record<string, string>;
}

export interface BridgeDetectResult {
    success: boolean;
    cdp_port?: number;
    target_count?: number;
    targets?: Array<{ id: string; url: string; title: string }>;
    error?: string;
}

const DEFAULT_CDP_PORTS = [9222, 9223, 9224, 9225, 9333];
const DETECT_TIMEOUT_MS = 3000;

export async function detect_external_cdp(
    config: ExternalCdpBridgeConfig
): Promise<BridgeDetectResult> {
    const base = validate_bridge_url(config.bridge_url);
    const ports = config.cdp_ports.length > 0 ? config.cdp_ports : DEFAULT_CDP_PORTS;

    for (const port of ports) {
        try {
            const res = await fetch(`${base}/cdp/detect`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.bridge_token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ port }),
                signal: AbortSignal.timeout(DETECT_TIMEOUT_MS)
            });

            if (res.ok) {
                const data = await res.json();
                return {
                    success: true,
                    cdp_port: port,
                    target_count: data.target_count,
                    targets: data.targets
                };
            }
        } catch {
            // try next port
        }
    }

    return { success: false, error: 'cdp_port_not_found' };
}

export async function start_external_cdp(
    config: ExternalCdpBridgeConfig,
    cdp_port: number,
    session_id: string,
    tab_url: string,
    redact_data: boolean,
    max_body_capture_bytes: number,
    redact_sensitive_headers: boolean = true,
    redact_url_query: boolean = true,
): Promise<{ success: boolean; error?: string; session_key?: string }> {
    const base = validate_bridge_url(config.bridge_url);
    try {
        const res = await fetch(`${base}/cdp/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.bridge_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                port: cdp_port,
                session_id,
                tab_url,
                redact_data,
                redact_sensitive_headers,
                redact_url_query,
                max_body_capture_bytes
            }),
            signal: AbortSignal.timeout(10000)
        });

        const data = await res.json();
        if (res.ok && data.ok) {
            return { success: true, session_key: data.session_key };
        }
        return { success: false, error: data.error?.code || 'cdp_start_failed' };
    } catch (e) {
        return { success: false, error: 'bridge_unavailable' };
    }
}

export async function poll_external_cdp_events(
    config: ExternalCdpBridgeConfig,
    session_key: string
): Promise<BridgeBodyEvent[]> {
    const base = validate_bridge_url(config.bridge_url);
    try {
        const res = await fetch(
            `${base}/cdp/events?session_key=${encodeURIComponent(session_key)}`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${config.bridge_token}` },
                signal: AbortSignal.timeout(5000)
            }
        );

        if (!res.ok) return [];
        const data = await res.json();
        return data.events || [];
    } catch {
        return [];
    }
}

export async function stop_external_cdp(
    config: ExternalCdpBridgeConfig,
    session_key: string
): Promise<void> {
    const base = validate_bridge_url(config.bridge_url);
    try {
        await fetch(`${base}/cdp/stop`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.bridge_token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ session_key }),
            signal: AbortSignal.timeout(5000)
        });
    } catch {
        // best-effort
    }
}
