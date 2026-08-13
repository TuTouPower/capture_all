// tests/unit/content_log_privacy.test.ts
// t172 SEC-004 AC-001~004: content 未采集不产生 URL 日志 + log level 下发 + 默认 info
import { describe, expect, it, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Logger } from '../../src/shared/logger';
import type { AppLogEntry } from '../../src/shared/types';

const project_root = resolve(__dirname, '..', '..');
const content_source = readFileSync(resolve(project_root, 'src/extension/content/content_script.ts'), 'utf8');

// 内存 transport：捕获条目供断言
class CaptureTransport {
    entries: AppLogEntry[] = [];
    write(entry: AppLogEntry): void { this.entries.push(entry); }
    flush(): Promise<void> { return Promise.resolve(); }
    get_entries(): Promise<AppLogEntry[]> { return Promise.resolve(this.entries); }
    count(): Promise<number> { return Promise.resolve(this.entries.length); }
    clear(): Promise<void> { this.entries = []; return Promise.resolve(); }
}

describe('content 加载日志隐私（t172）', () => {
    afterEach(() => {
        Logger.set_level('info');
    });

    it('AC-001: 模块加载时不再记录页面 URL 日志（无 Content script loaded）', () => {
        expect(content_source).not.toContain('Content script loaded');
        expect(content_source).not.toMatch(/logger\.info\([^)]*window\.location\.href/);
    });

    it('AC-002a: start 消息应用下发的 log_level（silent/warn 时 content 不写 info）', () => {
        // start 分支读取 message.log_level 并应用
        expect(content_source).toContain('message.log_level');
        expect(content_source).toContain('Logger.set_level');
        // 模块加载路径无任何 logger 写入（只有消息处理与采集内日志）
        const module_level_writes = (content_source.match(/^logger\.(info|warn|error|debug)/gm) ?? []);
        expect(module_level_writes).toHaveLength(0);
    });


    it('AC-002c: 重载恢复采集路径（status poll on_active）同样应用 log_level（f001）', () => {
        expect(content_source).toContain('resp.log_level');
        expect(content_source).toMatch(/on_active[\s\S]{0,200}Logger\.set_level\(resp\.log_level/);
    });
    it('AC-002b: Logger.set_level(silent/warn) 后 content 不写 info 级日志（行为）', () => {
        // silent：全部抑制
        const t1 = new CaptureTransport();
        Logger.set_level('silent');
        new Logger('test/silent', t1).info('no info');
        new Logger('test/silent', t1).error('no error either');
        expect(t1.entries).toHaveLength(0);

        // warn：info 不写，warn/error 写
        const t2 = new CaptureTransport();
        Logger.set_level('warn');
        const logger = new Logger('test/warn', t2);
        logger.info('info filtered');
        logger.warn('warn recorded');
        logger.error('error recorded');
        expect(t2.entries.map(e => e.message)).toEqual(['warn recorded', 'error recorded']);
    });

    it('AC-003: 默认 level 为 info——未显式 set_level 时 info 写入、debug 不写入', () => {
        const transport = new CaptureTransport();
        const logger = new Logger('test/default', transport);
        // 不调用 set_level：默认 info
        logger.debug('debug filtered');
        logger.info('info recorded');
        expect(transport.entries.map(e => e.message)).toEqual(['info recorded']);
    });
});
