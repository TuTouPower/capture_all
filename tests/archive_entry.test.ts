import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

describe('ZIP export entries', () => {
    it('dashboard imports build_archive from archive_builder', () => {
        const src = read('src/dashboard/dashboard_shared.ts');
        expect(src).toMatch(/import.*build_archive.*archive_builder/);
    });
    it('popup imports build_archive from archive_builder', () => {
        const src = read('src/popup/popup.ts');
        expect(src).toMatch(/import.*build_archive.*archive_builder/);
    });
});
