// popup/popup.ts
import type { RecordConfig, Session, UserConfig, ThemeMode } from '../shared/types';
import { get_basic_config, get_advanced_config } from '../shared/capture_modes';
import { init_locale, t, apply_translations, set_locale, type Locale } from '../shared/i18n';
import { init_theme, set_theme } from '../shared/theme';
import { load_user_config, save_user_config } from '../shared/user_config';
import { DEFAULT_USER_CONFIG } from '../shared/constants';

let user_config: UserConfig = { ...DEFAULT_USER_CONFIG } as UserConfig;
let is_recording = false;
let current_session: Session | null = null;
let duration_timer: ReturnType<typeof setInterval> | null = null;

const is_extension = typeof chrome !== 'undefined' && !!chrome.runtime?.id;

// DOM Elements
const statusIndicator = document.getElementById('statusIndicator')!;
const statusText = statusIndicator.querySelector('.status-text')!;
const dot = statusIndicator.querySelector('.dot')!;
const sessionInfo = document.getElementById('sessionInfo')!;
const basicBtn = document.getElementById('basicBtn')!;
const advancedBtn = document.getElementById('advancedBtn')!;
const startBtn = document.getElementById('startBtn')!;
const stopBtn = document.getElementById('stopBtn')!;
const historyList = document.getElementById('historyList')!;
const mousePrecision = document.getElementById('mousePrecision') as HTMLSelectElement;
const captureKeyboard = document.getElementById('captureKeyboard') as HTMLInputElement;
const captureInputValues = document.getElementById('captureInputValues') as HTMLInputElement;
const captureRequestBody = document.getElementById('captureRequestBody') as HTMLInputElement;
const captureResponseBody = document.getElementById('captureResponseBody') as HTMLInputElement;
const settingsBtn = document.getElementById('settingsBtn')!;
const settingsPanel = document.getElementById('settingsPanel')!;
const closeSettings = document.getElementById('closeSettings')!;
const languageSelect = document.getElementById('languageSelect') as HTMLSelectElement;
const themeSelect = document.getElementById('themeSelect') as HTMLSelectElement;
const redactData = document.getElementById('redactData') as HTMLInputElement;

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    if (is_extension) {
        await init_locale();
        await init_theme();
        await load_user_config_and_apply();
        await load_state();
        await load_history();
    }
    apply_translations();
    setup_event_listeners();
    update_mode_selection();
    setup_settings();
});

async function load_user_config_and_apply(): Promise<void> {
    user_config = await load_user_config();

    // Apply to UI
    mousePrecision.value = user_config.mouse_precision;
    captureKeyboard.checked = user_config.keyboard_capture_mode !== 'none';
    captureInputValues.checked = user_config.capture_input_values;
    captureRequestBody.checked = user_config.capture_request_body;
    captureResponseBody.checked = user_config.capture_response_body;
    redactData.checked = user_config.redact_data;
    themeSelect.value = user_config.theme;
    languageSelect.value = user_config.locale;
}

async function load_state(): Promise<void> {
    const result = await chrome.storage.local.get(['is_recording', 'current_session']);
    is_recording = result.is_recording || false;
    current_session = result.current_session || null;

    update_mode_selection();
    update_recording_state();
}

function setup_settings(): void {
    settingsBtn.addEventListener('click', () => {
        settingsPanel.style.display = settingsPanel.style.display === 'none' ? 'block' : 'none';
    });

    closeSettings.addEventListener('click', () => {
        settingsPanel.style.display = 'none';
    });
}

function setup_event_listeners(): void {
    basicBtn.addEventListener('click', () => select_mode('basic'));
    advancedBtn.addEventListener('click', () => select_mode('advanced'));
    startBtn.addEventListener('click', start_recording);
    stopBtn.addEventListener('click', stop_recording);

    // Language change
    languageSelect.addEventListener('change', async () => {
        const locale = languageSelect.value as Locale;
        set_locale(locale);
        await save_user_config({ locale });
        apply_translations();
        update_recording_state();
        load_history();
    });

    // Theme change
    themeSelect.addEventListener('change', async () => {
        const theme = themeSelect.value as ThemeMode;
        await set_theme(theme);
        await save_user_config({ theme });
    });

    // Redact toggle
    redactData.addEventListener('change', async () => {
        await save_user_config({ redact_data: redactData.checked });
    });

    // Config change listeners
    mousePrecision.addEventListener('change', persist_config);
    captureKeyboard.addEventListener('change', persist_config);
    captureInputValues.addEventListener('change', persist_config);
    captureRequestBody.addEventListener('change', persist_config);
    captureResponseBody.addEventListener('change', persist_config);
}

function select_mode(mode: 'basic' | 'advanced'): void {
    user_config.selected_mode = mode;
    if (is_extension) save_user_config({ selected_mode: mode });
    update_mode_selection();
}

function update_mode_selection(): void {
    basicBtn.classList.toggle('selected', user_config.selected_mode === 'basic');
    advancedBtn.classList.toggle('selected', user_config.selected_mode === 'advanced');
}

