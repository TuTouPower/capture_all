# 日志系统改造方案

> 状态：待实施 | 2026-06-09

---

## 1. 现状

全项目裸 `console.log/warn/error`，**没有日志系统**。

```
src/background/service_worker.ts   18 处 console.*
src/background/session_manager.ts   3 处 console.*
src/background/keepalive.ts         1 处 console.debug
src/content/content_script.ts       4 处 console.*
src/dashboard/dashboard.ts          1 处 console.error
src/popup/popup.ts                  1 处 console.warn
src/devtools/devtools.ts            1 处 console.*
src/devtools/devtools_panel.ts      1 处 console.*
```

问题：

| 问题 | 影响 |
|------|------|
| 无级别控制 | debug 日志和 error 混在一起，用户无法关掉噪音 |
| 无持久化 | Service Worker 休眠后日志全部丢失 |
| 无导出 | 用户无法导出诊断日志排查问题 |
| 用户不可见 | 只有开发者打开 `chrome://extensions` 才能看 |
| 污染采集数据 | content script 的 `console.log` 会被 CDP 捕获，混入用户采集的 console_events |
| 无结构化 | 纯字符串拼接，无法按模块/级别筛选 |

---

## 2. 需求

### 功能需求

1. **Logger 封装** — 统一 `debug/info/warn/error` 四级，替代裸 `console.*`
2. **级别开关** — 用户在 dashboard 设置日志级别，低于当前级别的日志不产生任何 I/O
3. **持久化存储** — 日志写入 IndexedDB（独立 store），不受 SW 休眠影响
4. **日志导出** — 用户可导出为 JSON/JSONL 文件下载
5. **自清洁** — 扩展自身日志不混入用户采集的 console 数据
6. **容量控制** — 超出上限自动删除最旧记录，防止无限增长
7. **content script 支持** — 通过消息通道中继日志到 background

### 非功能需求

- 同步调用（不阻塞调用方）
- 批量写入（复用现有 flush 模式）
- 发送失败静默（不反压业务逻辑）
- TypeScript strict
- 命名 snake_case

---

## 3. 架构

```
┌─────────────────────────────────────────────────────────┐
│  content script                                         │
│  Logger ──▶ MessageLogTransport ──sendMessage──┐        │
│            (不再 console.log)                    │        │
└─────────────────────────────────────────────────┼────────┘
                                                  │
    ┌─────────────────────────────────────────────┼────────┐
    │  background SW                              │        │
    │  Logger ──▶ IndexedDBLogTransport ◀─────────┘        │
    │            (buffer 50 + flush)               │        │
    │                                              ▼        │
    │            IndexedDB: capture_all_db                  │
    │            ┌──────────────────────────────────┐      │
    │            │ app_logs (NEW, v3)              │      │
    │            │ key: id, idx: timestamp/level/   │      │
    │            │ module                          │      │
    │            └──────────────────────────────────┘      │
    │            ┌──────────────────────────────────┐      │
    │            │ console_events (现有，采集数据)    │      │
    │            │ network_requests                 │      │
    │            │ ... (完全隔离，永不交叉)           │      │
    │            └──────────────────────────────────┘      │
    └──────────────────────────────────────────────────────┘

    ┌──────────────────────────────────────────────────────┐
    │  dashboard / popup / devtools                        │
    │  Logger ──▶ IndexedDBLogTransport (直接写 IndexedDB)  │
    │  dashboard settings: 日志级别 + 导出 + 清除           │
    └──────────────────────────────────────────────────────┘
```

### 数据流

```
Logger.debug("msg")      --level gate--> 丢弃 (级别不足)
Logger.info("msg")        --level gate--> transport.write(entry)
                                            │
                                            ▼
                                      内存 buffer
                                            │
                              buffer.size >= BATCH_SIZE?
                                            │
                                     flush ──▶ IndexedDB
                                            │
                                    自清洁：超上限删最旧
```

### 自清洁四层隔离

| 层 | 机制 |
|----|------|
| 存储 | `app_logs` store 与采集 stores 完全分离 |
| content script | 用 `sendMessage` 发日志，不再 `console.log`；CDP 监听的是页面 JS context，无法截获扩展消息通道 |
| background SW | Logger 直写 IndexedDB，SW 无页面 context，不被 CDP 监控 |
| 导出 | `export_app_logs()` 只查 `app_logs`；`export_json()` 只查采集 stores |

---

## 4. 详细设计

### 4.1 类型定义 (`src/shared/types.ts`)

