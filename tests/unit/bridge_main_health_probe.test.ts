// tests/unit/bridge_main_health_probe.test.ts
// t183 AC-003/004: main 启动判定三态——2xx 非本服务明确错误退出（非「already listening」）；
// --probe 复用同一探测逻辑（probe_bridge_health）。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { run_bridge_main, run_bridge_probe } from '../../src/bridge/main';
import { BRIDGE_SERVICE_ID } from '../../src/bridge/config';

function self_response() {
    return {
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
        json: async () => ({ ok: true, service: BRIDGE_SERVICE_ID, bridge_version: '0.1.0' }),
    };
}

function foreign_response() {
    return {
        ok: true,
        headers: { get: (name: string) => (name === 'content-type' ? 'application/json' : null) },
        json: async () => ({ ok: true }),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('t183 AC-003: main 端口占用判定', () => {
    it('healthy（本服务已运行）→ 打印 already listening，不启动新 server', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => self_response()));
        const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
        await run_bridge_main(['--port', '17831']);
        expect(stdout).toHaveBeenCalledWith(expect.stringContaining('already listening'));
        stdout.mockRestore();
    });

    it('occupied（2xx 非本服务）→ 抛出明确错误（非 already listening），入口 glue 非零退出', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => foreign_response()));
        await expect(run_bridge_main(['--port', '17831'])).rejects.toThrow(/non-capture-all/);
        // 入口 glue：main().catch → stderr + process.exit(1)（非零退出路径）
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const main_src = readFileSync(resolve(__dirname, '..', '..', 'src', 'bridge', 'main.ts'), 'utf8');
        expect(main_src).toMatch(/process\.exit\(1\)/);
    });
});

describe('t183 AC-004: SessionStart hook 复用同一探测逻辑', () => {
    it('run_bridge_probe 对任意 200 服务返回 occupied（hook 判定依据）', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => foreign_response()));
        await expect(run_bridge_probe('http://127.0.0.1:17831')).resolves.toBe('occupied');
    });

    it('run_bridge_probe 对本服务返回 healthy', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => self_response()));
        await expect(run_bridge_probe('http://127.0.0.1:17831')).resolves.toBe('healthy');
    });

    it('run_bridge_probe 对不可达返回 unreachable', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
        await expect(run_bridge_probe('http://127.0.0.1:17831')).resolves.toBe('unreachable');
    });

    it('.claude/settings.json SessionStart hook 调 bridge --probe，不再用 curl HTTP 200 独立判定', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const settings = readFileSync(resolve(__dirname, '..', '..', '.claude', 'settings.json'), 'utf8');
        const session_start = settings.split('"SessionStart"')[1] ?? '';
        expect(session_start).toMatch(/--probe/);
        expect(session_start).toMatch(/\$probe/);
        expect(session_start).toMatch(/healthy/);
        expect(session_start).toMatch(/occupied/);
        // 旧的「HTTP 200 即健康」独立判定已移除
        expect(session_start).not.toMatch(/grep -q 200/);
    });

    it('server /health 标识与 probe 识别常量同源（BRIDGE_SERVICE_ID，防漂移）', async () => {
        const { readFileSync } = await import('node:fs');
        const { resolve } = await import('node:path');
        const server_src = readFileSync(resolve(__dirname, '..', '..', 'src', 'bridge', 'server.ts'), 'utf8');
        expect(server_src).toMatch(new RegExp(`service: BRIDGE_SERVICE_ID`));
        expect(BRIDGE_SERVICE_ID).toBe('capture-all-bridge');
    });
});
