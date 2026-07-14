import {
    readFileSync,
    readdirSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const project_root = resolve(__dirname, '..');
const manifest_path = resolve(project_root, 'manifest.json');
const manifest = read_manifest(manifest_path);

interface ExtensionManifest {
    permissions: string[];
    host_permissions: string[];
    content_scripts: Array<{
        matches: string[];
        js: string[];
    }>;
}

function read_manifest(path: string): ExtensionManifest {
    return JSON.parse(readFileSync(path, 'utf8')) as ExtensionManifest;
}

function list_source_files(directory: string): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) {
            return list_source_files(path);
        }
        return ['.ts', '.tsx', '.js', '.jsx'].includes(extname(entry.name))
            ? [path]
            : [];
    });
}

describe('manifest permission contract', () => {
    test('keeps permissions required by capture features', () => {
        expect(manifest.permissions).toEqual([
            'storage',
            'webRequest',
            'debugger',
            'tabs',
            'alarms',
            'downloads',
            'cookies',
        ]);
        expect(manifest.host_permissions).toEqual(['<all_urls>']);
    });

    test('uses declarative content scripts without scripting permission', () => {
        expect(manifest.permissions).not.toContain('scripting');
        expect(manifest.content_scripts).toEqual([
            expect.objectContaining({
                matches: ['<all_urls>'],
                js: ['src/content/content_script.ts'],
            }),
        ]);

        for (const path of list_source_files(resolve(project_root, 'src'))) {
            expect(
                readFileSync(path, 'utf8'),
                `${path} uses chrome.scripting without manifest permission`,
            ).not.toMatch(/chrome\.scripting\b/);
        }
    });

    test('does not request activeTab alongside broader access', () => {
        expect(manifest.permissions).not.toContain('activeTab');
        expect(manifest.permissions).toContain('tabs');
        expect(manifest.host_permissions).toContain('<all_urls>');
    });

    test('Vite passes the source manifest directly to CRXJS', () => {
        const vite_config = readFileSync(
            resolve(project_root, 'vite.config.ts'),
            'utf8',
        );

        expect(vite_config).toContain("import manifest from './manifest.json'");
        expect(vite_config).toContain('crx({ manifest })');
    });
});
