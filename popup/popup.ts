// popup/popup.ts
import type { RecordConfig, Session } from '../shared/types';
import { get_basic_config, get_advanced_config } from '../shared/capture_modes';

let selected_mode: 'basic' | 'advanced' = 'basic';
let is_recording = false;
let current_session: Session | null = null;
let duration_timer: ReturnType<typeof setInterval> | null = null;

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

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await load_state();
    setup_event_listeners();
    await load_history();
});

async function load_state(): Promise<void> {
    const result = await chrome.storage.local.get(['selected_mode', 'is_recording', 'current_session']);
    selected_mode = result.selected_mode || 'basic';
    is_recording = result.is_recording || false;
    current_session = result.current_session || null;

    update_mode_selection();
    update_recording_state();
}

function setup_event_listeners(): void {
    basicBtn.addEventListener('click', () => select_mode('basic'));
    advancedBtn.addEventListener('click', () => select_mode('advanced'));
    startBtn.addEventListener('click', start_recording);
    stopBtn.addEventListener('click', stop_recording);

    // Config change listeners
    mousePrecision.addEventListener('change', save_config);
    captureKeyboard.addEventListener('change', save_config);
    captureInputValues.addEventListener('change', save_config);
    captureRequestBody.addEventListener('change', save_config);
    captureResponseBody.addEventListener('change', save_config);
}

function select_mode(mode: 'basic' | 'advanced'): void {
    selected_mode = mode;
    chrome.storage.local.set({ selected_mode });
    update_mode_selection();
}

function update_mode_selection(): void {
    basicBtn.classList.toggle('selected', selected_mode === 'basic');
    advancedBtn.classList.toggle('selected', selected_mode === 'advanced');

    // Update config based on mode
    if (selected_mode === 'basic') {
        captureKeyboard.checked = false;
        captureInputValues.checked = false;
        captureRequestBody.checked = false;
        captureResponseBody.checked = false;
    }
}

function get_config(): RecordConfig {
    const base_config = selected_mode === 'basic' ? get_basic_config() : get_advanced_config();

    return {
        ...base_config,
        mouse_precision: mousePrecision.value as any,
        keyboard_capture_mode: captureKeyboard.checked ? 'shortcuts' : 'none',
        capture_input_values: captureInputValues.checked,
        capture_request_body: captureRequestBody.checked,
        capture_response_body: captureResponseBody.checked
    };
}

function save_config(): void {
    const config = get_config();
    chrome.storage.local.set({ config });
}

async function start_recording(): Promise<void> {
    const config = get_config();

    try {
        const response = await chrome.runtime.sendMessage({
            action: 'start',
            config
        });

        if (response.success) {
            is_recording = true;
            current_session = response.session;
            chrome.storage.local.set({ is_recording: true, current_session });
            update_recording_state();
            await load_history();
        } else {
            alert(`Failed to start recording: ${response.error}`);
        }
    } catch (error) {
        alert(`Error: ${error}`);
    }
}

async function stop_recording(): Promise<void> {
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
        alert(`Error: ${error}`);
    }
}

function update_recording_state(): void {
    if (is_recording) {
        dot.classList.add('recording');
        dot.classList.remove('ready');
        statusText.textContent = 'Recording';
        startBtn.style.display = 'none';
        stopBtn.style.display = 'block';
        sessionInfo.style.display = 'block';

        if (current_session) {
            sessionInfo.querySelector('.session-id')!.textContent = `ID: ${current_session.id}`;
            start_duration_timer();
        }
    } else {
        dot.classList.remove('recording');
        dot.classList.add('ready');
        statusText.textContent = 'Ready';
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
    try {
        const sessions: Session[] = await chrome.runtime.sendMessage({ action: 'list_sessions' });

        if (sessions.length === 0) {
            historyList.innerHTML = '<div class="history-empty">No sessions recorded yet</div>';
            return;
        }

        historyList.innerHTML = sessions.slice(0, 20).map(session => `
            <div class="history-item" data-id="${session.id}">
                <div class="history-meta">
                    <span class="history-time">${new Date(session.start_time).toLocaleString()}</span>
                    <span class="history-duration">${format_duration(session)}</span>
                </div>
                <div class="history-actions">
                    <button class="btn-sm primary" onclick="view_session('${session.id}')">View</button>
                    <button class="btn-sm" onclick="delete_session('${session.id}')">Delete</button>
                </div>
            </div>
        `).join('');
    } catch {
        historyList.innerHTML = '<div class="history-empty">Failed to load history</div>';
    }
}

function format_duration(session: Session): string {
    if (!session.end_time) return 'In progress';
    const duration = session.end_time - session.start_time;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
}

// Global functions for onclick handlers
(window as any).view_session = (id: string) => {
    chrome.tabs.create({ url: `detail/detail.html?session=${id}` });
};

(window as any).delete_session = async (id: string) => {
    if (confirm('Delete this session?')) {
        await chrome.runtime.sendMessage({ action: 'delete_session', session_id: id });
        await load_history();
    }
};
