import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const icon_paths = [
    'assets/icons/icon16.png',
    'assets/icons/icon48.png',
    'assets/icons/icon128.png'
];

function read_png_bit_depth(file_path: string): number {
    const png = readFileSync(file_path);
    return png[24];
}

describe('extension icons', () => {
    test.each(icon_paths)('%s uses 8-bit PNG channels', (file_path) => {
        expect(read_png_bit_depth(file_path)).toBe(8);
    });
});
