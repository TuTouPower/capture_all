// shared/id.ts — capture_id 生成
// P0.60: 统一 capture_id 格式为 <时间戳毫秒>_<随机7字符>，不再含 capture_ 前缀
// t152 AC-007: 随机段统一用 crypto.randomUUID（非 secure context fallback），消除多份 Math.random 副本。

/** 生成唯一随机后缀（小写字母数字，定长）。优先 crypto.randomUUID；旧环境回退 Math.random。 */
export function generate_unique_suffix(len = 8): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID().replace(/-/g, '').slice(0, len);
        }
    } catch {
        // ignore
    }
    let s = Math.random().toString(36).slice(2, 2 + len);
    while (s.length < len) s = '0' + s;
    return s;
}

/** 记录稳定指纹：djb2 哈希（同步、确定性），用于无 event_id/request_id 记录的 id 唯一化。 */
export function stable_fingerprint(value: unknown): string {
    let h = 5381;
    try {
        const s = JSON.stringify(value) ?? '';
        for (let i = 0; i < s.length; i++) {
            h = ((h << 5) + h + s.charCodeAt(i)) | 0;
        }
    } catch {
        // ignore
    }
    return (h >>> 0).toString(36);
}

export function generate_capture_id(): string {
    return `${Date.now()}_${generate_unique_suffix(7)}`;
}
