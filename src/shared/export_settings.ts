// shared/export_settings.ts
import type { UserConfig } from './types';
import { format_system_time_filename } from './system_time';

type ExportExtension = 'json' | 'jsonl' | 'html' | 'har';

type ExportConfig = Pick<UserConfig, 'export_capture_directory' | 'export_filename_template' | 'system_time_timezone'>;

export function build_export_filename(config: ExportConfig, capture_id: string, extension: ExportExtension, now = new Date()): string {
    const date = format_system_time_filename(now.getTime(), config);
    const base_name = config.export_filename_template
        .split('{capture_id}').join(capture_id)
        .split('{session_id}').join(capture_id)
        .split('{date}').join(date)
        .split('{ext}').join(extension);
    const filename = base_name.endsWith(`.${extension}`) ? base_name : `${base_name}.${extension}`;
    const directory = normalize_download_path(config.export_capture_directory);

    return directory ? `${directory}/${normalize_download_path(filename)}` : normalize_download_path(filename);
}

function normalize_download_path(path: string): string {
    return path
        .split('/')
        .map(part => part.trim())
        .filter(part => part.length > 0 && part !== '.' && part !== '..')
        .join('/');
}
