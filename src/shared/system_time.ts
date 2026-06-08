// shared/system_time.ts
import type { CaptureEvent, CaptureRecord, ConsoleEventData, NetworkRequestData, UserConfig } from './types';

export interface ExportableCaptureData {
    capture: CaptureRecord;
    events: CaptureEvent[];
    network_requests: NetworkRequestData[];
    console_events: ConsoleEventData[];
}

export type CaptureWithSystemTimes = CaptureRecord & {
    start_time_system_time: string;
    end_time_system_time: string | null;
};

export type RecordWithSystemTime<T> = T & {
    absolute_time_system_time: string;
};

export interface ExportableCaptureDataWithSystemTimes {
    capture: CaptureWithSystemTimes;
    events: Array<RecordWithSystemTime<CaptureEvent>>;
    network_requests: Array<RecordWithSystemTime<NetworkRequestData>>;
    console_events: Array<RecordWithSystemTime<ConsoleEventData>>;
}

type SystemTimeConfig = Pick<UserConfig, 'system_time_timezone'>;

export function format_system_time(ts: string | number, config: SystemTimeConfig): string {
    const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };

    if (config.system_time_timezone !== 'browser') {
        options.timeZone = config.system_time_timezone;
    }

    return new Intl.DateTimeFormat('sv-SE', options).format(new Date(ms));
}

export function add_system_times_to_capture_data(data: ExportableCaptureData, config: SystemTimeConfig): ExportableCaptureDataWithSystemTimes {
    return {
        capture: add_capture_system_times(data.capture, config),
        events: data.events.map(event => add_absolute_system_time(event, config)),
        network_requests: data.network_requests.map(request => add_absolute_system_time(request, config)),
        console_events: data.console_events.map(log => add_absolute_system_time(log, config))
    };
}

export function add_capture_system_times(capture: CaptureRecord, config: SystemTimeConfig): CaptureWithSystemTimes {
    return {
        ...capture,
        start_time_system_time: format_system_time(capture.started_at, config),
        end_time_system_time: capture.ended_at === null ? null : format_system_time(capture.ended_at, config)
    };
}

export function add_absolute_system_time<T>(record: T, config: SystemTimeConfig): RecordWithSystemTime<T> {
    const absolute_time = (record as Record<string, unknown>).absolute_time;
    let absolute_time_system_time = '';
    if (typeof absolute_time === 'string' || typeof absolute_time === 'number') {
        absolute_time_system_time = format_system_time(absolute_time, config);
    }
    return {
        ...record,
        absolute_time_system_time
    };
}

export const add_system_times_to_session_data = add_system_times_to_capture_data;
export const add_session_system_times = add_capture_system_times;
export type ExportableSessionData = ExportableCaptureData;
export type ExportableSessionDataWithSystemTimes = ExportableCaptureDataWithSystemTimes;
export type SessionWithSystemTimes = CaptureWithSystemTimes;
