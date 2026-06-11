// tests/tab_events.test.ts
import { describe, it, expect } from 'vitest';
import type {
    TabCreatedData,
    TabUrlChangeData,
    NavigationData
} from '../src/shared/types';

// ─── helpers ported from background/service_worker.ts and content/content_script.ts ───
// These replicate the pure logic so we can unit-test in isolation.

// Tab URL deduplication (from service_worker.ts: last_tab_urls Map)
function should_emit_url_change(
    last_tab_urls: Map<number, string>,
    tab_id: number,
    new_url: string
): boolean {
    if (!new_url) return false;
    const prev_url = last_tab_urls.get(tab_id);
    if (prev_url === new_url) return false;
    last_tab_urls.set(tab_id, new_url);
    return true;
}

// Navigation deduplication (from content_script.ts: last_url variable)
function should_emit_navigation(
    last_url_ref: { value: string },
    new_url: string
): boolean {
    if (new_url === last_url_ref.value) return false;
    return true;
}

function build_navigation_event(
    last_url_ref: { value: string },
    new_url: string
): NavigationData | null {
    if (!should_emit_navigation(last_url_ref, new_url)) return null;
    const from = last_url_ref.value;
    last_url_ref.value = new_url;
    return { from, to: new_url };
}

// Tab created event builder (from service_worker.ts)
function build_tab_created_data(
    tab: { id?: number; url?: string; pendingUrl?: string; openerTabId?: number; windowId?: number; title?: string }
): TabCreatedData {
    return {
        tab_id: tab.id ?? -1,
        url: tab.url || tab.pendingUrl || '',
        opener_tab_id: tab.openerTabId ?? null,
        window_id: tab.windowId!,
        title: tab.title || ''
    };
}

// Tab URL change event builder (from service_worker.ts)
function build_tab_url_change_data(
    tab_id: number,
    url: string,
    title: string
): TabUrlChangeData {
    return { tab_id, url, title };
}

// ─── tab_created event structure ───

describe('tab_created_event', () => {
    it('contains tab_id, url, opener_tab_id, window_id, title', () => {
        const data = build_tab_created_data({
            id: 42,
            url: 'https://example.com',
            openerTabId: 10,
            windowId: 1,
            title: 'Example'
        });
        expect(data.tab_id).toBe(42);
        expect(data.url).toBe('https://example.com');
        expect(data.opener_tab_id).toBe(10);
        expect(data.window_id).toBe(1);
        expect(data.title).toBe('Example');
    });

    it('uses -1 for missing tab id', () => {
        const data = build_tab_created_data({
            url: 'https://example.com',
            windowId: 1
        });
        expect(data.tab_id).toBe(-1);
    });

    it('uses null for missing opener_tab_id', () => {
        const data = build_tab_created_data({
            id: 5,
            url: 'https://example.com',
            windowId: 2
        });
        expect(data.opener_tab_id).toBeNull();
    });

    it('falls back to pendingUrl when url is empty', () => {
        const data = build_tab_created_data({
            id: 7,
            pendingUrl: 'chrome://newtab',
            windowId: 1
        });
        expect(data.url).toBe('chrome://newtab');
    });

    it('defaults to empty string when both url and pendingUrl are missing', () => {
        const data = build_tab_created_data({
            id: 8,
            windowId: 1
        });
        expect(data.url).toBe('');
    });

    it('defaults title to empty string', () => {
        const data = build_tab_created_data({
            id: 9,
            url: 'https://example.com',
            windowId: 1
        });
        expect(data.title).toBe('');
    });
});

// ─── tab_url_change deduplication ───

