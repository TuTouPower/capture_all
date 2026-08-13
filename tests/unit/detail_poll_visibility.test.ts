// tests/unit/detail_poll_visibility.test.ts
// t160 AC-003/004: 详情轮询 visibility 暂停/恢复 + 离开详情不触发读取（静态源码扫描）
// dashboard.ts 顶层注册 chrome/dom 事件无法直接 import（见 t155 同模式），用源码断言。
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const project_root = resolve(__dirname, '..', '..');
const dashboard_source = readFileSync(resolve(project_root, 'src/extension/dashboard/dashboard.ts'), 'utf8');

describe('detail 轮询 visibility 控制', () => {
    it('AC-003: visibilitychange 进入 hidden 清理轮询 interval，恢复 visible 重建', () => {
        // 注册 visibilitychange 监听
        expect(dashboard_source).toMatch(/addEventListener\(['"]visibilitychange['"]/);
        // hidden 分支清理 interval（if (document.hidden) → stop_poll）
        expect(dashboard_source).toMatch(/if\s*\(\s*document\.hidden\s*\)\s*\{/);
        // visible 恢复分支重建 interval（else → start_poll，且 start_poll 有非 null 防重入）
        expect(dashboard_source).toMatch(/\}\s*else\s*\{\s*start_poll\(\)/);
        expect(dashboard_source).toMatch(/clearInterval\(poll_interval\)/);
        expect(dashboard_source).toMatch(/if\s*\(\s*poll_interval\s*\)\s*return/);
    });

    it('AC-004: 离开详情页（page !== detail）轮询不触发 load_detail 读取', () => {
        // detail 分支有 page 守卫
        expect(dashboard_source).toMatch(/get_page\(\) === ['"]detail['"]/);
        // 轮询 interval 引用被保存（可清理）
        expect(dashboard_source).toMatch(/let\s+poll_interval/);
    });
});
