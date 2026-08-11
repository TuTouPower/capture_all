// .scratch/t114_nested_query_spike.ts
// t114 SPIKE: 验证嵌套 query 递归脱敏候选实现 — 解码深度、终止条件、10 种 outer/inner 组合
import { redact_url as current_redact_url } from '../src/shared/redaction';

const SENSITIVE = ['token', 'key', 'secret', 'password', 'passwd', 'auth', 'credential', 'jwt'];

const MAX_DEPTH = 5;

function is_sensitive_key(key: string): boolean {
    const lower = key.toLowerCase();
    return SENSITIVE.some((p) => lower.includes(p));
}

// 检测 value 中是否存在嵌套 query 形态（plain 或 percent-encoded）
// 返回嵌套起点（含 ? 的子串）或 null。encoded=true 时先解码再检测。
function find_nested_query(value: string): { nested: string; consumed_encoded: boolean } | null {
    // 直接 ? 形态
    const q = value.indexOf('?');
    if (q !== -1 && /[?&][^#&]*=[^#&]+/.test(value.slice(q))) {
        return { nested: value.slice(q), consumed_encoded: false };
    }
    // percent-encoded ? 形态（%3F ... %3D 或 %3f）
    const dec = try_decode(value);
    if (dec !== value) {
        const dq = dec.indexOf('?');
        if (dq !== -1 && /[?&][^#&]*=[^#&]+/.test(dec.slice(dq))) {
            return { nested: dec.slice(dq), consumed_encoded: true };
        }
    }
    return null;
}

function try_decode(s: string): string {
    try {
        return decodeURIComponent(s);
    } catch {
        return s;
    }
}

// 候选：递归脱敏（absolute + 手动统一处理 value 内嵌）
function candidate_redact_url(url: string, redact_query: boolean, depth = 0): { url: string; url_status: 'captured' | 'redacted' } {
    if (!redact_query) return { url, url_status: 'captured' };
    if (depth > MAX_DEPTH) return { url, url_status: 'captured' };

    try {
        const parsed = new URL(url);
        let redacted = false;
        for (const key of [...parsed.searchParams.keys()]) {
            if (is_sensitive_key(key)) {
                const values = parsed.searchParams.getAll(key);
                parsed.searchParams.delete(key);
                for (const _ of values) {
                    parsed.searchParams.append(key, '[REDACTED]');
                    redacted = true;
                }
                continue;
            }
            // 非敏感 key：value 内嵌 query 递归脱敏
            const values = parsed.searchParams.getAll(key);
            for (let i = 0; i < values.length; i++) {
                const v = values[i];
                const found = find_nested_query(v);
                if (found && !found.consumed_encoded) {
                    const nested = candidate_redact_url(found.nested, true, depth + 1);
                    if (nested.url_status === 'redacted') {
                        parsed.searchParams.delete(key);
                        const new_vals = parsed.searchParams.getAll(key);
                        // 重建：把嵌套脱敏结果替换进对应位置
                        parsed.searchParams.delete(key);
                        const vals = [...values];
                        vals[i] = v.slice(0, v.length - found.nested.length) + nested.url;
                        for (const nv of vals) parsed.searchParams.append(key, nv);
                        redacted = true;
                    }
                } else if (found && found.consumed_encoded) {
                    // encoded 形态：解码后脱敏，再编码写回
                    const dec = try_decode(v);
                    const nested = candidate_redact_url(found.nested, true, depth + 1);
                    if (nested.url_status === 'redacted') {
                        const new_val = dec.slice(0, dec.length - found.nested.length) + nested.url;
                        parsed.searchParams.delete(key);
                        const vals = [...values];
                        vals[i] = encodeURIComponent(new_val);
                        for (const nv of vals) parsed.searchParams.append(key, nv);
                        redacted = true;
                    }
                }
            }
        }
        return { url: parsed.toString(), url_status: redacted ? 'redacted' : 'captured' };
    } catch {
        // 手动分支
        const hash_marker = url.indexOf('#');
        const without_hash = hash_marker === -1 ? url : url.slice(0, hash_marker);
        const hash_part = hash_marker === -1 ? '' : url.slice(hash_marker);
        const query_marker = without_hash.indexOf('?');
        if (query_marker === -1) return { url, url_status: 'captured' };
        const path_part = without_hash.slice(0, query_marker);
        const query_part = without_hash.slice(query_marker + 1);
        const params = query_part.split('&');
        let redacted = false;
        const out_params = params.map((param) => {
            const eq = param.indexOf('=');
            const raw_key = eq === -1 ? param : param.slice(0, eq);
            const value = eq === -1 ? '' : param.slice(eq + 1);
            let key: string;
            try { key = decodeURIComponent(raw_key); } catch { key = raw_key; }
            if (is_sensitive_key(key)) {
                redacted = true;
                return `${raw_key}=[REDACTED]`;
            }
            const found = find_nested_query(value);
            if (found && !found.consumed_encoded) {
                const nested = candidate_redact_url(found.nested, true, depth + 1);
                if (nested.url_status === 'redacted') {
                    redacted = true;
                    return `${raw_key}=${value.slice(0, value.length - found.nested.length)}${nested.url}`;
                }
            } else if (found && found.consumed_encoded) {
                const dec = try_decode(value);
                const nested = candidate_redact_url(found.nested, true, depth + 1);
                if (nested.url_status === 'redacted') {
                    redacted = true;
                    const new_val = dec.slice(0, dec.length - found.nested.length) + nested.url;
                    return `${raw_key}=${encodeURIComponent(new_val)}`;
                }
            }
            return param;
        });
        return { url: `${path_part}?${out_params.join('&')}${hash_part}`, url_status: redacted ? 'redacted' : 'captured' };
    }
}

const cases = [
    { name: 'bare_query_outer_relative_nested_path', input: '?next=child?token=secret_bare', secret: 'secret_bare' },
    { name: 'relative_path_outer_relative_nested_path', input: 'outer?next=child?token=secret_relative_path', secret: 'secret_relative_path' },
    { name: 'root_relative_outer_root_relative_nested_path', input: '/outer?next=/child?token=secret_root_relative', secret: 'secret_root_relative' },
    { name: 'bare_query_outer_query_relative_nested_value', input: '?next=?token=secret_query_relative', secret: 'secret_query_relative' },
    { name: 'root_relative_outer_protocol_relative_nested_url', input: '/outer?next=//inner.example/login?token=secret_protocol_relative', secret: 'secret_protocol_relative' },
    { name: 'bare_query_outer_encoded_relative_nested_path', input: '?next=child%3Ftoken%3Dsecret_encoded_relative', secret: 'secret_encoded_relative' },
    { name: 'absolute_outer_relative_nested_path', input: 'https://outer.example/start?next=child?token=secret_absolute_relative', secret: 'secret_absolute_relative' },
    { name: 'absolute_outer_root_relative_nested_path', input: 'https://outer.example/start?next=/child?token=secret_absolute_root_relative', secret: 'secret_absolute_root_relative' },
    { name: 'absolute_outer_encoded_relative_nested_path', input: 'https://outer.example/start?next=child%3Ftoken%3Dsecret_absolute_encoded_relative', secret: 'secret_absolute_encoded_relative' },
    { name: 'absolute_outer_absolute_nested_url', input: 'https://outer.example/start?next=https://inner.example/login?token=secret_absolute_nested', secret: 'secret_absolute_nested' },
    // 双编码（%253F）：不应被误处理（decode 一次仍是 %3F，不触发）
    { name: 'double_encoded_not_matched', input: '?next=child%253Ftoken%253Dsecret_double', secret: 'secret_double', expect_leak: true },
    // 深层嵌套链终止（MAX_DEPTH 保护）
    { name: 'deep_chain_terminates', input: '?next=?next=?next=?token=secret_deep', secret: 'secret_deep' },
] as const;

let pass = 0;
let fail = 0;
for (const c of cases) {
    const out = candidate_redact_url(c.input, true);
    const leaks = out.url.includes(c.secret);
    const expect_leak = (c as any).expect_leak === true;
    const ok = leaks === expect_leak;
    if (ok) pass++; else fail++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}`);
    console.log(`  in:  ${c.input}`);
    console.log(`  out: ${out.url} (status=${out.url_status}, leak=${leaks})`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
