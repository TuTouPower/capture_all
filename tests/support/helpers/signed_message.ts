// tests/support/helpers/signed_message.ts
// T121 测试 helper：构造带 per-message HMAC 签名的 content 采集消息。
// 与 content_hmac.ts 的 TS 实现同源（同 canonical + hmac），供各通道测试构造合法消息。
import { hmac_sha256_hex, canonical_payload } from '../../../src/extension/content/content_hmac';

export const TEST_SECRET = 'test-secret-0123456789abcdef';

export function sign_message<T extends Record<string, unknown>>(data: T): T & { sig: string } {
    return sign_message_with_secret(data, TEST_SECRET);
}

export function sign_message_with_secret<T extends Record<string, unknown>>(
    data: T,
    secret: string,
): T & { sig: string } {
    const sig = hmac_sha256_hex(secret, canonical_payload(data));
    return { ...data, sig };
}
