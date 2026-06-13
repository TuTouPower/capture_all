// shared/archive_builder.ts — 页面侧 ZIP 组装
import { zipSync, strToU8 } from 'fflate';
import { plan_body, safe_request_id } from './body_routing';
import { sha256_hex } from './hash';
import {
    add_absolute_system_time,
    add_capture_system_times,
} from './system_time';
import type {
    CaptureRecord,
    CaptureEvent,
    ConsoleEventData,
    NetworkRequestData,
    SystemTimeTimezone,
} from './types';

// ============================================================
// 输入类型
// ============================================================

export interface ArchiveBuildInput {
    capture: CaptureRecord;
    events: CaptureEvent[];
    network_requests: NetworkRequestData[];
    console_events: ConsoleEventData[];
}

export interface ArchiveBuildOptions {
    inline_text_max_bytes: number;
    system_time_timezone: SystemTimeTimezone;
}

interface BodyFileEntry {
    path: string;
    bytes: Uint8Array;
}

interface NetworkJsonlResult {
    line: string;
    body_files: BodyFileEntry[];
}

interface ReadmeInfo {
    capture_id: string;
    network_count: number;
    image_count: number;
    event_count: number;
}

// ============================================================
// 辅助函数
// ============================================================

function b64_to_bytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        out[i] = bin.charCodeAt(i);
    }
    return out;
}

function resolve_body(
    body: string | null,
    encoding: 'utf8' | 'base64' | null,
): Uint8Array | null {
    if (body === null) return null;
    if (encoding === 'base64') return b64_to_bytes(body);
    return strToU8(body);
}

// ============================================================
// build_network_jsonl_line — 单条网络请求 JSONL
// ============================================================

export async function build_network_jsonl_line(
    req: NetworkRequestData,
    inline_text_max_bytes: number,
): Promise<string> {
    const result = await process_single_request(req, inline_text_max_bytes);
    return result.line;
}

async function process_single_request(
    req: NetworkRequestData,
    inline_text_max_bytes: number,
): Promise<NetworkJsonlResult> {
    const body_files: BodyFileEntry[] = [];
    const safe_id = safe_request_id(req.request_id);

    // 处理 response body
    const response_plan = plan_body(
        {
            encoding: req.response_body_encoding,
            mime: req.mime_type,
            byte_size: req.response_body_bytes,
            status: req.response_body_status,
            has_body: req.response_body !== null,
        },
        inline_text_max_bytes,
    );

    let response_body: string | null = null;
    let response_body_ref: string | null = null;
    let response_body_sha256: string | null = null;

    if (response_plan.placement === 'file') {
        const bytes = resolve_body(
            req.response_body,
            req.response_body_encoding,
        );
        if (bytes) {
            const ext = response_plan.ext ?? 'bin';
            const path = `bodies/response/${safe_id}.${ext}`;
            response_body_ref = path;
            response_body_sha256 = await sha256_hex(bytes);
            body_files.push({ path, bytes });
        }
    } else if (response_plan.placement === 'inline') {
        response_body = req.response_body;
    }

    // 处理 request body
    const request_plan = plan_body(
        {
            encoding: req.request_body_encoding,
            mime: req.request_body_mime,
            byte_size: req.request_body_bytes,
            status: req.request_body_status,
            has_body: req.request_body !== null,
        },
        inline_text_max_bytes,
    );

    let request_body: string | null = null;
    let request_body_ref: string | null = null;
    let request_body_sha256: string | null = null;

    if (request_plan.placement === 'file') {
        const bytes = resolve_body(
            req.request_body,
            req.request_body_encoding,
        );
        if (bytes) {
            const ext = request_plan.ext ?? 'bin';
            const path = `bodies/request/${safe_id}.${ext}`;
            request_body_ref = path;
            request_body_sha256 = await sha256_hex(bytes);
            body_files.push({ path, bytes });
        }
    } else if (request_plan.placement === 'inline') {
        request_body = req.request_body;
    }

    const output = {
        ...req,
        response_body,
        response_body_ref,
        response_body_sha256,
        request_body,
        request_body_ref,
        request_body_sha256,
    };

    return { line: JSON.stringify(output), body_files };
}

// ============================================================
// render_readme — 生成 README.md
// ============================================================

