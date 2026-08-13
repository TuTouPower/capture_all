// bridge/logger.ts — Node 侧结构化 stderr 日志（B1-M13）
// bridge 是 Node 进程，无 chrome logger；按项目约束（bridge 非浏览器模块可用 console，
// 但只用 warn/error 级别）输出 JSON 行到 stderr，便于关键路径可观测与机器解析。

type BridgeLogLevel = 'warn' | 'error';

export function bridge_log(level: BridgeLogLevel, event: string, fields?: Record<string, unknown>): void {
    const entry = JSON.stringify({
        ts: new Date().toISOString(),
        level,
        event,
        ...fields,
    });
    if (level === 'error') {
        console.error(entry);
    } else {
        console.warn(entry);
    }
}

export function bridge_warn(event: string, fields?: Record<string, unknown>): void {
    bridge_log('warn', event, fields);
}

