# ZIP 完整包导出格式设计

**日期**：2026-06-13
**状态**：待实现（已按 review 修正）
**审阅**：`docs/review.md` — 2026-06-13 第一轮审阅通过（修正后），无 CRITICAL

**目标**：用 ZIP 完整包替代单 JSON 承载大量二进制 body，使 GPT 生成图片等二进制响应可被真正采集和还原；保留现有 JSON/JSONL/HAR/HTML 作为轻量/兼容导出。

---

## 1. 背景与问题

当前导出把所有数据塞进单个 JSON 字符串。实测导出 `capture_all_capture_1781290138060_jbyr4ou` 437 条网络请求中，只有 154 条 body 被保存，250 条被标 `unsupported_binary`（body 置 null）。

根因：`src/background/network_capture.ts:304-305` 在 CDP `Network.getResponseBody` 返回 `base64Encoded: true` 时，直接 `response_body_status = 'unsupported_binary'`、`body = null`，丢弃所有二进制内容。图片、字体、二进制 fetch 因此全部丢失。

单 JSON 承载大二进制的真实危害：
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

```
body               # 文本原文 或 base64 字符串
body_encoding      # 'utf8' | 'base64'（too_large 时也保留，不置 null）
body_byte_size     # 原始字节数
mime_type          # 来自 Network.responseReceived 的 content-type（response）
request_body_mime  # 来自 request headers 的 content-type（request，见 §4.2）
```

### 3.1 base64 byte_size 计算

使用 padding 修正公式，不估算：

```
function base64_decoded_size(b64: string): number {
    const without_spaces = b64.replace(/\s/g, '');
    const padding = (without_spaces.endsWith('==') ? 2 : without_spaces.endsWith('=') ? 1 : 0);
    return Math.floor(without_spaces.length * 3 / 4) - padding;
}
```

采集上限判断（见 §6 旋钮一）：
- `byte_size <= max_body_capture_bytes` → 存 body。
- `byte_size > max_body_capture_bytes` → 不存 body 字节，仅留元数据，`response_body_status = 'too_large'`（保留 URL、mime、byte_size、encoding）。

二进制成功采集时状态为 `captured`（不再是 `unsupported_binary`）。`unsupported_binary` 保留用于无法判定编码的极少数情况。

`request_body` 走相同规则（上传图片场景下图片字节是 request_body），但使用独立的 `request_body_mime`/`request_body_encoding`/`request_body_bytes` 字段。

### 3.2 新增类型字段

`NetworkRequestData` 新增：

```typescript
response_body_encoding: 'utf8' | 'base64' | null;
response_body_bytes: number | null;
request_body_encoding: 'utf8' | 'base64' | null;
request_body_bytes: number | null;
request_body_mime: string | null;
```

---

## 4. ZIP 包结构

```
capture_<capture_id>_<date>.zip
├── README.md
├── manifest.json
├── capture.json
├── events.jsonl
├── navigation.jsonl
├── network.jsonl
├── console.jsonl
├── errors.jsonl
├── storage.jsonl
├── cookies.jsonl
└── bodies/
    ├── request/<safe_id>.<ext>
    └── response/<safe_id>.<ext>
```

空类别仍生成对应空 jsonl 文件（0 行），保证结构稳定、README 描述一致。

`bodies/` 路径使用 `safe_request_id`：仅保留 `[a-zA-Z0-9._-]`，其余字符替换为 `_`。冲突时追加递增序号 `_2`、`_3`。

### 4.1 network.jsonl 行格式

**以现有 `NetworkRequestData` 全部字段为基底**，只做以下变更：

1. 原 `response_body` / `request_body` 字段：小文本时保留原值；二进制/大文本时置 `null`。
2. 追加引用字段（仅当 body 落文件时非 null）：

```json
{
  "request_id": "cdp_1",
  "url": "https://chatgpt.com/backend-api/files/library",
  "method": "GET",
  "status_code": 200,
  "... 其余既有字段 ...": "...",
  "response_body_ref": "bodies/response/cdp_1.png",
  "response_body_bytes": 981455,
  "response_body_sha256": "8068ae7f…",
  "request_body_ref": null,
  "request_body_bytes": null,
  "request_body_sha256": null
}
```

追加字段：

```
response_body_ref          # 落文件时非 null
response_body_bytes        # 原始字节数
response_body_sha256       # 落文件时的 sha256 hex
request_body_ref
request_body_bytes
request_body_sha256
```

不删除任何现有字段（headers、timing、error_text、initiator、tab_id 等全部保留），确保 ZIP 导出的信息不少于 JSON 导出。

### 4.2 request body 独立 mime

