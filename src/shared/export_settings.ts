// shared/export_settings.ts
import type { UserConfig } from './types';

type ExportExtension = 'json' | 'jsonl' | 'html' | 'har';

type ExportConfig = Pick<UserConfig, 'export_directory' | 'export_filename_template'>;

export function build_export_filename(config: ExportConfig, session_id: string, extension: ExportExtension, now = new Date()): string {
    const date = now.toISOString().slice(0, 10);
    const base_name = config.export_filename_template
        .split('{session_id}').join(session_id)
        .split('{date}').join(date)
        .split('{ext}').join(extension);
    const filename = base_name.endsWith(`.${extension}`) ? base_name : `${base_name}.${extension}`;
    const directory = normalize_download_path(config.export_directory);

    return directory ? `${directory}/${normalize_download_path(filename)}` : normalize_download_path(filename);
}

function normalize_download_path(path: string): string {
    return path
        .split('/')
        .map(part => part.trim())
        .filter(part => part.length > 0 && part !== '.' && part !== '..')
        .join('/');
}
