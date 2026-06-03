// shared/theme.ts
import type { ThemeMode } from './types';

const STORAGE_KEY = 'theme';

let current_theme: ThemeMode = 'follow-system';
let media_query: MediaQueryList | null = null;
let media_listener: ((e: MediaQueryListEvent) => void) | null = null;

function resolve_theme(mode: ThemeMode): 'light' | 'dark' {
    if (mode === 'light') return 'light';
    if (mode === 'dark') return 'dark';
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
}

function attach_system_listener(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    if (!media_query) media_query = window.matchMedia('(prefers-color-scheme: dark)');
    if (media_listener) media_query.removeEventListener('change', media_listener);
    media_listener = () => {
        if (current_theme === 'follow-system') {
            document.documentElement.setAttribute('data-theme', resolve_theme('follow-system'));
        }
    };
    media_query.addEventListener('change', media_listener);
}

export function apply_theme(mode: ThemeMode): void {
    current_theme = mode;
    document.documentElement.setAttribute('data-theme', resolve_theme(mode));
    if (mode === 'follow-system') {
        attach_system_listener();
    }
}

export function get_theme(): ThemeMode {
    return current_theme;
}

export async function init_theme(): Promise<void> {
    let mode: ThemeMode = 'follow-system';
    try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            if (result[STORAGE_KEY]) mode = result[STORAGE_KEY] as ThemeMode;
        }
    } catch {
        // best-effort
    }
    apply_theme(mode);
}

export async function set_theme(mode: ThemeMode): Promise<void> {
    apply_theme(mode);
    try {
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
            await chrome.storage.local.set({ [STORAGE_KEY]: mode });
        }
    } catch {
        // best-effort
    }
}
