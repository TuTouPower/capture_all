# Task review t171（reviewer_focus: 代码）

- task：`t171_fix_body_capture_privacy_default`
- spec：`docs/tasks/t171_fix_body_capture_privacy_default/spec.md`
- diff_anchor：`9d9a0f34ff67782abc55377e9648bdea051d8916`
- target：`git diff 9d9a0f34ff67782abc55377e9648bdea051d8916`
- round：1
- reviewed_at：2026-08-13 19:05 UTC+8

## Findings

### t171_code_f001 - response_preview 未脱敏，原始 body 前缀明文落库与导出（AC-002）

- 严重度：important
- 锚点：AC-002「含 password/token/api_key 等敏感 key 的 form-urlencoded 或 JSON body 按敏感 key 脱敏」。
- 位置：`src/extension/background/service_worker.ts:1078-1087`；`src/extension/background/network_capture.ts:262,866,1057`；`src/shared/redaction.ts:230`
- 问题：`response_preview` 字段是 `response_body` 的**原始**前 200 字符（`build_cdp_body_result` line 262 `preview: body_text.slice(0, 200)`；CDP 路径 line 866、web_request 路径 line 1057 落库）。`handle_network_request` 的 t171 脱敏只处理 `request.request_body` / `request.response_body`，未处理 `response_preview`。`redact_data=true` 时，JSON/form 响应若前 200 字符内含敏感 key 值（token 常位于响应开头），`response_preview` 明文进 IndexedDB；导出默认保留（`strip_body_parts` 无选项直接返回原对象），agent `get_all_capture_data` 原样透传 `NetworkRequestData`。泄漏链完整：落库 + 默认导出 + agent 上下文。这与 AC-002 的脱敏目标直接冲突，也削弱 t171 的隐私动机。
- 建议：`handle_network_request` 中对 `request.response_preview` 用同一 `mime_type` 过 `redact_body`（或对前 200 字符做敏感 key 检测/整体降级）；若 preview 与 body 同源可考虑预览直接取自脱敏后 body 的前缀，避免双份原始内容。

### t171_code_f002 - preview 降级阈值误用 100MB，未知 MIME body 完整原文落库（AC-003）

- 严重度：important
- 锚点：AC-003「无法安全解析的 body 以 hash/长度/preview 存储，**不落盘完整原始内容**」。
- 位置：`src/shared/body_redaction.ts:29-39`（preview_summary）；`src/extension/background/service_worker.ts:1080,1084`（传 `current_config.max_body_capture_bytes`）
- 问题：`preview_summary` 的截断阈值由调用方传入，生产路径传的是 `max_body_capture_bytes`（`MAX_BODY_CAPTURE_BYTES = 100MB`，constants.ts:22）。采集路径已把 body 截断到 ≤100MB（`build_cdp_body_result`/`truncate_request_body`），因此 `body.length > max_preview_bytes` 恒不成立，`preview=<截断后全文>`，`[body_redacted:len=N,preview=<完整原文>]` 整体落库。可观察：`redact_data=true` 时，`text/plain` POST 或 `text/html` 响应（<100MB）的 request/response body 变成长度相同、仅包一层 wrapper 的内容——完整原始内容落盘，AC-003「不落盘完整原始内容」未满足。单测 `AC-003a` 用 `max_preview_bytes=20` 演示截断，但生产参数（100MB）下无截断效果，测试未覆盖真实调用路径。
- 建议：preview 用独立短阈值（如复用 `RESPONSE_PREVIEW_LENGTH` 或新增常量，256B 量级）按字节截断，`len=N` 保留全长信息；或对不可解析 MIME 只存长度 + 短 preview，不把 body 上限当 preview 上限。

### t171_code_f003 - multipart file 内容未跳过/未降级，文件原文落库（范围行 + AC-003）

- 严重度：important
- 锚点：spec 范围「multipart 字段按敏感 key 脱敏，**password/file 内容默认跳过**」；AC-003「无法安全解析的 body 以 hash/长度/preview 存储」。
- 位置：`src/shared/body_redaction.ts:90-101`（is_sensitive_multipart）
- 问题：multipart 处理是整体粗检测：仅当存在敏感 `name`，或 `filename=` 与 body 中任意处 `password|token|secret|key`（不区分大小写）同时出现时才降级 preview。`name="file"` 不在敏感 key 列表（SENSITIVE_KEY_PATTERNS 无 `file`），纯文件上传（如 `name="file"; filename="scan.pdf"`，内容为任意文档/图片/二进制）时 `is_sensitive_multipart` 返回 false，文件内容**原文**落库。实现未做 part 级解析，file part 内容实际「无法安全解析」，与 AC-003 的降级要求不符；`password/file 内容默认跳过` 中 file 部分未实现。可观察：multipart 表单上传身份证/简历文件，`redact_data=true` 时文件内容明文进 IndexedDB 与导出（单测「multipart 无敏感内容保留原文」把该行为固化为期望，正是缺口所在）。
- 建议：multipart 含 `filename=` 的 part 视为 file 内容，整体降级 preview（与 password 一致），或实现 part 级解析：敏感 name / file part 的值替换为摘要，非敏感文本 part 保留。

