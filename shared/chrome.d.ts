// shared/chrome.d.ts
declare namespace chrome {
    namespace runtime {
        const id: string;
        function sendMessage(message: any): Promise<any>;
        const onMessage: {
            addListener(callback: (message: any, sender: any, sendResponse: (response: any) => void) => boolean): void;
            removeListener(callback: (message: any, sender: any, sendResponse: (response: any) => void) => boolean): void;
        };
        const onInstalled: {
            addListener(callback: () => void): void;
        };
    }

    namespace tabs {
        function create(options: { url: string }): Promise<any>;
        function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number; url?: string; title?: string }>>;
        function sendMessage(tabId: number, message: any): Promise<any>;
        const onActivated: {
            addListener(callback: (activeInfo: { tabId: number; windowId: number }) => void): void;
        };
        const onRemoved: {
            addListener(callback: (tabId: number, removeInfo: { windowId: number; isWindowClosing: boolean }) => void): void;
        };
    }

    namespace alarms {
        function create(name: string, alarmInfo: { periodInMinutes: number }): void;
        function clear(name: string): Promise<boolean>;
        const onAlarm: {
            addListener(callback: (alarm: { name: string }) => void): void;
        };
    }

    namespace storage {
        namespace local {
            function get(keys: string | string[]): Promise<Record<string, any>>;
            function set(items: Record<string, any>): Promise<void>;
        }
    }

    namespace webRequest {
        const onBeforeRequest: {
            addListener(callback: (details: any) => void, filter: { urls: string[] }): void;
            removeListener(callback: (details: any) => void): void;
        };
        const onCompleted: {
            addListener(callback: (details: any) => void, filter: { urls: string[] }): void;
            removeListener(callback: (details: any) => void): void;
        };
        const onErrorOccurred: {
            addListener(callback: (details: any) => void, filter: { urls: string[] }): void;
            removeListener(callback: (details: any) => void): void;
        };
    }

    namespace dbg {
        function attach(target: { tabId: number }, version: string): Promise<void>;
        function detach(target: { tabId: number }): Promise<void>;
        function sendCommand(target: { tabId: number }, method: string, params?: any): Promise<any>;
        const onEvent: {
            addListener(callback: (source: any, method: string, params: any) => void): void;
            removeListener(callback: (source: any, method: string, params: any) => void): void;
        };
    }

    namespace downloads {
        function download(options: { url: string; filename: string }): Promise<number>;
    }

    namespace scripting {
        function executeScript(options: { target: { tabId: number }; files: string[] }): Promise<any>;
    }
}
