// dashboard/dashboard_settings.ts — 设置页
import type { UserConfig, ThemeMode } from '../../shared/types';
import { set_locale, t, type I18nStrings, type Locale } from '../shared/i18n';
import { set_theme } from '../shared/theme';
import { wire_sidebar_resize } from './sidebar_resize';
import { save_user_config } from '../../shared/user_config';
import { DEFAULT_USER_CONFIG } from '../../shared/constants';
import { normalize_agent_bridge_config } from '../../shared/agent_bridge_config';
import { Logger } from '../../shared/logger';
import { send_ui_message } from '../../shared/message_contract';
import {
    esc, I, is_extension, get_user_config, set_user_config,
    logger,
} from './dashboard_shared';

declare const __BUILD_TIME__: string;

function seg(name: string, opts: [string, string][], val: string): string {
    return `<div class="seg" data-seg="${name}">${opts.map(([v, l]) => `<button data-val="${v}" data-on="${val === v ? 1 : 0}">${l}</button>`).join('')}</div>`;
}
function sw(name: string, on: boolean, sm = false): string {
    return `<span class="switch${sm ? ' sm' : ''}" data-sw="${name}" data-on="${on ? 1 : 0}"><span class="knob"></span></span>`;
}

function render_settings(): string {
    const cfg = get_user_config();
    const SET_NAV: [string, keyof I18nStrings, string][] = [
        ['general', 'general', 'navSettings'], ['defaults', 'captureDefaults', 'navCurrent'],
        ['privacy', 'privacyRedaction', 'err'], ['export', 'exportLabel', 'navExport'],
        ['diagnostics', 'diagnosticsLogs', 'console'], ['integrations', 'integrations', 'navMcp'],
    ];
    return `<div class="page">
        <div class="pg-head">
            <div class="pg-title"><h1>${t('settings')}</h1><p>${t('settingsDesc')}</p></div>
        </div>
        <div class="set-body">
            <nav class="set-subnav scroll">
                ${SET_NAV.map(([k, l, ic], i) => `<button class="set-navitem" data-setnav="set-${k}" data-on="${i === 0 ? 1 : 0}">${I[ic]}${t(l)}</button>`).join('')}
            </nav>
            <div class="set-resize-handle"></div>
            <div class="set-scroll scroll">
                <section class="set-section" id="set-general">
                    <h2>${t('general')}</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field"><span class="field-lbl">${t('language')}</span>
                            <select class="input" data-cfg="locale"><option value="zh" ${cfg.locale === 'zh' ? 'selected' : ''}>${t('chinese')}</option><option value="en" ${cfg.locale === 'en' ? 'selected' : ''}>${t('english')}</option></select>
                        </div>
                        <div class="field"><span class="field-lbl">${t('theme')}</span>${seg('theme', [['follow-system', t('themeFollowSystem')], ['light', t('themeLight')], ['dark', t('themeDark')]], cfg.theme)}</div>
                        <div class="field"><span class="field-lbl">${t('timeDisplay')}</span>${seg('detail_time_display_mode', [['relative', t('detailTimeRelative')], ['system', t('detailTimeSystem')]], cfg.detail_time_display_mode)}</div>
                        <div class="field"><span class="field-lbl">${t('systemTimeTimezone')}</span>
                            <select class="input" data-cfg="system_time_timezone"><option value="browser" ${cfg.system_time_timezone === 'browser' ? 'selected' : ''}>${t('timezoneFollowBrowser')}</option><option value="UTC" ${cfg.system_time_timezone === 'UTC' ? 'selected' : ''}>UTC</option><option value="UTC+1" ${cfg.system_time_timezone === 'UTC+1' ? 'selected' : ''}>UTC+1</option><option value="UTC+2" ${cfg.system_time_timezone === 'UTC+2' ? 'selected' : ''}>UTC+2</option><option value="UTC+3" ${cfg.system_time_timezone === 'UTC+3' ? 'selected' : ''}>UTC+3</option><option value="UTC+4" ${cfg.system_time_timezone === 'UTC+4' ? 'selected' : ''}>UTC+4</option><option value="UTC+5" ${cfg.system_time_timezone === 'UTC+5' ? 'selected' : ''}>UTC+5</option><option value="UTC+6" ${cfg.system_time_timezone === 'UTC+6' ? 'selected' : ''}>UTC+6</option><option value="UTC+7" ${cfg.system_time_timezone === 'UTC+7' ? 'selected' : ''}>UTC+7</option><option value="UTC+8" ${cfg.system_time_timezone === 'UTC+8' ? 'selected' : ''}>UTC+8</option><option value="UTC+9" ${cfg.system_time_timezone === 'UTC+9' ? 'selected' : ''}>UTC+9</option><option value="UTC+10" ${cfg.system_time_timezone === 'UTC+10' ? 'selected' : ''}>UTC+10</option><option value="UTC+11" ${cfg.system_time_timezone === 'UTC+11' ? 'selected' : ''}>UTC+11</option><option value="UTC+12" ${cfg.system_time_timezone === 'UTC+12' ? 'selected' : ''}>UTC+12</option><option value="UTC-1" ${cfg.system_time_timezone === 'UTC-1' ? 'selected' : ''}>UTC-1</option><option value="UTC-2" ${cfg.system_time_timezone === 'UTC-2' ? 'selected' : ''}>UTC-2</option><option value="UTC-3" ${cfg.system_time_timezone === 'UTC-3' ? 'selected' : ''}>UTC-3</option><option value="UTC-4" ${cfg.system_time_timezone === 'UTC-4' ? 'selected' : ''}>UTC-4</option><option value="UTC-5" ${cfg.system_time_timezone === 'UTC-5' ? 'selected' : ''}>UTC-5</option><option value="UTC-6" ${cfg.system_time_timezone === 'UTC-6' ? 'selected' : ''}>UTC-6</option><option value="UTC-7" ${cfg.system_time_timezone === 'UTC-7' ? 'selected' : ''}>UTC-7</option><option value="UTC-8" ${cfg.system_time_timezone === 'UTC-8' ? 'selected' : ''}>UTC-8</option><option value="UTC-9" ${cfg.system_time_timezone === 'UTC-9' ? 'selected' : ''}>UTC-9</option><option value="UTC-10" ${cfg.system_time_timezone === 'UTC-10' ? 'selected' : ''}>UTC-10</option><option value="UTC-11" ${cfg.system_time_timezone === 'UTC-11' ? 'selected' : ''}>UTC-11</option><option value="UTC-12" ${cfg.system_time_timezone === 'UTC-12' ? 'selected' : ''}>UTC-12</option></select>
                        </div>
                    </div></div>
                </section>
                <section class="set-section" id="set-defaults">
                    <h2>${t('captureDefaults')}</h2>
                    <div class="set-card">
                        <div class="set-grid c3">
                            <div class="field"><span class="field-lbl">${t('captureRequestBody')}</span>${sw('capture_request_body', cfg.capture_request_body)}</div>
                            <div class="field"><span class="field-lbl">${t('captureResponseBody')}</span>${sw('capture_response_body', cfg.capture_response_body)}</div>
                            <div class="field"><span class="field-lbl">${t('captureInputValues')}</span>${sw('capture_input_values', cfg.capture_input_values)}</div>
                            <div class="field"><span class="field-lbl">${t('captureLimitMb')}</span><input class="input mono" type="number" data-cfg="max_body_capture_bytes" value="${esc(String(Math.round(cfg.max_body_capture_bytes / 1048576)))}" min="1" max="1024" step="1"></div>
                            <div class="field"><span class="field-lbl">${t('inlineTextLimitKb')}</span><input class="input mono" type="number" data-cfg="inline_text_max_bytes" value="${esc(String(Math.round(cfg.inline_text_max_bytes / 1024)))}" min="0" max="1024" step="1"></div>
                        </div>
                    </div>
                </section>
                <section class="set-section" id="set-privacy">
                    <div class="set-subhead"><h2>${t('privacyRedaction')}</h2>${sw('redact_data', cfg.redact_data)}</div>
                    <div class="set-card"><div class="set-grid">
                        <div class="field span2"><span class="field-lbl">${t('sensitiveCaptureNotice')}</span><span style="font-size:12px;color:var(--ink-3)">${t('sensitiveCaptureDesc')}</span></div>
                        <div class="field span2"><span class="field-lbl">${t('redactionBoundary')}</span><span style="font-size:12px;color:var(--ink-3)">${t('redactionBoundaryDesc')}</span></div>
                    </div></div>
                </section>
                <section class="set-section" id="set-export">
                    <h2>${t('exportLabel')}</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field span2"><span class="field-lbl">${t('filenameTemplate')}</span><input class="input mono" data-cfg="export_filename_template" value="${esc(cfg.export_filename_template)}"></div>
                        <div class="field span2"><span class="field-lbl">${t('exportCaptureDirectory')}</span><input class="input mono" data-cfg="export_capture_directory" value="${esc(cfg.export_capture_directory)}" placeholder="capture-all/exports"></div>
                        <div class="field span2"><span class="field-lbl">${t('exportLogDirectory')}</span><input class="input mono" data-cfg="export_log_directory" value="${esc(cfg.export_log_directory)}" placeholder="capture-all/logs"></div>
                        <div class="field"><span class="field-lbl">${t('exportSaveAs')}</span>${sw('export_save_as', cfg.export_save_as)}</div>
                    </div></div>
                </section>
                <section class="set-section" id="set-diagnostics">
                    <h2>${t('diagnosticsLogs')}</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field span2"><span class="field-lbl">${t('logLevel')}</span>${seg('log_level', [['debug', 'debug'], ['info', 'info'], ['warn', 'warn'], ['error', 'error'], ['silent', 'silent']], cfg.log_level)}</div>
                        <div class="field"><span class="field-lbl">${t('maxLogSizeMb')}</span><input class="input mono" type="number" data-cfg="log_max_size_mb" value="${esc(String(cfg.log_max_size_mb))}" min="1" max="1024" step="1"></div>
                        <div class="field"><span class="field-lbl">${t('currentLogSize')}</span><input id="logSize" class="input mono" readonly value="—"></div>
                        <div class="field span2" style="display:flex;gap:8px">
                            <button class="btn sm" id="exportLog"><span>${I.export}</span>${t('exportLogs')}</button>
                            <button class="btn sm danger" id="clearLogs"><span>${I.trash}</span>${t('clearLogs')}</button>
                        </div>
                    </div></div>
                </section>
                <section class="set-section" id="set-integrations" style="margin-bottom:8px">
                    <h2>${t('integrationsMcp')}</h2>
                    <div class="set-card"><div class="set-grid">
                        <div class="field"><span class="field-lbl">${t('agentBridgeEnabled')}</span>${sw('agent_bridge_enabled', cfg.agent_bridge_enabled)}</div>
                        <div class="field span2"><span class="field-lbl">${t('agentBridgeUrl')}</span><input class="input mono" data-cfg="agent_bridge_url" value="${esc(cfg.agent_bridge_url)}" placeholder="http://127.0.0.1:17831"></div>
                        <div class="field"><span class="field-lbl">${t('agentBridgeBrowserLabel')}</span><input class="input mono" data-cfg="browser_label" value="${esc(cfg.browser_label || '')}" placeholder="${esc(t('agentBridgeBrowserLabelPlaceholder'))}"></div>
                        <div class="field"><span class="field-lbl">${t('agentBridgePollInterval')}</span><input class="input mono" type="number" data-cfg="agent_bridge_poll_interval_ms" value="${esc(cfg.agent_bridge_poll_interval_ms)}"></div>
                        <div class="field span2" id="bridge-status-area"><span class="field-lbl">${t('agentBridgeStatus')}</span><span class="info mono" id="bridgeStatus">${t('agentBridgeNotConnected')}</span></div>
                        <div class="field span2 error-text" id="bridgeErr" style="display:none;color:var(--red-ink)"></div>
                        <div class="field span2" id="bridge-advanced">
                            <button class="btn sm" id="bridgeAdvToggle" type="button">▸ ${t('agentBridgeLegacy')}</button>
                            <div id="bridgeAdvContent" style="display:none;margin-top:8px">
                                <span class="field-lbl" style="display:block;margin-top:4px">${t('agentBridgeLegacyToken')}</span>
                                <input class="input mono" type="password" data-cfg="agent_bridge_token" value="${esc(cfg.agent_bridge_token)}" style="margin-top:4px">
                                <span style="font-size:11px;color:var(--ink-3);display:block;margin-top:4px">${t('agentBridgeLegacyDesc')}</span>
                            </div>
                        </div>
                    </div></div>
                </section>
            </div>
        </div>
        <div class="set-footer"><span class="info">${I.agent} ${t('changesSavedImmediately')} · build ${esc(typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : 'dev')}</span></div>
    </div>`;
}

