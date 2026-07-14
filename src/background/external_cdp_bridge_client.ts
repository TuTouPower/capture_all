// background/external_cdp_bridge_client.ts
// Client for external CDP bridge — fetches CDP body events from the bridge server.

import type { BodyCaptureStatus } from '../shared/types';

export interface ExternalCdpBridgeConfig {
    bridge_url: string;
    bridge_token: string;
    cdp_ports: number[];
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
    const ports = config.cdp_ports.length > 0 ? config.cdp_ports : DEFAULT_CDP_PORTS;

    for (const port of ports) {
        try {
            const res = await fetch(`${config.bridge_url}/cdp/detect`, {
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
    try {
        const res = await fetch(`${config.bridge_url}/cdp/start`, {
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
    try {
        const res = await fetch(
            `${config.bridge_url}/cdp/events?session_key=${encodeURIComponent(session_key)}`,
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
    try {
        await fetch(`${config.bridge_url}/cdp/stop`, {
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
