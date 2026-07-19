// background/stream_buffer.ts
// Throttled accumulation buffer for streaming response bodies.
// Flushes on time threshold, byte threshold, or force (capture stop / connection end).
// T024: flush 保留 entry，force_flush/flush_all 默认删除 entry；on_flush 失败回填 chunks；
// remove 幂等；size 仅计活跃流。

export interface StreamBufferOptions {
    time_threshold_ms?: number;
    byte_threshold?: number;
    on_flush: (request_id: string, accumulated: string) => Promise<void> | void;
}

interface BufferEntry {
    chunks: string[];
    bytes: number;
    timer: ReturnType<typeof setTimeout> | null;
}

const DEFAULT_TIME_MS = 1000;
const DEFAULT_BYTES = 16 * 1024; // 16KB

export function create_stream_buffer(options: StreamBufferOptions) {
    const time_ms = options.time_threshold_ms ?? DEFAULT_TIME_MS;
    const byte_threshold = options.byte_threshold ?? DEFAULT_BYTES;
    const on_flush = options.on_flush;
    const buffers = new Map<string, BufferEntry>();

    // flush 同步调用 on_flush；失败回填 chunks 以备重试。
    // delete_after=true 时成功后从 buffers 删除 entry（连接结束语义）。
    function flush(request_id: string, delete_after: boolean = false): void {
        const entry = buffers.get(request_id);
        if (!entry || entry.chunks.length === 0) {
            if (delete_after && entry) {
                if (entry.timer !== null) {
                    clearTimeout(entry.timer);
                    entry.timer = null;
                }
                buffers.delete(request_id);
            }
            return;
        }
        if (entry.timer !== null) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        const combined = entry.chunks.join('');
        const entry_chunks_snapshot = entry.chunks;
        const entry_bytes_snapshot = entry.bytes;

        try {
            const ret = on_flush(request_id, combined);
            if (ret && typeof (ret as Promise<void>).then === 'function') {
                // 异步路径：清空 chunks，失败时异步回填
                entry.chunks = [];
                entry.bytes = 0;
                (ret as Promise<void>).catch(() => {
                    const e = buffers.get(request_id);
                    if (e) {
                        e.chunks.unshift(...entry_chunks_snapshot);
                        e.bytes += entry_bytes_snapshot;
                    }
                });
                if (delete_after) buffers.delete(request_id);
                return;
            }
            // 同步路径：成功清空
            entry.chunks = [];
            entry.bytes = 0;
            if (delete_after) buffers.delete(request_id);
        } catch {
            // 同步失败：保留 chunks 不清空，调用方可重试 force_flush；吞掉异常避免污染主流程
        }
    }

    function append(request_id: string, chunk: string): void {
        let entry = buffers.get(request_id);
        if (!entry) {
            entry = { chunks: [], bytes: 0, timer: null };
            buffers.set(request_id, entry);
        }

        entry.chunks.push(chunk);
        entry.bytes += new TextEncoder().encode(chunk).length;

        if (entry.bytes >= byte_threshold) {
            flush(request_id);
            return;
        }

        if (entry.timer === null) {
            entry.timer = setTimeout(() => flush(request_id), time_ms);
        }
    }

    // force_flush = flush + delete entry（连接结束语义）
    function force_flush(request_id: string): void {
        flush(request_id, true);
    }

    function flush_all(): void {
        for (const request_id of [...buffers.keys()]) {
            flush(request_id, true);
        }
    }

    // remove 幂等：不存在 request_id 不抛错
    function remove(request_id: string): void {
        const entry = buffers.get(request_id);
        if (entry?.timer != null) {
            clearTimeout(entry.timer);
        }
        buffers.delete(request_id);
    }

    // size 仅计 chunks.length > 0 的活跃流（空 entry 不计）
    function size(): number {
        let count = 0;
        for (const entry of buffers.values()) {
            if (entry.chunks.length > 0) count++;
        }
        return count;
    }

    return { append, force_flush, flush_all, remove, size };
}
