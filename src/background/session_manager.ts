// background/session_manager.ts
import type { Session, RecordConfig } from '../shared/types';
import { create_session, update_session, list_sessions, delete_session, get_session, get_session_size, check_storage_limit, flush_all } from './storage';
import { start_keepalive, stop_keepalive } from './keepalive';
import { DEFAULT_CONFIG } from '../shared/constants';
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/session', get_app_log_transport());

let current_session: Session | null = null;
let monitoring_interval: ReturnType<typeof setInterval> | null = null;

export async function start_session(config: RecordConfig = DEFAULT_CONFIG): Promise<Session> {
    if (current_session) {
        throw new Error('Session already active');
    }

    const now_iso = new Date().toISOString();
    const session: Session = {
        capture_id: generate_session_id(),
        name: 'Session ' + new Date().toLocaleString(),
        status: 'capturing',
        mode: 'standard',
        started_at: now_iso,
        ended_at: null,
        duration_ms: 0,
        start_url: '',
        end_url: null,
        tab_id: 0,
        window_id: null,
        config_snapshot: config,
        stats: {
            event_count: 0,
            nav_count: 0,
            request_count: 0,
            log_count: 0,
            error_count: 0,
            storage_change_count: 0,
            cookie_change_count: 0
        },
        tags: [],
        created_at: now_iso,
        updated_at: now_iso,
    };

    await create_session(session);
    current_session = session;

    // Start keepalive
    start_keepalive();

    // Start storage monitoring
    start_storage_monitoring(session.capture_id);

    logger.info('Session started', { capture_id: session.capture_id });
    return session;
}

export async function stop_session(): Promise<Session | null> {
    if (!current_session) {
        return null;
    }

    const session = current_session;
    session.ended_at = new Date().toISOString();
    session.status = 'completed';
    session.duration_ms = new Date(session.ended_at).getTime() - new Date(session.started_at).getTime();
    session.updated_at = new Date().toISOString();

    // Stop storage monitoring
    stop_storage_monitoring();

    // Flush all data
    await flush_all();

    // Update session
    await update_session(session);

    // Stop keepalive
    stop_keepalive();

    logger.info('Session stopped', { capture_id: session.capture_id });
    current_session = null;

    return session;
}

export async function get_current_session(): Promise<Session | null> {
    return current_session;
}

export async function list_all_sessions(): Promise<Session[]> {
    return list_sessions();
}

export async function delete_session_by_id(id: string): Promise<void> {
    if (current_session?.capture_id === id) {
        await stop_session();
    }
    await delete_session(id);
}

export async function get_session_by_id(id: string): Promise<Session | null> {
    return get_session(id);
}

export function get_session_bytes(id: string): number {
    return get_session_size(id);
}

function generate_session_id(): string {
    return `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function start_storage_monitoring(session_id: string): void {
    if (monitoring_interval) {
        clearInterval(monitoring_interval);
    }

    monitoring_interval = setInterval(async () => {
        const is_over_limit = await check_storage_limit(session_id);
        if (is_over_limit) {
            logger.warn('Storage limit reached, stopping session');
            await stop_session();
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