request body 的 mime 从 request headers 的 `content-type` 派生，不复用 response 的 `mime_type`。`request_body_mime` 在采集时由 CDP `Network.requestWillBeSent` 的 `request.headers['content-type']` 或 webRequest `onBeforeSendHeaders` 提取。

若无从获取，`request_body_mime = null`，路由时按文本处理（default safe）。

### 4.3 扩展名推断

由 mime 推断文件扩展名：

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

```
拿到一条 body
  │
  ├─ status == 'too_large' 或 body 为 null？
  │     是 → omit（仅元数据，无 ref，无内联）
  │     否 ↓
  │
  └─ 要存。放哪？
        ├─ is_binary? → bodies/ 文件
        │     （binary = encoding=='base64' 或 mime 非文本型）
        ├─ byte_size >= inline_text_max_bytes → bodies/ 文件
        └─ byte_size <  inline_text_max_bytes → 内联进 jsonl
```

两个判断相互独立：
- **存不存**（采集上限）：对所有 body 含二进制生效。
- **放哪**（内联阈值）：只对"已决定要存的文本"生效；二进制永远落文件。

文本/二进制判定优先级：
1. `body_encoding === 'base64'` → 二进制（CDP 已判定，最可靠）。
2. 兜底看 mime：`text/*`、`application/json`、`application/javascript`、`*+json`、`*+xml`、`image/svg+xml` 视为文本，其余视为二进制。

---

## 6. 配置（两个旋钮）

| 字段 | 默认 | 含义 | 作用对象 |
|------|------|------|----------|
| `max_body_capture_bytes` | `104857600` (100MB) | 单个 body 是否存字节；超过仅留元数据(too_large) | 文本 + 二进制 |
| `inline_text_max_bytes` | `32768` (32KB) | 文本内联进 jsonl vs 落文件 | 仅文本 |

迁移：现有 `max_request_body_bytes` / `max_response_body_bytes`（P0.44，默认 1MB）的语义"防 JSON 爆"已过时，统一收敛为单个 `max_body_capture_bytes`，默认上调到 100MB。
- `RecordConfig` / `UserConfig`：移除 `max_request_body_bytes` / `max_response_body_bytes`，新增 `max_body_capture_bytes` 与 `inline_text_max_bytes`。
- `DEFAULT_CONFIG` / `DEFAULT_USER_CONFIG` / 常量同步。
- 旧用户配置通过 `DEFAULT_USER_CONFIG` 自动获得新默认值。
- Dashboard 设置页：新增两个数字输入框。

---

## 7. README.md（包内，面向不懂扩展的人）

必含小节：
1. **这是什么**：Capture All（全采）浏览器扩展导出的一次网页采集记录包。
2. **文件清单**：逐个说明 manifest/capture/各 jsonl/bodies 的作用。
3. **怎么看网络请求**：打开 `network.jsonl`，每行一条请求。
4. **怎么打开图片/附件**：`response_body_ref` 指向 `bodies/response/` 下文件，直接双击打开。
5. **字段说明**：时间字段与时区、`status_code`；`*_body_status` 各值含义：
   - `captured` — 已保存正文。
   - `too_large` — 正文过大仅留信息。
   - `not_enabled` — 采集中未启用正文采集。
   - `cdp_failed` — CDP 获取失败（如资源已释放）。
   - `unsupported_binary` — 无法判定的二进制编码。
6. **隐私警告**：包内可能含 cookie、token、上传图片、聊天内容；请勿随意分享。

README 由模板 + 实际计数动态渲染（如"本包含 437 条网络请求，其中 7 张图片"）。

---

## 8. 架构：ZIP 在页面侧构建

**ZIP 在页面侧（popup/dashboard/detail）组装并下载，不在 SW 内打包。**

原因：（来自 review HIGH #1/#2）
1. MV3 Service Worker 没有 `URL.createObjectURL`，无法直接触发下载。
2. 若 SW 内 `zipSync` 再通过 `sendMessage` 回传整包 ArrayBuffer，会多一轮进程间拷贝，实际比"页面侧构建"更差。
3. SW 内存更受限，100MB 默认上限下多 body 极易 OOM。

**v1 实现路径**：
- SW 已有 `get_capture_data` action（返回会话完整结构化数据），ZIP 导出复用此通道。
- 页面侧拿到数据后，用 fflate `zipSync` 一次性打包为 `Uint8Array`，再 `Blob` → `download_blob` 下载。
- `zipSync` 是非流式 API，v1 接受打包时页面内存峰值 = 数据 + ZIP 输出。
- 页面进程内存预算高于 SW，通常可承受中等规模导出。

**已知限制（v1，在 README 和文档中诚实声明）**：
- 非流式：所有 JSONL + bodies 同时驻留页面内存才打包。
- 极大规模采集（数千条带大图片的请求）仍可能在页面侧 OOM。
- 未来版本可改用 fflate 流式 API 或分批下载。

