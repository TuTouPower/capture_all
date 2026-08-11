// tests/unit/archive_body_ref_consistency.test.ts
// 验证 archive body 去重改名后 JSONL body_ref 指向最终文件（P1-12）
import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';
import { build_archive } from '../../src/extension/shared/archive_builder';
import { unzipSync } from 'fflate';

function make_capture(): any {
    return {
        capture_id: 'cap_archive',
        name: 'c',
        status: 'completed',
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
        duration_ms: 1000,
        start_url: 'https://a.com',
        end_url: null,
        tab_id: 1,
        window_id: 1,
        config_snapshot: {},
        stats: { user_actions: 0, requests: 2, errors: 0 },
        tags: [],
        url: 'https://a.com',
        tab_title: '',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };
}

function make_req(request_id: string, body: string): any {
    return {
        capture_id: 'cap_archive',
        event_id: `e_${request_id}`,
        request_id,
        method: 'GET',
        url: `https://a.com/${request_id}`,
        url_status: 'captured',
        status_code: 200,
        status_text: null,
        protocol: null,
        resource_type: 'xhr',
        initiator: null,
        duration_ms: null,
        start_time_ms: null,
        end_time_ms: null,
        request_headers: {},
        response_headers: {},
        headers_status: 'captured',
        request_body: null,
        request_body_status: 'not_enabled',
        request_body_encoding: null,
        request_body_bytes: null,
        request_body_mime: null,
        response_body: body,
        response_body_status: 'captured',
        response_body_encoding: 'utf8',
        response_body_bytes: new TextEncoder().encode(body).length,
        mime_type: 'application/json',
        request_size_bytes: null,
        response_size_bytes: null,
        transfer_size_bytes: null,
        from_cache: null,
        cache_status: null,
        error_text: null,
        capture_method: 'cdp_primary',
        body_capture_mode: 'extension_cdp',
    };
}

describe('archive body_ref 一致性 (T109)', () => {
    it('AC-001: 相同 body 触发去重改名时，JSONL 两条 body_ref 均指向保留文件', async () => {
        const same_body = 'x'.repeat(200);
        // 两个不同 request_id 但 body 相同 → 路径冲突 → 后者加 _2
        const archive = await build_archive({
            capture: make_capture(),
            events: [],
            network_requests: [
                make_req('req_dup', same_body),
                make_req('req_dup', same_body),
            ],
            console_events: [],
        }, { inline_text_max_bytes: 100, system_time_timezone: 'UTC+8' });

        const files = unzipSync(archive);
        const network_jsonl = new TextDecoder().decode(files['network.jsonl']);
        const body_entries = Object.entries(files).filter(([p]) => p.startsWith('bodies/response/') && !p.endsWith('.gitkeep'));

        // 两个 body 文件（去重后路径不同）
        expect(body_entries.length).toBe(2);
        const paths = body_entries.map(([p]) => p).sort();
        expect(paths[0]).toContain('bodies/response/');
        expect(paths[1]).toContain('_2');

        // JSONL 每行 body_ref 指向存在的文件，且去重后指向各自保留文件（含 _2）
        const refs: string[] = [];
        for (const line of network_jsonl.trim().split('\n')) {
            const parsed = JSON.parse(line);
            expect(files[parsed.response_body_ref]).toBeDefined();
            refs.push(parsed.response_body_ref);
        }
        expect(refs.length).toBe(2);
        expect(refs).toEqual(expect.arrayContaining(['bodies/response/req_dup.json']));
        expect(refs.some((r) => r.includes('_2'))).toBe(true);
    });

    it('AC-002: 不存在 JSONL 引用旧名且归档内无此文件的条目', async () => {
        const same_body = 'y'.repeat(200);
        const archive = await build_archive({
            capture: make_capture(),
            events: [],
            network_requests: [
                make_req('req_dup', same_body),
                make_req('req_dup', same_body),
            ],
            console_events: [],
        }, { inline_text_max_bytes: 100, system_time_timezone: 'UTC+8' });

        const files = unzipSync(archive);
        const network_jsonl = new TextDecoder().decode(files['network.jsonl']);
        const referenced = new Set<string>();
        for (const line of network_jsonl.trim().split('\n')) {
            const parsed = JSON.parse(line);
            if (parsed.response_body_ref) referenced.add(parsed.response_body_ref);
        }
        for (const ref of referenced) {
            expect(files[ref]).toBeDefined();
        }
    });
});


describe('body_ref 指向各自文件 (T109 f001)', () => {
    it('f001: 同路径冲突时不同内容 body_ref 指向各自保留文件', async () => {
        const body_a = 'A'.repeat(200);
        const body_b = 'B'.repeat(200);
        const archive = await build_archive({
            capture: make_capture(),
            events: [],
            network_requests: [
                make_req('req_dup', body_a),
                make_req('req_dup', body_b),
            ],
            console_events: [],
        }, { inline_text_max_bytes: 100, system_time_timezone: 'UTC+8' });

        const files = unzipSync(archive);
        const network_jsonl = new TextDecoder().decode(files['network.jsonl']);
        const refs: string[] = [];
        for (const line of network_jsonl.trim().split('\n')) {
            const parsed = JSON.parse(line);
            refs.push(parsed.response_body_ref);
        }
        // 首条指向原始文件（存 A），第二条指向 _2（存 B）
        const first_bytes = new TextDecoder().decode(files[refs[0]]);
        const second_bytes = new TextDecoder().decode(files[refs[1]]);
        expect(first_bytes).toBe(body_a);
        expect(second_bytes).toBe(body_b);
    });
});


describe('遮蔽冲突 body_ref (T109 f003)', () => {
    it('f003: req×2 + req_2 时第三条 ref 指向自身 req_2_2 文件', async () => {
        const body_a = 'A'.repeat(200);
        const body_b = 'B'.repeat(200);
        const body_c = 'C'.repeat(200);
        const archive = await build_archive({
            capture: make_capture(),
            events: [],
            network_requests: [
                make_req('req', body_a),
                make_req('req', body_b),
                make_req('req_2', body_c),
            ],
            console_events: [],
        }, { inline_text_max_bytes: 100, system_time_timezone: 'UTC+8' });

        const files = unzipSync(archive);
        const network_jsonl = new TextDecoder().decode(files['network.jsonl']);
        const refs: string[] = [];
        const contents: string[] = [];
        for (const line of network_jsonl.trim().split('\n')) {
            const parsed = JSON.parse(line);
            refs.push(parsed.response_body_ref);
            contents.push(new TextDecoder().decode(files[parsed.response_body_ref]));
        }
        expect(contents[0]).toBe(body_a);
        expect(contents[1]).toBe(body_b);
        expect(contents[2]).toBe(body_c);
    });
});