```typescript
// 日志级别
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

// 单条日志
export interface AppLogEntry {
    id: string;              // "log_<timestamp36>_<random6>"
    timestamp: number;       // Date.now()
    level: LogLevel;
    module: string;          // "background/sw", "content/content_script", ...
    message: string;
    details?: unknown;       // 结构化附加上下文
    stack?: string;          // error 级别自动捕获
}

// 查询过滤
export interface LogQueryFilter {
    level?: LogLevel;
    module?: string;
    since?: number;
    until?: number;
}

// UserConfig 扩展
export interface UserConfig {
    // ... 现有字段保持不变 ...
    log_level: LogLevel;        // 默认 'warn'
    log_max_entries: number;    // 默认 10000
}
```

### 4.2 Logger 类 (`src/shared/logger.ts`) [新建]

```typescript
// 传输层接口 — 不同 context 不同实现
export interface LogTransport {
    write(entry: AppLogEntry): void;
    flush(): Promise<void>;
    get_entries(limit: number, offset: number, filters?: LogQueryFilter): Promise<AppLogEntry[]>;
    count(filters?: LogQueryFilter): Promise<number>;
    clear(): Promise<void>;
}

const LEVEL_WEIGHT: Record<LogLevel, number> = {
    debug: 0, info: 1, warn: 2, error: 3, silent: 4,
};

let _global_level: LogLevel = 'warn';

export class Logger {
    constructor(
        private module: string,
        private transport: LogTransport,
    ) {}

    debug(message: string, details?: unknown): void {
        this.write('debug', message, details);
    }

    info(message: string, details?: unknown): void {
        this.write('info', message, details);
    }

    warn(message: string, details?: unknown): void {
        this.write('warn', message, details);
    }

    error(message: string, details?: unknown): void {
        this.write('error', message, details);
    }

    private write(level: LogLevel, message: string, details?: unknown): void {
        // 级别门控：低于全局级别的直接丢弃，零 I/O
        if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[_global_level]) return;

        const entry: AppLogEntry = {
            id: generate_log_id(),
            timestamp: Date.now(),
            level,
            module: this.module,
            message,
            details,
            stack: level === 'error'
                ? new Error().stack?.split('\n').slice(2).join('\n')
                : undefined,
        };

        this.transport.write(entry);
    }

    static get_level(): LogLevel {
        return _global_level;
    }

    static set_level(level: LogLevel): void {
        _global_level = level;
    }
}

function generate_log_id(): string {
    return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
```

设计要点：
- Logger 实例化轻量（两个字段），每个模块创建一个
- `write()` 是同步的，只入 buffer，不阻塞调用方
- `console.log` 不再使用 — 日志存储到 IndexedDB 后，开发者通过导出或 dashboard 查看
- error 级别自动捕获调用栈（跳过 Logger 自身的两帧）

### 4.3 IndexedDBLogTransport (`src/background/app_log_storage.ts`) [新建]

```typescript
export class IndexedDBLogTransport implements LogTransport {
    private buffer: AppLogEntry[] = [];
    private readonly batch_size = 50;
    private flush_timer: ReturnType<typeof setTimeout> | null = null;

    write(entry: AppLogEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length >= this.batch_size) {
            this.schedule_flush();
        }
    }

    private schedule_flush(): void {
        if (this.flush_timer) return;           // 已有待处理的 flush
        this.flush_timer = setTimeout(() => {   // 延迟合并
            this.flush();
        }, 100);
    }

    async flush(): Promise<void> {
        if (this.flush_timer) {
            clearTimeout(this.flush_timer);
            this.flush_timer = null;
        }
        if (this.buffer.length === 0) return;

        const batch = this.buffer.splice(0);
        const db = await get_db();              // 复用 storage.ts 的 DB 实例

        const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readwrite');
        const store = tx.objectStore(STORE_NAMES.APP_LOGS);
        for (const entry of batch) {
            store.put(entry);
        }

        await new Promise<void>((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });

        await this.trim_if_needed();            // 自清洁
    }

    async get_entries(limit: number, offset: number, filters?: LogQueryFilter): Promise<AppLogEntry[]> {
        // 使用 timestamp index，按时间倒序
        // 可选过滤：level / module / since / until
    }

    async count(filters?: LogQueryFilter): Promise<number> {
        // 带过滤的计数
    }

    async clear(): Promise<void> {
        // 清空 app_logs store
    }

    private async trim_if_needed(): Promise<void> {
        const max = await load_log_max_entries();
        const total = await this.count();
        if (total <= max) return;

        // 删最旧的 (total - max) 条
        const db = await get_db();
        const tx = db.transaction([STORE_NAMES.APP_LOGS], 'readwrite');
        const store = tx.objectStore(STORE_NAMES.APP_LOGS);
        const index = store.index('timestamp');

        const cursor = index.openCursor(null, 'next');  // 升序 = 最旧在前
        let deleted = 0;
        const to_delete = total - max;

        await new Promise<void>((resolve, reject) => {
            cursor.onsuccess = () => {
                const c = cursor.result;
                if (c && deleted < to_delete) {
                    c.delete();
                    deleted++;
                    c.continue();
                } else {
                    resolve();
                }
            };
            cursor.onerror = () => reject(cursor.error);
        });
    }
}

// 单例
let _transport: IndexedDBLogTransport | null = null;

export function get_app_log_transport(): IndexedDBLogTransport {
    if (!_transport) _transport = new IndexedDBLogTransport();
    return _transport;
}
```

