// background/session_manager.ts
import type { Session, RecordConfig } from '../shared/types';
import { create_session, update_session, list_sessions, delete_session, get_session, get_session_size, check_storage_limit, flush_all } from './storage';
import { start_keepalive, stop_keepalive } from './keepalive';
import { DEFAULT_CONFIG } from '../shared/constants';

let current_session: Session | null = null;
let monitoring_interval: ReturnType<typeof setInterval> | null = null;

export async function start_session(config: RecordConfig = DEFAULT_CONFIG): Promise<Session> {
    if (current_session) {
        throw new Error('Session already active');
    }

    const session: Session = {
        id: generate_session_id(),
        start_time: Date.now(),
        end_time: null,
        config,
        stats: {
            event_count: 0,
            request_count: 0,
            log_count: 0,
            dom_changes: 0
        }
    };

    await create_session(session);
    current_session = session;

    // Start keepalive
    start_keepalive();

    // Start storage monitoring
    start_storage_monitoring(session.id);

    console.log('Record All: Session started:', session.id);
    return session;
}

export async function stop_session(): Promise<Session | null> {
    if (!current_session) {
        return null;
    }

    const session = current_session;
    session.end_time = Date.now();

    // Stop storage monitoring
    stop_storage_monitoring();

    // Flush all data
    await flush_all();

    // Update session
    await update_session(session);

    // Stop keepalive
    stop_keepalive();

    console.log('Record All: Session stopped:', session.id);
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
    if (current_session?.id === id) {
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
            console.warn('Record All: Storage limit reached, stopping session');
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
