// content 侧共享：per-message HMAC 签名/校验（t121）。
// 安全模型：secret 由 content 每次 start 生成，内联进注入脚本闭包（不写 window），
// 页面脚本仅可读 window nonce、无法构造合法签名（普通页面；观察注入过程的对抗页面可读 secret，ADR-020 威胁模型排除）。
// 注入脚本与 content 共用同一同步 HMAC-SHA256 实现（避免 subtle 异步时序与双实现漂移），
// 正确性由 RFC 4231 测试向量锁定。

const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

// 标准 SHA-256（同步）。输入 string 或 Uint8Array，输出 hex。
export function sha256_hex(input: string | Uint8Array): string {
    const bytes: Uint8Array = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    // 补齐到 64 字节块：len | 0x80 | 0* | 64-bit 位长
    const bit_len = bytes.length * 8;
    const padded_len = (((bytes.length + 8) >> 6) + 1) << 6;
    const padded = new Uint8Array(padded_len);
    padded.set(bytes);
    padded[bytes.length] = 0x80;
    // 大端写入 64-bit 位长（JS 数字安全处理 < 2^53）
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded_len - 8, Math.floor(bit_len / 0x100000000));
    dv.setUint32(padded_len - 4, bit_len >>> 0);

    let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    const w = new Uint32Array(64);
    const dv_padded = new DataView(padded.buffer);
    for (let i = 0; i < padded_len; i += 64) {
        for (let j = 0; j < 16; j++) w[j] = dv_padded.getUint32(i + j * 4);
        for (let j = 16; j < 64; j++) {
            const s0 = rotr(w[j - 15], 7) ^ rotr(w[j - 15], 18) ^ (w[j - 15] >>> 3);
            const s1 = rotr(w[j - 2], 17) ^ rotr(w[j - 2], 19) ^ (w[j - 2] >>> 10);
            w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
        }

        let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
        for (let j = 0; j < 64; j++) {
            const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            const ch = (e & f) ^ (~e & g);
            const temp1 = (h + S1 + ch + SHA256_K[j] + w[j]) >>> 0;
            const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            const maj = (a & b) ^ (a & c) ^ (b & c);
            const temp2 = (S0 + maj) >>> 0;
            h = g; g = f; f = e; e = (d + temp1) >>> 0;
            d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
        }

        h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
        h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    return to_hex32(h0) + to_hex32(h1) + to_hex32(h2) + to_hex32(h3)
        + to_hex32(h4) + to_hex32(h5) + to_hex32(h6) + to_hex32(h7);
}

function rotr(x: number, n: number): number {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function to_hex32(v: number): string {
    return v.toString(16).padStart(8, '0');
}

function to_bytes(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

// HMAC-SHA256（同步，RFC 2104；输出 hex）。
export function hmac_sha256_hex(secret: string, message: string): string {
    const block = 64;
    let key = to_bytes(secret);
    if (key.length > block) key = hex_to_bytes(sha256_hex(key));
    const ipad = new Uint8Array(block).fill(0x36);
    const opad = new Uint8Array(block).fill(0x5c);
    for (let i = 0; i < key.length; i++) {
        ipad[i] ^= key[i];
        opad[i] ^= key[i];
    }
    const inner = new Uint8Array(ipad.length + to_bytes(message).length);
    inner.set(ipad);
    inner.set(to_bytes(message), ipad.length);
    const inner_hash = sha256_hex(inner);
    const outer = new Uint8Array(opad.length + 32);
    outer.set(opad);
    outer.set(hex_to_bytes(inner_hash), opad.length);
    return sha256_hex(outer);
}

function hex_to_bytes(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
}

// 稳定 JSON 序列化（key 递归排序），签名与校验共用同一 canonical 形式。
export function canonical_payload(data: unknown): string {
    if (data === null || typeof data !== 'object') return JSON.stringify(data);
    if (Array.isArray(data)) return `[${data.map((v) => canonical_payload(v)).join(',')}]`;
    const keys = Object.keys(data as Record<string, unknown>).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical_payload((data as Record<string, unknown>)[k])}`).join(',')}}`;
}

// 生成 per-start secret（32 字节 hex；无 getRandomValues 时 fallback）。
export function generate_secret(): string {
    try {
        if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
            const buf = new Uint8Array(32);
            crypto.getRandomValues(buf);
            return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
        }
    } catch {
        // fallthrough
    }
    let s = '';
    for (let i = 0; i < 64; i++) s += Math.floor(Math.random() * 16).toString(16);
    return s;
}

// 对排除 sig 的消息体计算签名（注入脚本用：先 canonical，再 hmac，再把 sig 加入对象）。
export function sign_payload(secret: string, payload: Record<string, unknown>): string {
    const { sig: _omit, ...rest } = payload;
    return hmac_sha256_hex(secret, canonical_payload(rest));
}

