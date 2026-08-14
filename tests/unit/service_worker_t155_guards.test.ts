// tests/unit/service_worker_t155_guards.test.ts
// t155 源码级回归防御：service_worker 的并行 start、generation 守卫、test_bridge_fetch 校验。
// service_worker.ts 顶层注册 chrome 事件，无法直接 import，用静态源码扫描断言。

import { describe, expect, it } from 'vitest';

async function read_sw_source(): Promise<string> {
    const fs = await import('fs');
    const path = await import('path');
    return fs.readFileSync(
        path.resolve(__dirname, '..', '..', 'src', 'extension', 'background', 'service_worker.ts'),
        'utf8',
    );
}

describe('t155 service_worker guards', () => {
    it('B2-M6: start 对全部 tab 并行通知（Promise.all）', async () => {
        const src = await read_sw_source();
        expect(src).toMatch(/notify_tabs_in_parallel\(capturable_tabs/);
    });

    it('B2-M12: handle_event 含 generation 守卫（await 后校验再写 stats）', async () => {
        const src = await read_sw_source();
        // handle_event 内：write_events 后、stats 变更前校验 generation
        const handle_event_section = src.split(/async function handle_event/)[1] ?? '';
        expect(handle_event_section).toMatch(/const gen = capture_state\.current_generation\(\)/);
        expect(handle_event_section).toMatch(/is_active_generation\(gen\)/);
        expect(handle_event_section.indexOf('is_active_generation(gen)'))
            .toBeLessThan(handle_event_section.indexOf('increment_capture_event_stats'));
    });

    it('B2-M12: handle_network_request 含 generation 守卫', async () => {
        const src = await read_sw_source();
        const section = src.split(/async function handle_network_request/)[1] ?? '';
        expect(section).toMatch(/const gen = capture_state\.current_generation\(\)/);
        expect(section).toMatch(/is_active_generation\(gen\)/);
    });

    it('B2-M12: onCreated/onUpdated 监听含 generation 守卫', async () => {
        const src = await read_sw_source();
        const created = src.split(/onCreated\.addListener/)[1] ?? '';
        expect(created).toMatch(/const gen = capture_state\.current_generation\(\)/);
        const updated = src.split(/onUpdated\.addListener/)[1] ?? '';
        expect(updated).toMatch(/const gen = capture_state\.current_generation\(\)/);
    });

    it('B2-M5: handle_test_bridge_fetch 发起请求前走 is_allowed_local_bridge_url 校验', async () => {
        const src = await read_sw_source();
        const section = src.split(/async function handle_test_bridge_fetch/)[1] ?? '';
        expect(section).toMatch(/is_allowed_local_bridge_url\(bridge_url\)/);
        // 校验失败返回错误，不发起 fetch
        expect(section).toMatch(/Bridge URL rejected/);
    });
});
