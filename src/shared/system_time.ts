// shared/system_time.ts
import type { CaptureEvent, CaptureRecord, ConsoleEventData, NetworkRequestData, SystemTimeTimezone, UserConfig } from './types';

export interface ExportableCaptureData {
    capture: CaptureRecord;
    events: CaptureEvent[];
    network_requests: NetworkRequestData[];
    console_events: ConsoleEventData[];
}

export type CaptureWithSystemTimes = CaptureRecord & {
    start_time_system_time: string;
    end_time_system_time: string | null;
    start_time_label: string;
    end_time_label: string | null;
};

export type RecordWithSystemTime<T> = T & {
    absolute_time_system_time: string;
    absolute_time_label: string;
};

export interface ExportableCaptureDataWithSystemTimes {
    capture: CaptureWithSystemTimes;
    events: Array<RecordWithSystemTime<CaptureEvent>>;
    network_requests: Array<RecordWithSystemTime<NetworkRequestData>>;
    console_events: Array<RecordWithSystemTime<ConsoleEventData>>;
}

type SystemTimeConfig = Pick<UserConfig, 'system_time_timezone'>;

// ============================================================
// parse_utc_offset — extract offset minutes from UTC±N string
// ============================================================
export function parse_utc_offset(tz: SystemTimeTimezone | string): number | null {
    if (tz === 'browser') return null;
    if (tz === 'UTC') return 0;
    const match = /^UTC([+-])(\d{1,2})$/.exec(tz);
    if (!match) return null;
    const sign = match[1] === '+' ? 1 : -1;
    const hours = parseInt(match[2], 10);
    return sign * hours * 60;
}

// ============================================================
// format_offset — human-readable UTC offset label
// ============================================================
function format_offset(tz: SystemTimeTimezone | string): string {
    if (tz === 'browser') return 'browser';
    if (tz === 'UTC') return 'UTC';
    const match = /^UTC([+-]\d{1,2})$/.exec(tz);
    if (!match) return tz;
    return `UTC${match[1]}`;
}

// Cache the DateTimeFormat for browser/UTC paths
let _cached_locale_formatter: Intl.DateTimeFormat | null = null;
let _cached_locale_cfg_id = '';

function get_locale_formatter(user_offset_minutes: number | null, user_tz: string): Intl.DateTimeFormat {
    // For browser path, use no timeZone option
    // For UTC, use 'UTC' which IS a valid IANA timeZone
    const id = user_tz;
    if (_cached_locale_formatter && _cached_locale_cfg_id === id) {
        return _cached_locale_formatter;
    }
    const options: Intl.DateTimeFormatOptions = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'UTC'
    };
    _cached_locale_formatter = new Intl.DateTimeFormat('sv-SE', options);
    _cached_locale_cfg_id = id;
    return _cached_locale_formatter;
}

// ============================================================
// format_system_time — format timestamp per user config
// ============================================================
export function format_system_time(ts: string | number, config: SystemTimeConfig): string {
    const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts;
    const tz = config.system_time_timezone;

    // browser path: keep using system local time
    if (tz === 'browser') {
        const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        return new Intl.DateTimeFormat('sv-SE', options).format(new Date(ms));
    }

    const offset_minutes = parse_utc_offset(tz);

    // UTC path: can use Intl with 'UTC' timeZone directly
    if (offset_minutes !== null && offset_minutes === 0) {
        const fmt = get_locale_formatter(0, tz);
        return fmt.format(new Date(ms));
    }

    // Fixed UTC offset path: manually compute local time
    // Intl.DateTimeFormat does not accept 'UTC+8' as a valid timeZone
    const local_ms = ms + (offset_minutes ?? 0) * 60 * 1000;
    const d = new Date(local_ms);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const min = String(d.getUTCMinutes()).padStart(2, '0');
    const ss = String(d.getUTCSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

// ============================================================
// format_time_label — human-readable label w/ timezone info
// ============================================================
export function format_time_label(ts: string | number, config: SystemTimeConfig): string {
    const formatted = format_system_time(ts, config);
    const tz = config.system_time_timezone;
    if (tz === 'browser') return `${formatted} (browser)`;
    if (tz === 'UTC') return `${formatted} (UTC)`;
    return `${formatted} (${tz})`;
}

// ============================================================
// format_system_time_filename
// ============================================================
export function format_system_time_filename(ts: string | number, config: SystemTimeConfig): string {
    return format_system_time(ts, config).replace(' ', '_').replace(/:/g, '-');
}

// ============================================================
// add_system_times_to_capture_data
// ============================================================
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
        end_time_system_time: capture.ended_at === null ? null : format_system_time(capture.ended_at, config),
        start_time_label: format_time_label(capture.started_at, config),
        end_time_label: capture.ended_at === null ? null : format_time_label(capture.ended_at, config)
    };
}

export function add_absolute_system_time<T>(record: T, config: SystemTimeConfig): RecordWithSystemTime<T> {
    const absolute_time = (record as Record<string, unknown>).absolute_time;
    let absolute_time_system_time = '';
    let absolute_time_label = '';
    if (typeof absolute_time === 'string' || typeof absolute_time === 'number') {
        absolute_time_system_time = format_system_time(absolute_time, config);
        absolute_time_label = format_time_label(absolute_time, config);
    }
    return {
        ...record,
        absolute_time_system_time,
        absolute_time_label
    };
}

export const add_system_times_to_session_data = add_system_times_to_capture_data;
export const add_session_system_times = add_capture_system_times;
export type ExportableSessionData = ExportableCaptureData;
export type ExportableSessionDataWithSystemTimes = ExportableCaptureDataWithSystemTimes;
export type SessionWithSystemTimes = CaptureWithSystemTimes;
