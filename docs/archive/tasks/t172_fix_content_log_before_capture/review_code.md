# Task review t172（reviewer_focus: 代码）

- task：`t172_fix_content_log_before_capture`
- spec：`docs/tasks/t172_fix_content_log_before_capture/spec.md`
- diff_anchor：`12a00f4a0934c529fc13e2871515ff8068df0119`
- target：`git diff 12a00f4a0934c529fc13e2871515ff8068df0119`
- round：1
- reviewed_at：2026-08-13 19:20 UTC+8
reviewed_scope: 63f86689ab2fbf40

## Findings

### t172_code_f001 - poll 启动路径不应用 log_level，silent/warn 下 content 仍写 info 日志

- 严重度：important
- 锚点：AC-002（用户将 log level 设为 silent/warn 后，content 世界不写 info 级日志）
- 位置：`src/extension/content/content_script.ts:75-91`（`start_status_poll` on_active → `start_capture`）；`src/extension/shared/poll_capture_status.ts:10-16`（`CaptureStatusResponse` 无 `log_level`）；`src/extension/background/service_worker.ts:1282-1361`（`tabs.onUpdated` 不补发 start 消息）
- 问题：log_level 仅在 `message.action === 'start'` 分支应用（`content_script.ts:46-50`）。content 在 active capture 期间加载时（刷新当前标签页 / 新开标签页），启动走 `start_status_poll` 立即 `get_status` → `on_active` → `start_capture`（`content_script.ts:81-88`），此路径收不到 start 消息：SW `onUpdated` 只做 CDP 重试、不补发 start，`get_status` 响应也无 `log_level` 字段（`service_worker.ts:326-337`）。结果：用户已在 dashboard 设 silent/warn 时，采集期刷新页面仍写入 `'Recording already active (detected via poll), starting capture'`（`content_script.ts:86`）与 `'Content capture started'`（`content_script.ts:98`）两条 info 级 app log 条目，直接违反 AC-002。start 消息下发覆盖的仅是 capture 启动瞬间已存在的 tab 与 tab 激活路径，采集期重载是最常见漏网场景。
- 建议：在 poll on_active 路径同样应用 log_level——在 `get_status` 响应携带 `log_level`（SW 侧 `service_worker.ts:326-337` 追加字段，`CaptureStatusResponse` 增加可选 `log_level`），`on_active` 回调先 `Logger.set_level(resp.log_level)` 再 `start_capture`；或 SW 在 `onUpdated` 补发带 `log_level` 的 start 消息。

### t172_code_f002 - 默认级别链路未闭合：DEFAULT_USER_CONFIG.log_level 仍 'debug'，实际默认未改为 info

- 严重度：important
- 锚点：契约区范围项「默认日志级别改为 info/warn（不再默认 debug）」
- 位置：`src/shared/constants.ts:70`（`log_level: 'debug' as const`）；`src/extension/background/service_worker.ts:108`（`onInstalled` 用 `load_user_config().log_level` 覆盖）；`src/extension/background/service_worker.ts:746,1196`（start 消息下发 `(await load_user_config()).log_level`）
- 问题：`src/shared/logger.ts:18` 静态默认改 `'info'` 是惰性的——真实运行路径全部以 `DEFAULT_USER_CONFIG.log_level`（仍 `'debug'`）为准：SW `onInstalled` 立即 `Logger.set_level('debug')`（`service_worker.ts:108`）；content 的 start 下发同样取 `user_config.log_level`（`service_worker.ts:746,1196`），fresh install（用户未设 log_level）时 content 在 capture 期间被 `set_level('debug')`，SW 亦保持 debug。可观测：新装用户默认日志粒度与改动前完全一致，spec 要求的「不再默认 debug」未达成；`sanitize_user_config` 仅校验枚举合法性（`user_config.ts:403-407`），不改变默认值。新增测试 `content_log_privacy.test.ts:59-65`（标签 AC-003）只断言 `logger.ts` 静态默认，未触达 user_config → downlink 的真实默认路径，掩盖了缺口。
- 建议：`DEFAULT_USER_CONFIG.log_level` 改为 `'info'`（`constants.ts:70`），与 `logger.ts` 默认一致；测试补一条「未设 user_config 时 start 消息下发 info」的断言。

## 结论