新增模块（页面侧，`src/shared/` 而非 `src/background/`）：
- `src/shared/archive_builder.ts`：接收结构化数据 → 写各 jsonl → 写 bodies 文件 → 渲染 README/manifest → `zipSync` 返回 `Uint8Array`。

调用入口（popup/dashboard/detail）：
- 导出格式选项加入 `ZIP 完整包`。
- 入口流程：`chrome.runtime.sendMessage({action:'get_capture_data', session_id})` → 拿到数据 → `build_archive(data)` → `download_blob` → `track_export_dir('capture')`。
- 沿用已修复的导出目录记忆逻辑。

文件名：`build_capture_filename` 扩展名 `.zip`。

---

## 9. 数据流

```
采集中:
  CDP getResponseBody
    → base64Encoded? 记录 body_encoding/mime/byte_size/body
    → byte_size > max_body_capture_bytes? → too_large（保留 encoding/mime/bytes）
    → 写 IndexedDB

导出 ZIP:
  页面侧：
    sendMessage({action:'get_capture_data', session_id})
    → SW flush_all() 落盘
    → SW 返回 CaptureData（含 events/network/console，network 含 body base64）
    → 页面侧构建：
        逐请求 body 路由 → 内联 or 写 bodies/ 文件（算 sha256）
        → 写各 jsonl → capture.json → manifest.json → README.md
        → zipSync(files) → Uint8Array
    → new Blob([archive], {type:'application/zip'})
    → download_blob → track_export_dir('capture')
```

---

## 10. 错误处理

- 某条 body 写入失败：跳过该 body，jsonl 行 `*_body_status` 记错误态，不中断整包。
- `too_large`：保留 URL/mime/bytes/encoding，无 ref/内联。
- zip 生成异常：抛错 → UI 提示导出失败，不静默吞错。
- 空采集：仍生成结构完整的 zip（空 jsonl + README + manifest）。

---

## 11. 环境兼容说明

- `crypto.subtle`：生产代码用 `globalThis.crypto.subtle`（MV3 runtime 和现代浏览器均有）。测试环境中 Vitest + Node 22+ 的 `globalThis.crypto` 提供此 API；若 CI 或更低版本 Node 缺失，测试文件内 polyfill：`import { webcrypto } from 'node:crypto'; globalThis.crypto = webcrypto as any`。
- `atob`：生产代码有（MV3 runtime）。测试文件按需 polyfill。
- `zipSync`：来自 `fflate`，Node/浏览器均可用，store 模式（不压缩），因为图片/二进制本身已压缩。

---

## 12. 测试边界

单元测试：
- body 路由规则：二进制→文件、大文本→文件、小文本→内联、too_large→omit。
- 文本/二进制判定：base64 优先、mime 兜底。
- 扩展名推断表。
- base64_decoded_size 含 padding/无 padding/空字符串/带空白。
- safe_request_id：字母数字点横线保留、特殊字符替换、冲突去重。
- network.jsonl 行：既有字段全保留 + ref/bytes/sha256 追加；内联与引用互斥。
- manifest/README/capture.json 存在且计数正确。
- 配置迁移：旧字段移除、新字段默认值、采集读 `max_body_capture_bytes`。
- 二进制还原：给定 base64 输入，bodies/ 写出的字节与原始一致。
- `archive_builder` 整体：给定小样本 CaptureData，生成解包后可验证的 ZIP。

回归：
- 现有 JSON/JSONL/HAR/HTML 导出不回归。
- 导出目录记忆（P0.40-R1）对 ZIP 同样生效。

E2E（host Chrome / CDP）：
- 采集含图片的页面 → 导出 ZIP → 解包验证 `bodies/response/*.png` 字节非空、可打开。

---

## 13. 影响文件

- `src/shared/types.ts` — body encoding/bytes/mime 字段、配置字段
- `src/shared/constants.ts` — 默认配置、采集上限、内联阈值常量
- `src/shared/body_routing.ts` — 新建，判定 body 内联/落文件/省略 + mime→ext
- `src/shared/hash.ts` — 新建，sha256_hex
- `src/shared/archive_builder.ts` — 新建，组装 ZIP（页面侧）
- `src/background/network_capture.ts` — 二进制不丢、记录 encoding/mime/byte_size、采集上限
- `src/shared/export_settings.ts` — `.zip` 扩展名
- `src/dashboard/dashboard.ts` / `src/popup/popup.ts` / `src/detail/detail.ts` — ZIP 导出入口 + 设置 UI
- `tests/` — 新增各模块测试
- `docs/superpowers/specs/2026-06-13-zip-archive-export-design.md` — 本文件
- `docs/review.md` — 审阅记录
