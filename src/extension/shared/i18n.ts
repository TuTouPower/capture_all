// shared/i18n.ts
export type Locale = 'en' | 'zh';

export interface I18nStrings {
    // Status
    ready: string;
    capturing: string;
    captureId: string;

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
    startCapture: string;
    stopCapture: string;

    // History
    recentCaptures: string;
    noCaptures: string;
    view: string;
    delete: string;
    deleteConfirm: string;

    // Detail page
    captureDetail: string;
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
    captureNotFound: string;
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
    agentBridgeBrowserNo: string;
    agentBridgeBrowserLabel: string;
    agentBridgeBrowserLabelPlaceholder: string;
    agentBridgeStatus: string;
    agentBridgeEnrolling: string;
    agentBridgeEnrolled: string;
    agentBridgeNotConnected: string;
    agentBridgeBridgeNotFound: string;
    agentBridge401Retry: string;
    agentBridgeLegacy: string;
    agentBridgeLegacyToken: string;
    agentBridgeLegacyDesc: string;

    // Popup (Capture All redesign)
    mainPanel: string;
    captureDone: string;
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

    // Dashboard — shell / nav
    captureRecords: string;
    currentCapture: string;
    exportTask: string;
    localUser: string;

    // Dashboard — captures list
    allCaptures: string;
    withErrors: string;
    completed: string;
    storageUsed: string;
    estimatedSize: string;
    captureCountSuffix: string;
    noCaptureRecords: string;
    captureRecordsDesc: string;
    searchCapturesPlaceholder: string;
    allFilter: string;
    refresh: string;
    reset: string;
    statusLabel: string;
    filterOf: string;
    filterTotalSuffix: string;
    filterTotal: string;
    countUnit: string;
    captureName: string;
    time: string;
    size: string;
    actions: string;
    selectedCount: string;
    captureRecordsUnit: string;
    clearSelection: string;
    deleteSelectedConfirm: string;
    deleteCaptureConfirm: string;
    deleteFailed: string;
    activeCaptureNoDelete: string;

    // Dashboard — detail
    overview: string;
    ended: string;
    openOriginalPage: string;
    exportZip: string;
    eventLabel: string;
    detail: string;
    source: string;
    urlSourceDetail: string;
    errorMessage: string;
    stack: string;
    keyLabel: string;
    nameLabel: string;
    searchRailPlaceholder: string;
    quickFilter: string;
    noEvents: string;
    eventsCountSuffix: string;
    listView: string;
    trackView: string;
    zoom: string;
    laneNetwork: string;
    laneUi: string;
    laneConsole: string;
    laneDom: string;
    laneStorage: string;
    laneNav: string;
    laneError: string;
    absoluteTime: string;
    noNetworkRequests: string;
    basicInfo: string;
    statusCode: string;
    resourceType: string;
    protocol: string;
    cache: string;
    captureMethod: string;
    requestHeaders: string;
    responseHeaders: string;
    requestBody: string;
    responseBody: string;
    noConsoleLogs: string;
    levelLabel: string;
    messageLabel: string;
    lineLabel: string;
    noData: string;
    captureSummary: string;
    totalEvents: string;
    totalErrors: string;
    categoryOverview: string;
    keyTimeline: string;
    configIntro: string;
    settingsDefaultsLink: string;
    captureModules: string;
    captureOptions: string;
    configLabel: string;

    // Dashboard — settings
    general: string;
    privacyRedaction: string;
    diagnosticsLogs: string;
    integrations: string;
    settingsDesc: string;
    captureDefaults: string;
    timeDisplay: string;
    timezoneFollowBrowser: string;
    captureLimitMb: string;
    inlineTextLimitKb: string;
    sensitiveCaptureNotice: string;
    sensitiveCaptureDesc: string;
    redactionBoundary: string;
    redactionBoundaryDesc: string;
    filenameTemplate: string;
    exportCaptureDirectory: string;
    exportLogDirectory: string;
    logLevel: string;
    maxLogSizeMb: string;
    currentLogSize: string;
    exportLogs: string;
    clearLogs: string;
    integrationsMcp: string;
    changesSavedImmediately: string;
    clearLogsConfirm: string;
    exportFailed: string;

