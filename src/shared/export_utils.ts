// shared/export_utils.ts — 统一的导出下载入口
// 三个导出入口（popup、dashboard capture、dashboard log）复用此模块，
// 行为一致：chrome.downloads.download + saveAs。
//
// P0.53: 移除 last_dir 持久化机制。chrome.downloads.download 只接受相对
// Downloads 根目录的相对路径，而 chrome.downloads.search 返回的是磁盘绝对
// 路径——无法回填为下次的建议路径，回填必然失败并覆盖用户配置目录。
// 导出目录唯一来源为用户配置（export_capture_directory / export_log_directory）；
// saveAs 对话框由 Chrome 自身记忆上次文件夹。

import { build_export_filename } from './export_settings';
import type { UserConfig } from './types';
import { format_system_time_filename } from './system_time';

/**
 * 统一的下载入口。所有导出最终调用此函数。
 * @returns download_id
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

export function build_capture_filename(
    config: Pick<
        UserConfig,
        | 'export_capture_directory'
        | 'export_filename_template'
        | 'system_time_timezone'
    >,
    capture_id: string,
    extension: 'json' | 'jsonl' | 'html' | 'har' | 'zip',
): string {
    return build_export_filename(config, capture_id, extension);
}

export function build_log_filename(
    config: Pick<UserConfig, 'export_log_directory' | 'system_time_timezone'>,
): string {
    const dir = config.export_log_directory || '';
    const date = format_system_time_filename(Date.now(), config);
    const base = `capture_all_logs_${date}.log`;
    return dir ? `${dir}/${base}` : base;
}
