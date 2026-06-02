// background/keepalive.ts
const ALARM_NAME = 'record_all_keepalive';
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
            // Just by receiving this alarm, the SW stays alive
            console.debug('Record All: Keepalive alarm triggered');
        }
    });
}
