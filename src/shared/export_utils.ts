// shared/export_utils.ts — 统一的导出下载入口
// 三个导出入口（popup、dashboard capture、dashboard log）复用此模块。
//
// P0.62: 用户反馈"另存为记不住上次任意文件夹"。根因：
// chrome.downloads.download({ filename, saveAs:true }) 会把建议 filename 解析到
// 默认下载目录，对话框每次从默认目录打开，绕开了网页下载用的"上次目录"记忆。
// 改用 File System Access API 的 showSaveFilePicker：
//   - 可写任意位置（不限 Downloads 子目录）
//   - 传 id（按导出类型区分），浏览器按 id 持久记忆上次文件夹，等同网页下载
//   - 用户取消（AbortError）静默返回，不报错
// 保留 chrome.downloads.download 兜底：
//   - filename 含 '/'（用户配置了导出目录）→ 直接静默存到该相对目录
//   - showSaveFilePicker 不可用（如 service worker 环境）→ 退回 downloads API

import { build_export_filename } from './export_settings';
import type { UserConfig } from './types';
import { format_system_time_filename } from './system_time';

interface SaveFilePickerType {
    description: string;
    accept: Record<string, string[]>;
}

interface SaveFilePickerOptions {
    suggestedName?: string;
    id?: string;
    startIn?: string;
    types?: SaveFilePickerType[];
}

interface FileSystemWritable {
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
}

interface SaveFileHandle {
    createWritable(): Promise<FileSystemWritable>;
}

type ShowSaveFilePicker = (opts: SaveFilePickerOptions) => Promise<SaveFileHandle>;

const MIME_BY_EXT: Record<string, string> = {
    json: 'application/json',
    jsonl: 'application/json',
    html: 'text/html',
    har: 'application/json',
    zip: 'application/zip',
    log: 'text/plain',
};

function picker_types_for(filename: string): SaveFilePickerType[] {
    const ext = filename.split('.').pop()?.toLowerCase() ?? '';
    const mime = MIME_BY_EXT[ext];
    if (!ext || !mime) return [];
    return [{ description: `${ext.toUpperCase()} file`, accept: { [mime]: [`.${ext}`] } }];
}

/**
 * 统一的下载入口。所有导出最终调用此函数。
 * @param picker_id 按导出类型区分（如 capture_export / log_export），
 *                  浏览器据此记忆各类导出的上次文件夹。
 * @returns 兜底 downloads API 时返回 download_id；picker 路径返回 undefined。
 */
export async function download_blob(
    blob: Blob,
    filename: string,
    picker_id?: string,
): Promise<number | undefined> {
    const has_dir = filename.includes('/');
    const picker = (globalThis as { showSaveFilePicker?: ShowSaveFilePicker }).showSaveFilePicker;

    // 已配置导出目录（filename 含子目录）→ 静默存到该相对目录，保持原行为
    if (!has_dir && typeof picker === 'function') {
        try {
            const handle = await picker({
                suggestedName: filename,
                id: picker_id,
                startIn: 'downloads',
                types: picker_types_for(filename),
            });
            const writable = await handle.createWritable();
            await writable.write(blob);
            await writable.close();
            return undefined;
        } catch (err) {
            // 用户取消：静默返回，不视为错误
            if (err instanceof DOMException && err.name === 'AbortError') return undefined;
            throw err;
        }
    }

    const url = URL.createObjectURL(blob);
    const download_id = await chrome.downloads.download({
        url,
        filename,
        saveAs: !has_dir,
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
