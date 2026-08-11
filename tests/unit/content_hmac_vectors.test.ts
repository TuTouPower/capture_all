// tests/unit/content_hmac_vectors.test.ts
// T121 密码学实现回归锁定：TS 版（content 校验）与注入脚本 JS 版（SYNC_HMAC_JS 签名）
// 必须逐字节一致，且与标准 HMAC-SHA256 输出吻合（防双实现漂移）。
// 向量来自 RFC 4231（ASCII 字符串用例）与 node:crypto 生成的固定 ASCII 用例。
import { describe, expect, it } from 'vitest';
import {
    hmac_sha256_hex,
    canonical_payload,
    SYNC_HMAC_JS,
    verify_payload,
    sign_payload,
} from '../../src/extension/content/content_hmac';

// 在隔离作用域执行注入脚本 HMAC 定义（与 network_hook build_page_script 内联同一常量）
const js_hmac = new Function(SYNC_HMAC_JS + '; return { hmac: hmac_sha256_str, canon: canonical_str };')() as {
    hmac: (secret: string, message: string) => string;
    canon: (data: unknown) => string;
};

// node:crypto 对 ASCII key/message 的标准输出（RFC 4231 case2 + 补充用例，node 24 实测）
const RFC_CASES: Array<[string, string, string]> = [
    ['Jefe', 'what do ya want for nothing?', '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843'],
    ['key', 'The quick brown fox jumps over the lazy dog', 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'],
    ['a'.repeat(40), 'd'.repeat(50), '2d7219666d09c570fab2f8e619b43e803c9d25ccef93f12d84fb26e1e7555c8f'],
    ['secret-0123456789abcdef', '{"a":1,"b":"x"}', '8514faad8e20e04f3e44748ff552556a58d0533b8696facadb8d12710defbfcc'],
    ['', 'empty-key-empty-message', '1c1c404612846e95e36121fd6520e3a7e87eeed3a04d2658ac44138b8465082e'],
];

describe('HMAC-SHA256 双实现与标准向量', () => {
    it('TS 版符合标准 HMAC-SHA256 向量', () => {
        for (const [key, msg, expect_hex] of RFC_CASES) {
            expect(hmac_sha256_hex(key, msg)).toBe(expect_hex);
        }
    });

    it('JS 注入版（SYNC_HMAC_JS）与 TS 版逐用例一致', () => {
        for (const [key, msg] of RFC_CASES) {
            expect(js_hmac.hmac(key, msg)).toBe(hmac_sha256_hex(key, msg));
        }
    });

    it('跨块边界与长 key 分支双实现一致（SHA-256 多块 / HMAC key>64）', () => {
        // SHA-256 单块/跨块边界：55/56/57/63/64/65/112/1000 字节消息
        const messages = [55, 56, 57, 63, 64, 65, 112, 1000]
            .map((n) => 'm'.repeat(n));
        // HMAC key 边界：63/64/65/131 字节（>64 触发 key 预哈希分支）
        const keys = [63, 64, 65, 131].map((n) => 'k'.repeat(n));
        for (const key of [...keys, 'short']) {
            for (const msg of messages) {
                expect(js_hmac.hmac(key, msg)).toBe(hmac_sha256_hex(key, msg));
            }
        }
        // 中文/emoji 多字节 UTF-8 输入
        expect(js_hmac.hmac('密钥', '中文🎉消息'.repeat(20))).toBe(hmac_sha256_hex('密钥', '中文🎉消息'.repeat(20)));
    });

    it('JS 注入版 canonical 与 TS 版一致（嵌套/中文/空值）', () => {
        const samples = [
            { source: 's', url: 'https://e/x', nonce: 'n1', z: [1, 2, { b: 'c' }], a: null },
            { 中文: '值', n: 0, arr: [], empty: '', undef: undefined },
            'plain-string',
            42,
        ];
        for (const s of samples) {
            expect(js_hmac.canon(s)).toBe(canonical_payload(s));
        }
    });

    it('sign_payload 与 verify_payload 往返一致，篡改/缺失被拒', () => {
        const secret = 'vector-secret';
        const payload = { source: 'x', method: 'GET', url: 'https://a/b', status: 200 };
        const signed = { ...payload, sig: sign_payload(secret, payload) };
        expect(verify_payload(secret, signed)).toBe(true);
        expect(verify_payload(secret, { ...signed, url: 'https://evil' })).toBe(false);
        expect(verify_payload(secret, payload)).toBe(false);
        expect(verify_payload('wrong-secret', signed)).toBe(false);
    });
});
