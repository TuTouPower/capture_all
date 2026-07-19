// background/capture_state.ts
// SW capture 状态机单例。按 T028 spike 设计实现：
// 5 阶段（idle/starting/capturing/stopping/rolling_back）+ generation token + 串行化。

import type { CaptureConfig } from '../../shared/types';

export type CapturePhase = 'idle' | 'starting' | 'capturing' | 'stopping' | 'rolling_back';

export interface CaptureRuntimeState {
    phase: CapturePhase;
    capture_id: string | null;
    start_time: number | null;
    config: CaptureConfig | null;
    generation: number;
}

const state: CaptureRuntimeState = {
    phase: 'idle',
    capture_id: null,
    start_time: null,
    config: null,
    generation: 0,
};

// 串行化：start/stop 必须等前一次完成
let pending_promise: Promise<unknown> = Promise.resolve();

export function get_state(): Readonly<CaptureRuntimeState> {
    return state;
}

export function current_generation(): number {
    return state.generation;
}

export function is_active_generation(gen: number): boolean {
    return state.generation === gen && (state.phase === 'capturing' || state.phase === 'starting');
}

// 串行化执行：start/stop 必须排队
export async function run_exclusive<T>(fn: (state: CaptureRuntimeState) => Promise<T>): Promise<T> {
    const prev = pending_promise;
    let release!: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    pending_promise = prev.then(() => next);
    await prev;
    try {
        return await fn(state);
    } finally {
        release();
    }
}

// begin_start 进入 starting 阶段，递增 generation。
// 返回 commit/rollback 句柄；commit -> capturing，rollback -> idle（T032 完整实现）。
export function begin_start(capture_id: string, config: CaptureConfig): {
    generation: number;
    commit: () => void;
    rollback: () => void;
} {
    state.phase = 'starting';
    state.capture_id = capture_id;
    state.start_time = Date.now();
    state.config = config;
    state.generation += 1;
    const gen = state.generation;
    return {
        generation: gen,
        commit: () => {
            if (state.generation === gen) state.phase = 'capturing';
        },
        rollback: () => {
            if (state.generation === gen) {
                state.phase = 'idle';
                state.capture_id = null;
                state.start_time = null;
                state.config = null;
            }
        },
    };
}

// begin_stop 进入 stopping 阶段。
export function begin_stop(): { generation: number; commit: () => void } {
    const gen = state.generation;
    state.phase = 'stopping';
    return {
        generation: gen,
        commit: () => {
            if (state.generation === gen) {
                state.phase = 'idle';
                state.capture_id = null;
                state.start_time = null;
                state.config = null;
            }
        },
    };
}
