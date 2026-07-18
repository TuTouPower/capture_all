// tests/sw_action_contract.test.ts
// P0.46: UI action 与 SW handler 的契约测试
// 确保 UI 发送的每个 action 都被 SW 处理，防止 action 名漂移

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const sw_src = readFileSync(resolve(__dirname, '../src/extension/background/service_worker.ts'), 'utf8');
const popup_src = readFileSync(resolve(__dirname, '../src/extension/popup/popup.ts'), 'utf8');
const dashboard_src = readFileSync(resolve(__dirname, '../src/extension/dashboard/dashboard.ts'), 'utf8');

function extract_actions_from_source(src: string): Set<string> {
    const actions = new Set<string>();
    const re = /action:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        actions.add(m[1]);
    }
    return actions;
}

function extract_sw_cases(src: string): Set<string> {
    const cases = new Set<string>();
    const re = /case\s+'([^']+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) {
        cases.add(m[1]);
    }
    return cases;
}

describe('P0.46: SW action contract', () => {
    const sw_cases = extract_sw_cases(sw_src);
    const popup_actions = extract_actions_from_source(popup_src);
    const dashboard_actions = extract_actions_from_source(dashboard_src);

    const all_ui_actions = new Set([
        ...popup_actions,
        ...dashboard_actions,
    ]);

    it('every UI sendMessage action is handled by SW', () => {
        for (const action of all_ui_actions) {
            expect(sw_cases.has(action), `UI action "${action}" not found in SW handler cases`).toBe(true);
        }
    });

    it('no UI action uses get_session_data (legacy name)', () => {
        expect(all_ui_actions.has('get_session_data')).toBe(false);
    });

    it('SW get_capture_data returns only metadata, not full event data', () => {
        // Find the get_capture_data handler and verify it doesn't return events/network_requests
        const handler_match = sw_src.match(
            /case\s+'get_capture_data'[\s\S]*?return\s+([\s\S]*?);/
        );
        if (!handler_match) {
            // Handler delegates to a function — verify the function returns lean data
            const func_match = sw_src.match(
                /async function get_capture_data[\s\S]*?return\s+\{([\s\S]*?)\};/
            );
            expect(func_match).not.toBeNull();
            const return_body = func_match![1];
            // After P0.47 fix, should NOT include events, network_requests, console_logs
            expect(return_body).not.toContain('events');
            expect(return_body).not.toContain('network_requests');
            expect(return_body).not.toContain('console_logs');
            expect(return_body).toContain('success');
            expect(return_body).toContain('capture');
        }
    });

    it('SW handles all critical actions', () => {
        const required = [
            'start', 'stop', 'get_status', 'get_capture_data',
            'list_captures', 'delete_capture',
            'export_json', 'export_jsonl', 'export_html', 'export_har',
            'export_app_logs', 'clear_app_logs', 'get_app_log_size',
        ];
        for (const action of required) {
            expect(sw_cases.has(action), `Required action "${action}" missing from SW`).toBe(true);
        }
    });
});
