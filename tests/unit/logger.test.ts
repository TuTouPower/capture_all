// tests/logger.test.ts — fault injection: Error 对象必须保留 message/stack
// P0.59: 修复前 Error 直接进 IndexedDB，structured clone 丢 enumerable props 之外的字段，
// 日志中只能看到 `{}`，无法定位真凶。
import { describe, it, expect } from 'vitest';
import { Logger } from '../../src/shared/logger';
import type { AppLogEntry } from '../../src/shared/types';
import type { LogTransport } from '../../src/shared/logger';

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

describe('Logger redaction & size cap', () => {
    it('redacts sensitive URL query in string details', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.info('nav', 'https://example.com/path?token=SECRET&id=1');

        const value = transport.last_entry?.details as string;
        expect(value).not.toContain('SECRET');
        expect(value).toContain('%5BREDACTED%5D');
        expect(value).toContain('id=1');
    });

    it('redacts sensitive URL inside nested object details', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.info('ctx', { user: 'a', meta: { url: 'https://x?api_key=K&path=/y' } });

        const details = transport.last_entry?.details as { meta: { url: string } };
        expect(details.meta.url).not.toContain('K');
        expect(details.meta.url).toContain('%5BREDACTED%5D');
        expect(details.meta.url).toContain('path=%2Fy');
    });

    it('redacts URL inside arrays', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.info('arr', ['https://x?token=Z', 'keep']);

        const arr = transport.last_entry?.details as string[];
        expect(arr[0]).not.toContain('Z');
        expect(arr[1]).toBe('keep');
    });

    it('truncates oversized string to MAX_LOG_ENTRY_BYTES + marker', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        const huge = 'a'.repeat(100 * 1024);
        logger.info('big', huge);

        const value = transport.last_entry?.details as string;
        expect(value.length).toBeLessThan(huge.length);
        expect(value).toContain('[TRUNCATED]');
    });

    it('redacts URL inside Error message', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        const err = new Error('fetch failed: https://api.example.com/?token=SECRET');
        logger.error('fail', err);

        const details = transport.last_entry?.details as { message: string };
        expect(details.message).not.toContain('SECRET');
        expect(details.message).toContain('%5BREDACTED%5D');
    });

    it('redacts URL in top-level message string', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.warn('redirect to https://x?token=SECRET happened');

        expect(transport.last_entry?.message).not.toContain('SECRET');
        expect(transport.last_entry?.message).toContain('%5BREDACTED%5D');
    });

    it('handles circular references without throwing', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        const obj: Record<string, unknown> = { url: 'https://x?token=Z' };
        obj.self = obj;

        expect(() => logger.info('circular', obj)).not.toThrow();
        const details = transport.last_entry?.details as Record<string, unknown>;
        expect(details.url).not.toContain('Z');
        expect(details.self).toBe('[Circular]');
    });

    it('keeps non-URL non-oversized primitives unchanged', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.error('String detail', 'boom');

        expect(transport.last_entry?.details).toBe('boom');
    });
});
