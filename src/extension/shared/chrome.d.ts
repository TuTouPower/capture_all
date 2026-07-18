// shared/chrome.d.ts
declare namespace chrome {
    const runtime: {
        id: string;
        lastError?: { message: string };
        sendMessage(message: any): Promise<any>;
        getURL(path: string): string;
        getManifest(): { version: string; [key: string]: unknown };
        onMessage: {
            addListener(callback: (message: any, sender: any, sendResponse: (response: any) => void) => boolean): void;
            removeListener(callback: (message: any, sender: any, sendResponse: (response: any) => void) => boolean): void;
        };
        onInstalled: {
            addListener(callback: () => void): void;
        };
    };

    namespace tabs {
        function create(options: { url: string }): Promise<any>;
        function get(tabId: number): Promise<{ id?: number; url?: string; title?: string; windowId?: number }>;
        function query(queryInfo: { active?: boolean; currentWindow?: boolean }): Promise<Array<{ id?: number; url?: string; title?: string }>>;
        function sendMessage(tabId: number, message: any): Promise<any>;
        const onActivated: {
            addListener(callback: (activeInfo: { tabId: number; windowId: number }) => void): void;
        };
        const onCreated: {
            addListener(callback: (tab: any) => void): void;
        };
        const onUpdated: {
            addListener(callback: (tabId: number, changeInfo: any, tab: any) => void): void;
        };
        const onRemoved: {
            addListener(callback: (tabId: number, removeInfo?: { windowId: number; isWindowClosing: boolean }) => void): void;
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
            function remove(keys: string | string[]): Promise<void>;
        }
    }

    namespace webRequest {
        const onBeforeRequest: {
            addListener(callback: (details: any) => void, filter: { urls: string[] }, extraInfoSpec?: string[]): void;
            removeListener(callback: (details: any) => void): void;
        };
        const onBeforeSendHeaders: {
            addListener(callback: (details: any) => void, filter: { urls: string[] }, extraInfoSpec?: string[]): void;
            removeListener(callback: (details: any) => void): void;
        };
        const onHeadersReceived: {
            addListener(callback: (details: any) => void, filter: { urls: string[] }, extraInfoSpec?: string[]): void;
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
        function attach(target: { tabId: number; sessionId?: string }, version: string): Promise<void>;
        function detach(target: { tabId: number; sessionId?: string }): Promise<void>;
        function sendCommand(target: { tabId: number; sessionId?: string }, method: string, params?: any): Promise<any>;
        const onEvent: {
            addListener(callback: (source: { tabId?: number; sessionId?: string }, method: string, params: any) => void): void;
            removeListener(callback: (source: { tabId?: number; sessionId?: string }, method: string, params: any) => void): void;
        };
    }

    namespace devtools {
        namespace panels {
            function create(title: string, icon_path: string, page_path: string): void;
        }
    }

    namespace downloads {
        function download(options: { url: string; filename: string; saveAs?: boolean }): Promise<number>;
        function search(query: { id?: number; filename?: string }): Promise<Array<{ id: number; filename: string; state: string }>>;
        const onChanged: {
            addListener(callback: (delta: { id: number; state?: { current: string } }) => void): void;
            removeListener(callback: (delta: { id: number; state?: { current: string } }) => void): void;
        };
    }

    namespace cookies {
        const onChanged: {
            addListener(callback: (info: { cookie: { name: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite?: string; expirationDate?: number; storeId?: string }; removed: boolean; cause: string }) => void): void;
            removeListener(callback: (info: { cookie: { name: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite?: string; expirationDate?: number; storeId?: string }; removed: boolean; cause: string }) => void): void;
        };
    }
}
