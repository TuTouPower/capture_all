import { describe, it, expect } from 'vitest';
import { sha256_hex } from '../src/shared/hash';

// Node < 22 may not have globalThis.crypto.subtle
if (!globalThis.crypto?.subtle) {
    const { webcrypto } = require('node:crypto');
    (globalThis as any).crypto = webcrypto;
}

describe('sha256_hex', () => {
    it('hashes empty input to known digest', async () => {
        const hex = await sha256_hex(new Uint8Array([]));
        expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });

    it('hashes "abc" to known digest', async () => {
        const hex = await sha256_hex(new TextEncoder().encode('abc'));
        expect(hex).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    });
});
