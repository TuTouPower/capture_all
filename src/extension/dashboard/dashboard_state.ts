// dashboard/dashboard_state.ts — t186: Dashboard 显式状态（DashboardState + factory/reset）。
// 模块级默认实例供既有 getter/setter（消费方零改动）；测试可用 create_dashboard_state() 建独立实例。
import type { CaptureRecord, CaptureEvent, NetworkRequestData, ConsoleEventData, UserConfig } from '../../shared/types';
import { DEFAULT_USER_CONFIG } from '../../shared/constants';

export interface DashboardState {
    user_config: UserConfig;
    captures: CaptureRecord[];
    page: string;
    selected: Set<string>;
    detail_capture: CaptureRecord | null;
    detail_events: CaptureEvent[];
    detail_network: NetworkRequestData[];
    detail_console: ConsoleEventData[];
    dt_tab: string;
    dt_view: 'list' | 'trace';
    dt_quick: string;
    dt_sel: number;
    dt_insp_open: boolean;
    dt_play: number;
    dt_zoom: number;
    dt_zoom_overview: boolean;
    dt_net_sel: number;
    dt_net_insp_closed: boolean;
    cap_search: string;
    cap_status_filter: 'all' | 'capturing' | 'completed';
    // t154: 按 capture_id 记忆 detail 上次 tab/view/quick（会话内存级）
    dt_memory: Map<string, { tab: string; view: 'list' | 'trace'; quick: string }>;
}

export function create_dashboard_state(): DashboardState {
    return {
        user_config: { ...DEFAULT_USER_CONFIG } as UserConfig,
        captures: [],
        page: 'captures',
        selected: new Set<string>(),
        detail_capture: null,
        detail_events: [],
        detail_network: [],
        detail_console: [],
        dt_tab: 'timeline',
        dt_view: 'list',
        dt_quick: 'all',
        dt_sel: -1,
        dt_insp_open: false,
        dt_play: 49.5,
        dt_zoom: 50,
        dt_zoom_overview: true,
        dt_net_sel: -1,
        dt_net_insp_closed: false,
        cap_search: '',
        cap_status_filter: 'all',
        dt_memory: new Map(),
    };
}

export function reset_dashboard_state(s: DashboardState): void {
    const fresh = create_dashboard_state();
    s.user_config = fresh.user_config;
    s.captures = fresh.captures;
    s.page = fresh.page;
    s.selected = fresh.selected;
    s.detail_capture = fresh.detail_capture;
    s.detail_events = fresh.detail_events;
    s.detail_network = fresh.detail_network;
    s.detail_console = fresh.detail_console;
    s.dt_tab = fresh.dt_tab;
    s.dt_view = fresh.dt_view;
    s.dt_quick = fresh.dt_quick;
    s.dt_sel = fresh.dt_sel;
    s.dt_insp_open = fresh.dt_insp_open;
    s.dt_play = fresh.dt_play;
    s.dt_zoom = fresh.dt_zoom;
    s.dt_zoom_overview = fresh.dt_zoom_overview;
    s.dt_net_sel = fresh.dt_net_sel;
    s.dt_net_insp_closed = fresh.dt_net_insp_closed;
    s.cap_search = fresh.cap_search;
    s.cap_status_filter = fresh.cap_status_filter;
    s.dt_memory = fresh.dt_memory;
}

// ── 模块级默认实例（既有函数式 getter/setter 操作对象；消费方 import 不变） ──
const _state: DashboardState = create_dashboard_state();

export const get_user_config = () => _state.user_config;
export const set_user_config = (v: UserConfig) => { _state.user_config = v; };
export const get_captures = () => _state.captures;
export const set_captures = (v: CaptureRecord[]) => { _state.captures = v; };
export const get_page = () => _state.page;
export const set_page = (v: string) => { _state.page = v; };
export const get_selected = () => _state.selected;
export const get_detail_capture = () => _state.detail_capture;
export const set_detail_capture = (v: CaptureRecord | null) => { _state.detail_capture = v; };
export const get_detail_events = () => _state.detail_events;
export const set_detail_events = (v: CaptureEvent[]) => { _state.detail_events = v; };
export const get_detail_network = () => _state.detail_network;
export const set_detail_network = (v: NetworkRequestData[]) => { _state.detail_network = v; };
export const get_detail_console = () => _state.detail_console;
export const set_detail_console = (v: ConsoleEventData[]) => { _state.detail_console = v; };
export const get_dt_tab = () => _state.dt_tab;
export const set_dt_tab = (v: string) => { _state.dt_tab = v; };
export const get_dt_view = () => _state.dt_view;
export const set_dt_view = (v: 'list' | 'trace') => {
    _state.dt_view = v;
    if (v === 'list') {
        _state.dt_zoom = 50;
        _state.dt_zoom_overview = true;
    }
};
export const get_dt_quick = () => _state.dt_quick;
export const set_dt_quick = (v: string) => { _state.dt_quick = v; };
export const get_dt_sel = () => _state.dt_sel;
export const set_dt_sel = (v: number) => { _state.dt_sel = v; };
export const get_dt_insp_open = () => _state.dt_insp_open;
export const set_dt_insp_open = (v: boolean) => { _state.dt_insp_open = v; };
export const get_dt_play = () => _state.dt_play;
export const set_dt_play = (v: number) => { _state.dt_play = v; };
export const get_dt_zoom = () => _state.dt_zoom;
export const set_dt_zoom = (v: number) => {
    _state.dt_zoom = v;
    _state.dt_zoom_overview = false;
};
export const get_dt_zoom_window_pct = () => (
    _state.dt_zoom_overview ? 100 : Math.max(5, 100 - _state.dt_zoom)
);
export const get_dt_net_sel = () => _state.dt_net_sel;
export const set_dt_net_sel = (v: number) => { _state.dt_net_sel = v; };
export const get_cap_search = () => _state.cap_search;
export const set_cap_search = (v: string) => { _state.cap_search = v; };
export const get_cap_status_filter = () => _state.cap_status_filter;
export const set_cap_status_filter = (v: 'all' | 'capturing' | 'completed') => { _state.cap_status_filter = v; };
export const get_dt_net_insp_closed = () => _state.dt_net_insp_closed;
export const set_dt_net_insp_closed = (v: boolean) => { _state.dt_net_insp_closed = v; };

// t154 AC-003: open_detail 按 capture_id 记忆上次 tab/view/quick 筛选。
// 会话内存级（dashboard 重载后重置），由 open_detail 保存当前采集、打开新采集时恢复。
export const save_dt_memory = (id: string | null | undefined): void => {
    if (!id) return;
    _state.dt_memory.set(id, { tab: get_dt_tab(), view: get_dt_view(), quick: get_dt_quick() });
};
export const get_dt_memory = (id: string): { tab: string; view: 'list' | 'trace'; quick: string } | undefined => _state.dt_memory.get(id);
