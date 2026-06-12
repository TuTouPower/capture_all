import { describe, expect, it } from 'vitest';
import type { BodyCaptureStatus, NetworkRequestData } from '../src/shared/types';

const valid_resource_types = new Set<NetworkRequestData['resource_type']>([
    'fetch',
    'xhr',
    'document',
    'script',
    'stylesheet',
    'image',
    'font',
    'media',
    'websocket',
    'ping',
    'other',
]);

const valid_capture_methods = new Set<NetworkRequestData['capture_method']>([
    'web_request',
    'cdp_primary',
    'extension_cdp',
    'external_cdp_bridge',
    'fallback_hook',
]);

const valid_body_statuses = new Set<BodyCaptureStatus>([
    'not_enabled',
    'captured',
    'failed',
    'too_large',
    'unsupported',
    'unsupported_binary',
    'opaque_response',
    'cdp_failed',
    'fallback_unavailable',
    'target_not_matched',
    'permission_denied',
    'partial',
    'redacted',
]);

const export_data = {
    capture: {
        started_at: '2026-06-13 10:00:00 UTC+8',
        ended_at: '2026-06-13 10:00:01 UTC+8',
        system_time_timezone: 'UTC+8',
    },
    network_requests: [
        {
            resource_type: 'script',
            capture_method: 'cdp_primary',
            request_body_status: 'captured',
            response_body_status: 'captured',
        },
        {
            resource_type: 'stylesheet',
            capture_method: 'web_request',
            request_body_status: 'not_enabled',
            response_body_status: 'captured',
        },
    ] satisfies Array<Pick<NetworkRequestData, 'resource_type' | 'capture_method' | 'request_body_status' | 'response_body_status'>>,
};

describe('export_integrity', () => {
    it('exports system timezone fields without UTC ISO suffixes', () => {
        expect(export_data.capture.system_time_timezone).toBeTruthy();
        expect(export_data.capture.started_at).not.toContain('Z');
        expect(export_data.capture.ended_at).not.toContain('Z');
    });

    it('exports normalized network request fields', () => {
        for (const request of export_data.network_requests) {
            expect(valid_resource_types.has(request.resource_type)).toBe(true);
            expect(request.resource_type).toBe(request.resource_type.toLowerCase());
            expect(valid_capture_methods.has(request.capture_method)).toBe(true);
            expect(valid_body_statuses.has(request.request_body_status)).toBe(true);
            expect(valid_body_statuses.has(request.response_body_status)).toBe(true);
        }
    });

    it('fails when not_enabled dominates response body capture', () => {
        const not_enabled_count = export_data.network_requests.filter(
            request => request.response_body_status === 'not_enabled'
        ).length;

        expect(not_enabled_count / export_data.network_requests.length).toBeLessThan(0.5);
    });
});
