// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { create_content_event } from '../src/extension/content/content_event_utils';

describe('create_content_event', () => {
    const base_params = {
        capture_id: 'cap_123',
        category: 'user_action' as const,
        type: 'mouse_event' as const,
        relative_time_ms: 100,
        tab_id: 1,
        url: 'https://example.com/page',
        source: 'content_script' as const,
    };

    beforeEach(() => {
        document.title = '';
    });

    it('fills page_title from document.title', () => {
        document.title = 'Test Page Title';
        const event = create_content_event(base_params);
        expect(event.page_title).toBe('Test Page Title');
    });

    it('sets page_title to null when document.title is empty', () => {
        document.title = '';
        const event = create_content_event(base_params);
        expect(event.page_title).toBeNull();
    });

    it('sets top_frame_url to null when window === window.top (main frame)', () => {
        // In jsdom, window === window.top by default
        const event = create_content_event(base_params);
        expect(event.top_frame_url).toBeNull();
    });

    it('preserves all other base fields', () => {
        document.title = 'Page';
        const event = create_content_event(base_params);
        expect(event.capture_id).toBe('cap_123');
        expect(event.category).toBe('user_action');
        expect(event.type).toBe('mouse_event');
        expect(event.url).toBe('https://example.com/page');
        expect(event.source).toBe('content_script');
    });
});
