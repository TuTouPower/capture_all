import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

const project_root = resolve(__dirname, '..', '..');

interface PackageManifest {
    name: string;
    private: boolean;
    version: string;
    description: string;
    keywords: string[];
    repository: {
        type: string;
        url: string;
    };
    license: string;
    engines: Record<string, string>;
    scripts: Record<string, string>;
    devDependencies: Record<string, string>;
}

interface PackageLock {
    name: string;
    packages: Record<
        string,
        {
            name?: string;
            version?: string;
            license?: string;
            engines?: Record<string, string>;
            devDependencies?: Record<string, string>;
        }
    >;
}

const package_json = JSON.parse(
    readFileSync(resolve(project_root, 'package.json'), 'utf8'),
) as PackageManifest;
const package_lock = JSON.parse(
    readFileSync(resolve(project_root, 'package-lock.json'), 'utf8'),
) as PackageLock;

describe('package metadata', () => {
    test('identifies the public project without enabling npm publication', () => {
        expect(package_json).toMatchObject({
            name: 'capture-all',
            private: true,
            version: '0.1.0',
            description: expect.stringContaining('Chrome MV3'),
            repository: {
                type: 'git',
                url: 'git+https://github.com/TuTouPower/capture_all.git',
            },
            license: 'Apache-2.0',
            keywords: expect.arrayContaining([
                'chrome-extension',
                'browser-debugging',
                'mcp',
            ]),
        });
    });

    test('declares the Node versions supported by Vite', () => {
        expect(package_json.engines).toEqual({
            node: '^20.19.0 || >=22.12.0',
        });
        expect(
            readFileSync(resolve(project_root, '.nvmrc'), 'utf8').trim(),
        ).toBe('20.19.0');
    });

    test('uses cross-platform esbuild commands without changing outputs', () => {
        expect(package_json.scripts['build:bridge']).toBe(
            'esbuild src/bridge/main.ts --bundle --platform=node '
            + '--format=esm --external:ws '
            + '--outfile=artifacts/bridge/bridge.mjs',
        );
        expect(package_json.scripts['build:mcp']).toBe(
            'esbuild src/mcp/main.ts --bundle --platform=node '
            + '--format=esm --external:ws '
            + '--outfile=artifacts/mcp/mcp.mjs',
        );
        expect(package_json.devDependencies.esbuild).toBe('^0.28.1');
    });

    test('declares a compatible secure Vite toolchain', () => {
        expect(package_json.devDependencies).toMatchObject({
            '@crxjs/vite-plugin': '^2.7.1',
            vite: '^8.1.4',
            vitest: '^4.1.10',
        });
    });

    test('keeps root package metadata synchronized in the lockfile', () => {
        expect(package_lock.name).toBe(package_json.name);
        expect(package_lock.packages['']).toMatchObject({
            name: package_json.name,
            version: package_json.version,
            license: package_json.license,
            engines: package_json.engines,
            devDependencies: expect.objectContaining({
                '@crxjs/vite-plugin':
                    package_json.devDependencies['@crxjs/vite-plugin'],
                esbuild: package_json.devDependencies.esbuild,
                vite: package_json.devDependencies.vite,
                vitest: package_json.devDependencies.vitest,
            }),
        });
    });
});
