// shared/i18n.ts
export type Locale = 'en' | 'zh';

export interface I18nStrings {
    // Status
    ready: string;
    recording: string;
    sessionId: string;

    // Mode selection
    selectMode: string;
    basicTitle: string;
    basicDesc: string;
    advancedTitle: string;
    advancedDesc: string;
    advancedWarning: string;

    // Config
    configuration: string;
    mousePrecision: string;
    clicksOnly: string;
    clicksScrollDrag: string;
    fullTrajectory: string;
    captureKeyboard: string;
    captureInputValues: string;
    captureRequestBody: string;
    captureResponseBody: string;
    sensitiveData: string;

    // Actions
    startRecording: string;
    stopRecording: string;

    // History
    recentSessions: string;
    noSessions: string;
    view: string;
    delete: string;
    deleteConfirm: string;

    // Detail page
    sessionDetail: string;
    exportJson: string;
    exportHtml: string;
    exportHar: string;
    startTime: string;
    duration: string;
    mode: string;
    events: string;
    networkRequests: string;
    consoleLogs: string;
    timeline: string;
    network: string;
    console: string;
    sessionNotFound: string;
    error: string;
    allEvents: string;
    mouse: string;
    keyboard: string;
    scroll: string;
    domChanges: string;
    navigation: string;
    pageLoad: string;
    tabSwitch: string;
    searchEvents: string;
    searchUrls: string;
    searchLogs: string;
    method: string;
    url: string;
    status: string;
    type: string;
    allTypes: string;
    allLevels: string;

    // Settings
    settings: string;
    language: string;
    english: string;
    chinese: string;
    redactData: string;
    redactDataDesc: string;
    theme: string;
    themeFollowSystem: string;
    themeLight: string;
    themeDark: string;
}

const en: I18nStrings = {
    ready: 'Ready',
    recording: 'Recording',
    sessionId: 'ID',

    selectMode: 'Select Recording Mode',
    basicTitle: 'Basic Recording',
    basicDesc: 'Mouse, keyboard, scroll, DOM changes, network metadata',
    advancedTitle: 'Advanced Recording',
    advancedDesc: '+ Console logs, response bodies (requires debugger)',
    advancedWarning: 'May trigger Chrome debugger warning',

    configuration: 'Configuration',
    mousePrecision: 'Mouse Precision',
    clicksOnly: 'Clicks only',
    clicksScrollDrag: 'Clicks + Scroll + Drag',
    fullTrajectory: 'Full trajectory',
    captureKeyboard: 'Capture Keyboard',
    captureInputValues: 'Capture Input Values',
    captureRequestBody: 'Capture Request Body',
    captureResponseBody: 'Capture Response Body',
    sensitiveData: 'Sensitive data',

    startRecording: 'Start Recording',
    stopRecording: 'Stop Recording',

    recentSessions: 'Recent Sessions',
    noSessions: 'No sessions recorded yet',
    view: 'View',
    delete: 'Delete',
    deleteConfirm: 'Delete this session?',

    sessionDetail: 'Session Detail',
    exportJson: 'Export JSON',
    exportHtml: 'Export HTML',
    exportHar: 'Export HAR',
    startTime: 'Start Time',
    duration: 'Duration',
    mode: 'Mode',
    events: 'Events',
    networkRequests: 'Network Requests',
    consoleLogs: 'Console Logs',
    timeline: 'Timeline',
    network: 'Network',
    console: 'Console',
    sessionNotFound: 'Session not found',
    error: 'Error',
    allEvents: 'All Events',
    mouse: 'Mouse',
    keyboard: 'Keyboard',
    scroll: 'Scroll',
    domChanges: 'DOM Changes',
    navigation: 'Navigation',
    pageLoad: 'Page Load',
    tabSwitch: 'Tab Switch',
    searchEvents: 'Search events...',
    searchUrls: 'Search URLs...',
    searchLogs: 'Search logs...',
    method: 'Method',
    url: 'URL',
    status: 'Status',
    type: 'Type',
    allTypes: 'All Types',
    allLevels: 'All Levels',

    settings: 'Settings',
    language: 'Language',
    english: 'English',
    chinese: '中文',
    redactData: 'Redact Sensitive Data',
    redactDataDesc: 'Mask passwords, tokens, and truncate long text',
    theme: 'Theme',
    themeFollowSystem: 'Follow System',
    themeLight: 'Light',
    themeDark: 'Dark',
};

