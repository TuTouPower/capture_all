// background/keepalive.ts
import { Logger } from '../../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/keepalive', get_app_log_transport());

const ALARM_NAME = 'capture_all_keepalive';
const ALARM_INTERVAL_MINUTES = 0.5; // 30 seconds

// T068: 幂等标志，避免重复注册 listener
let listener_registered = false;
const keepalive_handler = (alarm: { name: string }): void => {
    if (alarm.name === ALARM_NAME) {
        logger.debug('Keepalive alarm triggered');
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
