// background/notify_tabs.ts — t195 AC-004: start 并行通知抽为可 import 单元。
// 独立模块避免 service_worker 顶层 chrome 副作用阻断 import（行为级单测入口）。

/**
 * B2-M6: 多 tab 并行通知——Promise.all 全量并发，避免串行重试阻塞 start
 * （最坏 N×(200+400+600)ms 卡在 run_exclusive 内）。send 由调用方注入。
 */
export async function notify_tabs_in_parallel<T>(
    tabs: Array<{ id?: number; url?: string }>,
    send: (tabId: number) => Promise<T>,
): Promise<Array<T | undefined>> {
    const http_tabs = tabs.filter((t) => /^https?:\/\//.test(t.url || ''));
    return Promise.all(http_tabs.map(async (tab) => {
        if (!tab.id) return undefined;
        return send(tab.id);
    }));
}
