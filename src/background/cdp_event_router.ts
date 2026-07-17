// background/cdp_event_router.ts
// Session routing for CDP events. Supports main target + sub-targets (worker/iframe/OOPIF).
// Main target: sessionId is undefined. Sub-targets: sessionId tracked in attached_sessions.

const attached_sessions = new Set<string>();

export function register_session(session_id: string): void {
    attached_sessions.add(session_id);
}

export function unregister_session(session_id: string): void {
    attached_sessions.delete(session_id);
}

export function has_session(session_id: string): boolean {
    return attached_sessions.has(session_id);
}

export function get_attached_sessions(): ReadonlySet<string> {
    return attached_sessions;
}

export function clear_sessions(): void {
    attached_sessions.clear();
}

export function should_handle_event(
    source: { tabId?: number; sessionId?: string } | undefined,
    dbg_tab_id: number | null
): boolean {
    if (dbg_tab_id === null) return false;
    if (source?.tabId !== dbg_tab_id) return false;
    const session_id = source?.sessionId;
    if (session_id && !attached_sessions.has(session_id)) return false;
    return true;
}