const zh: I18nStrings = {
    ready: '就绪',
    recording: '录制中',
    sessionId: 'ID',

    selectMode: '选择录制模式',
    basicTitle: '基础录制',
    basicDesc: '鼠标、键盘、滚动、DOM 变化、网络请求元数据',
    advancedTitle: '深度录制',
    advancedDesc: '+ 控制台日志、响应体（需要调试器）',
    advancedWarning: '可能触发 Chrome 调试警告条',

    configuration: '配置',
    mousePrecision: '鼠标精度',
    clicksOnly: '仅点击',
    clicksScrollDrag: '点击 + 滚动 + 拖拽',
    fullTrajectory: '完整轨迹',
    captureKeyboard: '捕获键盘',
    captureInputValues: '捕获输入值',
    captureRequestBody: '捕获请求体',
    captureResponseBody: '捕获响应体',
    sensitiveData: '敏感数据',

    startRecording: '开始录制',
    stopRecording: '停止录制',

    recentSessions: '最近录制',
    noSessions: '暂无录制记录',
    view: '查看',
    delete: '删除',
    deleteConfirm: '确定删除此录制？',

    sessionDetail: '录制详情',
    exportJson: '导出 JSON',
    exportHtml: '导出 HTML',
    exportHar: '导出 HAR',
    startTime: '开始时间',
    duration: '时长',
    mode: '模式',
    events: '事件',
    networkRequests: '网络请求',
    consoleLogs: '控制台日志',
    timeline: '时间线',
    network: '网络',
    console: '控制台',
    sessionNotFound: '录制未找到',
    error: '错误',
    allEvents: '所有事件',
    mouse: '鼠标',
    keyboard: '键盘',
    scroll: '滚动',
    domChanges: 'DOM 变化',
    navigation: '导航',
    pageLoad: '页面加载',
    tabSwitch: '标签切换',
    searchEvents: '搜索事件...',
    searchUrls: '搜索 URL...',
    searchLogs: '搜索日志...',
    method: '方法',
    url: 'URL',
    status: '状态',
    type: '类型',
    allTypes: '所有类型',
    allLevels: '所有级别',

    settings: '设置',
    language: '语言',
    english: 'English',
    chinese: '中文',
    redactData: '脱敏敏感数据',
    redactDataDesc: '遮蔽密码、令牌，截断长文本',
    theme: '主题',
    themeFollowSystem: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
};

const locales: Record<Locale, I18nStrings> = { en, zh };

let current_locale: Locale = 'en';

export function detect_locale(): Locale {
    const lang = navigator.language || 'en';
    if (lang.startsWith('zh')) return 'zh';
    return 'en';
}

export function get_locale(): Locale {
    return current_locale;
}

export function set_locale(locale: Locale): void {
    current_locale = locale;
    chrome.storage.local.set({ locale });
}

export async function init_locale(): Promise<void> {
    const result = await chrome.storage.local.get('locale');
    if (result.locale) {
        current_locale = result.locale;
    } else {
        current_locale = detect_locale();
    }
}

export function t(key: keyof I18nStrings): string {
    return locales[current_locale][key] || locales.en[key] || key;
}

export function apply_translations(): void {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n') as keyof I18nStrings;
        if (key && locales[current_locale][key]) {
            el.textContent = t(key);
        }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder') as keyof I18nStrings;
        if (key && locales[current_locale][key]) {
            (el as HTMLInputElement).placeholder = t(key);
        }
    });
}
