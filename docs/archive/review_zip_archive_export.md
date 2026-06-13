# ZIP 完整包导出文档审阅

**审阅日期**：2026-06-13
**审阅对象**：
- `docs/superpowers/specs/2026-06-13-zip-archive-export-design.md`
- `docs/superpowers/plans/2026-06-13-zip-archive-export.md`

**结论**：APPROVE（已修正）

所有 HIGH/MED 问题已在 spec v2 和 plan v2 修正。关键变更：

| 问题 | 修正 |
|------|------|
| HIGH #1 SW sendMessage 大消息 | ZIP 在页面侧构建，SW 只回传数据（复用 get_capture_data），页面进程内存预算高于 SW |
| HIGH #2 zipSync vs 流式 | 接受 v1 非流式，文档诚实声明限制；页面侧一次性 zipSync |
| HIGH #3 request body 用 response mime | 新增 request_body_mime 独立字段，从 request headers content-type 提取 |
| HIGH #4 base64 byte_size 估算不准 | 改为含 padding 修正公式 base64_decoded_size() |
| MED #1 crypto.subtle | doc 写清测试环境 polyfill 方式 |
| MED #2 atob | 同上 |
| MED #3 100000 条截断 | get_capture_data 无 limit，全量读取；manifest 计数如实反映 |
| MED #4 network_line 丢字段 | 改为 { ...req } 全字段保留，只覆盖 body/ref 字段 |
| MED #5 request_id 非法字符 | safe_request_id() 仅保留 [a-zA-Z0-9._-]，冲突去重 |
| MED #6 too_large 丢 encoding | too_large 时保留 encoding=base64 |
- [x] MED #7 commit 步骤 — 用户确认可直接执行 commit，无需标注

设计方向正确：二进制 body 不再丢弃，ZIP 中用 `bodies/` 文件承载大内容，JSONL 只保留小文本或引用，这能解决单 JSON 导出内存爆和 base64 污染问题。但当前 plan 有几处会导致实现失败或目标落空的问题，需要先修正再执行。

## CRITICAL

无。

## HIGH

### 1. `export_archive` 仍通过 `sendMessage` 返回整包 bytes，未真正避开 MV3 大消息/多份拷贝风险

- 位置：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md:200-202`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:878-881`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:1014-1025`

设计说要“返回 zip 的 bytes/Blob 引用，避免拼巨型字符串”，但 plan 实际让 service worker 返回 `archive.buffer`，UI 再 `new Blob([r.archive])`。这仍会把完整 ZIP 通过 `chrome.runtime.sendMessage` 复制到 UI 进程，和原来的“大对象跨消息传递”问题同类，只是从 JSON 字符串变成 ArrayBuffer。

建议修复：明确选择一种低拷贝路径：
- SW 内直接 `chrome.downloads.download({ url: object_url })`，UI 只发 action，不接收 bytes；或
- 用 offscreen document / extension page 负责打包与下载；或
- 若暂时无法完全流式，文档要承认“第一版仍有整包内存拷贝”，不要宣称已规避 SW OOM。

### 2. plan 选用 `zipSync`，与“逐 body 流式写入 zip”目标冲突

- 位置：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md:200-202`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:546`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:819`

spec 要“逐 body 流式写入 zip 条目，规避 SW OOM”，但 plan 使用 `fflate.zipSync(files)`，并且 `files` 是 `Record<string, Uint8Array>`，会先把所有 JSONL、所有 body、最终 zip 全部同时留在内存。100MB 单 body 默认下，多个 body 很容易超出 MV3 SW 内存。

建议修复：
- 第一版若接受非流式，应降低默认 `max_body_capture_bytes` 或明确 ZIP 生成仍有内存上限。
- 若要兑现目标，改成 fflate streaming API 或其它可逐条输出的 ZIP writer，并避免保存完整 `files` map。

### 3. request body 使用 response mime 推断，上传图片/文件会错扩展名和文本/二进制判断

- 位置：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md:59`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:787-790`

spec 明确 request_body 要走相同规则，尤其上传图片场景。但 plan 在构造 request body artifact 时使用 `mime: req.mime_type`，这通常是 response 的 content-type，不是 request payload 的 content-type。结果上传图片可能被按响应 JSON/HTML 处理，错误内联或落错扩展名。

建议修复：给 `NetworkRequestData` 增加 request body 的 `request_body_mime_type` 或从 request headers 的 `content-type` 派生；request 和 response 分别使用自己的 mime。

### 4. 采集层二进制 `byte_size` 估算不准确，可能绕过上限

- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:248-250`

`Math.floor(result.body.length * 3 / 4)` 没处理 base64 padding，可能高估/低估；更重要的是没校验非法 base64。上限判断依赖它时，边界值可能错判。

建议修复：用可靠计算：去掉空白，按 padding 修正 `decoded_size = len * 3 / 4 - padding`；或直接解码后以 `Uint8Array.length` 为准，但要权衡解码内存。

## MEDIUM

### 1. `crypto.subtle` 在 Node/Vitest 环境不一定以全局 `crypto` 形式存在

- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:515-517`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:529`

plan 说 Node 18+ 提供 `crypto.subtle`，但 Vitest 的运行环境/Node 版本配置可能不是全局可用。测试容易在本地或 CI 上因 `crypto is not defined` 失败。

建议修复：在测试环境使用 `globalThis.crypto` 并确认 Vitest 环境；必要时从 `node:crypto`.webcrypto 做测试 polyfill，但生产代码仍用 Web Crypto。

### 2. `atob` 在测试/Node 环境可能不可用

- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:655-659`

MV3 runtime 有 `atob`，但 Vitest Node 环境未必有。`archive_exporter.test.ts` 会直接调用 `build_body_artifact`，可能失败。

建议修复：把 base64 decode 封装成环境兼容 helper；测试里明确 polyfill，或使用已有项目工具。

### 3. `export_archive` 一次拉取每类 100000 条，分页/上限策略不明确

- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:756-764`

这会遗漏超过 100000 条的数据，且一次性读入大数组，与“完整包”和低内存目标冲突。

建议修复：使用分页迭代写 JSONL；manifest 计数可边写边统计。若暂时设硬上限，README/manifest 必须标注是否截断。

### 4. `network_line` 丢弃了不少现有网络字段，可能破坏“完整包”语义

- 位置：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md:84-113`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:730-749`

示例只列核心字段可以，但 plan 的实现函数实际只输出少量字段。若现有 `NetworkRequestData` 包含 headers、timing、错误信息、initiator、tab/frame 等字段，ZIP 的 `network.jsonl` 会比现有 JSON 导出少很多信息。

建议修复：`network.jsonl` 应以现有网络记录为基底，只替换/剥离大 body 字段，再追加 `*_body_ref/bytes/sha256`。

### 5. 同一 request_id + ext 可能文件名冲突

- 位置：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md:77-79`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:680`

若 request_id 含不安全字符、重复、或 request/response 多段 body，路径可能冲突或生成非法 zip path。CDP requestId 通常安全，但不应把它直接当路径组件。

建议修复：增加 `safe_request_id`：仅允许 `[a-zA-Z0-9._-]`，其它转义；冲突时追加短 hash。

### 6. `too_large` 时 encoding/byte_size 元数据可能丢失

- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:248-255`

二进制超过上限时，代码只设 `byte_size`，但 `encoding` 仍是 null。spec 要保留 mime/byte_size 等元数据；encoding 也应保留为 `base64`，否则导出层/审计无法知道它原本是二进制。

建议修复：即使 `too_large`，也设置 `response_body_encoding = 'base64'` 或 `'utf8'`。

### 7. 文档状态流转与任务执行顺序矛盾

- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:18`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:64-69`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:1121-1130`

plan 要“每个 task 独立 commit”，但当前用户通常未明确授权提交；且最后文档标“已实现”依赖所有代码完成。作为执行计划可以保留 commit 命令，但应标注“仅在用户要求提交时执行”。

建议修复：把 commit 步骤改成可选，或写明需要用户授权。

## LOW

### 1. 测试文件里的注释与项目“默认少注释”风格不完全一致

- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:86`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:315`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:488`

这些顶部注释不是必须，实际实现时可以省略。

### 2. README 包内字段说明略少

- 位置：`docs/superpowers/specs/2026-06-13-zip-archive-export-design.md:180-190`
- 位置：`docs/superpowers/plans/2026-06-13-zip-archive-export.md:709-713`

README 计划只解释了少量 status。建议至少覆盖 `captured`、`too_large`、`not_enabled`、`cdp_failed`、`unsupported_binary`，否则非开发用户仍难判断缺失原因。

## 验证结果

| 检查 | 结果 |
|---|---|
| 文档一致性 | Fail |
| 可实现性 | Fail |
| 安全风险 | Pass |
| 测试覆盖设计 | Pass with comments |
| 构建/单测 | Skipped（仅审阅文档，未执行代码） |

## 已审阅文件

- `docs/superpowers/specs/2026-06-13-zip-archive-export-design.md` — Modified/Design
- `docs/superpowers/plans/2026-06-13-zip-archive-export.md` — Modified/Plan

## 建议修改顺序

1. 先决定 ZIP 生成与下载是否必须真正流式/低拷贝。
2. 修正 plan 中 `zipSync(files)` 与 `sendMessage archive.buffer` 的实现路线。
3. 给 request body 增加独立 mime/encoding/bytes 设计。
4. 调整分页导出、字段保留、safe path、base64 size 计算。
5. 再进入 TDD 实现。
