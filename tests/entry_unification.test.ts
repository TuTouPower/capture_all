import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

function source(path: string): string {
    return readFileSync(resolve(root, path), 'utf8');
}

describe('entry_unification', () => {
    it('all UI export entries use shared download_blob', () => {
        const popup = source('src/extension/popup/popup.ts');
        const dashboard_shared = source('src/extension/dashboard/dashboard_shared.ts');

        expect(popup).toMatch(/download_blob/);
        expect(dashboard_shared).toMatch(/download_blob/);
    });

    it('export filename generation stays centralized', () => {
        const export_settings = source('src/extension/shared/export_settings.ts');
        const popup = source('src/extension/popup/popup.ts');

        expect(export_settings).toMatch(/export function build_export_filename/);
        expect(popup).not.toMatch(/capture_all_\$\{.*\}\./);
    });

    it('network capture uses shared redaction helpers', () => {
        const network_capture = source('src/extension/background/network_capture.ts');

        expect(network_capture).toMatch(/from '\.\.\/\.\.\/shared\/redaction'/);
        expect(network_capture).toMatch(/redact_headers/);
        expect(network_capture).toMatch(/redact_url/);
        expect(network_capture).toMatch(/truncate_request_body/);
        expect(network_capture).toMatch(/truncate_response_body/);
    });

    it('event type category mapping stays centralized', () => {
        const event_category = source('src/shared/event_category.ts');

        expect(event_category).toMatch(/export function category_for_event_type/);
        expect(event_category).toMatch(/network_request.*return 'network'/);
        expect(event_category).toMatch(/type === 'console_event'\) return 'console'/);
    });
});