### 4.4 MessageLogTransport (`src/shared/logger.ts` 或 `src/background/app_log_storage.ts`)

```typescript
export class MessageLogTransport implements LogTransport {
    private buffer: AppLogEntry[] = [];
    private readonly batch_size = 20;

    write(entry: AppLogEntry): void {
        this.buffer.push(entry);
        if (this.buffer.length >= this.batch_size) {
            this.send_batch();
        }
    }

    private send_batch(): void {
        const batch = this.buffer.splice(0);
        // fire-and-forget，不等待响应
        chrome.runtime.sendMessage({
            action: 'app_log_batch',
            entries: batch,
        }).catch(() => {});  // SW 可能休眠，静默失败
    }

    async flush(): Promise<void> {
        while (this.buffer.length > 0) {
            this.send_batch();
            await new Promise(r => setTimeout(r, 50));  // 小延迟，避免太快
        }
    }

    // content script 不支持 IndexedDB 直写，以下方法抛错
    async get_entries(): Promise<AppLogEntry[]> { throw new Error('not supported'); }
    async count(): Promise<number> { throw new Error('not supported'); }
    async clear(): Promise<void> { throw new Error('not supported'); }
}
```

### 4.5 DB 迁移 (`src/background/storage.ts`)

```typescript
export const DB_VERSION = 3;  // was 2

// onupgradeneeded 中新增：
if (old_version < 3) {
    if (!database.objectStoreNames.contains(STORE_NAMES.APP_LOGS)) {
        const log_store = database.createObjectStore(STORE_NAMES.APP_LOGS, {
            keyPath: 'id',
        });
        log_store.createIndex('timestamp', 'timestamp');
        log_store.createIndex('level', 'level');
        log_store.createIndex('module', 'module');
    }
}
```

### 4.6 常量 (`src/shared/constants.ts`)

```typescript
STORE_NAMES: {
    // ... 现有 ...
    APP_LOGS: 'app_logs',
}

DEFAULT_USER_CONFIG: {
    // ... 现有 ...
    log_level: 'warn',
    log_max_entries: 10000,
}
```

### 4.7 Service Worker 集成 (`src/background/service_worker.ts`)

新增 action（在 `handle_message` switch 中）：

```typescript
case 'app_log_batch': {
    const transport = get_app_log_transport();
    for (const entry of (message.entries || [])) {
        transport.write(entry);
    }
    return { success: true };
}

case 'export_app_logs': {
    const content = await export_app_logs(message.options || {});
    return { success: true, data: content };
}

case 'clear_app_logs': {
    await get_app_log_transport().clear();
    return { success: true };
}

case 'get_app_log_count': {
    const count = await get_app_log_transport().count();
    return { success: true, count };
}
```

初始化（在 `chrome.runtime.onInstalled` 或模块顶层）：

```typescript
// 加载用户配置中的日志级别
const config = await load_user_config();
Logger.set_level(config.log_level);
```

### 4.8 导出 (`src/background/exporter.ts`)

```typescript
export interface ExportAppLogsOptions {
    format: 'json' | 'jsonl';
    level?: LogLevel;
    module?: string;
    since?: number;
    until?: number;
}

export async function export_app_logs(options: ExportAppLogsOptions): Promise<string> {
    const transport = get_app_log_transport();
    const entries = await transport.get_entries(100000, 0, {
        level: options.level,
        module: options.module,
        since: options.since,
        until: options.until,
    });

    if (options.format === 'jsonl') {
        return entries.map(e => JSON.stringify(e)).join('\n');
    }
    return JSON.stringify({
        exported_at: new Date().toISOString(),
        total: entries.length,
        filters: { level: options.level, module: options.module },
        entries,
    }, null, 2);
}
```

