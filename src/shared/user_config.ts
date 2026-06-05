// shared/user_config.ts
import type { UserConfig } from './types';
import { DEFAULT_USER_CONFIG } from './constants';

const STORAGE_KEY = 'user_config';

export async function load_user_config(): Promise<UserConfig> {
    try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const stored = result[STORAGE_KEY] as Partial<UserConfig> | undefined;
        return { ...DEFAULT_USER_CONFIG, ...(stored || {}) } as UserConfig;
    } catch {
        return { ...DEFAULT_USER_CONFIG } as UserConfig;
    }
}

export async function save_user_config(patch: Partial<UserConfig>): Promise<void> {
    const current = await load_user_config();
    const next: UserConfig = { ...current, ...patch };
    await chrome.storage.local.set({ [STORAGE_KEY]: next });
}
