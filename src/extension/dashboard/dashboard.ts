// dashboard/dashboard.ts — Capture All 主面板入口
// 只做初始化、导入各模块、注册路由
import { init_locale, t, type I18nStrings } from '../shared/i18n';
import { init_theme } from '../shared/theme';
import { wire_sidebar_resize } from './sidebar_resize';
import { load_user_config } from '../../shared/user_config';
import {
    logger, is_extension, I,
    set_user_config, get_captures,
    get_page, set_page,
    get_detail_capture, get_detail_events, get_detail_network, get_detail_console,
    load_captures, load_detail,
    router,
} from './dashboard_shared';
import { render_captures, wire_captures } from './dashboard_captures';
import { render_detail, wire_detail, open_detail } from './dashboard_detail';
import { render_settings, wire_settings } from './dashboard_settings';
import { render_current, wire_simple_open, render_exports, wire_exports } from './dashboard_integrations';

// ── sidebar / shell ─────────────────────────────────────────────────────
const NAV = [
    { key: 'captures', icon: 'navCaptures', lbl: 'captureRecords' },
    { key: 'current', icon: 'navCurrent', lbl: 'currentCapture' },
    { key: 'exports', icon: 'navExport', lbl: 'exportTask' },
    { key: 'settings', icon: 'navSettings', lbl: 'settings' },
] satisfies { key: string; icon: string; lbl: keyof I18nStrings }[];

const root = document.getElementById('root')!;

function render_shell(): void {
    const page = get_page();
    const captures = get_captures();
    const active = page === 'detail' ? 'captures' : page;
    const live = captures.filter((s) => s.status === 'capturing').length;
    root.innerHTML = `<div class="app">
        <div class="titlebar">
            <span class="tl-lights"><i></i><i></i><i></i></span>
            <span class="tl-title">Capture All — ${t('mainPanel')}</span>
        </div>
        <div class="app-body">
            <aside class="sidebar">
                <div class="sb-brand"><span class="sb-logo"><span class="sb-logo-ring"></span></span><b>Capture All</b></div>
                <nav class="sb-nav">
                    ${NAV.map((n) => `<button class="sb-item" data-nav="${n.key}" data-on="${active === n.key ? 1 : 0}">
                        <span class="sb-ic">${I[n.icon]}</span><span class="sb-lbl">${t(n.lbl)}</span>
                        ${n.key === 'current' && live ? `<span class="sb-badge mono">${live}</span>` : ''}
                    </button>`).join('')}
                </nav>
                <div class="sb-spacer"></div>
                <div class="sb-user">
                    <span class="sb-ava">A</span>
                    <div class="sb-user-meta"><b>${t('localUser')}</b><span>Capture All</span></div>
                </div>
                <div class="sb-resize-handle"></div>
            </aside>
            <div class="content" id="content"></div>
        </div>
    </div>`;
    root.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => go((b as HTMLElement).dataset.nav!)));
    const sb_handle = root.querySelector('.sb-resize-handle') as HTMLElement | null;
    if (sb_handle) {
        wire_sidebar_resize({
            handle: sb_handle,
            storage_key: 'sidebar_width',
            css_var: '--sidebar-w',
            default_px: 232,
            min_px: 160,
            max_px: 400,
        });
    }
    render_content();
}

function go(p: string): void { set_page(p); logger.debug('Dashboard page', { page: p }); render_shell(); }

// t144: detail 快照签名——事件数、最新相对时间、network/console 数组长度与 stats，判断轮询是否有实质变化
function detail_snapshot_signature(capture_id: string): string {
    const events = get_detail_events();
    const cap = get_detail_capture();
    const latest = events.length > 0 ? events[events.length - 1].relative_time_ms : 0;
    return `${capture_id}:${events.length}:${latest}:${get_detail_network().length}:${get_detail_console().length}:${cap?.stats?.event_count ?? 0}:${cap?.stats?.request_count ?? 0}:${cap?.stats?.log_count ?? 0}`;
}

function render_content(): void {
    const page = get_page();
    const c = document.getElementById('content')!;
    if (page === 'captures') { c.innerHTML = render_captures(); wire_captures(); }
    else if (page === 'detail') { c.innerHTML = render_detail(); wire_detail(); }
    else if (page === 'settings') { c.innerHTML = render_settings(); wire_settings(); }
    else if (page === 'current') { c.innerHTML = render_current(); wire_simple_open(); }
    else if (page === 'exports') { c.innerHTML = render_exports(); wire_exports(); }
    else { c.innerHTML = render_captures(); wire_captures(); }
}

// ── inject router into shared (breaks circular deps) ────────────────────
router.go = go;
router.render_content = render_content;
router.render_shell = render_shell;
router.open_detail = open_detail;

// ── init ────────────────────────────────────────────────────────────────
async function init(): Promise<void> {
    if (is_extension) {
        await init_locale();
        await init_theme();
        set_user_config(await load_user_config());
        await load_captures();
    }
    const params = new URLSearchParams(location.search);
    const sid = params.get('capture');
    const p = params.get('page');
    if (sid && (p === 'detail' || !p)) {
        await open_detail(sid);
    } else {
        if (p) set_page(p);
        render_shell();
    }
    // Auto-refresh: poll for capture state changes every 2s
    // TODO(M4): 改用 chrome.runtime.onMessage 监听 service worker 推送的变化通知，
    // 替代全量轮询。需 service_worker.ts 在 capture 状态变化时主动推送消息。
    let poll_in_flight = false;
    let poll_interval: ReturnType<typeof setInterval> | null = null;
    const poll_once = async () => {
        try {
            if (!is_extension) return;
            if (poll_in_flight) return; // 单飞：避免重叠
            poll_in_flight = true;
            const prev_state = get_captures().map(s => `${s.capture_id}:${s.status}:${s.stats?.event_count || 0}:${s.stats?.request_count || 0}`);
            await load_captures();
            const cur_state = get_captures().map(s => `${s.capture_id}:${s.status}:${s.stats?.event_count || 0}:${s.stats?.request_count || 0}`);
            const captures_changed = prev_state.join(',') !== cur_state.join(',');
            if (captures_changed) {
                if (get_page() === 'captures' || get_page() === 'current' || get_page() === 'exports') {
                    render_content();
                }
            }
            // t144: detail 轮询仅在有变化时更新（事件数或 stats 变化），无变化不整页重渲染；
            // timeline 拖拽期间跳过，防重渲染替换 DOM 打断 pointermove。
            // t160 AC-004: 离开详情页（page !== detail）不触发读取。
            if (get_page() === 'detail' && get_detail_capture()?.status === 'capturing' && !router.is_tl_dragging()) {
                const cap = get_detail_capture()!;
                const prev_sig = detail_snapshot_signature(cap.capture_id);
                // t160 AC-001/002: 增量模式——先 metadata 对比，无推进不读数据，有推进增量 append
                await load_detail(cap.capture_id, { incremental: true });
                const cur_sig = detail_snapshot_signature(cap.capture_id);
                if (prev_sig !== cur_sig) {
                    render_content();
                }
            }
        } catch (err) {
            logger.error('polling error', err);
        } finally {
            poll_in_flight = false;
        }
    };
    const start_poll = () => {
        if (poll_interval) return;
        poll_interval = setInterval(poll_once, 2000);
    };
    const stop_poll = () => {
        if (poll_interval) {
            clearInterval(poll_interval);
            poll_interval = null;
        }
    };
    start_poll();
    // t160 AC-003: 页面 hidden 暂停轮询，恢复 visible 重建
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stop_poll();
        } else {
            start_poll();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
