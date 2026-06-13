// shared/export_utils.ts — 统一的导出下载入口
// P0.40: 三个导出入口（popup、dashboard capture、dashboard log）复用此模块，
// 行为一致：chrome.downloads.download + saveAs + 独立目录持久化

import { build_export_filename } from './export_settings';
import type { UserConfig } from './types';
import { format_system_time_filename } from './system_time';

const STORAGE_KEY_CAPTURE_DIR = 'last_capture_export_dir';
const STORAGE_KEY_LOG_DIR = 'last_log_export_dir';

export interface ExportDirs {
    capture_dir: string;
    log_dir: string;
}

export async function load_last_export_dirs(): Promise<ExportDirs> {
    const result = await chrome.storage.local.get([
        STORAGE_KEY_CAPTURE_DIR,
        STORAGE_KEY_LOG_DIR,
    ]);
    return {
        capture_dir: (result[STORAGE_KEY_CAPTURE_DIR] as string) || '',
        log_dir: (result[STORAGE_KEY_LOG_DIR] as string) || '',
    };
}

export async function save_last_export_dir(
    type: 'capture' | 'log',
    dir: string,
): Promise<void> {
    const key =
        type === 'capture' ? STORAGE_KEY_CAPTURE_DIR : STORAGE_KEY_LOG_DIR;
    await chrome.storage.local.set({ [key]: dir });
}

/**
 * 统一的下载入口。所有导出最终调用此函数。
 * @returns download_id，可用于跟踪下载完成后的目录提取
 */
export async function download_blob(
    blob: Blob,
    filename: string,
    opts?: { save_as?: boolean },
): Promise<number> {
    const url = URL.createObjectURL(blob);
    const download_id = await chrome.downloads.download({
        url,
        filename,
        saveAs: opts?.save_as ?? true,
    });
    // 延迟释放 blob URL，确保下载引擎已读取完毕
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return download_id;
}

/**
 * 跟踪下载完成，提取用户选择的目录并持久化。
 * 调用方在 download_blob() 返回 download_id 后调用此函数。
 */
export function track_export_dir(
    download_id: number,
    type: 'capture' | 'log',
): void {
    const persist = (results: Array<{ id: number; filename: string; state: string }>) => {
        if (results.length > 0 && results[0].filename) {
            const dir = extract_dir_from_filename(results[0].filename);
            if (dir) void save_last_export_dir(type, dir);
        }
    };
    // Check if download already completed before listener was registered
    chrome.downloads.search({ id: download_id }).then((results) => {
        if (results.length > 0 && results[0].state === 'complete') {
            persist(results);
            return;
        }
        const listener = (delta: {
            id: number;
            state?: { current: string };
        }) => {
            if (delta.id !== download_id || !delta.state?.current) return;
            if (delta.state.current !== 'complete' && delta.state.current !== 'interrupted') return;
            chrome.downloads.onChanged.removeListener(listener);
            if (delta.state.current === 'complete') {
                chrome.downloads.search({ id: download_id }).then(persist).catch(() => undefined);
            }
        };
        chrome.downloads.onChanged.addListener(listener);
    }).catch(() => undefined);
}

export function build_capture_filename(
    config: Pick<
        UserConfig,
        | 'export_capture_directory'
        | 'export_filename_template'
        | 'system_time_timezone'
    >,
    capture_id: string,
    extension: 'json' | 'jsonl' | 'html' | 'har' | 'zip',
    last_dir?: string,
): string {
    const dir = last_dir || config.export_capture_directory;
    return build_export_filename(
        { ...config, export_capture_directory: dir },
        capture_id,
        extension,
    );
}

export function build_log_filename(
    config: Pick<
        UserConfig,
        'export_log_directory' | 'system_time_timezone'
    >,
    last_dir?: string,
): string {
    const dir = last_dir || config.export_log_directory || '';
    const date = format_system_time_filename(Date.now(), config);
    const base = `capture_all_logs_${date}.log`;
    return dir ? `${dir}/${base}` : base;
}

export function extract_dir_from_filename(filename: string): string {
    const last_slash = filename.lastIndexOf('/');
    if (last_slash <= 0) return '';
    return filename.substring(0, last_slash);
}