### 4.9 Dashboard UI (`src/dashboard/dashboard.ts`)

在设置导航中新增：

```typescript
['diagnostics', '诊断日志', ...icon],
```

新增设置分区：

```
┌──────────────────────────────────────────────────┐
│ 诊断日志                                          │
├──────────────────────────────────────────────────┤
│                                                  │
│  日志级别                                         │
│  ┌──────┬──────┬──────┬──────┬────────┐          │
│  │debug │ info │ warn │error │ silent │          │
│  └──────┴──────┴──────┴──────┴────────┘          │
│                                                  │
│  最大储存条数      [10000        ]                 │
│  超出后自动删除最旧记录                              │
│                                                  │
│  当前日志数：1,234 条                              │
│                                                  │
│  [导出 JSON]  [导出 JSONL]  [清除所有日志]          │
│                                                  │
└──────────────────────────────────────────────────┘
```

交互逻辑：
- 级别切换：`persist({ log_level })` + `Logger.set_level(level)` + 通知 background
- 导出按钮：`chrome.runtime.sendMessage({ action: 'export_app_logs', options: { format } })` → 创建 Blob 下载
- 清除按钮：确认对话框 → `chrome.runtime.sendMessage({ action: 'clear_app_logs' })`
- 当前日志数：页面加载时查询 `get_app_log_count`

### 4.10 Console 迁移清单

| 文件 | 数量 | Transport | Logger 模块名 |
|------|------|-----------|---------------|
| `src/background/service_worker.ts` | 18 | IndexedDB | `background/sw` |
| `src/background/session_manager.ts` | 3 | IndexedDB | `background/session` |
| `src/background/keepalive.ts` | 1 | IndexedDB | `background/keepalive` |
| `src/content/content_script.ts` | 4 | Message | `content/script` |
| `src/dashboard/dashboard.ts` | 1 | IndexedDB | `dashboard` |
| `src/popup/popup.ts` | 1 | IndexedDB | `popup` |
| `src/devtools/devtools.ts` | 1 | IndexedDB | `devtools` |
| `src/devtools/devtools_panel.ts` | 1 | IndexedDB | `devtools/panel` |

迁移规则：
- `console.log('Capture All: xxx')` → `logger.info('xxx')`
- `console.warn('Capture All: xxx')` → `logger.warn('xxx')`
- `console.error('Capture All: xxx', err)` → `logger.error('xxx', err)`
- `console.debug(...)` → `logger.debug(...)`
- 保留 `console.log` 零容忍（除 `app_log_storage.ts` 初始化阶段的 fallback）

---

## 5. 文件改动总览

| 顺序 | 文件 | 操作 |
|------|------|------|
| 1 | `src/shared/types.ts` | 加 `LogLevel`/`AppLogEntry`/`LogQueryFilter`/`LogTransport` 类型，`UserConfig` 加 `log_level`+`log_max_entries` |
| 2 | `src/shared/constants.ts` | `DB_VERSION`→3, `STORE_NAMES`+`APP_LOGS`, `DEFAULT_USER_CONFIG` 加默认值 |
| 3 | `src/shared/logger.ts` | **新建** — `Logger` 类 + `MessageLogTransport` + `generate_log_id` |
| 4 | `src/background/storage.ts` | v3 migration — 创建 `app_logs` store |
| 5 | `src/background/app_log_storage.ts` | **新建** — `IndexedDBLogTransport` + 单例 + 查询/导出/清除 |
| 6 | `src/background/exporter.ts` | 新增 `export_app_logs()` / `clear_app_logs()` |
| 7 | `src/background/service_worker.ts` | 初始化 + 4 新 action + console 迁移 |
| 8 | `src/dashboard/dashboard.ts` | settings nav + 诊断日志 UI section |
| 9-14 | 其余文件 | console → logger 迁移 |

---

## 6. 验证

1. `npm run build` — TypeScript strict 编译通过
2. 加载扩展 → dashboard → 诊断日志 → 级别切为 `debug`
3. 开始采集 → 操作页面 → 停止 → 导出日志 JSON → 含 debug 级别内部日志
4. 导出采集数据 JSON → `console_events` 不含扩展自身日志（`Capture All:` 前缀）
5. `silent` 级别下无新日志写入 → 切回 `debug` 恢复
6. 超 `log_max_entries` 后自动删最旧
7. `npm test` 单测通过
