import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve_client_token } from '../../src/mcp/token_resolver';

const tmp_roots: string[] = [];

async function make_tmp(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), 'mcp-token-'));
    tmp_roots.push(path);
    return path;
}

afterEach(async () => {
    while (tmp_roots.length) {
        const p = tmp_roots.pop()!;
        await rm(p, { recursive: true, force: true }).catch(() => {});
    }
});

describe('resolve_client_token (T091 MCP token file fallback)', () => {
    it('prefers env token when present', async () => {
        const tmp = await make_tmp();
        const file = join(tmp, 'bridge_token');
        await writeFile(file, 'file_token_value', { mode: 0o600 });
        await chmod(file, 0o600);
        const result = await resolve_client_token('env_token_value', file);
        expect(result).toBe('env_token_value');
    });

    it('falls back to file when env missing', async () => {
        const tmp = await make_tmp();
        const file = join(tmp, 'bridge_token');
        await writeFile(file, 'persisted_token_value', { mode: 0o600 });
        await chmod(file, 0o600);
        const result = await resolve_client_token(undefined, file);
        expect(result).toBe('persisted_token_value');
    });

    it('returns null when env missing and file missing', async () => {
        const tmp = await make_tmp();
        const result = await resolve_client_token(undefined, join(tmp, 'does_not_exist'));
        expect(result).toBeNull();
    });

    it('returns null when env empty and file missing', async () => {
        const tmp = await make_tmp();
        const result = await resolve_client_token('', join(tmp, 'does_not_exist'));
        expect(result).toBeNull();
    });

    it('trims env token whitespace', async () => {
        const result = await resolve_client_token('  spaced_env_token  ', '/nonexistent');
        expect(result).toBe('spaced_env_token');
    });
});
