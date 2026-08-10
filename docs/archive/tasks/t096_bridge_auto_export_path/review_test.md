# Task review t096（reviewer_focus: 测试）

- task：`t096_bridge_auto_export_path`
- spec：`docs/tasks/t096_bridge_auto_export_path/spec.md`
- diff_anchor：`4fd96ee173d1d567e5e38856000df49824f30d18`
- target：`git diff 4fd96ee173d1d567e5e38856000df49824f30d18`
- round：1
- reviewed_at：2026-08-11 11:17 UTC+8
reviewed_scope: 3833438285d4b9b4

## Findings

### t096_test_f001 - AC-001 `outside_dir` 断言为无校验力死断言

- 严重度：minor
- 锚点：AC-001；无行为缺陷（不影响判定）
- 位置：`tests/unit/agent_bridge_server.test.ts:1922`
- 问题：`outside_dir` = `join(tmpdir(), 'capture-all-escape-outside')` 是 `export_dir`（`capture-all-escape-<random>`）的兄弟目录，从未参与路径解析。`expect(file_path.startsWith(outside_dir)).toBe(false)` 恒为真。逃逸路径（如 pre-fix 的 `/escape`、`/tmp/escape`）同样不以 `outside_dir` 开头，故该断言对逃逸无判定力。不构成假绿风险（上一行 `startsWith(export_dir + '/')` 才是主断言），属冗余/误导。
- 建议：删除该断言；如需显式证明"未写出 EXPORT_DIR 外"，改为断言真实逃逸目标不存在（如 `!existsSync(join(tmpdir(), 'escape'))`），或仅保留 `startsWith(export_dir + '/')` 主断言。

### t096_test_f002 - `run_export_with_format` 循环内多 server 仅关闭最后一个

- 严重度：minor
- 锚点：无 AC；测试资源泄漏
- 位置：`tests/unit/agent_bridge_server.test.ts:1874`、`1917`
- 问题：AC-001 循环 5 个 format，每次 `run_export_with_format` 调 `start_test_server()`（新监听 http.Server），模块级 `cleanup` 只保留最后一个 server 的 close，前 4 个未被关闭直至进程退出。当前 vitest 进程级退出掩盖泄漏（全文件 82 用例 1.87s 通过、无挂起），仍为测试卫生缺陷。
- 建议：`run_export_with_format` 内 `try/finally` 关闭本 server，或复用单一 server 跑全部 format。

### t096_test_f003 - AC-002 合法 format 样例覆盖偏窄

- 严重度：minor
- 锚点：AC-002；可观察行为无缺陷（机制已测）
- 位置：`tests/unit/agent_bridge_server.test.ts:1933-1946`
- 问题：AC-002 仅测 `jsonl` 一个合法 format；`json` 由既有用例 `auto-writes large export results when output_path is omitted`（750 行）覆盖。`har`/`html`、大写归一（`JSON`→`.json`）、白名单长度边界（16/17 字符）未覆盖。均走同一白名单正则 `^[a-zA-Z0-9]{1,16}$`，不构成覆盖缺口。
- 建议：可各补一例合法 `har` 与 17 字符非法 format。

## 结论

- 前轮 finding 复核：无（Round 1）
- 改测方向复核：无（本轮纯新增 describe，无既有测试改动）
- 本轮新发现：3 条（均 minor）
- 未进表的提示：
  - `run_export_with_format` 的 `export_dir` 形参未使用（死参）。
  - AC-001/AC-002 未 readFile 回读内容；文件写入由 `writeFile` 失败→500→`result.data.file_path` 取值为空→断言失败的链路间接验证。对路径净化 AC 判定充分。
  - `.json` 回退断言耦合具体安全默认值（spec 仅示例"如 json"），默认扩展名变更时需同步更新测试。
- 总体判断：3 条 AC 均有走真实 HTTP server + 真实文件系统 + 真实生产逻辑（`/mcp/command` → `resolve_auto_output_path` → `write_result_to_file`）的测试；逃逸样例覆盖 `..`/`/`/`\`/编码五类，断言强度足（`startsWith(export_dir + '/')`、精确 `join` 路径、realpath 前缀），无危险模式命中，无未解决 critical/important；仅 minor，PASS。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：re_verified。独立运行 3 条 T096 用例通过；用 node 复算 pre-fix `path.join` 确认 `../../../../escape`→`/escape`、`foo/../../escape`→`/tmp/escape` 逃逸会被 `startsWith(export_dir)` 断言捕获（另两例 `%2f`、`\` 在 POSIX 下不真逃逸，但仍断言净化后回退 `.json`）；生产正则 `^[a-zA-Z0-9]{1,16}$` 逐一拒绝 5 个逃逸串。
- AC-002：re_verified。`jsonl` 断言精确等于 `join(export_dir, 'session-x.jsonl')` 且 `ok === true`；`json` 由既有 750 行用例覆盖。
- AC-003：re_verified。`file_real.startsWith(dir_real + '/')` 为正确目录包含判定（`+ '/'` 防兄弟目录前缀误判），用合法 format 验证 resolve 后落点与文件真实存在。

coverage = 3 / 3

verdict: PASS

## Round 2 (2026-08-11 03:26 UTC+8)

reviewed_scope: f52ebc0713b7d225

## Findings

本轮无新 finding。

## 结论

- 前轮 finding 复核：
  - t096_test_f001（minor，outside_dir 死断言）：已消除。`outside_dir` 引用已删（`agent_bridge_server.test.ts:1913-1933`），主断言 `startsWith(export_dir + '/')`、`.json` 结尾、无 `/../`、无 `\` 保留。属删除无判定力的恒真断言，非迁就实现。
  - t096_test_f002（minor，循环 server 泄漏）：已消除。`run_export_with_format` `try/finally` 内 `await server.close()`（`:1908-1910`），5 次循环 server 均自关。
  - t096_test_f003（minor，AC-002 覆盖窄）：处置为遗留，`docs/pending/todo/p009_auto_export_format_case_expand.md` 已登记（未开），同白名单正则无覆盖缺口。
- 改测方向复核：无迁就实现。本轮 diff 仅删除 f001 指出的恒真断言、重构 helper 关闭逻辑，未改任何既有断言预期。
- 本轮新发现：0 条
- 未进表的提示：
  - `file_path || ''`（`:1923`）对 undefined 兜底为空串 → `startsWith` 恒 false → 失败可观察，非静默通过。
  - helper finally 关闭后 `afterEach` 对同一 server 二次 close，Node 幂等无副作用，全文件 82 passed 佐证。
- 总体判断：3 条 AC 测试均真实触达生产路径（`/mcp/command` → `resolve_auto_output_path` → `write_result_to_file` + 真实 fs），断言强度足，无危险模式命中；Round 1 三条 minor 均已处置（2 修 1 遗留登记）。无未解决 critical/important，PASS。
- 系统性 follow-up：无

### AC 复验披露

- AC-001：re_verified。`npx vitest run tests/unit/agent_bridge_server.test.ts -t "T096"` → 3 passed；5 逃逸串逐一断言落点 `startsWith(export_dir + '/')`、`.json` 结尾、无 `/../`、无 `\`。
- AC-002：re_verified。`jsonl` 精确断言 `join(export_dir, 'session-x.jsonl')` 且 `ok === true`；`json` 由既有 750 行用例覆盖。
- AC-003：re_verified。realpath 前缀断言 `file_real.startsWith(dir_real + '/')` 正确防兄弟目录误判。
- 附带：全文件 82 passed，修复未破坏既有 79 用例。

coverage = 3 / 3（100%，全 `re_verified`）

verdict: PASS
