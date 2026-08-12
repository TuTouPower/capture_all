// background/keepalive.ts
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';
import { flush_all } from './storage';

const logger = new Logger('background/keepalive', get_app_log_transport());

const ALARM_NAME = 'capture_all_keepalive';
const ALARM_INTERVAL_MINUTES = 0.5; // 30 seconds

// T068: 幂等标志，避免重复注册 listener
let listener_registered = false;

// B2-M16: handler 不再空操作——执行真实工作（flush 缓冲事件落库），
// 既延长 SW 存活时间，又保证已采集事件尽早持久化（与周期 flush 幂等）。
async function keepalive_do_work(): Promise<void> {
    try {
        await flush_all();
        await get_app_log_transport().flush();
        logger.debug('Keepalive flush completed');
    } catch (err) {
        logger.warn('Keepalive flush failed', err);
    }
}

const keepalive_handler = (alarm: { name: string }): void => {
    if (alarm.name === ALARM_NAME) {
        void keepalive_do_work();
    }
};

export function start_keepalive(): void {
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: ALARM_INTERVAL_MINUTES
    });
}

export function stop_keepalive(): void {
    chrome.alarms.clear(ALARM_NAME);
}

export function setup_keepalive_listener(): void {
    if (listener_registered) return;
    chrome.alarms.onAlarm.addListener(keepalive_handler);
    listener_registered = true;
}
