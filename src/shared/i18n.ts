// shared/i18n.ts
export type Locale = 'en' | 'zh';

export interface I18nStrings {
    // Status
    ready: string;
    recording: string;
    sessionId: string;

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
    exportJsonl: string;
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
    systemTimeTimezone: string;
    timezoneBrowser: string;
    detailTimeDisplayMode: string;
    detailTimeSystem: string;
    detailTimeRelative: string;
    exportDirectory: string;
    exportDirectoryDesc: string;
    exportFilenameTemplate: string;
    exportFilenameTemplateDesc: string;
    exportSaveAs: string;
    agentBridge: string;
    agentBridgeEnabled: string;
    agentBridgeUrl: string;
    agentBridgeToken: string;
    agentBridgePollInterval: string;
    agentBridgeDesc: string;

    // Popup (Capture All redesign)
    mainPanel: string;
    captureDone: string;
    startCapture: string;
    stopCapture: string;
    liveDetail: string;
    openDetail: string;
    clickToEnd: string;
    exportLabel: string;
    newCapture: string;
    viewAll: string;
    viewDetail: string;
    capUser: string;
    capNav: string;
    capNet: string;
    capConsole: string;
    capError: string;
    capStorage: string;
    capCookie: string;
    capMask: string;
}

const en: I18nStrings = {
    ready: 'Ready',
    recording: 'Recording',
    sessionId: 'ID',

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

    recentSessions: 'Recent Captures',
    noSessions: 'No captures recorded yet',
    view: 'View',
    delete: 'Delete',
    deleteConfirm: 'Delete this capture?',

    sessionDetail: 'Capture Detail',
    exportJson: 'Export JSON',
    exportJsonl: 'Export JSONL',
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
    sessionNotFound: 'Capture not found',
    error: 'Error',
    allEvents: 'All Events',
    mouse: 'Mouse',
    keyboard: 'Keyboard',
    scroll: 'Scroll',
    domChanges: 'Input Events',
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
    systemTimeTimezone: 'System Time Timezone',
    timezoneBrowser: 'Follow Browser / System',
    detailTimeDisplayMode: 'Detail Time Display',
    detailTimeSystem: 'System Time',
    detailTimeRelative: 'Relative Time',
    exportDirectory: 'Export Directory',
    exportDirectoryDesc: 'Relative to Chrome Downloads; leave empty for default',
    exportFilenameTemplate: 'Export Filename',
    exportFilenameTemplateDesc: 'Tokens: {capture_id}, {date}, {ext}',
    exportSaveAs: 'Ask where to save each export',
    agentBridge: 'MCP Bridge',
    agentBridgeEnabled: 'Enable MCP bridge',
    agentBridgeUrl: 'Bridge URL',
    agentBridgeToken: 'Bridge Token',
    agentBridgePollInterval: 'Poll Interval (ms)',
    agentBridgeDesc: 'Local bridge only; token is required before connecting',

    mainPanel: 'Main Panel',
    captureDone: 'Capture Complete',
    startCapture: 'Start Capture',
    stopCapture: 'Stop Capture',
    liveDetail: 'Live Detail',
    openDetail: 'View Detail',
    clickToEnd: 'Click to End',
    exportLabel: 'Export',
    newCapture: 'New Capture',
    viewAll: 'View All',
    viewDetail: 'View Detail',
    capUser: 'User Actions',
    capNav: 'Navigation',
    capNet: 'Network',
    capConsole: 'Console',
    capError: 'Errors',
    capStorage: 'Storage',
    capCookie: 'Cookie',
    capMask: 'Redaction',
};

const zh: I18nStrings = {
    ready: '就绪',
    recording: '采集中',
    sessionId: 'ID',

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

    startRecording: '开始采集',
    stopRecording: '停止采集',

    recentSessions: '最近采集',
    noSessions: '暂无采集记录',
    view: '查看',
    delete: '删除',
    deleteConfirm: '确定删除此采集？',

    sessionDetail: '采集详情',
    exportJson: '导出 JSON',
    exportJsonl: '导出 JSONL',
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
    sessionNotFound: '采集未找到',
    error: '错误',
    allEvents: '所有事件',
    mouse: '鼠标',
    keyboard: '键盘',
    scroll: '滚动',
    domChanges: '输入事件',
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
    systemTimeTimezone: '系统时间时区',
    timezoneBrowser: '跟随浏览器 / 系统',
    detailTimeDisplayMode: '详情页时间显示',
    detailTimeSystem: '系统时间',
    detailTimeRelative: '相对时间',
    exportDirectory: '导出目录',
    exportDirectoryDesc: '相对于 Chrome 下载目录；留空使用默认位置',
    exportFilenameTemplate: '导出文件名',
    exportFilenameTemplateDesc: '可用占位符：{capture_id}、{date}、{ext}',
    exportSaveAs: '每次导出时选择保存位置',
    agentBridge: 'MCP Bridge',
    agentBridgeEnabled: '启用 MCP bridge',
    agentBridgeUrl: 'Bridge URL',
    agentBridgeToken: 'Bridge Token',
    agentBridgePollInterval: '轮询间隔（毫秒）',
    agentBridgeDesc: '仅连接本地 bridge；必须填写 token 才会连接',

    mainPanel: '主面板',
    captureDone: '采集完成',
    startCapture: '开始采集',
    stopCapture: '停止采集',
    liveDetail: '实时详情',
    openDetail: '查看详情',
    clickToEnd: '点击结束',
    exportLabel: '导出',
    newCapture: '开始新采集',
    viewAll: '查看全部',
    viewDetail: '查看详情',
    capUser: '用户行为',
    capNav: '页面导航',
    capNet: '网络请求',
    capConsole: '控制台',
    capError: '错误异常',
    capStorage: 'Storage',
    capCookie: 'Cookie',
    capMask: '脱敏',
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
