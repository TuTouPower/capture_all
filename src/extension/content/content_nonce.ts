// content 侧共享：per-start nonce 生成（T097/p011 三通道收敛）。
// secure context 用 crypto.randomUUID；http 页 fallback Math.random。
export function generate_nonce(): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
    } catch {
        // ignore
    }
    return `nonce_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
