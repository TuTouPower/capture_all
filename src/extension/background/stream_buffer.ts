// background/stream_buffer.ts
// Throttled accumulation buffer for streaming response bodies.
// Flushes on time threshold, byte threshold, or force (capture stop / connection end).
// M2 fix: on_flush callback enqueues to existing batch write queue (single-writer model).

export interface StreamBufferOptions {
    time_threshold_ms?: number;
    byte_threshold?: number;
    on_flush: (request_id: string, accumulated: string) => void;
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

    function flush(request_id: string): void {
        const entry = buffers.get(request_id);
        if (!entry || entry.chunks.length === 0) return;
        if (entry.timer !== null) {
            clearTimeout(entry.timer);
            entry.timer = null;
        }
        const combined = entry.chunks.join('');
        entry.chunks = [];
        entry.bytes = 0;
        on_flush(request_id, combined);
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

    function force_flush(request_id: string): void {
        flush(request_id);
    }

    function flush_all(): void {
        for (const request_id of buffers.keys()) {
            flush(request_id);
        }
    }

    function remove(request_id: string): void {
        const entry = buffers.get(request_id);
        if (entry?.timer !== null) {
            clearTimeout(entry!.timer!);
        }
        buffers.delete(request_id);
    }

    function size(): number {
        return buffers.size;
    }

    return { append, force_flush, flush_all, remove, size };
}
