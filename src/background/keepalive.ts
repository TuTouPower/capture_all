// background/keepalive.ts
import { Logger } from '../shared/logger';
import { get_app_log_transport } from './app_log_storage';

const logger = new Logger('background/keepalive', get_app_log_transport());

const ALARM_NAME = 'capture_all_keepalive';
const ALARM_INTERVAL_MINUTES = 0.5; // 30 seconds

export function start_keepalive(): void {
    chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: ALARM_INTERVAL_MINUTES
    });
}

export function stop_keepalive(): void {
    chrome.alarms.clear(ALARM_NAME);
}

export function setup_keepalive_listener(): void {
    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === ALARM_NAME) {
            logger.debug('Keepalive alarm triggered');
        }
    });
}