async function persist(patch: Partial<UserConfig>): Promise<void> {
    set_user_config({ ...get_user_config(), ...patch });
    if (is_extension) await save_user_config(patch);
}

async function persist_bridge(): Promise<void> {
    const c = document.getElementById('content')!;
    const errEl = c.querySelector('#bridgeErr') as HTMLElement | null;
    try {
        const patch = normalize_agent_bridge_config({
            agent_bridge_enabled: (c.querySelector('[data-sw="agent_bridge_enabled"]') as HTMLElement)?.dataset.on === '1',
            agent_bridge_url: (c.querySelector('[data-cfg="agent_bridge_url"]') as HTMLInputElement)?.value || '',
            agent_bridge_token: (c.querySelector('[data-cfg="agent_bridge_token"]') as HTMLInputElement)?.value || '',
            agent_bridge_poll_interval_ms: Number((c.querySelector('[data-cfg="agent_bridge_poll_interval_ms"]') as HTMLInputElement)?.value),
            browser_label: (c.querySelector('[data-cfg="browser_label"]') as HTMLInputElement)?.value || '',
        });
        await persist(patch);
        if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    } catch (e) {
        await persist({ agent_bridge_enabled: false });
        const swEl = c.querySelector('[data-sw="agent_bridge_enabled"]') as HTMLElement | null;
        if (swEl) swEl.dataset.on = '0';
        if (errEl) { errEl.textContent = e instanceof Error ? e.message : String(e); errEl.style.display = 'block'; }
    }
}

