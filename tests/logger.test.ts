// tests/logger.test.ts — fault injection: Error 对象必须保留 message/stack
// P0.59: 修复前 Error 直接进 IndexedDB，structured clone 丢 enumerable props 之外的字段，
// 日志中只能看到 `{}`，无法定位真凶。
import { describe, it, expect } from 'vitest';
import { Logger } from '../src/shared/logger';
import type { AppLogEntry } from '../src/shared/types';
import type { LogTransport } from '../src/shared/logger';

// 内存 transport：捕获最后一条 entry 供断言
class CaptureTransport implements LogTransport {
    last_entry: AppLogEntry | null = null;
    write(entry: AppLogEntry): void { this.last_entry = entry; }
    flush(): Promise<void> { return Promise.resolve(); }
    get_entries(): Promise<AppLogEntry[]> { return Promise.resolve(this.last_entry ? [this.last_entry] : []); }
    count(): Promise<number> { return Promise.resolve(this.last_entry ? 1 : 0); }
    clear(): Promise<void> { this.last_entry = null; return Promise.resolve(); }
}

describe('Logger Error serialization (P0.59)', () => {
    it('preserves Error name/message/stack as plain object', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        const err = new TypeError('Cannot read properties of undefined (reading "replace")');
        logger.error('Export failed', err);

        const details = transport.last_entry?.details as Record<string, unknown> | undefined;
        expect(details).toBeDefined();
        expect(details?.name).toBe('TypeError');
        expect(details?.message).toBe('Cannot read properties of undefined (reading "replace")');
        expect(typeof details?.stack).toBe('string');
        expect((details?.stack as string).length).toBeGreaterThan(0);
    });

    it('preserves Error subclass (RangeError)', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.error('Out of range', new RangeError('offset -1'));

        const details = transport.last_entry?.details as Record<string, unknown>;
        expect(details.name).toBe('RangeError');
        expect(details.message).toBe('offset -1');
    });

    it('passes through plain object details unchanged', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.error('Plain object', { code: 42, hint: 'x' });

        const details = transport.last_entry?.details as Record<string, unknown>;
        expect(details).toEqual({ code: 42, hint: 'x' });
    });

    it('passes through string details unchanged', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.error('String detail', 'boom');

        expect(transport.last_entry?.details).toBe('boom');
    });

    it('passes through undefined details', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.error('No details');

        expect(transport.last_entry?.details).toBeUndefined();
    });

    it('error level records stack on the entry itself', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.error('with stack');

        expect(transport.last_entry?.stack).toBeDefined();
        expect(typeof transport.last_entry?.stack).toBe('string');
    });

    it('debug level does not record entry stack', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.debug('no stack');

        expect(transport.last_entry?.stack).toBeUndefined();
    });
});