    // Dashboard — current / exports
    currentCaptureDesc: string;
    noActiveCapture: string;
    eventsSuffix: string;
    requestsSuffix: string;
    exportTaskDesc: string;

    // Dashboard — shared event labels
    mouseClick: string;
    keyPress: string;
    inputLabel: string;
    openPage: string;
    routeChangeLabel: string;
    spaRouteChange: string;
    domChangeLabel: string;
    kindDom: string;
    kindLifecycle: string;
    pctPrefix: string;
    captureNameSuffix: string;
    exportFailedFlush: string;
}

const en: I18nStrings = {
    ready: 'Ready',
    capturing: 'Capturing',
    captureId: 'ID',

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

    recentCaptures: 'Recent Captures',
    noCaptures: 'No captures yet',
    view: 'View',
    delete: 'Delete',
    deleteConfirm: 'Delete this capture?',

    captureDetail: 'Capture Detail',
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
    captureNotFound: 'Capture not found',
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
    agentBridgeBrowserNo: 'Browser No.',
    agentBridgeBrowserLabel: 'Label (optional)',
    agentBridgeBrowserLabelPlaceholder: 'e.g. Mac Chrome Dev',
    agentBridgeStatus: 'Status',
    agentBridgeEnrolling: 'Enrolling...',
    agentBridgeEnrolled: 'Connected',
    agentBridgeNotConnected: 'Not connected',
    agentBridgeBridgeNotFound: 'Bridge not reachable — check that Bridge is running',
    agentBridge401Retry: 'Auth expired, re-enrolling...',
    agentBridgeLegacy: 'Advanced / Legacy',
    agentBridgeLegacyToken: 'Legacy Bridge Token',
    agentBridgeLegacyDesc: 'For troubleshooting only. The browser number auto-enroll is recommended.',

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

    // Dashboard — shell / nav
    captureRecords: 'Capture Records',
    currentCapture: 'Current Capture',
    exportTask: 'Export Tasks',
    localUser: 'Local User',

    // Dashboard — captures list
    allCaptures: 'All Captures',
    withErrors: 'With Errors',
    completed: 'Completed',
    storageUsed: 'Storage Used',
    estimatedSize: 'Estimated size',
    captureCountSuffix: 'captures',
    noCaptureRecords: 'No capture records',
    captureRecordsDesc: 'Manage and view all completed capture records, with export, archive, and tag management.',
    searchCapturesPlaceholder: 'Search capture name, URL, tags…',
    allFilter: 'All',
    refresh: 'Refresh',
    reset: 'Reset',
    statusLabel: 'Status',
    filterOf: 'of',
    filterTotalSuffix: '',
    filterTotal: 'Total',
    countUnit: 'records',
    captureName: 'Name',
    time: 'Time',
    size: 'Size',
    actions: 'Actions',
    selectedCount: 'Selected',
    captureRecordsUnit: 'records',
    clearSelection: 'Clear selection',
    deleteSelectedConfirm: 'Delete selected capture records?',
    deleteCaptureConfirm: 'Delete this capture record?',
    deleteFailed: 'Delete failed',
    activeCaptureNoDelete: 'Active capture cannot be deleted',

    // Dashboard — detail
    overview: 'Overview',
    ended: 'Ended',
    openOriginalPage: 'Open Original Page',
    exportZip: 'ZIP Archive',
    eventLabel: 'Event',
    detail: 'Detail',
    source: 'Source',
    urlSourceDetail: 'URL / Source / Detail',
    errorMessage: 'Error Message',
    stack: 'Stack',
    keyLabel: 'Key',
    nameLabel: 'Name',
    searchRailPlaceholder: 'Search events, URLs, Storage keys…',
    quickFilter: 'Quick Filter',
    noEvents: 'No events',
    eventsCountSuffix: 'events',
    listView: 'List View',
    trackView: 'Track View',
    zoom: 'Zoom',
    laneNetwork: 'Network',
    laneUi: 'UI Events',
    laneConsole: 'Console',
    laneDom: 'DOM Changes',
    laneStorage: 'Storage',
    laneNav: 'Navigation',
    laneError: 'Errors',
    absoluteTime: 'Absolute Time',
    noNetworkRequests: 'No network requests',
    basicInfo: 'Basic Info',
    statusCode: 'Status Code',
    resourceType: 'Resource Type',
    protocol: 'Protocol',
    cache: 'Cache',
    captureMethod: 'Capture Method',
    requestHeaders: 'Request Headers',
    responseHeaders: 'Response Headers',
    requestBody: 'Request Body',
    responseBody: 'Response Body',
    noConsoleLogs: 'No console logs',
    levelLabel: 'Level',
    messageLabel: 'Message',
    lineLabel: 'Line',
    noData: 'No data',
    captureSummary: 'Capture Summary',
    totalEvents: 'Total Events',
    totalErrors: 'Total Errors',
    categoryOverview: 'Category Overview',
    keyTimeline: 'Key Timeline',
    configIntro: 'Config used for this capture (read-only snapshot). To change defaults, go to',
    settingsDefaultsLink: 'Settings → Capture Defaults.',
    captureModules: 'Capture Modules',
    captureOptions: 'Capture Options',
    configLabel: 'Config',

    // Dashboard — settings
    general: 'General',
    privacyRedaction: 'Privacy & Redaction',
    diagnosticsLogs: 'Diagnostics Logs',
    integrations: 'Integrations',
    settingsDesc: 'Manage Capture All preferences, capture defaults, privacy policy, export rules, and integrations.',
    captureDefaults: 'Capture Defaults',
    timeDisplay: 'Time Display',
    timezoneFollowBrowser: 'Follow Browser',
    captureLimitMb: 'Capture Limit (MB)',
    inlineTextLimitKb: 'Inline Text Limit (KB)',
    sensitiveCaptureNotice: 'Sensitive Data Notice',
    sensitiveCaptureDesc: 'Request bodies, response bodies, and input values are captured by default and may contain credentials, tokens, private messages, or personal information. Disable them before your first capture if not needed.',
    redactionBoundary: 'Redaction Boundary',
    redactionBoundaryDesc: 'Password inputs are never captured. Headers, URL queries, and input values are redacted by rules; request and response bodies are size-limited only and are not scanned for sensitive content.',
    filenameTemplate: 'Filename Template',
    exportCaptureDirectory: 'Capture Export Directory',
    exportLogDirectory: 'Log Export Directory',
    logLevel: 'Log Level',
    maxLogSizeMb: 'Max Log Size (MB)',
    currentLogSize: 'Current Log Size',
    exportLogs: 'Export Logs',
    clearLogs: 'Clear All Logs',
    integrationsMcp: 'Integrations · MCP Bridge',
    changesSavedImmediately: 'Changes are saved automatically',
    clearLogsConfirm: 'Clear all diagnostic logs? This cannot be undone.',
    exportFailed: 'Export failed',

    // Dashboard — current / exports
    currentCaptureDesc: 'In-progress capture sessions. View the event stream live and stop at any time.',
    noActiveCapture: 'No capture in progress',
    eventsSuffix: 'events',
    requestsSuffix: 'requests',
    exportTaskDesc: 'Select capture records to export. Ready:',

    // Dashboard — shared event labels
    mouseClick: 'Click',
    keyPress: 'Key',
    inputLabel: 'Input',
    openPage: 'Open',
    routeChangeLabel: 'Route change',
    spaRouteChange: 'SPA route change',
    domChangeLabel: 'DOM change',
    kindDom: 'DOM',
    kindLifecycle: 'Lifecycle',
    pctPrefix: '',
    captureNameSuffix: ' capture',
    exportFailedFlush: 'Export failed: could not persist buffered data',
};

