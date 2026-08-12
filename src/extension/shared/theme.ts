// shared/theme.ts
// B1-L6: 主题单一存储来源——user_config.theme 为唯一权威，废除独立的 'theme' storage key，
// 避免 popup/dashboard 读取双存储源导致漂移。dashboard_settings 改主题时经 save_user_config 落盘。
import type { ThemeMode } from '../../shared/types';
import { load_user_config, save_user_config } from '../../shared/user_config';

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

export async function init_theme(): Promise<void> {
    let mode: ThemeMode = 'follow-system';
    try {
        const cfg = await load_user_config();
        mode = cfg.theme;
    } catch {
        // best-effort
    }
    apply_theme(mode);
}

export async function set_theme(mode: ThemeMode): Promise<void> {
    apply_theme(mode);
    try {
        await save_user_config({ theme: mode });
    } catch {
        // best-effort
    }
}
