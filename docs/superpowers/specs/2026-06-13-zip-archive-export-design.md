# ZIP 完整包导出格式设计

**日期**：2026-06-13
**状态**：待实现
**目标**：用 ZIP 完整包替代单 JSON 承载大量二进制 body，使 GPT 生成图片等二进制响应可被真正采集和还原；保留现有 JSON/JSONL/HAR/HTML 作为轻量/兼容导出。

---

## 1. 背景与问题

当前导出把所有数据塞进单个 JSON 字符串。实测导出 `capture_all_capture_1781290138060_jbyr4ou` 437 条网络请求中，只有 154 条 body 被保存，250 条被标 `unsupported_binary`（body 置 null）。

根因：`src/background/network_capture.ts:304-305` 在 CDP `Network.getResponseBody` 返回 `base64Encoded: true` 时，直接 `response_body_status = 'unsupported_binary'`、`body = null`，丢弃所有二进制内容。图片、字体、二进制 fetch 因此全部丢失。

单 JSON 承载大二进制的真实危害（不是“难读”，而是）：
1. **导出时内存爆/失败**：SW 要 `JSON.stringify` 整个采集（含 base64），再经 `chrome.runtime.sendMessage` 复制给 UI，再 `new Blob`，多份拷贝。MV3 Service Worker 内存有限，几十～几百 MB 时卡死或被回收，导出直接失败。
2. **base64 污染 grep**：图片 base64 是几十万字符的单行噪声，`grep`/`jq`/编辑器遇超长行会卡或报错，且 grep 不出图片内容。

---

## 2. 导出格式定位

| 格式 | 定位 | 含大二进制 body |
|------|------|------|
| **ZIP 完整包** | 新增，默认全量导出 | 是 |
| JSON 轻量数据 | 保留，快速看数据/兼容旧流程 | 否（仅元数据 + 引用说明） |
| JSONL 流式数据 | 保留，程序逐行处理 | 否 |
| HAR 网络兼容 | 保留，DevTools/代理工具 | 否 |
| HTML 预览报告 | 保留，人快速预览 | 否 |

README 中明确：JSON/JSONL/HAR/HTML 是轻量/兼容导出，不保证包含所有 body；要完整二进制用 ZIP。

UI 文案：
- `ZIP 完整包（推荐）`
- `JSON 轻量数据`
- `JSONL 流式数据`
- `HAR 网络兼容`
- `HTML 预览报告`

---

## 3. 采集层改动（network_capture.ts）

CDP 返回二进制（`base64Encoded: true`）不再丢弃。每条 body 存储以下字段：

```text
body_encoding   # 'utf8' | 'base64'
mime_type       # 来自 Network.responseReceived 的 content-type
byte_size       # 原始字节数（base64 解码前的真实大小）
body            # 文本原文 或 base64 字符串
```

采集上限判断（见 §6 旋钮一）：
- `byte_size <= max_body_capture_bytes` → 存 body。
- `byte_size > max_body_capture_bytes` → 不存 body 字节，仅留元数据，`response_body_status = 'too_large'`（保留 URL、mime、byte_size）。

`BodyCaptureStatus` 新增/复用：二进制成功采集时状态为 `captured`（不再是 `unsupported_binary`）。`unsupported_binary` 保留用于无法判定编码的极少数情况。

注意：`request_body` 走相同规则（上传图片场景下图片字节是 request_body）。

---

## 4. ZIP 包结构

```text
capture_<capture_id>_<date>.zip
├── README.md              # 给不懂扩展的人的说明（见 §5）
├── manifest.json          # 包格式版本、文件清单、各类计数
├── capture.json           # 会话摘要：时间/时区/配置/统计，无大 body
├── events.jsonl           # 用户行为事件
├── navigation.jsonl       # 页面导航事件
├── network.jsonl          # 每条请求一行，body 用引用（见 §4.1）
├── console.jsonl          # 控制台日志
├── errors.jsonl           # 错误异常
├── storage.jsonl          # Storage 变更
├── cookies.jsonl          # Cookie 变更
└── bodies/
    ├── request/<request_id>.<ext>
    └── response/<request_id>.<ext>
```

空类别仍生成对应空 jsonl 文件（0 行），保证结构稳定、README 描述一致。

### 4.1 network.jsonl 行格式

