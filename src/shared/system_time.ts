// shared/system_time.ts
import type { ConsoleLog, NetworkRequest, RecordEvent, Session, UserConfig } from './types';

export interface ExportableSessionData {
    session: Session;
    events: RecordEvent[];
    network_requests: NetworkRequest[];
    console_logs: ConsoleLog[];
}

export type SessionWithSystemTimes = Session & {
    start_time_system_time: string;
    end_time_system_time: string | null;
};

export type RecordWithSystemTime<T extends { absolute_time: number }> = T & {
    absolute_time_system_time: string;
};

export interface ExportableSessionDataWithSystemTimes {
    session: SessionWithSystemTimes;
    events: Array<RecordWithSystemTime<RecordEvent>>;
    network_requests: Array<RecordWithSystemTime<NetworkRequest>>;
    console_logs: Array<RecordWithSystemTime<ConsoleLog>>;
}

type SystemTimeConfig = Pick<UserConfig, 'system_time_timezone'>;

export function format_system_time(timestamp_ms: number, config: SystemTimeConfig): string {
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

    return new Intl.DateTimeFormat('sv-SE', options).format(new Date(timestamp_ms));
}

export function add_system_times_to_session_data(data: ExportableSessionData, config: SystemTimeConfig): ExportableSessionDataWithSystemTimes {
    return {
        session: add_session_system_times(data.session, config),
        events: data.events.map(event => add_absolute_system_time(event, config)),
        network_requests: data.network_requests.map(request => add_absolute_system_time(request, config)),
        console_logs: data.console_logs.map(log => add_absolute_system_time(log, config))
    };
}

export function add_session_system_times(session: Session, config: SystemTimeConfig): SessionWithSystemTimes {
    return {
        ...session,
        start_time_system_time: format_system_time(session.start_time, config),
        end_time_system_time: session.end_time === null ? null : format_system_time(session.end_time, config)
    };
}

export function add_absolute_system_time<T extends { absolute_time: number }>(record: T, config: SystemTimeConfig): RecordWithSystemTime<T> {
    return {
        ...record,
        absolute_time_system_time: format_system_time(record.absolute_time, config)
    };
}