### t171_code_f004 - 敏感 key 子串匹配过宽，误伤非敏感字段值（不破坏非敏感内容）

- 严重度：minor
- 锚点：行为缺陷——审阅重点「不破坏非敏感内容」。
- 位置：`src/shared/body_redaction.ts:18-22`（is_sensitive_key）
- 问题：`lower.includes(pattern)` 子串匹配，`auth` 会命中 `author`/`authority`/`authentication`，`token` 命中 `tokenizer`/`tokenization`。可观察：JSON `{"author": "alice", "title": "t"}` 的 `author` 值被替换为 `[REDACTED]`——非敏感数据被破坏，且用户无法从导出分辨是真敏感还是误伤。无安全风险（方向保守），但数据可用性受损。
- 建议：敏感 key 用词边界/分隔符匹配（如 `password`、`api_key` 全词匹配，`auth` 类改为 `authorization`/`auth_` 前缀或 `\b` 边界），并对 `author` 类常见词做白名单排除。

### t171_code_f005 - 解析失败整体降级为静态 [REDACTED]，无长度/hash 信息且误伤可解析 form（AC-003 手段不符）

- 严重度：minor
- 锚点：AC-003「以 hash/长度/preview 存储」的正面手段。
- 位置：`src/shared/body_redaction.ts:47-50`（redact_urlencoded catch）、`59-62`（redact_json catch）
- 问题：JSON 解析失败或任一 form key `decodeURIComponent` 抛错（非法 `%` 序列）时，整个 body 变成静态 `[REDACTED]`：既无长度、也无 hash/preview，诊断价值归零；且单 key 编码异常会连带破坏整条可解析 form 的其余非敏感字段。安全上保守（不落原文），与 AC-003「提供 hash/长度/preview」的信息保留要求有差距。
- 建议：catch 分支改走 `preview_summary`（长度 + 短 preview，或 hash），与 AC-003 手段统一；urlencoded 解析失败时逐 pair 容错（仅对无法解码的 key 保守处理，不整体丢弃）。

### t171_code_f006 - PRIVACY.md 未同步 body 默认与脱敏边界说明（AC-005 覆盖范围不全）

- 严重度：minor
- 锚点：AC-005「公开文档（README/PRIVACY）的 body 默认与脱敏边界描述与实现一致」。
- 位置：`PRIVACY.md:37`；`tests/unit/public_docs.test.ts:117-126`
- 问题：README.md / README.en.md 已同步（AC-005 主体验证通过），但 AC-005 明列 PRIVACY：`PRIVACY.md:37` 仍只写「body 限于 100MB，非隐私过滤器」，未说明 body 默认关闭、敏感 key 脱敏与不可解析降级边界。该句不与实现冲突（限制确实非脱敏），但 PRIVACY 作为隐私文档缺 body 脱敏边界说明；`public_docs.test.ts` 仅断言 README 两份，未覆盖 PRIVACY。
- 建议：PRIVACY.md 补充 body 默认关闭与脱敏边界一段，并在 public_docs 测试中加 PRIVACY 断言（或声明 PRIVACY 不承载该描述，改由 README 独占）。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（Round 1）
- 本轮新发现：6 条（important × 3，minor × 3）
- 未进表的提示：
  - 文件过大（按「文件过大标准」，仅结论段列出，不进 finding 表）：`src/extension/background/exporter.ts` 449 行（≥400 minor 阈值，本 task 净增约 8 行）；`src/extension/background/service_worker.ts` 1381 行（≥800 important 阈值，本 task 净增 13 行）。无不可拆硬约束声明，建议后续 task 拆分。
  - 范围外观察：`src/extension/content/network_hook.ts:356` 模块级 `capture_response_body = true` 与 `start_network_hook` 默认参数 `new_capture_response_body = true`（line 422）仍是旧默认；实际调用点 `content_script.ts:133` 显式传 `config.capture_response_body`（默认 false）覆盖，hook 启动即随配置注入，未发现可观察窗口期，不构成 finding。
  - 数据一致性观察：body 脱敏/降级后 `request_body_bytes` / `response_body_bytes`（HAR `bodySize`、`stats.total_body_bytes`，service_worker.ts:1092）仍为原始字节数，与落库内容不一致；无安全影响，不影响 AC 判定。
  - 接入点覆盖核验：`write_network_requests` 全仓唯一调用点为 `handle_network_request:1089`；CDP body（line 981）、fallback hook（line 1016）、web_request/CDP 注册（line 703、1223、1340）全部汇聚于此；`ws_frame` 在 line 1051 提前返回，不误脱敏。接入点覆盖成立。
  - MCP/UI opt-in 核验：MCP `start_recording` 缺省合并 `DEFAULT_CONFIG`（schemas.ts:26-27）→ 默认关闭；popup.ts:339-340 与 dashboard_settings.ts:59-60 开关随 user_config（默认 false）。AC-001 的 opt-in 路径成立。