每行一个 JSON 对象。小文本 body 内联在 `request_body` / `response_body` 字段；其余用引用字段：

```json
{
  "request_id": "cdp_1",
  "url": "https://chatgpt.com/backend-api/files/library",
  "method": "GET",
  "status_code": 200,
  "resource_type": "image",
  "capture_method": "cdp_primary",
  "mime_type": "image/png",
  "response_body_status": "captured",
  "response_body_ref": "bodies/response/cdp_1.png",
  "response_body_bytes": 981455,
  "response_body_sha256": "8068ae7f…",
  "response_body": null,
  "request_body_status": "not_enabled",
  "request_body_ref": null,
  "request_body": null
}
```

字段语义：
- `*_body`：仅当内联（小文本）时非 null。
- `*_body_ref`：指向 `bodies/` 内文件的相对路径；内联或无 body 时为 null。
- `*_body_bytes`：原始字节数。
- `*_body_sha256`：落文件时计算的内容哈希，用于校验与去重判断。
- `*_body_status`：`captured` / `too_large` / `not_enabled` / `cdp_failed` 等既有状态。

### 4.2 扩展名推断

由 `mime_type` 推断文件扩展名：

| mime | ext |
|------|-----|
| image/png | .png |
| image/jpeg | .jpg |
| image/gif | .gif |
| image/webp | .webp |
| image/svg+xml | .svg |
| font/woff2, application/font-woff2 | .woff2 |
| font/woff | .woff |
| application/json, *+json | .json |
| text/html | .html |
| text/css | .css |
| application/javascript, text/javascript | .js |
| text/plain | .txt |
| 其他/未知 | .bin |

---

## 5. body 路由规则

导出层对每条 body 按以下顺序判定：

```text
拿到一条 body
  │
  ├─ byte_size > max_body_capture_bytes ?         (此判断已在采集层完成)
  │     是 → 已是 too_large，仅元数据，无 ref，无内联
  │     否 ↓
  │
  └─ 要存。放哪？
        ├─ body_encoding == 'base64'(二进制) → bodies/ 文件
        ├─ 文本 byte_size >= inline_text_max_bytes → bodies/ 文件
        └─ 文本 byte_size <  inline_text_max_bytes → 内联进 network.jsonl
```

两个判断相互独立：
- **存不存**（采集上限）：对所有 body 含二进制生效。
- **放哪**（内联阈值）：只对“已决定要存的文本”生效；二进制永远落文件。

文本/二进制判定优先级：
1. `body_encoding === 'base64'` → 二进制（CDP 已判定，最可靠）。
2. 兜底看 mime：`text/*`、`application/json`、`application/javascript`、`*+json`、`*+xml`、`image/svg+xml` 视为文本，其余视为二进制。

---

## 6. 配置（两个旋钮）

| 字段 | 默认 | 含义 | 作用对象 |
|------|------|------|----------|
| `max_body_capture_bytes` | `104857600` (100MB) | 单个 body 是否存字节；超过仅留元数据(too_large) | 文本 + 二进制 |
| `inline_text_max_bytes` | `32768` (32KB) | 文本内联进 jsonl vs 落文件 | 仅文本 |

迁移：现有 `max_request_body_bytes` / `max_response_body_bytes`（P0.44，默认 1MB）的语义“防 JSON 爆”已过时，统一收敛为单个 `max_body_capture_bytes`，默认上调到 100MB。
- `RecordConfig` / `UserConfig`：移除 `max_request_body_bytes` / `max_response_body_bytes`，新增 `max_body_capture_bytes` 与 `inline_text_max_bytes`。
- `DEFAULT_CONFIG` / `DEFAULT_USER_CONFIG` / 常量同步。
- 旧用户配置通过 `DEFAULT_USER_CONFIG` 自动获得新默认值。
- 采集代码中 4 处大小检查改读 `max_body_capture_bytes`。
- Dashboard 设置页：移除两个旧输入框，新增 `max_body_capture_bytes` 与 `inline_text_max_bytes` 数字输入。

---

## 7. README.md 内容（包内，面向不懂扩展的人）