const zh: I18nStrings = {
    ready: '就绪',
    capturing: '采集中',
    captureId: 'ID',

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

    startCapture: '开始采集',
    stopCapture: '停止采集',

    recentCaptures: '最近采集',
    noCaptures: '暂无采集',
    view: '查看',
    delete: '删除',
    deleteConfirm: '确定删除此采集？',

    captureDetail: '采集详情',
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
    captureNotFound: '采集未找到',
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
    agentBridgeBrowserNo: '浏览器编号',
    agentBridgeBrowserLabel: '备注名（可选）',
    agentBridgeBrowserLabelPlaceholder: '如：Mac Chrome Dev',
    agentBridgeStatus: '状态',
    agentBridgeEnrolling: '连接中...',
    agentBridgeEnrolled: '已连接',
    agentBridgeNotConnected: '未连接',
    agentBridgeBridgeNotFound: 'Bridge 未启动 — 请检查 Bridge 是否运行',
    agentBridge401Retry: '认证过期，重新连接中...',
    agentBridgeLegacy: '高级 / 兼容',
    agentBridgeLegacyToken: '兼容 Bridge Token',
    agentBridgeLegacyDesc: '仅用于故障排查。推荐使用浏览器编号自动连接。',

    mainPanel: '主面板',
    captureDone: '采集完成',
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

    // Dashboard — shell / nav
    captureRecords: '采集记录',
    currentCapture: '当前采集',
    exportTask: '导出任务',
    localUser: '本地用户',

    // Dashboard — captures list
    allCaptures: '全部采集',
    withErrors: '有错误',
    completed: '已完成',
    storageUsed: '占用空间',
    estimatedSize: '估算大小',
    captureCountSuffix: '次采集',
    noCaptureRecords: '暂无采集记录',
    captureRecordsDesc: '管理和查看所有已完成的采集记录，支持导出、归档和标签管理。',
    searchCapturesPlaceholder: '搜索采集名称、URL、标签…',
    allFilter: '全部',
    refresh: '刷新',
    reset: '重置',
    statusLabel: '状态',
    filterOf: '条（全部',
    filterTotalSuffix: '）',
    filterTotal: '共',
    countUnit: '条',
    captureName: '采集名称',
    time: '时间',
    size: '大小',
    actions: '操作',
    selectedCount: '已选择',
    captureRecordsUnit: '条采集记录',
    clearSelection: '清除选择',
    deleteSelectedConfirm: '确定删除选中的采集记录？',
    deleteCaptureConfirm: '确定删除此采集记录？',
    deleteFailed: '删除失败',
    activeCaptureNoDelete: '采集进行中不可删除',

    // Dashboard — detail
    overview: '概览',
    ended: '已结束',
    openOriginalPage: '打开原页面',
    exportZip: 'ZIP 完整包',
    eventLabel: '事件',
    detail: '详情',
    source: '来源',
    urlSourceDetail: 'URL / 来源 / 详情',
    errorMessage: '错误消息',
    stack: '堆栈',
    keyLabel: 'Key',
    nameLabel: '名称',
    searchRailPlaceholder: '搜索事件、URL、Storage key…',
    quickFilter: '快速筛选',
    noEvents: '暂无事件',
    eventsCountSuffix: '个事件',
    listView: '列表视图',
    trackView: '轨道视图',
    zoom: '缩放',
    laneNetwork: '网络',
    laneUi: '界面事件',
    laneConsole: '控制台',
    laneDom: 'DOM 变更',
    laneStorage: '存储',
    laneNav: '导航',
    laneError: '错误',
    absoluteTime: '绝对时间',
    noNetworkRequests: '暂无网络请求',
    basicInfo: '基本信息',
    statusCode: '状态码',
    resourceType: '资源类型',
    protocol: '协议',
    cache: '缓存',
    captureMethod: '采集方式',
    requestHeaders: '请求头',
    responseHeaders: '响应头',
    requestBody: '请求体',
    responseBody: '响应体',
    noConsoleLogs: '暂无控制台日志',
    levelLabel: '级别',
    messageLabel: '消息',
    lineLabel: '行',
    noData: '暂无数据',
    captureSummary: '本次采集摘要',
    totalEvents: '事件总数',
    totalErrors: '错误总数',
    categoryOverview: '七标签概览',
    keyTimeline: '关键时间线',
    configIntro: '本次采集使用的配置（只读快照）。如需修改默认值，请前往',
    settingsDefaultsLink: '设置 → 采集默认值。',
    captureModules: '采集模块',
    captureOptions: '采集选项',
    configLabel: '本次配置',

    // Dashboard — settings
    general: '通用',
    privacyRedaction: '隐私与脱敏',
    diagnosticsLogs: '诊断日志',
    integrations: '集成',
    settingsDesc: '管理 Capture All 的全局偏好、采集默认值、隐私策略、导出规则和集成能力。',
    captureDefaults: '采集默认值',
    timeDisplay: '时间显示',
    timezoneFollowBrowser: '跟随浏览器',
    captureLimitMb: '采集上限 (MB)',
    inlineTextLimitKb: '内联文本上限 (KB)',
    sensitiveCaptureNotice: '敏感采集提醒',
    sensitiveCaptureDesc: '请求体、响应体和输入值采集默认开启，可能包含凭据、Token、私密消息或个人信息。不需要时请在首次采集前关闭。',
    redactionBoundary: '脱敏边界',
    redactionBoundaryDesc: '密码输入始终不采集。Header、URL 查询和输入值按规则脱敏；请求体和响应体只限制大小，不扫描内容中的敏感信息。',
    filenameTemplate: '文件名模板',
    exportCaptureDirectory: '采集导出目录',
    exportLogDirectory: '日志导出目录',
    logLevel: '日志级别',
    maxLogSizeMb: '最大日志大小 (MB)',
    currentLogSize: '当前日志大小',
    exportLogs: '导出运行日志',
    clearLogs: '清除所有日志',
    integrationsMcp: '集成 · MCP Bridge',
    changesSavedImmediately: '更改即时保存',
    clearLogsConfirm: '确定清空所有诊断日志？此操作不可撤销。',
    exportFailed: '导出失败',

    // Dashboard — current / exports
    currentCaptureDesc: '正在进行的采集会话，实时查看事件流并随时停止。',
    noActiveCapture: '当前没有进行中的采集',
    eventsSuffix: '事件',
    requestsSuffix: '请求',
    exportTaskDesc: '选择采集记录导出。已就绪',

    // Dashboard — shared event labels
    mouseClick: '点击',
    keyPress: '按键',
    inputLabel: '输入',
    openPage: '打开',
    routeChangeLabel: '路由变化',
    spaRouteChange: 'SPA 路由变化',
    domChangeLabel: 'DOM 变化',
    kindDom: 'DOM',
    kindLifecycle: '生命周期',
    pctPrefix: '占比 ',
    captureNameSuffix: ' 的采集',
    exportFailedFlush: '导出失败：无法落盘缓冲数据',
};

