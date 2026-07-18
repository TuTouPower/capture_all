import { describe, expect, it } from 'vitest';
import { category_for_event_type } from '../../src/shared/event_category';

describe('event_category', () => {
    it('classifies input events as user actions', () => {
        expect(category_for_event_type('input_event')).toBe('user_action');
    });

    it('classifies page load events as navigation', () => {
        expect(category_for_event_type('page_load')).toBe('navigation');
    });
});
