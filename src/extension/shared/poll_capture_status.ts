// shared/poll_capture_status.ts
//
// 解决 BUG-004：content_script 加载时一次性 get_status，若 SW 此时未采集就退出；
// 之后 SW 开始采集，发 sendMessage 给该 tab 会失败（"Receiving end does not exist"），
// 导致用户行为 / storage 事件 0 条。
//
// 本模块提供可注入依赖的轮询函数：content_script 加载后周期性查 SW 状态，
// 直到采集开始或主动停止。轮询与首次 get_status 共用同一逻辑。

export interface CaptureStatusResponse {
    is_capturing: boolean;
    capture_id?: string;
    start_time?: number;
    tab_id?: number;
    config?: unknown;
}

export interface PollDeps {
    get_status: () => Promise<CaptureStatusResponse | null>;
    on_active: (resp: CaptureStatusResponse) => void;
    setInterval: (handler: () => void, ms: number) => unknown;
    clearInterval: (id: unknown) => void;
}

export const POLL_INTERVAL_MS = 2000;
export const POLL_MAX_ATTEMPTS = 150; // ~5 分钟上限，避免长 idle tab 永久轮询

/**
 * 启动采集状态轮询。
 *
 * 行为：
 * - 立即执行一次 get_status；若 is_capturing 则调用 on_active 并返回（不轮询）
 * - 否则启动 setInterval 周期检查；一旦发现采集开始，调用 on_active 并清除定时器
 * - 达到 POLL_MAX_ATTEMPTS 仍未采集，停止轮询（避免泄漏）
 *
 * 返回 stop 函数，调用后清除定时器（content_script 卸载或采集结束时调用）。
 */
export function start_status_poll(deps: PollDeps): () => void {
    let timer_id: unknown = null;
    let attempts = 0;
    let stopped = false;

    const check_once = async (): Promise<boolean> => {
        try {
            const resp = await deps.get_status();
            if (resp && resp.is_capturing) {
                deps.on_active(resp);
                return true;
            }
        } catch {
            // SW 暂不可达 — 等下一轮
        }
        return false;
    };

    const clear = (): void => {
        if (timer_id !== null) {
            deps.clearInterval(timer_id);
            timer_id = null;
        }
    };

    // 首次立即检查（不延迟一个 interval）
    check_once().then((active) => {
        if (active || stopped) return;
        timer_id = deps.setInterval(() => {
            if (stopped) return;
            attempts++;
            if (attempts > POLL_MAX_ATTEMPTS) {
                clear();
                return;
            }
            check_once().then((is_active) => {
                if (is_active) clear();
            });
        }, POLL_INTERVAL_MS);
    });

    return () => {
        stopped = true;
        clear();
    };
}