- 总体判断：AC-001/004 实现正确，AC-002/003 存在三条独立且可观察的隐私泄漏路径（response_preview 未脱敏、preview 阈值=100MB 原文落库、multipart file 原文落库），均为本 task 核心目标（SEC-003 body 隐私）的未达成项，须修复后重审。
- 系统性 follow-up：无（均为本 task 内修复项）

### AC 复验方式

- AC-001（默认关闭，UI/MCP opt-in）：`re_verified`。证据：constants.ts:37-38/52-53 默认 false；popup.ts:339-340、dashboard_settings.ts:59-60、MCP schemas.ts:26-34 缺省合并 DEFAULT_CONFIG；body_redaction.test.ts「AC-001」用例断言。
- AC-002（form/JSON 敏感 key 脱敏）：`re_verified`（判定违反）。证据：body_redaction.test.ts「AC-002a/b」覆盖 redact_body 主路径 ✓；但 service_worker.ts:1078-1087 未脱敏 `response_preview`（f001）→ AC-002 有未覆盖泄漏路径。
- AC-003（不可解析降级，不落完整原文）：`re_verified`（判定违反）。证据：preview_summary 阈值=100MB 生产参数下不截断（f002）；multipart file 原文保留（f003）；解析失败降级 [REDACTED] 无长度信息（f005，minor）。
- AC-004（导出独立剥离 request/response/preview，默认保留）：`re_verified`。证据：exporter.ts strip_body_parts（默认原样返回、独立 delete 三个字段）、export_body_strip.test.ts 4 用例全过、agent_command_dispatcher.ts:96-98 与 schemas.ts:126-128 透传、HAR 路径剥离后 postData/text 条件判断自然省略。
- AC-005（README/PRIVACY 与实现一致）：`re_verified`。证据：README.md/README.en.md 同步 + public_docs.test.ts 断言通过；PRIVACY.md 未补 body 边界（f006，minor）。

coverage = 5 / 5

verdict: FAIL
## Round 2 (2026-08-13 19:10 UTC+8)

### 前轮 finding 复核（以 `git diff 9d9a0f34ff67782abc55377e9648bdea051d8916` 与代码/测试为准）

- f001（important，response_preview 未脱敏）：**已修**。`handle_network_request` 现对 `request.response_preview` 同样过 `redact_body`（service_worker.ts:1090-1094，mime 用 `request.mime_type`）。语义核验：preview 为原始 body 前 200 字符，mime=json 且截断不完整时 `JSON.parse` 失败 → 长度摘要（`[body_redacted:len=N]`），mime 未知/HTML → 长度摘要，均不回退原文。泄漏链（落库 + 默认导出 + agent 透传）已断。
- f002（important，preview 阈值 100MB 含完整原文）：**已修**。`preview_summary` 改为长度-only（body_redaction.ts:32-37，`[body_redacted:len=N]`，无 preview 段），未知/不可解析 MIME 不再含任何原文片段；单测 AC-003a 已改断言（`not.toContain('preview=')`、`not.toContain('binary')`、`not.toContain('secret-token')`），恒真断言消除。遗留影响见 f007（README 未同步）与结论段（死参数）。
- f003（important，multipart file part 未跳过）：**已修**。`is_sensitive_multipart` 改为「敏感 name **或任何 `filename=`** 即整体降级长度摘要」（body_redaction.ts:100-106）；新增用例「multipart 含 file part 降级」（断言不含文件内容）与「无敏感 name 且无 file part 保留原文」。`name="file"; filename=...` 路径不再落原文。
- f004（minor，子串匹配误伤 author/tokenizer）：**已修**。`is_sensitive_key` 改全等 + `_`/`-`/`.` 分隔符前后缀匹配（body_redaction.ts:24-29）；新增用例断言 `author=me&tokenizer=x` 保留、`access_token` 脱敏。逐字核验：`author`/`tokenizer` 不匹配，`access_token`/`refresh_token`/`new_password` 匹配。边缘漏报见 f008。
- f005（minor，解析失败静态 [REDACTED] 无长度信息）：**已修**。`redact_urlencoded`/`redact_json` catch 均改走 `preview_summary` 长度摘要（body_redaction.ts:50-53,66-69），mode='preview'；AC-003b 用例断言 `[body_redacted:len=` 且不含原文。
- f006（minor，PRIVACY.md 未同步）：**已修**。PRIVACY.md:19 改「Request and response body capture is **disabled by default**」，PRIVACY.md:27 改「redacted per MIME for sensitive keys…stored as a length summary rather than full content」；public_docs.test.ts:145-146 增加两条 PRIVACY 断言。