const locales: Record<Locale, I18nStrings> = { en, zh };

let current_locale: Locale = 'en';

function detect_locale(): Locale {
    const lang = navigator.language || 'en';
    if (lang.startsWith('zh')) return 'zh';
    return 'en';
}

export function get_locale(): Locale {
    return current_locale;
}

// t152: 单一事实来源 = user_config.locale（持久化由调用方经 save_user_config 落盘）。
// set_locale 只切内存语言，不再写独立 'locale' storage key。
function apply_locale_to_dom(locale: Locale): void {
    // t190 AC-003: 同步 document.lang（辅助技术/浏览器语言提示）；非 DOM 环境忽略
    try {
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = locale;
        }
    } catch {
        // ignore
    }
}

export function set_locale(locale: Locale): void {
    current_locale = locale;
    apply_locale_to_dom(locale);
}

export async function init_locale(): Promise<void> {
    // 从 user_config.locale 恢复；未显式设置过（无 locale 键）时按浏览器语言自动检测。
    try {
        const result = await chrome.storage.local.get('user_config');
        const stored = (result.user_config as Record<string, unknown> | undefined) ?? null;
        if (stored && (stored.locale === 'en' || stored.locale === 'zh')) {
            current_locale = stored.locale as Locale;
            // t190 AC-003: init 路径同样同步 document.lang（重载后切换效果不失效）
            apply_locale_to_dom(current_locale);
            return;
        }
    } catch {
        // fall through to detect
    }
    current_locale = detect_locale();
    // t190 AC-003: 自动检测路径同步 document.lang
    apply_locale_to_dom(current_locale);
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
