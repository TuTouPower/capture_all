// shared/body_routing.ts — body 路由规则

import type { BodyCaptureStatus } from './types';

export type BodyEncoding = 'base64' | 'utf8';

// ============================================================
// MIME → 扩展名
// ============================================================

const MIME_EXT_MAP: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'text/html': 'html',
    'text/css': 'css',
    'text/plain': 'txt',
    'text/xml': 'xml',
    'text/csv': 'csv',
    'application/json': 'json',
    'application/xml': 'xml',
    'application/javascript': 'js',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'application/gzip': 'gz',
    'application/wasm': 'wasm',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
    'font/ttf': 'ttf',
    'font/otf': 'otf',
};

export function ext_for_mime(mime: string | null): string {
    if (!mime) return 'bin';
    const lower = mime.toLowerCase().split(';')[0].trim();
    if (MIME_EXT_MAP[lower]) return MIME_EXT_MAP[lower];
    // +json / +xml suffix
    if (lower.endsWith('+json')) return 'json';
    if (lower.endsWith('+xml')) return 'xml';
    return 'bin';
}

// ============================================================
// 文本 / 二进制判断
// ============================================================

const TEXT_PREFIXES = ['text/'];
const TEXT_EXACT = [
    'application/json',
    'application/javascript',
    'application/x-javascript',
    'application/ecmascript',
    'application/xml',
    'image/svg+xml',
];
const TEXT_SUFFIXES = ['+json', '+xml'];

export function is_text_body(
    encoding: BodyEncoding | null,
    mime: string | null,
): boolean {
    if (encoding === 'base64') return false;
    if (!mime) return true; // 无 mime 且非 base64 → 当作文本
    const lower = mime.toLowerCase().split(';')[0].trim();
    if (TEXT_PREFIXES.some((p) => lower.startsWith(p))) return true;
    if (TEXT_EXACT.includes(lower)) return true;
    if (TEXT_SUFFIXES.some((s) => lower.endsWith(s))) return true;
    return false;
}

// ============================================================
// plan_body — 决定 body 存放位置
// ============================================================

export interface PlanBodyOpts {
    encoding: BodyEncoding | null;
    mime: string | null;
    byte_size: number | null;
    status: BodyCaptureStatus;
    has_body: boolean;
}

export interface PlanBodyResult {
    placement: 'inline' | 'file' | 'omit';
    ext: string | null;
}

export function plan_body(
    opts: PlanBodyOpts,
    inline_text_max_bytes: number,
): PlanBodyResult {
    if (opts.status === 'too_large' || !opts.has_body) {
        return { placement: 'omit', ext: null };
    }
    const text = is_text_body(opts.encoding, opts.mime);
    if (!text) {
        return { placement: 'file', ext: ext_for_mime(opts.mime) };
    }
    if ((opts.byte_size ?? 0) >= inline_text_max_bytes) {
        return { placement: 'file', ext: ext_for_mime(opts.mime) };
    }
    return { placement: 'inline', ext: null };
}

// ============================================================
// safe_request_id — 安全化 request id
// ============================================================

export function safe_request_id(
    id: string | undefined | null,
    used?: Set<string>,
): string {
    // 空字符串 / null / undefined 均视为无效 id，走 'unknown' fallback。
    // 空字符串尤其要拦截：archive 文件名不能为空。
    const safe_id_input = (typeof id === 'string' && id.length > 0) ? id : 'unknown';
    const safe = safe_id_input.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (!used) return safe;
    let candidate = safe;
    let n = 2;
    while (used.has(candidate)) {
        candidate = `${safe}_${n}`;
        n++;
    }
    return candidate;
}