必含小节：
1. **这是什么**：Capture All（全采）浏览器扩展导出的一次网页采集记录包。
2. **文件清单**：逐个说明 manifest/capture/各 jsonl/bodies 的作用。
3. **怎么看网络请求**：打开 `network.jsonl`，每行一条请求。
4. **怎么打开图片/附件**：`response_body_ref` 指向 `bodies/response/` 下文件，直接双击打开。
5. **字段说明**：时间字段与时区、`status_code`、`*_body_status` 各值含义、`too_large` 是什么。
6. **隐私警告**：包内可能含 cookie、token、上传图片、聊天内容；请勿随意分享。

README 由模板 + 实际计数渲染（如“本包含 437 条网络请求，其中 7 张图片”）。

---

## 8. 架构与实现边界

新增模块：
- `src/background/archive_exporter.ts`：生成 ZIP。读取会话数据 → 写各 jsonl → 写 bodies 文件 → 渲染 README/manifest → 打包返回。
- ZIP 写入：优先复用项目已有 zip 能力；若无，引入轻量 zip 写入（store 模式即可，二进制已压缩）。

Service Worker：
- 新增 action `export_archive`，返回 zip 的 bytes/Blob 引用，避免拼巨型字符串。
- 逐 body 流式写入 zip 条目，而非一次性构建大字符串，规避 SW OOM。

调用入口（popup/dashboard/detail）：
- 导出格式选项加入 `ZIP 完整包`，走 `export_archive` + `download_blob` + `track_export_dir('capture')`。
- 沿用已修复的导出目录记忆逻辑。

文件名：`build_capture_filename` 扩展支持 `.zip` 扩展名。

---

## 9. 数据流

```text
采集中:
  CDP getResponseBody
    → base64Encoded? 记录 body_encoding/mime/byte_size/body
    → byte_size > max_body_capture_bytes? 仅元数据(too_large)
    → 写 IndexedDB

导出 ZIP:
  export_archive(capture_id)
    → flush_all() 落盘
    → 读会话 + 事件 + 网络
    → 逐请求:
        body 路由(§5) → 内联 or 写 bodies/ 文件(算 sha256)
        写 network.jsonl 一行
    → 写其余 jsonl
    → 渲染 capture.json / manifest.json / README.md
    → zip 打包
    → 返回 Blob → UI download_blob → track_export_dir('capture')
```

---

## 10. 错误处理

- 某条 body 写入失败：跳过该 body，jsonl 行 `*_body_status` 记错误态，不中断整包。
- `too_large`：保留 URL/mime/bytes，无 ref/内联。
- zip 生成异常：返回 `{ success:false, error }`，UI 提示导出失败，不静默吞错。
- 空采集：仍生成结构完整的 zip（空 jsonl + README + manifest）。

---

## 11. 测试边界

单元测试：
- body 路由规则：二进制→文件、大文本→文件、小文本→内联、too_large→仅元数据。
- 文本/二进制判定：base64 优先、mime 兜底。
- 扩展名推断表。
- network.jsonl 行含 ref/bytes/sha256；内联与引用互斥（有 ref 则 body 为 null）。
- manifest/README/capture.json 存在且字段完备（计数正确）。
- 配置迁移：旧字段移除、新字段默认值、采集读 `max_body_capture_bytes`。
- 二进制还原：给定 base64 输入，bodies/ 写出的字节与原始一致。

回归：
- 现有 JSON/JSONL/HAR/HTML 导出不回归。
- 导出目录记忆（P0.40-R1）对 ZIP 同样生效。

E2E（host Chrome / CDP）：
- 采集含图片的页面 → 导出 ZIP → 解包验证 `bodies/response/*.png` 字节非空、可打开。

---

## 12. 影响文件

- `src/background/network_capture.ts` — 二进制不丢、记录 encoding/mime/size、采集上限
- `src/background/archive_exporter.ts` — 新增 ZIP 生成
- `src/background/service_worker.ts` — `export_archive` action
- `src/shared/types.ts` — body 字段、配置字段、BodyCaptureStatus
- `src/shared/constants.ts` — 默认配置
- `src/shared/export_utils.ts` / `export_settings.ts` — `.zip` 文件名
- `src/dashboard/dashboard.ts` / `src/popup/popup.ts` / `src/detail/detail.ts` — ZIP 导出入口 + 设置 UI
- `tests/` — 新增 archive_exporter / 配置迁移 / 路由规则测试
- `docs/TASKS.md` — 记录任务
