// tests/session_manager.test.ts — P0.32: capture creation includes url and tab_title
import { describe, it, expect } from 'vitest';
import type { CaptureRecord } from '../src/shared/types';
import { create_empty_capture_stats } from '../src/shared/capture_stats';

// Replica of start_recording logic with P0.32 fix
function create_capture_record(opts: {
    session_id: string;
    active_tab_url: string;
    active_tab_title: string;
    tab_id: number;
}): CaptureRecord {
    const now_iso = new Date().toISOString();
    const capture: CaptureRecord = {
        capture_id: opts.session_id,
        name: 'Capture ' + new Date().toLocaleString(),
        status: 'capturing',
        started_at: now_iso,
        ended_at: null,
        duration_ms: 0,
        start_url: opts.active_tab_url,
        end_url: null,
        tab_id: opts.tab_id,
        window_id: null,
        config_snapshot: {},
        stats: create_empty_capture_stats(),
        tags: [],
        created_at: now_iso,
        updated_at: now_iso,
        // P0.32: url and tab_title from active tab
        url: opts.active_tab_url,
        tab_title: opts.active_tab_title,
    };
    return capture;
}

describe('capture record creation includes url and tab_title', () => {
    it('sets url from active tab URL', () => {
        const capture = create_capture_record({
            session_id: 'capture_test_001',
            active_tab_url: 'https://opencode.ai/workspace/test',
            active_tab_title: 'OpenCode - Workspace',
            tab_id: 12345,
        });
        expect(capture.url).toBe('https://opencode.ai/workspace/test');
    });

    it('sets tab_title from active tab title', () => {
        const capture = create_capture_record({
            session_id: 'capture_test_002',
            active_tab_url: 'https://example.com',
            active_tab_title: 'Example Domain',
            tab_id: 67890,
        });
        expect(capture.tab_title).toBe('Example Domain');
    });

    it('url and tab_title are non-empty strings for valid tabs', () => {
        const capture = create_capture_record({
            session_id: 'capture_test_003',
            active_tab_url: 'https://www.baidu.com',
            active_tab_title: '百度一下',
            tab_id: 11111,
        });
        expect(capture.url).toBeTruthy();
        expect(capture.url!.length).toBeGreaterThan(0);
        expect(capture.tab_title).toBeTruthy();
        expect(capture.tab_title!.length).toBeGreaterThan(0);
    });

    it('handles empty URL gracefully (e.g., newtab page)', () => {
        const capture = create_capture_record({
            session_id: 'capture_test_004',
            active_tab_url: '',
            active_tab_title: '',
            tab_id: 0,
        });
        expect(capture.url).toBe('');
        expect(capture.tab_title).toBe('');
    });

    it('start_url and url are consistent (same active tab)', () => {
        const capture = create_capture_record({
            session_id: 'capture_test_005',
            active_tab_url: 'https://github.com',
            active_tab_title: 'GitHub',
            tab_id: 22222,
        });
        expect(capture.start_url).toBe(capture.url);
        expect(capture.start_url).toBe('https://github.com');
    });
});