- 本轮新发现：2 条（均 important）
- 未进表的提示：
  - 文件过大：`src/extension/background/service_worker.ts` 1392 行（实现源码 ≥800 important 阈值；本 task 净增 4 行），按降级规则仅此处列出。
  - 测试层观察（交 test reviewer）：测试标签 AC-003 实际测的是默认 level（范围项），spec AC-003「active capture 期间行为一致」无专属测试；F001 的 poll 路径无测试覆盖。
  - 时序说明：spec 要求「在 Logger 创建前应用」——实现是 start 消息到达后 `set_level`（`content_script.ts:47-50`），晚于模块加载时的 Logger 创建，但模块加载日志已删除、其间无任何日志写入，功能等价，不判偏离。
  - `content_script.ts:45` `logger.debug('Content received message')` 先于 `set_level` 执行：user_config=debug 时该行会被默认 info 滤掉，仅损失一条 debug 行，无可观测影响。
  - `service_worker.ts:746` 在逐 tab map 内重复 `load_user_config()`（N 次 storage 读），可提至 `Promise.all` 循环外，非缺陷。
- 总体判断：log_level 下发链路只覆盖 start 消息路径，采集期重载的 poll 路径漏发（AC-002 未满足）；默认级别改动只动了 `logger.ts` 静态值，真实默认仍为 debug（范围项未达成）。两处均为未解决 important → FAIL。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：`re_verified` —— diff 核实 `content_script.ts` 模块级 `logger.info('Content script loaded', {url})` 已删除；grep 确认 content 目录各模块无模块级 logger 写入；`npx vitest run tests/unit/content_log_privacy.test.ts` 4 用例全过。
- AC-002：`re_verified`（部分）—— start 消息路径的 `set_level` 代码核实成立；poll 路径缺口见 F001，未达成。
- AC-003：`re_verified` —— diff 仅新增 log_level 下发，capture 期既有 `logger.info/debug`（`content_script.ts:98,157,232`）原样保留，未改采集日志行为。
- AC-004：`re_verified` —— 重跑 `npx vitest run tests/unit/content_log_privacy.test.ts`（4 passed）与 `tests/unit/logger.test.ts`（24 passed）。

coverage = 4 / 4

verdict: FAIL

## Round 2 (2026-08-13 19:23 UTC+8)

### 前轮 finding 复核（以 `git diff 12a00f4a0934c529fc13e2871515ff8068df0119` 与当前代码为准）

- **t172_code_f001（important，AC-002 poll 路径）—— 已消除**：SW `get_status` 响应追加 `log_level: (await load_user_config()).log_level`（`service_worker.ts:336-338`），`handle_message` 为 async 函数（`service_worker.ts:312`），await 合法；`CaptureStatusResponse` 增 `log_level?: string`（`poll_capture_status.ts:16`）；content `on_active` 在 `start_capture` 与 `logger.info('Recording already active...')`（`content_script.ts:90`）**之前**应用 `Logger.set_level(resp.log_level)`（`content_script.ts:83-86`），silent/warn 时该 info 日志同样被滤。start 消息与 poll 双路径同源（user_config）、幂等一致。
- **t172_code_f002（important，默认级别链路）—— 已消除**：`DEFAULT_USER_CONFIG.log_level` `'debug'` → `'info'`（`constants.ts:70`），链路闭环：logger.ts 静态默认 info ↔ user_config 默认 info ↔ SW `onInstalled` set_level('info') ↔ 下发 content set_level('info')，fresh install 全部生效。副作用扫描：无测试断言 `DEFAULT_USER_CONFIG.log_level === 'debug'`；dashboard_settings 默认选中 info 与渲染一致；e2e 为显式 `set_log_level(dash, 'debug')` 不受影响。

### 本轮新发现

- 0 条

### 未进表提示

- `get_status` 每次 poll（2s 间隔，`POLL_MAX_ATTEMPTS=150`）新增一次 `chrome.storage.local` 读，开销可忽略，非缺陷。
- AC-002c 为源文本静态断言（regex 匹配 on_active → set_level），测试强度交 test reviewer。
- 文件过大：`service_worker.ts` 1392 → 1394 行（本 task 净增 4 行），按降级规则仅此处列出。

### AC 复验披露（Round 2）

- AC-001：`re_verified` —— 模块级 URL 日志仍不存在（diff + grep），AC-001 测试通过。
- AC-002：`re_verified` —— start 消息路径（`content_script.ts:48-51`）与 poll 路径（`content_script.ts:83-86`）均应用下发 level，且均在 info 日志之前；语义正确。
- AC-003：`re_verified` —— capture 期既有日志未改，仅 level 生效时机前移；f002 修复使默认链路与 logger 默认一致。
- AC-004：`re_verified` —— `npx vitest run tests/unit/content_log_privacy.test.ts` 5 passed；`npx tsc --noEmit` 无错误；全量 `npx vitest run tests/unit` 177 files / 1696 tests 全过。

coverage = 4 / 4

reviewed_scope: 043a83eeba266451

verdict: PASS
