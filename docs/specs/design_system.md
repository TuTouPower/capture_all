# 设计系统、安全与配置

## 1. UI 设计系统

### 1.1 设计令牌 (design_tokens.css)

**字体**：Sans: IBM Plex Sans (系统 UI 兜底)；Mono: IBM Plex Mono (时间/URL/方法/状态码)

**色板** (浅色主题)：

| 令牌 | 值 | 用途 |
|---|---|---|
| `--canvas` | `#e7e6e3` | 页面背景 |
| `--surface` | `#ffffff` | 卡片/面板背景 |
| `--ink` | `#1b1b18` | 主文字 |
| `--ink-2` | `#56564f` | 副文字 |
| `--ink-3` | `#8c8c83` | 辅助文字 |
| `--border` | `#e7e7e3` | 边框 |
| `--green` | `#15a04a` | 成功/完成 |
| `--red` | `#e0352b` | 危险/错误/采集中 |
| `--blue` | `#3b82f6` | 主色 (品牌蓝) |
| `--purple` | `#6d33e0` | 网络数据源色 |
| `--amber` | `#d98510` | 控制台数据源色 |

**数据源色板**：

| 令牌 | 颜色 | 对应标签 |
|---|---|---|
| `--src-user` | `#2563eb` | 用户行为 |
| `--src-nav` | `#4a52d6` | 页面导航 |
| `--src-network` | `#6d33e0` | 网络请求 |
| `--src-console` | `#d98510` | 控制台 |
| `--src-error` | `#e0352b` | 错误异常 |
| `--src-storage` | `#15a04a` | Storage |
| `--src-cookie` | `#b88407` | Cookie |

**圆角/阴影**：`--radius`: 12px, `--radius-sm`: 8px, `--radius-xs`: 6px；`--shadow-card`：卡片阴影，`--shadow-pop`：弹窗阴影。

**主色**：品牌主色 `#3b82f6` (蓝色，chat10 用户指定)，应用于"开始采集"按钮、Logo、选中态。语义紫色 (网络请求源色) 保持不变。

### 1.2 已删除的概念

以下历史概念已从 UI 完全移除 (chat10, chat8)：

- 深度采集 / 标准采集 模式切换
- 模式 badge / 模式列 / 模式筛选
- "当前采集中" 统计卡
- 密度 (compact/regular) 切换
- 脱敏 作为独立数据标签 (脱敏是配置项，不是数据标签)
- `detail.html` 独立详情页 (已删除，合并入 dashboard)

---

## 2. 导出能力

| 格式 | 导出内容 | 说明 |
|---|---|---|
| JSON | 完整结构化数据 | capture_id + events 全量 |
| JSONL | 逐行记录 | 方便流式处理和 AI ingest |
| HTML | 自包含报告 | XSS 安全转义 (`</script>` -> `<\/script>`) |
| HAR | 网络归档格式 | Chrome DevTools / Fiddler 可识别 |

**导出设置**：目录为 Chrome Downloads 相对目录；文件名模板 `capture_all_{capture_id}_{date}.{ext}`；HTML 导出安全转义所有动态内容。

---

## 3. 隐私与安全

### 3.1 脱敏配置

```typescript
// 默认 RecordConfig
redact_sensitive_headers: true   // 默认开启 header 脱敏
redact_url_query: true           // 默认开启 URL 脱敏
redact_data: true                // 默认开启数据脱敏
keyboard_capture_mode: 'none'    // 默认不记录键盘
capture_input_values: false      // 默认不捕获输入值
capture_request_body: false      // 默认不捕获请求体
capture_response_body: false     // 默认不捕获响应体
```

### 3.2 脱敏规则

- **Headers 过滤**：`authorization`、`cookie`、`set-cookie`、`x-api-key` 等替换为 `[REDACTED]`
- **表单值**：`type=password` 始终 `[REDACTED]`；其他仅在 `capture_input_values=true` 时采集
- **URL query**：`token`/`key`/`secret`/`password`/`auth` 参数值替换为 `[REDACTED]`
- **键盘**：`'none'` 不记录；`'shortcuts'` 只记修饰键；`'all'` 完整记录
- **Body 截断**：request_body 10KB、response_body 50KB、console args 1KB、target_text 100 字符
- **脱敏与截断分离**：`redact_data` 控制脱敏，payload size limit 永远生效

### 3.3 安全约束

- 数据本地优先，不默认上传
- HTML 导出必须转义动态内容
- Bridge 仅绑定 `127.0.0.1`
- 不提供删除 session / 清空数据 MCP 能力
- 禁止硬编码 secret/token/弱口令
- Agent bridge token 由用户提供

---

## 4. 配置

### 4.1 默认采集配置

```typescript
DEFAULT_CONFIG: RecordConfig = {
    capture_mode: 'basic',
    mouse_precision: 'clicks_scroll_drag',
    capture_console: false,
    capture_network: true,
    keyboard_capture_mode: 'shortcuts',
    capture_input_values: false,
    capture_request_body: false,
    capture_response_body: false,
    redact_sensitive_headers: true,
    redact_url_query: true,
    redact_data: true,
    sample_rate_ms: 50
};
```

### 4.2 默认用户配置

```typescript
DEFAULT_USER_CONFIG = {
    selected_mode: 'basic',
    mouse_precision: 'clicks_scroll_drag',
    keyboard_capture_mode: 'none',
    capture_input_values: false,
    capture_request_body: false,
    capture_response_body: false,
    redact_data: true,
    theme: 'follow-system',
    locale: 'en',
    system_time_timezone: 'browser',
    detail_time_display_mode: 'system',
    export_directory: '',
    export_filename_template: 'capture_all_{capture_id}_{date}.{ext}',
    export_save_as: true,
    agent_bridge_enabled: false,
    agent_bridge_url: 'http://127.0.0.1:17831',
    agent_bridge_token: '',
    agent_bridge_poll_interval_ms: 1000
};
```

### 4.3 Bridge 配置

```json
{
    "host": "127.0.0.1",
    "port": 17831,
    "token": "<user-provided>",
    "command_timeout_ms": 30000,
    "full_data_timeout_ms": 120000
}
```

### 4.4 设置页删除项

从设置页移除默认模式选择项 (chat10 用户要求)。

---

## 5. 构建与测试

| 命令 | 说明 |
|---|---|
| `npm run build` | TypeScript 编译 + Vite 构建，输出到 `artifacts/dist/` |
| `npm test` | Vitest 单元测试 |
| `npm run test:e2e` | Playwright E2E 测试 |
| `npm run bridge` | 启动 Bridge 服务器 |
| `npm run mcp` | 启动 MCP Server |

**Vite 多入口**：`background`, `content`, `popup`, `detail` (遗留), `dashboard`, `devtools`, `devtools_panel`

**Chrome 权限**：`storage`, `webRequest`, `debugger`, `scripting`, `tabs`, `activeTab`, `alarms`, `downloads`, `cookies`；`host_permissions: ["<all_urls>"]`
