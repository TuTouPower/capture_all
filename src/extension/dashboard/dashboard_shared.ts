// dashboard/dashboard_shared.ts — t186: 拆分后的 façade 与 router 接线。
// 职责分离：dashboard_state.ts（显式状态 + factory/reset）、dashboard_data.ts（load/export）、
// dashboard_format.ts（纯函数）。本文件保留 re-export（消费方 import 不变）与 router。
export * from './dashboard_state';
export * from './dashboard_format';
export * from './dashboard_data';

// ── router（t186: 显式接线——未接线调用抛明确错误，不再静默 no-op） ─────
export interface DashboardRouter {
    go: (page: string) => void;
    render_content: () => void;
    render_shell: () => void;
    open_detail: (id: string) => void;
    is_tl_dragging: () => boolean;
}

let _router: DashboardRouter | null = null;

/** t186 AC-002: 一次性接线（dashboard.ts 入口初始化时调用；重复调用覆盖）。 */
export function wire_dashboard_router(r: DashboardRouter): void {
    _router = r;
}

function require_router(): DashboardRouter {
    if (!_router) {
        throw new Error('dashboard router not wired: call wire_dashboard_router() at entry before rendering');
    }
    return _router;
}

export const router = {
    go: (page: string) => require_router().go(page),
    render_content: () => require_router().render_content(),
    render_shell: () => require_router().render_shell(),
    open_detail: (id: string) => require_router().open_detail(id),
    is_tl_dragging: () => require_router().is_tl_dragging(),
};
