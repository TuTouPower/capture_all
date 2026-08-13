// duration_limit.ts — 采集时长上限执行（t159）
// 24h 单采集时长约束：采集成功时持久化截止时间并注册可取消 alarm（MV3 优先），
// alarm 到期触发 on_expired（service_worker 调 stop_capture('max_duration')）；
// chrome.alarms 不可用环境退化为内存 timer（防御）。
import { MAX_SESSION_DURATION_MS } from '../../shared/constants';
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/duration_limit', get_app_log_transport());

export const DURATION_ALARM_NAME = 'capture_max_duration';
/** 持久化截止时间键（SW 重启恢复读取） */
export const DEADLINE_STORAGE_KEY = 'active_capture_deadline_ms';

let fallback_timer: ReturnType<typeof setTimeout> | null = null;

/** 判断 alarm 是否为本模块的时长上限 alarm（service_worker onAlarm 转发用）。 */
export function is_duration_alarm(name: string): boolean {
    return name === DURATION_ALARM_NAME;
}

/**
 * 注册采集时长上限。deadline_ms 为绝对截止时间；on_expired 在到期时调用一次。
 * alarm（MV3，可跨 SW 重启持久）优先；不可用/失败时退化为内存 timer（仅当前进程有效，
 * SW 重启恢复由 restore 路径重建）。
 */
export async function arm_duration_limit(deadline_ms: number, on_expired: () => void): Promise<void> {
    disarm_duration_limit();
    const delay_ms = Math.max(0, deadline_ms - Date.now());
    try {
        const alarms = (globalThis as unknown as { chrome?: { alarms?: typeof chrome.alarms } }).chrome?.alarms;
        if (alarms?.create) {
            alarms.create(DURATION_ALARM_NAME, { when: deadline_ms });
            // MV3 create 失败可能走 runtime.lastError 而非抛异常；检测后回退内存 timer
            const last_error = (globalThis as unknown as { chrome?: { runtime?: { lastError?: unknown } } }).chrome?.runtime?.lastError;
            if (last_error) {
                throw new Error(String(last_error));
            }
            return;
        }
    } catch (err) {
        logger.warn('chrome.alarms unavailable, fallback to in-memory timer', { error: String(err).slice(0, 80) });
    }
    fallback_timer = setTimeout(() => {
        fallback_timer = null;
        on_expired();
    }, delay_ms);
}

/** 取消时长上限 alarm 与 fallback timer（手动停止/采集结束调用，幂等）。 */
export function disarm_duration_limit(): void {
    if (fallback_timer) {
        clearTimeout(fallback_timer);
        fallback_timer = null;
    }
    try {
        const alarms = (globalThis as unknown as { chrome?: { alarms?: typeof chrome.alarms } }).chrome?.alarms;
        if (alarms?.clear) {
            void Promise.resolve(alarms.clear(DURATION_ALARM_NAME)).catch(() => { /* best-effort */ });
        }
    } catch {
        // best-effort
    }
}

/** 便捷：当前采集的默认截止时间（start_time + 24h）。 */
export function compute_deadline_ms(start_time: number): number {
    return start_time + MAX_SESSION_DURATION_MS;
}
