// shared/paged_reader.ts — 全量分页读取统一实现（ADR-012: PAGE_SIZE=5000）
// 供 capture_data_reader.ts / exporter.ts / agent_data_queries.ts 共用。
// 读取路径禁止引入固定上限；若未来需内存预算约束，须显式 truncated/失败而非静默裁切。

export const PAGE_SIZE = 5000;

/**
 * 全量分页读取。fetcher 隐式契约：
 * - 单次返回条数 ≤ limit（storage 层 cursor 分页语义）；
 * - offset 单调推进时批次不重不漏；
 * 满足契约时本函数返回全部记录；fetcher 异常原样向上传播（不吞错）。
 */
export async function fetch_all_records<T>(
    fetcher: (offset: number, limit: number) => Promise<T[]>,
): Promise<T[]> {
    const all: T[] = [];
    let offset = 0;
    while (true) {
        const batch = await fetcher(offset, PAGE_SIZE);
        if (batch.length === 0) break;
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        offset += batch.length;
    }
    return all;
}