export function clamp_body_size_bytes(value: string, fallback: number, max: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(0, parsed));
}

function wire_settings(): void {
    const c = document.getElementById('content')!;
    const set_handle = c.querySelector('.set-resize-handle') as HTMLElement | null;
    if (set_handle) {
        wire_sidebar_resize({
            handle: set_handle,
            storage_key: 'settings_nav_width',
            css_var: '--set-nav-w',
            default_px: 196,
            min_px: 140,
            max_px: 320,
        });
    }
    c.querySelectorAll('[data-setnav]').forEach((b) => b.addEventListener('click', () => {
        c.querySelectorAll('[data-setnav]').forEach((x) => (x as HTMLElement).dataset.on = '0');
        (b as HTMLElement).dataset.on = '1';
        document.getElementById((b as HTMLElement).dataset.setnav!)?.scrollIntoView({ block: 'start' });
    }));
    c.querySelectorAll('[data-seg]').forEach((s) => {
        const name = (s as HTMLElement).dataset.seg!;
        s.querySelectorAll('button').forEach((btn) => btn.addEventListener('click', async () => {
            const val = (btn as HTMLElement).dataset.val!;
            s.querySelectorAll('button').forEach((x) => (x as HTMLElement).dataset.on = '0');
            (btn as HTMLElement).dataset.on = '1';
            if (name === 'theme') {
                // B1-L6: theme 由 set_theme 单一持久化（save_user_config）；此处仅同步本地渲染缓存，
                // 不再走 persist 重复落盘 user_config。
                await set_theme(val as ThemeMode);
                set_user_config({ ...get_user_config(), theme: val as ThemeMode });
            }
            else if (name === 'log_level') {
                Logger.set_level(val as 'debug' | 'info' | 'warn' | 'error' | 'silent');
                await persist({ log_level: val as 'debug' | 'info' | 'warn' | 'error' | 'silent' });
                send_ui_message('set_log_level', { level: val }).catch(() => {});
            }
            else await persist({ [name]: val } as Partial<UserConfig>);
        }));
    });
    c.querySelectorAll('[data-sw]').forEach((el) => el.addEventListener('click', async () => {
        const name = (el as HTMLElement).dataset.sw!;
        const on = (el as HTMLElement).dataset.on !== '1';
        (el as HTMLElement).dataset.on = on ? '1' : '0';
        if (name.startsWith('agent_bridge')) await persist_bridge();
        else await persist({ [name]: on } as Partial<UserConfig>);
    }));
    c.querySelectorAll('[data-cfg]').forEach((el) => {
        const name = (el as HTMLElement).dataset.cfg!;
        el.addEventListener('change', async () => {
            const v = (el as HTMLInputElement).value;
            if (name === 'locale') { set_locale(v as Locale); await persist({ locale: v as Locale }); }
            else if (name.startsWith('agent_bridge')) await persist_bridge();
            else if (name === 'browser_label') await persist_bridge();
            else if (name === 'log_max_size_mb') await persist({ [name]: Number(v) } as Partial<UserConfig>);
            else if (name === 'max_body_capture_bytes') await persist({ [name]: clamp_body_size_bytes(String(Number(v) * 1048576), DEFAULT_USER_CONFIG.max_body_capture_bytes, 1024 * 1048576) } as Partial<UserConfig>);
            else if (name === 'inline_text_max_bytes') await persist({ [name]: clamp_body_size_bytes(String(Number(v) * 1024), DEFAULT_USER_CONFIG.inline_text_max_bytes, 1024 * 1024) } as Partial<UserConfig>);
            else await persist({ [name]: v } as Partial<UserConfig>);
        });
    });
    c.querySelector('#bridgeAdvToggle')?.addEventListener('click', () => {
        const content = c.querySelector('#bridgeAdvContent') as HTMLElement | null;
        const toggle = c.querySelector('#bridgeAdvToggle') as HTMLElement | null;
        if (content && toggle) {
            const expanded = content.style.display !== 'none';
            content.style.display = expanded ? 'none' : 'block';
            toggle.textContent = (expanded ? '\u25b8 ' : '\u25be ') + t('agentBridgeLegacy');
        }
    });
    wire_diagnostics_settings(c);
}

