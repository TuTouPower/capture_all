import { describe, expect, test } from 'vitest';
import { build_export_filename } from '../shared/export_settings';

const now = new Date('2024-02-03T04:05:06.000Z');

describe('export settings', () => {
    test('builds filename from template tokens', () => {
        const filename = build_export_filename({
            export_directory: '',
            export_filename_template: 'record_all_{session_id}_{date}.{ext}'
        }, 'session_1', 'json', now);

        expect(filename).toBe('record_all_session_1_2024-02-03.json');
    });

    test('prefixes configured download subdirectory', () => {
        const filename = build_export_filename({
            export_directory: 'record-all/exports',
            export_filename_template: '{session_id}.{ext}'
        }, 'session_1', 'har', now);

        expect(filename).toBe('record-all/exports/session_1.har');
    });

    test('removes absolute and parent path segments from download paths', () => {
        const filename = build_export_filename({
            export_directory: '/safe/../exports',
            export_filename_template: '../{session_id}'
        }, 'session_1', 'html', now);

        expect(filename).toBe('safe/exports/session_1.html');
    });
});
