import { describe, expect, it } from 'vitest';
import { create_base_event } from '../src/shared/event_utils';

describe('create_base_event', () => {
    const base_params = {
        capture_id: 'cap_123',
        category: 'user_action' as const,
        type: 'mouse_event' as const,
        relative_time_ms: 100,
        tab_id: 1,
        url: 'https://example.com',
        source: 'content_script' as const,
    };

    it('defaults page_title and top_frame_url to null', () => {
        const event = create_base_event(base_params);
        expect(event.page_title).toBeNull();
        expect(event.top_frame_url).toBeNull();
    });

    it('uses provided page_title', () => {
        const event = create_base_event({ ...base_params, page_title: 'My Page' });
        expect(event.page_title).toBe('My Page');
    });

    it('uses provided top_frame_url', () => {
        const event = create_base_event({ ...base_params, top_frame_url: 'https://top.com' });
        expect(event.top_frame_url).toBe('https://top.com');
    });

    it('treats explicit null as null (not fallback)', () => {
        const event = create_base_event({ ...base_params, page_title: null, top_frame_url: null });
        expect(event.page_title).toBeNull();
        expect(event.top_frame_url).toBeNull();
    });

    it('preserves all other base fields', () => {
        const event = create_base_event(base_params);
        expect(event.capture_id).toBe('cap_123');
        expect(event.category).toBe('user_action');
        expect(event.type).toBe('mouse_event');
        expect(event.url).toBe('https://example.com');
        expect(event.source).toBe('content_script');
    });
});
