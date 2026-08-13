// tests/unit/dashboard_shared_split.test.ts
// t186 AC-002/003/004: router 未接线抛明确错误（非静默 no-op）；state factory/reset 独立实例；
// 状态/数据/格式化职责分离到独立模块。

import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    router,
    wire_dashboard_router,
    create_dashboard_state,
    reset_dashboard_state,
    get_dt_tab,
    set_dt_tab,
} from '../../src/extension/dashboard/dashboard_shared';

const root = resolve(__dirname, '..', '..');

describe('t186 AC-002: router 未接线抛明确错误', () => {
    it('未 wire 时 router.go 抛错（不再静默 no-op）', () => {
        expect(() => router.go('captures')).toThrow(/router not wired/);
    });

    it('未 wire 时 router.render_content / is_tl_dragging 抛错', () => {
        expect(() => router.render_content()).toThrow(/router not wired/);
        expect(() => router.is_tl_dragging()).toThrow(/router not wired/);
    });

    it('wire 后调用转发到注入的 callbacks', () => {
        const go = vi.fn();
        const render_content = vi.fn();
        wire_dashboard_router({ go, render_content, render_shell: vi.fn(), open_detail: vi.fn(), is_tl_dragging: vi.fn(() => true) });
        router.go('detail');
        router.render_content();
        expect(go).toHaveBeenCalledWith('detail');
        expect(render_content).toHaveBeenCalled();
    });
});

describe('t186 AC-003: state factory/reset 独立实例', () => {
    it('create_dashboard_state 返回独立实例（互不影响）', () => {
        const a = create_dashboard_state();
        const b = create_dashboard_state();
        expect(a).not.toBe(b);
        expect(a.captures).not.toBe(b.captures);
        a.page = 'detail';
        expect(b.page).toBe('captures');
    });

    it('reset_dashboard_state 恢复初始值', () => {
        const s = create_dashboard_state();
        s.page = 'detail';
        s.captures.push({} as never);
        reset_dashboard_state(s);
        expect(s.page).toBe('captures');
        expect(s.captures.length).toBe(0);
        expect(s.selected).toBeInstanceOf(Set);
    });

    it('模块默认实例 getter/setter 仍工作（消费方零改动）', () => {
        set_dt_tab('overview');
        expect(get_dt_tab()).toBe('overview');
        set_dt_tab('timeline');
    });
});

describe('t186 AC-004: 状态/数据/格式化职责分离', () => {
    it('三个模块存在且 dashboard_shared 为 façade（无实现）', () => {
        for (const f of ['dashboard_state.ts', 'dashboard_data.ts', 'dashboard_format.ts']) {
            expect(readFileSync(resolve(root, 'src/extension/dashboard', f), 'utf8').length).toBeGreaterThan(100);
        }
        const shared_src = readFileSync(resolve(root, 'src/extension/dashboard/dashboard_shared.ts'), 'utf8');
        expect(shared_src).toMatch(/export \* from '\.\/dashboard_state'/);
        expect(shared_src).toMatch(/export \* from '\.\/dashboard_data'/);
        expect(shared_src).toMatch(/export \* from '\.\/dashboard_format'/);
        // façade 不再承载实现（无 export_capture/load_detail 定义）
        expect(shared_src).not.toMatch(/export async function export_capture/);
        expect(shared_src).not.toMatch(/export async function load_detail/);
    });

    it('state 模块无数据服务（send_ui_message）；data 模块无渲染/格式化', () => {
        const state_src = readFileSync(resolve(root, 'src/extension/dashboard/dashboard_state.ts'), 'utf8');
        expect(state_src).not.toMatch(/send_ui_message/);
        const data_src = readFileSync(resolve(root, 'src/extension/dashboard/dashboard_data.ts'), 'utf8');
        expect(data_src).not.toMatch(/render_|innerHTML/);
        // format 模块为纯函数（无模块级可变状态 let）
        const format_src = readFileSync(resolve(root, 'src/extension/dashboard/dashboard_format.ts'), 'utf8');
        expect(format_src).not.toMatch(/^let |^const _/);
    });
});
