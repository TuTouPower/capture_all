// tests/logger.test.ts — fault injection: Error 对象必须保留 message/stack
// P0.59: 修复前 Error 直接进 IndexedDB，structured clone 丢 enumerable props 之外的字段，
// 日志中只能看到 `{}`，无法定位真凶。
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger, MessageLogTransport } from '../../src/shared/logger';
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

    // H3: credential 形字段名整体脱敏，阻止明文入 app_logs
    it('redacts credential fields in object details (H3)', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.info('ctx', { headers: { authorization: 'Bearer xyz', 'x-api-key': 'KEY123', 'Content-Type': 'application/json' } });

        const details = transport.last_entry?.details as { headers: Record<string, unknown> };
        expect(details.headers.authorization).toBe('[REDACTED]');
        expect(details.headers['x-api-key']).toBe('[REDACTED]');
        expect(details.headers['Content-Type']).toBe('application/json');
    });

    it('redacts token/secret/password named fields nested deep (H3)', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.info('ctx', { session: { access_token: 'AT', refreshToken: 'RT' }, config: { password: 'pw', other: 'keep' } });

        const details = transport.last_entry?.details as { session: Record<string, unknown>; config: Record<string, unknown> };
        expect(details.session.access_token).toBe('[REDACTED]');
        expect(details.session.refreshToken).toBe('[REDACTED]');
        expect(details.config.password).toBe('[REDACTED]');
        expect(details.config.other).toBe('keep');
    });

    it('redacts cookie/set-cookie/secret fields (H3)', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.info('ctx', { headers: { cookie: 'session=abc', 'set-cookie': 'id=1', secret: 's3cr3t', 'X-Custom': 'keep' } });

        const details = transport.last_entry?.details as { headers: Record<string, unknown> };
        expect(details.headers.cookie).toBe('[REDACTED]');
        expect(details.headers['set-cookie']).toBe('[REDACTED]');
        expect(details.headers.secret).toBe('[REDACTED]');
        expect(details.headers['X-Custom']).toBe('keep');
    });

    it('redacts sensitive field whose value is an object (H3)', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        logger.info('ctx', { token: { client_id: 'x', secret_key: 'y' } });

        const details = transport.last_entry?.details as { token: unknown };
        expect(details.token).toBe('[REDACTED]');
    });

    it('truncates oversized string to MAX_LOG_ENTRY_BYTES + marker', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        const huge = 'a'.repeat(100 * 1024);
        logger.info('big', huge);

        const value = transport.last_entry?.details as string;
        expect(value.length).toBeLessThan(huge.length);
        expect(value).toContain('[TRUNCATED]');
    }, 10000);

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

// B1-M7: sanitize_value 对 getter 抛错的 Proxy/对象返回 '[Unserializable]'，日志点不成为崩溃源
describe('Logger sanitize_value getter guard (B1-M7)', () => {
    it('returns [Unserializable] when an object getter throws', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        const obj: Record<string, unknown> = {};
        Object.defineProperty(obj, 'boom', {
            get() { throw new Error('getter failed'); },
            enumerable: true,
        });

        expect(() => logger.info('ctx', { obj })).not.toThrow();
        const details = transport.last_entry?.details as { obj: unknown };
        expect(details.obj).toBe('[Unserializable]');
    });

    it('returns [Unserializable] for a Proxy whose get trap throws', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        // target 需有 own key，Object.entries 才会经 [[Get]] 触发 get trap
        const proxy = new Proxy({ a: 1 }, { get() { throw new Error('trap'); } });

        expect(() => logger.info('proxy', proxy)).not.toThrow();
        expect(transport.last_entry?.details).toBe('[Unserializable]');
    });

    it('still cleans the seen set after getter failure (no cross-call pollution)', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test', transport);

        const obj: Record<string, unknown> = {};
        Object.defineProperty(obj, 'boom', {
            get() { throw new Error('getter failed'); },
            enumerable: true,
        });

        expect(() => logger.info('first', obj)).not.toThrow();
        expect(() => logger.info('second', { self: obj })).not.toThrow();
        // 第二次日志时同一对象不应被 seen 残留误判为 [Circular]
        const details = transport.last_entry?.details as { self: unknown };
        expect(details.self).toBe('[Unserializable]');
    });
});

// B2-M20: MessageLogTransport.flush 50ms 循环加轮次上限，写不停止时不无限自旋
describe('MessageLogTransport flush round cap (B2-M20)', () => {
    let original_chrome: unknown;
    let send_mock: ReturnType<typeof vi.fn>;

    afterEach(() => {
        (globalThis as any).chrome = original_chrome;
        vi.restoreAllMocks();
    });

    function make_entry(message: string): AppLogEntry {
        return { id: `log_${Math.random()}`, timestamp: Date.now(), level: 'debug', module: 'm', message };
    }

    it('flush stops after at most 5 rounds even when writes keep arriving', async () => {
        original_chrome = (globalThis as any).chrome;
        send_mock = vi.fn().mockRejectedValue(new Error('SW dormant'));
        (globalThis as any).chrome = { runtime: { sendMessage: send_mock } };

        const transport = new MessageLogTransport();
        transport.write(make_entry('prime'));
        const writer = setInterval(() => transport.write(make_entry('x')), 5);

        const started = Date.now();
        await transport.flush();
        clearInterval(writer);
        const elapsed = Date.now() - started;

        // 轮次上限 5：send_batch 至多调用 5 次，总耗时不超过 ~5×50ms + 余量
        expect(send_mock.mock.calls.length).toBeLessThanOrEqual(5);
        expect(send_mock.mock.calls.length).toBeGreaterThanOrEqual(1);
        expect(elapsed).toBeLessThan(5 * 50 + 200);
    });

    it('flush does not send when buffer is empty', async () => {
        original_chrome = (globalThis as any).chrome;
        send_mock = vi.fn().mockRejectedValue(new Error('SW dormant'));
        (globalThis as any).chrome = { runtime: { sendMessage: send_mock } };

        const transport = new MessageLogTransport();
        await transport.flush();
        expect(send_mock).not.toHaveBeenCalled();
    });
});
