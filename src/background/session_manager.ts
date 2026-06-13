// background/capture_manager.ts
import type { CaptureRecord, CaptureConfig } from '../shared/types';
import { create_capture, update_capture, list_captures, delete_capture, get_capture, get_capture_size, check_storage_limit, flush_all } from './storage';
import { start_keepalive, stop_keepalive } from './keepalive';
import { DEFAULT_CONFIG } from '../shared/constants';
import { create_empty_capture_stats } from '../shared/capture_stats';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/capture', get_app_log_transport());

let current_capture: CaptureRecord | null = null;
let monitoring_interval: ReturnType<typeof setInterval> | null = null;

export async function start_capture(config: CaptureConfig = DEFAULT_CONFIG): Promise<CaptureRecord> {
    if (current_capture) {
        throw new Error('Capture already active');
    }

    const now_iso = new Date().toISOString();
    const capture: CaptureRecord = {
        capture_id: generate_capture_id(),
        name: 'Capture ' + new Date().toLocaleString(),
        status: 'capturing',
        started_at: now_iso,
        ended_at: null,
        duration_ms: 0,
        start_url: '',
        end_url: null,
        tab_id: 0,
        window_id: null,
        config_snapshot: config,
        stats: create_empty_capture_stats(),
        tags: [],
        created_at: now_iso,
        updated_at: now_iso,
    };

    await create_capture(capture);
    current_capture = capture;

    // Start keepalive
    start_keepalive();

    // Start storage monitoring
    start_storage_monitoring(capture.capture_id);

    logger.info('Capture started', { capture_id: capture.capture_id });
    return capture;
}

export async function stop_capture(): Promise<CaptureRecord | null> {
    if (!current_capture) {
        return null;
    }

    const capture = current_capture;
    capture.ended_at = new Date().toISOString();
    capture.status = 'completed';
    capture.duration_ms = new Date(capture.ended_at).getTime() - new Date(capture.started_at).getTime();
    capture.updated_at = new Date().toISOString();

    // Stop storage monitoring
    stop_storage_monitoring();

    // Flush all data
    await flush_all();

    // Update capture
    await update_capture(capture);

    // Stop keepalive
    stop_keepalive();

    logger.info('Capture stopped', { capture_id: capture.capture_id });
    current_capture = null;

    return capture;
}

export async function get_current_capture(): Promise<CaptureRecord | null> {
    return current_capture;
}

export async function list_all_captures(): Promise<CaptureRecord[]> {
    return list_captures();
}

export async function delete_capture_by_id(id: string): Promise<void> {
    if (current_capture?.capture_id === id) {
        await stop_capture();
    }
    await delete_capture(id);
}

export async function get_capture_by_id(id: string): Promise<CaptureRecord | null> {
    return get_capture(id);
}

export function get_capture_bytes(id: string): number {
    return get_capture_size(id);
}

function generate_capture_id(): string {
    return `capture_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function start_storage_monitoring(capture_id: string): void {
    if (monitoring_interval) {
        clearInterval(monitoring_interval);
    }

    monitoring_interval = setInterval(async () => {
        const is_over_limit = await check_storage_limit(capture_id);
        if (is_over_limit) {
            logger.warn('Storage limit reached, stopping capture');
            await stop_capture();
            // TODO: Notify popup
        }
    }, 5000); // Check every 5 seconds
}

function stop_storage_monitoring(): void {
    if (monitoring_interval) {
        clearInterval(monitoring_interval);
        monitoring_interval = null;
    }
}