### 本轮新发现

### t171_code_f007 - README 仍声明「长度+preview 存储」，与长度-only 实现不符（AC-005）

- 严重度：minor
- 锚点：AC-005「公开文档（README/PRIVACY）的 body 默认与脱敏边界描述与实现一致」。
- 位置：`README.md:207`（「无法安全解析的 body 以长度+preview 存储」）；`README.en.md:206`（"stored as length+preview"）；`src/shared/body_redaction.ts:3`（文件头注释「降级为长度 + preview」）
- 问题：f002 修复将 `preview_summary` 改为长度-only（无 preview 段），PRIVACY.md 已同步为 "length summary"，但 README 两份与 body_redaction.ts 头注释仍写「长度+preview」——描述与实现不符，用户/agent 按文档预期「降级内容含可读 preview」而实际只有 `[body_redacted:len=N]`。无安全缺陷（实现更保守），属 AC-005 文档同步遗漏。
- 建议：README.md/README.en.md 与 body_redaction.ts 头注释改为「长度摘要（length-only）」，与 PRIVACY.md 措辞一致。

### t171_code_f008 - 词边界匹配漏报「敏感词+数字后缀」key（如 password2），值明文落库

- 严重度：minor
- 锚点：行为缺陷——AC-002 敏感 key 覆盖缺口。
- 位置：`src/shared/body_redaction.ts:24-29`（is_sensitive_key）
- 问题：词边界策略只匹配全等或 `_`/`-`/`.` 分隔段。`password1`/`password2`/`api_key2` 类（敏感词后直接跟数字/字母，无分隔符）不匹配。可观察：注册表单 `name="password2"`（确认密码字段）的 JSON/form body 值原样保留并落库导出——旧子串实现会脱敏，本轮修复引入该覆盖缺口（漏报方向，非误伤）。真实存在但非主流命名，不构成阻断。
- 建议：对纯敏感词（`password`/`passwd`/`secret`/`apikey`/`token`/`jwt`/`cookie`）增加「词 + 数字/`2`/`_confirm` 等后缀」前缀匹配（如 `lower.startsWith(p)` 且后续字符为数字），`auth`/`credential`/`authorization` 保持分隔符匹配以防误伤。

## 结论（Round 2）

- 前轮 finding 复核：f001/f002/f003/f004/f005/f006 全部按 diff 核实已修（详见上），无「修不彻底」项；未采信 task.md 自称，全部以代码与测试断言为准。
- 本轮新发现：2 条（minor × 2：f007、f008）。
- 未进表的提示：
  - 死参数：`redact_body` 第三参 `_max_preview_bytes`（body_redaction.ts:74）在 preview 段移除后未使用，调用点传 `inline_text_max_bytes`（service_worker.ts:1078）无实际效果；无行为影响，建议随 f007 一并清理或改签名。
  - 文件过大（沿用 Round 1 结论）：`exporter.ts` 449 行、`service_worker.ts` 1381 行（本 diff 再净增 7 行）；按降级规则不进 finding 表。
  - 接入点/默认值核验结论与 Round 1 一致（`write_network_requests` 唯一汇聚点、`ws_frame` 提前返回、UI/MCP opt-in 路径），本轮无变化。