// content 侧校验：消息体（含 sig 字段）签名是否匹配。
export function verify_payload(secret: string, payload: Record<string, unknown>): boolean {
    const sig = payload.sig;
    if (typeof sig !== 'string' || sig.length === 0) return false;
    const { sig: _omit, ...rest } = payload;
    const expected = hmac_sha256_hex(secret, canonical_payload(rest));
    // 恒定时间比较（长度固定 64 hex）
    if (expected.length !== sig.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
    return diff === 0;
}

// ─── 注入脚本内联同步 HMAC-SHA256（t121） ─────────────────────────────
// 页面 MAIN world 的注入脚本无法 import 模块，须自包含同一算法。
// 实现与上方 TS 版逐函数对应，正确性由同一组测试向量锁定（防双实现漂移）。
export const SYNC_HMAC_JS = `
    function sha256_hex_str(input) {
        var bytes = typeof input === 'string' ? utf8_bytes(input) : input;
        var bit_len = bytes.length * 8;
        var padded_len = (((bytes.length + 8) >> 6) + 1) << 6;
        var padded = new Uint8Array(padded_len);
        padded.set(bytes);
        padded[bytes.length] = 0x80;
        var dv = new DataView(padded.buffer);
        dv.setUint32(padded_len - 8, Math.floor(bit_len / 0x100000000));
        dv.setUint32(padded_len - 4, bit_len >>> 0);
        var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
        var h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
        var w = new Uint32Array(64);
        var dvp = new DataView(padded.buffer);
        for (var i = 0; i < padded_len; i += 64) {
            for (var j = 0; j < 16; j++) w[j] = dvp.getUint32(i + j * 4);
            for (var j = 16; j < 64; j++) {
                var s0 = rotr32(w[j-15],7) ^ rotr32(w[j-15],18) ^ (w[j-15]>>>3);
                var s1 = rotr32(w[j-2],17) ^ rotr32(w[j-2],19) ^ (w[j-2]>>>10);
                w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
            }
            var a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,g=h6,h=h7;
            for (var j = 0; j < 64; j++) {
                var S1 = rotr32(e,6) ^ rotr32(e,11) ^ rotr32(e,25);
                var ch = (e & f) ^ (~e & g);
                var t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
                var S0 = rotr32(a,2) ^ rotr32(a,13) ^ rotr32(a,22);
                var maj = (a & b) ^ (a & c) ^ (b & c);
                var t2 = (S0 + maj) >>> 0;
                h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
            }
            h0=(h0+a)>>>0; h1=(h1+b)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0;
            h4=(h4+e)>>>0; h5=(h5+f)>>>0; h6=(h6+g)>>>0; h7=(h7+h)>>>0;
        }
        return hex32(h0)+hex32(h1)+hex32(h2)+hex32(h3)+hex32(h4)+hex32(h5)+hex32(h6)+hex32(h7);
    }
    function rotr32(x, n) { return ((x >>> n) | (x << (32 - n))) >>> 0; }
    function hex32(v) { return ('00000000' + v.toString(16)).slice(-8); }
    function utf8_bytes(s) {
        if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s);
        var out = [];
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c < 0x80) out.push(c);
            else if (c < 0x800) { out.push(0xc0 | (c >> 6), 0x80 | (c & 63)); }
            else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < s.length) {
                var c2 = s.charCodeAt(i + 1);
                var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
                out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
                i++;
            } else { out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63)); }
        }
        return new Uint8Array(out);
    }
    function hex_to_bytes_str(hex) {
        var out = new Uint8Array(hex.length / 2);
        for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        return out;
    }
    function hmac_sha256_str(secret, message) {
        var key = utf8_bytes(secret);
        if (key.length > 64) key = hex_to_bytes_str(sha256_hex_str(key));
        var ipad = new Uint8Array(64); ipad.fill(0x36);
        var opad = new Uint8Array(64); opad.fill(0x5c);
        for (var i = 0; i < key.length; i++) { ipad[i] ^= key[i]; opad[i] ^= key[i]; }
        var inner = new Uint8Array(ipad.length + utf8_bytes(message).length);
        inner.set(ipad); inner.set(utf8_bytes(message), ipad.length);
        var inner_hash = sha256_hex_str(inner);
        var outer = new Uint8Array(opad.length + 32);
        outer.set(opad); outer.set(hex_to_bytes_str(inner_hash), opad.length);
        return sha256_hex_str(outer);
    }
    function canonical_str(data) {
        if (data === null || typeof data !== 'object') return JSON.stringify(data);
        if (Array.isArray(data)) return '[' + data.map(canonical_str).join(',') + ']';
        var keys = Object.keys(data).sort();
        var parts = [];
        for (var i = 0; i < keys.length; i++) parts.push(JSON.stringify(keys[i]) + ':' + canonical_str(data[keys[i]]));
        return '{' + parts.join(',') + '}';
    }
    function sign_str(secret, payload) {
        return hmac_sha256_str(secret, canonical_str(payload));
    }
`;