async function persist_config(): Promise<void> {
    const patch: Partial<UserConfig> = {
        mouse_precision: mousePrecision.value as UserConfig['mouse_precision'],
        keyboard_capture_mode: captureKeyboard.checked ? 'shortcuts' : 'none',
        capture_input_values: captureInputValues.checked,
        capture_request_body: captureRequestBody.checked,
        capture_response_body: captureResponseBody.checked
    };
    user_config = { ...user_config, ...patch };
    await save_user_config(patch);
}

function get_record_config(): RecordConfig {
    const base_config = user_config.selected_mode === 'basic' ? get_basic_config() : get_advanced_config();

    return {
        ...base_config,
        mouse_precision: user_config.mouse_precision,
        keyboard_capture_mode: user_config.keyboard_capture_mode,
        capture_input_values: user_config.capture_input_values,
        capture_request_body: user_config.capture_request_body,
        capture_response_body: user_config.capture_response_body,
        redact_data: user_config.redact_data
    };
}

async function start_recording(): Promise<void> {
    if (!is_extension) return;

    const config = get_record_config();
    const session_id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'start',
            session_id,
            config
        });

        if (response.success) {
            is_recording = true;
            current_session = {
                id: session_id,
                start_time: Date.now(),
                end_time: null,
                config,
                stats: { event_count: 0, request_count: 0, log_count: 0, dom_changes: 0 }
            };
            chrome.storage.local.set({ is_recording: true, current_session });
            update_recording_state();
            await load_history();
        } else {
            alert(`${t('error')}: ${response.error}`);
        }
    } catch (error) {
        alert(`${t('error')}: ${error}`);
    }
}

async function stop_recording(): Promise<void> {
    if (!is_extension) return;

    try {
        const response = await chrome.runtime.sendMessage({ action: 'stop' });

        if (response.success) {
            is_recording = false;
            current_session = null;
            chrome.storage.local.set({ is_recording: false, current_session: null });
            update_recording_state();
            await load_history();
        }
    } catch (error) {
        alert(`${t('error')}: ${error}`);
    }
}

function update_recording_state(): void {
    if (is_recording) {
        dot.classList.add('recording');
        dot.classList.remove('ready');
        statusText.textContent = t('recording');
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        sessionInfo.style.display = 'block';

        if (current_session) {
            sessionInfo.querySelector('.session-id')!.textContent = `${t('sessionId')}: ${current_session.id}`;
            start_duration_timer();
        }
    } else {
        dot.classList.remove('recording');
        dot.classList.add('ready');
        statusText.textContent = t('ready');
        startBtn.style.display = 'block';
        stopBtn.style.display = 'none';
        sessionInfo.style.display = 'none';
        stop_duration_timer();
    }
}

function start_duration_timer(): void {
    stop_duration_timer();
    if (!current_session) return;

    const durationEl = sessionInfo.querySelector('.session-duration')!;
    const update = () => {
        const duration = Date.now() - current_session!.start_time;
        const seconds = Math.floor(duration / 1000);
        const minutes = Math.floor(seconds / 60);
        durationEl.textContent = `${minutes}m ${seconds % 60}s`;
    };

    update();
    duration_timer = setInterval(update, 1000);
}

function stop_duration_timer(): void {
    if (duration_timer) {
        clearInterval(duration_timer);
        duration_timer = null;
    }
}

async function load_history(): Promise<void> {
    if (!is_extension) return;

    try {
        const sessions: Session[] = await chrome.runtime.sendMessage({ action: 'list_sessions' });

        if (sessions.length === 0) {
            historyList.innerHTML = `<div class="history-empty">${t('noSessions')}</div>`;
            return;
        }

        historyList.innerHTML = sessions.slice(0, 20).map(session => `
            <div class="history-item" data-id="${session.id}">
                <div class="history-meta">
                    <span class="history-time">${new Date(session.start_time).toLocaleString()}</span>
                    <span class="history-duration">${format_duration(session)}</span>
                </div>
                <div class="history-actions">
                    <button class="btn-sm primary" data-action="view" data-session="${session.id}">${t('view')}</button>
                    <button class="btn-sm" data-action="delete" data-session="${session.id}">${t('delete')}</button>
                </div>
            </div>
        `).join('');

        // Event delegation for history buttons
        historyList.onclick = async (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const btn = target.closest('[data-action]') as HTMLElement;
            if (!btn) return;

            const action = btn.dataset.action;
            const sessionId = btn.dataset.session;
            if (!action || !sessionId) return;

            if (action === 'view') {
                const url = chrome.runtime.getURL(`detail/detail.html?session=${sessionId}`);
                chrome.tabs.create({ url });
            } else if (action === 'delete') {
                if (confirm(t('deleteConfirm'))) {
                    await chrome.runtime.sendMessage({ action: 'delete_session', session_id: sessionId });
                    await load_history();
                }
            }
        };
    } catch {
        historyList.innerHTML = `<div class="history-empty">${t('error')}</div>`;
    }
}

function format_duration(session: Session): string {
    if (!session.end_time) return t('recording');
    const duration = session.end_time - session.start_time;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}