async function wire_diagnostics_settings(c: HTMLElement): Promise<void> {
    const { download_blob, build_log_filename } = await import('../shared/export_utils');
    const update_size = async () => {
        const el = c.querySelector('#logSize') as HTMLInputElement | null;
        if (!el) return;
        try {
            const r = await send_ui_message('get_app_log_size', {});
            if (r?.data?.size_bytes != null) {
                const mb = (r.data.size_bytes / (1024 * 1024)).toFixed(1);
                el.value = `${mb} MB`;
            } else {
                el.value = '—';
            }
        } catch {
            el.value = '—';
        }
    };
    update_size();

    c.querySelector('#exportLog')?.addEventListener('click', async () => {
        try {
            const r = await send_ui_message('export_app_logs', { options: { format: 'log' } });
            if (!r?.success) { alert(t('exportFailed')); return; }
            const blob = new Blob([r.data as BlobPart], { type: 'text/x-log' });
            const log_filename = build_log_filename({
                export_log_directory: get_user_config().export_log_directory,
                system_time_timezone: get_user_config().system_time_timezone,
            });
            await download_blob(blob, log_filename, 'log_export', get_user_config().export_save_as);
        } catch (e) { logger.error('Export logs error', e); }
    });

    c.querySelector('#clearLogs')?.addEventListener('click', async () => {
        if (!confirm(t('clearLogsConfirm'))) return;
        try {
            await send_ui_message('clear_app_logs', {});
            update_size();
        } catch (e) { logger.error('Clear logs error', e); }
    });
}

export { render_settings, wire_settings };