- 总体判断：Round 1 三条 blocking（f001~f003）均已正确修复，AC-002/003 泄漏路径闭合；本轮 2 条 minor（文档措辞同步、词边界边缘漏报）不阻断。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-001：`re_verified`。常量默认 false + opt-in 路径无变化（沿用 Round 1 证据）。
- AC-002：`re_verified`。response_preview 脱敏已补（service_worker.ts:1090-1094）；AC-002a/b + f004 词边界用例通过；边缘漏报 password2 类 → f008（minor）。
- AC-003：`re_verified`。preview_summary 长度-only；AC-003a/b 断言不含任何原文子串与 `preview=`；multipart file part 用例断言不含文件内容。
- AC-004：`re_verified`。无改动，export_body_strip.test.ts 4 用例全过。
- AC-005：`re_verified`。README/PRIVACY/public_docs 断言通过；README「长度+preview」措辞与实现不符 → f007（minor）。

coverage = 5 / 5

reviewed_scope: 0a4120212c0189fb

verdict: PASS
## Round 3 (2026-08-13 19:15 UTC+8)

### 前轮 finding 复核（以 `git diff 9d9a0f34ff67782abc55377e9648bdea051d8916` 与代码/测试为准）

- f007（minor，README「长度+preview」措辞）：**部分修复**。README.md:207 已改「无法安全解析的 body 以长度摘要存储」、README.en.md:206 已改 "stored as a length summary"（与 PRIVACY.md 一致）✓；但 `src/shared/body_redaction.ts:3` 文件头注释仍为「multipart 与不可解析二进制降级为长度 + preview」——f007 建议明确列出的三处位置中此残留未同步（实施方自述「头注释同步」与实际 diff 不符）。纯注释性 minor，不影响行为与 AC 判定，建议随处置表顺手清理。
- f008（minor，词边界漏数字后缀 key）：**已修**。`is_sensitive_key` 增加两条正则（body_redaction.ts:29-30）：
  - `new RegExp(`(^|[-_.])${p}\\d*$`)`：分隔符/开头 + 敏感词 + 数字到结尾（`x_password2`、`password123`）；
  - `new RegExp(`^${p}\\d*([-_.]|$)`)`：敏感词 + 数字 + 分隔符/结尾（`password2_confirm`）。
  - 转义核验：模板字符串 `\\d` 编译为字符串 `\d`，`RegExp` 构造收到数字类 `\d`；vitest（esbuild transform）下 password2 用例实际通过，证明转译后正则生效。`author`/`tokenizer`/`author2`/`authentication` 不受影响（`auth` 后非数字字符即不匹配）。
  - 独立行为验证（node 复现正则，17 个 key 场景）：password2/password123/password2_confirm/x_password2/api_key2/token123/refresh_token/user.password2 → 脱敏 ✓；author/tokenizer/author2/authentication/username/password2x → 保留 ✓。无误伤扩展、无新增漏报（`xpassword2` 类无分隔符拼接仍漏，属 f008 已声明的边界，不重复报告）。

### 本轮新发现

无（f007 残留为上一轮 finding 的修不彻底项，不另开编号；复核结论见上）。

## 结论（Round 3）

- 前轮 finding 复核：f008 按代码 + 测试 + 独立行为验证核实已修；f007 部分修复（README 两份已同步，body_redaction.ts:3 头注释残留一处「长度 + preview」），属注释级 minor，不阻断。
- 本轮新发现：0 条。
- 未进表的提示：
  - f007 残留定位：`body_redaction.ts:3`（与文件内 `preview_summary` 长度-only 实现及 `redact_body` 注释矛盾）。
  - 死参数 `_max_preview_bytes`（body_redaction.ts:74）仍未清理，无行为影响（沿用 Round 2 结论）。
  - 文件过大沿用 Round 1 结论（exporter.ts 449、service_worker.ts 1381），本轮无净增。
- 总体判断：Round 2 两条 minor 的实质修复（文档措辞、数字后缀匹配）已到位，正则转义正确、行为无回归；仅剩一处注释残留，无未解决 critical/important。
- 系统性 follow-up：无。

### AC 复验方式（Round 3）

- AC-001/AC-002/AC-003/AC-004：`re_verified`。无行为改动，沿 Round 2 结论；f008 正则扩展经测试与独立行为验证，AC-002 敏感 key 覆盖增强（password2 类）。
- AC-005：`re_verified`。README.md/README.en.md/PRIVACY.md 措辞均与实现一致（长度摘要）；public_docs.test.ts 断言通过；body_redaction.ts:3 头注释残留不改变文档事实（f007 部分修复记录）。

coverage = 5 / 5

reviewed_scope: 80bd2d8801792fca

verdict: PASS