describe('tab_url_change_dedup', () => {
    it('emits event for new URL', () => {
        const urls = new Map<number, string>();
        expect(should_emit_url_change(urls, 1, 'https://a.com')).toBe(true);
        expect(urls.get(1)).toBe('https://a.com');
    });

    it('skips duplicate URL for same tab', () => {
        const urls = new Map<number, string>();
        should_emit_url_change(urls, 1, 'https://a.com');
        expect(urls.get(1)).toBe('https://a.com');
        expect(should_emit_url_change(urls, 1, 'https://a.com')).toBe(false);
        expect(urls.get(1)).toBe('https://a.com');
    });

    it('emits when URL changes to different value', () => {
        const urls = new Map<number, string>();
        should_emit_url_change(urls, 1, 'https://a.com');
        expect(should_emit_url_change(urls, 1, 'https://b.com')).toBe(true);
        expect(urls.get(1)).toBe('https://b.com');
    });

    it('tracks URLs per tab independently', () => {
        const urls = new Map<number, string>();
        should_emit_url_change(urls, 1, 'https://a.com');
        // Same URL on different tab should emit
        expect(should_emit_url_change(urls, 2, 'https://a.com')).toBe(true);
        expect(urls.get(1)).toBe('https://a.com');
        expect(urls.get(2)).toBe('https://a.com');
    });

    it('skips empty URL', () => {
        const urls = new Map<number, string>();
        expect(should_emit_url_change(urls, 1, '')).toBe(false);
        // Map should remain unchanged for empty URL
        expect(urls.has(1)).toBe(false);
    });

    it('detects hash fragment as URL change', () => {
        const urls = new Map<number, string>();
        should_emit_url_change(urls, 1, 'https://a.com/page');
        expect(should_emit_url_change(urls, 1, 'https://a.com/page#section')).toBe(true);
        expect(urls.get(1)).toBe('https://a.com/page#section');
    });

    it('detects hash removal as URL change', () => {
        const urls = new Map<number, string>();
        should_emit_url_change(urls, 1, 'https://a.com/page#section');
        expect(should_emit_url_change(urls, 1, 'https://a.com/page')).toBe(true);
        expect(urls.get(1)).toBe('https://a.com/page');
    });

    it('skips same hash fragment as duplicate', () => {
        const urls = new Map<number, string>();
        should_emit_url_change(urls, 1, 'https://a.com/page#section');
        expect(should_emit_url_change(urls, 1, 'https://a.com/page#section')).toBe(false);
        expect(urls.get(1)).toBe('https://a.com/page#section');
    });

    it('removing tab clears its dedup state', () => {
        const urls = new Map<number, string>();
        should_emit_url_change(urls, 1, 'https://a.com');
        // Simulate tab removal (service_worker calls last_tab_urls.delete(tabId))
        urls.delete(1);
        // Same URL should emit again after tab removal and recreation
        expect(should_emit_url_change(urls, 1, 'https://a.com')).toBe(true);
    });

    it('builds correct TabUrlChangeData', () => {
        const data = build_tab_url_change_data(42, 'https://new.com', 'New Page');
        expect(data).toEqual({
            tab_id: 42,
            url: 'https://new.com',
            title: 'New Page'
        });
    });
});

// ─── navigation event (popstate / hashchange) ───

describe('navigation_event', () => {
    it('contains from and to URLs', () => {
        const ref = { value: 'https://example.com/page1' };
        const event = build_navigation_event(ref, 'https://example.com/page2');
        expect(event).not.toBeNull();
        expect(event!.from).toBe('https://example.com/page1');
        expect(event!.to).toBe('https://example.com/page2');
    });

    it('deduplicates same URL (popstate fires for same URL)', () => {
        const ref = { value: 'https://example.com/page1' };
        const event = build_navigation_event(ref, 'https://example.com/page1');
        expect(event).toBeNull();
    });

    it('updates last_url after navigation', () => {
        const ref = { value: 'https://example.com/a' };
        build_navigation_event(ref, 'https://example.com/b');
        expect(ref.value).toBe('https://example.com/b');
    });

    it('handles hash change navigation', () => {
        const ref = { value: 'https://example.com#section1' };
        const event = build_navigation_event(ref, 'https://example.com#section2');
        expect(event).not.toBeNull();
        expect(event!.from).toBe('https://example.com#section1');
        expect(event!.to).toBe('https://example.com#section2');
    });

    it('handles popstate back navigation', () => {
        const ref = { value: 'https://example.com/b' };
        const event = build_navigation_event(ref, 'https://example.com/a');
        expect(event).not.toBeNull();
        expect(event!.from).toBe('https://example.com/b');
        expect(event!.to).toBe('https://example.com/a');
    });

    it('fires consecutive navigations to different URLs', () => {
        const ref = { value: 'https://example.com/a' };
        const ev1 = build_navigation_event(ref, 'https://example.com/b');
        const ev2 = build_navigation_event(ref, 'https://example.com/c');
        expect(ev1).not.toBeNull();
        expect(ev1!.to).toBe('https://example.com/b');
        expect(ev2).not.toBeNull();
        expect(ev2!.from).toBe('https://example.com/b');
        expect(ev2!.to).toBe('https://example.com/c');
    });
});