export function render_readme(info: ReadmeInfo): string {
    return `# Capture All Archive — ${info.capture_id}

## Overview

This archive contains exported capture data.

## File Structure

- \`manifest.json\` — archive metadata
- \`README.md\` — this file
- \`network.jsonl\` — network requests
- \`events.jsonl\` — page events (user actions, navigation, storage, etc.)
- \`console.jsonl\` — console log entries
- \`bodies/inline/\` — inline body references
- \`bodies/request/\` — request body files
- \`bodies/response/\` — response body files

## Statistics

| Category   | Count |
|------------|-------|
| Network    | ${info.network_count} |
| Images     | ${info.image_count} |
| Events     | ${info.event_count} |

## Body Categories

Status values for body capture:

- \`captured\` — body content successfully captured
- \`too_large\` — body exceeded size limit, omitted
- \`not_enabled\` — body capture was not enabled for this request
- \`failed\` — body capture failed
- \`unsupported\` — content type not supported
- \`unsupported_binary\` — binary type not supported
- \`opaque_response\` — opaque response (CORS)
- \`cdp_failed\` — CDP capture failed
- \`fallback_unavailable\` — fallback capture unavailable
- \`target_not_matched\` — request did not match capture target
- \`permission_denied\` — permission denied
- \`partial\` — body partially captured
- \`redacted\` — body was redacted

## Privacy Warning

**This archive may contain sensitive data.** Handle with care:

- Cookie values may be included in event data
- Request/response headers may contain authorization tokens
- Storage changes may contain user data
- Console output may include personal information
- Body content may include PII

Do not share this archive without reviewing its contents.
`;
}

// ============================================================
// build_archive — 主入口，组装 ZIP
// ============================================================

export async function build_archive(
    input: ArchiveBuildInput,
    options: ArchiveBuildOptions,
): Promise<Uint8Array> {
    const { capture, events, network_requests, console_events } = input;
    const { inline_text_max_bytes, system_time_timezone } = options;
    const time_config = { system_time_timezone };

    // 系统时间标注
    const capture_with_times = add_capture_system_times(capture, time_config);
    const events_with_times = events.map((e) =>
        add_absolute_system_time(e, time_config),
    );
    const network_with_times = network_requests.map((r) =>
        add_absolute_system_time(r, time_config),
    );
    const console_with_times = console_events.map((c) =>
        add_absolute_system_time(c, time_config),
    );

    // 处理网络请求，收集 body 文件
    const network_lines: string[] = [];
    const all_body_files: BodyFileEntry[] = [];

    for (const req of network_with_times) {
        const result = await process_single_request(req, inline_text_max_bytes);
        network_lines.push(result.line);
        all_body_files.push(...result.body_files);
    }

    // 事件 JSONL
    const event_lines = events_with_times.map((e) => JSON.stringify(e));
    const console_lines = console_with_times.map((c) => JSON.stringify(c));

    // body 路径冲突解决（重复路径加 _2、_3 后缀）
    const used_paths = new Set<string>();
    const resolved_body_files: BodyFileEntry[] = [];

    for (const file of all_body_files) {
        let path = file.path;
        if (used_paths.has(path)) {
            const dot = path.lastIndexOf('.');
            const base = dot > 0 ? path.slice(0, dot) : path;
            const ext = dot > 0 ? path.slice(dot) : '';
            let n = 2;
            while (used_paths.has(`${base}_${n}${ext}`)) {
                n++;
            }
            path = `${base}_${n}${ext}`;
        }
        used_paths.add(path);
        resolved_body_files.push({ path, bytes: file.bytes });
    }

    // 图片计数
    const image_count = network_requests.filter(
        (r) => r.resource_type === 'image',
    ).length;

    // 统计
    const counts = {
        network: network_requests.length,
        events: events.length,
        console: console_events.length,
        images: image_count,
        body_files: resolved_body_files.length,
    };

    // manifest
    const manifest = {
        format: 'capture_all_archive',
        version: 1,
        capture_id: capture.capture_id,
        created_at: new Date().toISOString(),
        counts,
        capture: capture_with_times,
    };

    // README
    const readme = render_readme({
        capture_id: capture.capture_id,
        network_count: counts.network,
        image_count: counts.images,
        event_count: counts.events,
    });

    // 组装 ZIP 文件
    const files: Record<string, Uint8Array> = {};

    files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
    files['README.md'] = strToU8(readme);
    files['network.jsonl'] = strToU8(network_lines.join('\n'));
    files['events.jsonl'] = strToU8(event_lines.join('\n'));
    files['console.jsonl'] = strToU8(console_lines.join('\n'));

    // 空目录占位（保持结构稳定）
    files['bodies/request/.gitkeep'] = new Uint8Array(0);
    files['bodies/response/.gitkeep'] = new Uint8Array(0);
    files['bodies/inline/.gitkeep'] = new Uint8Array(0);

    // body 文件
    for (const file of resolved_body_files) {
        files[file.path] = file.bytes;
    }

    return zipSync(files);
}
