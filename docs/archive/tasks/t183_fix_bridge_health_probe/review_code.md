# Task review t183（reviewer_focus: 代码）

- task：`t183_fix_bridge_health_probe`
- spec：`docs/tasks/t183_fix_bridge_health_probe/spec.md`
- diff_anchor：`c274da4d06ad162bdec1cd9acc9e0f45fa8f549e`
- target：`git diff c274da4d06ad162bdec1cd9acc9e0f45fa8f549e`
- round：1
- reviewed_at：2026-08-13 22:35 UTC+8

## Findings

### t183_code_f001 - AC-004 未完成：SessionStart hook 仍用 curl 200 判断，未复用 --probe

- 严重度：important
- 锚点：AC-004「SessionStart hook 复用同一探测逻辑」；spec 范围「SessionStart hook 复用同一探测脚本，避免 shell 逻辑漂移」
- 位置：`.claude/settings.json:33`（SessionStart hook command）；对照 `src/bridge/main.ts:12-24`（`--probe` 子命令）
- 问题：实现侧只提供了 `--probe <url>` 子命令作为「复用出口」，但 hook 本身未接线——`.claude/settings.json:33` 的 SessionStart hook 仍是 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:17831/health | grep -q 200 && exit 0`，即「HTTP 200 即健康」的旧漂移逻辑。该文件是 git 追踪文件（`git ls-files` 确认），diff 中无任何改动。可观测后果：配置端口被任意 2xx 服务占用时，hook 仍静默跳过 Bridge 启动（spec 背景描述的原始缺陷原样复现），shell 与 TS 探测逻辑继续漂移。另 `docs/blueprint/architecture.md:268` 新增段落声称「SessionStart hook 复用 `probe_bridge_health`（`--probe <url>` 子命令出口）」，与仓库内 hook 实际内容不符——文档描述的是设计意图而非现状。
- 建议：更新 `.claude/settings.json` SessionStart hook，将 curl 探测替换为 `node "$root/artifacts/bridge/bridge.mjs" --probe http://127.0.0.1:17831`，按 exit code 语义处理（healthy=0 跳过启动；occupied=2 报端口冲突不启动；unreachable=3 正常启动），并同步修正 architecture.md 为实际状态。

### t183_code_f002 - 测试读源码断言实现细节，重构即红且不验证行为

- 严重度：minor
- 锚点：代码质量（测试 anti-pattern）；非 AC 违约
- 位置：`tests/unit/bridge_main_health_probe.test.ts:61-68`（「main 的 --probe 分支与启动判定共用 run_bridge_probe（源码接线）」用例）
- 问题：该用例用 `readFileSync` 读 `src/bridge/main.ts` 源码 + 正则断言 `/run_bridge_probe\(probe_url\)/` 与 `/status === 'healthy' \? 0 : .../`。断言对象是实现文本而非行为：任何无害重构（提取 exit code 常量、改名、调整注释）都会红，而红不代表行为错误；反之该正则也证明不了「hook 真正复用」（见 f001）。`process.exit` 不可进程内 mock 是真实约束，但不应靠字符串匹配绕过。
- 建议：删除该用例，或将 exit code 语义提取为导出常量（如 `BRIDGE_PROBE_EXIT_CODES`）并断言常量值；`--probe` 分支 exit code 的端到端验证留待 hook 接线后的 e2e。

### t183_code_f003 - --probe exit code 契约无文档，消费者需反推代码

- 严重度：minor
- 锚点：代码质量（契约可发现性）；非 AC 违约
- 位置：`src/bridge/main.ts:20`（`process.exit(status === 'healthy' ? 0 : status === 'occupied' ? 2 : 3)`）；`docs/blueprint/architecture.md:263-268`
- 问题：`--probe` 子命令的 exit code（0/2/3）与 stdout 文本（`healthy`/`occupied`/`unreachable`）是该命令对外的唯一机器契约，但未在任何文档说明——architecture.md 只写「`--probe <url>` 子命令出口」，语义散落在 main.ts 与测试正则里。任何新消费者（含 f001 修复后的 hook）必须读源码或测试才能得知 0/2/3 的含义，接错即误判。
- 建议：在 architecture.md「/health 识别契约（t183）」节补充 exit code 与输出格式；或在 main.ts 定义命名常量并注释。

### t183_code_f004 - import 声明位于文件中部（入口判定处），破坏顶部 import 惯例

- 严重度：minor
- 锚点：代码质量（文件组织/可读性）；非 AC 违约
- 位置：`src/bridge/main.ts:62-70`
- 问题：`import { pathToFileURL } from 'node:url'` 出现在文件尾部（`is_main` 判定处），而非顶部 import 区。ESM 下 hoist 合法、功能正确，但违背文件顶部 import 惯例，且 `import.meta.url === pathToFileURL(process.argv[1]).href` 这一运行环境判定无注释说明意图（「测试 import 不触发入口」仅写在注释之外、靠读者推断）。main.ts 仅 72 行，无性能理由。
- 建议：import 移至文件顶部；将 is_main 判定提炼为带注释的小函数（如 `is_main_module()`）。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 本轮新发现：4 条（1 important + 3 minor）
- 未进表的提示：
  - 文件过大（降级规则，仅列路径行数）：`src/bridge/server.ts` 1156 行（本 task 仅 +3，一处 send_json 调用）；`tests/unit/agent_bridge_server.test.ts` 2080 行（本 task 仅 +5，断言更新）。均为历史累积，非本 task 堆大。
  - 复杂度：`probe_bridge_health`（config.ts:189-213）手算 McCabe ≈ 6，低于提示阈值；无 ≥10 函数。
  - 范围外观察：`--probe` 参数解析 `argv[probe_index + 1]`（main.ts:14）会把 `--probe` 后紧跟的 flag（如 `--probe --port`）当作 URL；hook 用法固定（`--probe <url>`），不构成当前缺陷。`run_bridge_probe`（main.ts:6-8）是薄转发层，作为 `--probe` 语义出口可接受。`is_bridge_healthy`（config.ts:215-217）保留为兼容 wrapper、仅测试引用，AC-002 措辞引用其行为，非死代码。BRIDGE_VERSION（server.ts:44，'0.1.0'）与 package.json version 一致；版本不参与匹配，符合 spec 风险回退「版本号仅展示」。
- 总体判断：AC-001/002/003/005 实现与测试均核实通过（相关单测 104 passed），但 AC-004 的核心目标——SessionStart hook 复用探测逻辑——只做了出口未接线，shell 漂移逻辑依旧存在，且 architecture.md 声称与实际不符，任务不可信，须修复后进入下一轮。
- AC 复验方式：
  - AC-001：`re_verified` — `src/bridge/server.ts:262-265` 返回 `{ok:true, service:'capture-all-bridge', bridge_version:BRIDGE_VERSION}`；`tests/unit/agent_bridge_server.test.ts:183-189` 断言通过。
  - AC-002：`re_verified` — `src/bridge/config.ts:189-213` 校验 status + Content-Type + 完整标识，解析失败归 occupied；`tests/unit/bridge_config_health.test.ts` 两条 AC-002 用例通过。
  - AC-003：`re_verified` — `src/bridge/main.ts:42-47` occupied 分支 throw 明确错误；`tests/unit/bridge_main_health_probe.test.ts:26-29` `rejects.toThrow(/non-capture-all/)` 通过；入口 catch 打印 stderr 并 exit(1)（main.ts:68-70）。
  - AC-004：`re_verified`（复验结果为未达成）— `.claude/settings.json:33` 仍为 `curl … | grep -q 200`，diff 无 hook 改动，见 f001。
  - AC-005：`re_verified` — `npx vitest run tests/unit/bridge_config_health.test.ts tests/unit/bridge_main_health_probe.test.ts tests/unit/agent_bridge_server.test.ts`：3 files / 104 tests passed。
  - coverage = 5 / 5
- 系统性 follow-up：无。

reviewed_scope: ef650bb92fa61641

verdict: FAIL

## Round 2 复核（2026-08-13 22:38 UTC+8）

前轮 4 条 finding 处置确认（以当前 `git diff c274da4d06ad162bdec1cd9acc9e0f45fa8f549e` 为准）：

- **t183_code_f001（important）已消除**：`.claude/settings.json:33` SessionStart hook 已改为 `node "$root/artifacts/bridge/bridge.mjs" --probe http://127.0.0.1:17831`：healthy → `exit 0` 跳过启动；occupied → stderr 告警后 `exit 0`（不启动、不静默）；其余（unreachable）→ 正常启动。`curl … | grep -q 200` 已移除。hook 与 main 现共用 `probe_bridge_health` 三态逻辑，AC-004 达成。`docs/blueprint/architecture.md:268` 描述与实际一致。
- **t183_code_f002（minor）已消除**：`tests/unit/bridge_main_health_probe.test.ts` 原「main 源码接线正则」用例删除，改为 hook 文本断言（第 6 条：settings.json 含 `--probe`/`$probe`/`healthy`/`occupied` 且不含 `grep -q 200`）。第 2 条内保留 `process.exit(1)` 文本断言——入口 catch 路径进程内不可测（`process.exit` 不可 mock），是覆盖 AC-003「非零退出」的最小手段，且 occupied 分支 throw 已有行为断言，不判修不彻底。
- **t183_code_f003（minor）已消除**：`docs/blueprint/architecture.md:268` 已补「`--probe <url>` 子命令输出三态文本 + exit code（healthy=0 / occupied=2 / unreachable=3），SessionStart hook 与自动化脚本复用」。
- **t183_code_f004（minor）已消除**：`import { pathToFileURL } from 'node:url'` 已移至 `src/bridge/main.ts:3` 顶部 import 区。

修复过程引入的新改动扫描：`BRIDGE_SERVICE_ID` 提升为 `src/bridge/config.ts:180` 导出常量，`src/bridge/server.ts:265` `/health` 与 probe 识别共用同一常量（同源防漂移，强化 AC-001/002 一致性）；`server.ts` 单向依赖 `config.ts`，无循环 import。hook 中 `probe="$(node … --probe … 2>/dev/null)"` 若探测进程异常输出为空则落入启动分支，与 unreachable 语义一致，可接受。occupied 分支 exit 0 + 告警符合 Claude Code hook 非零 exit 会阻断 SessionStart 的约束，合理。未发现新问题。

本轮验证：`npx tsc --noEmit` exit 0；`npx vitest run tests/unit/bridge_main_health_probe.test.ts tests/unit/bridge_config_health.test.ts tests/unit/agent_bridge_server.test.ts`：3 files / 105 tests passed（main 探测测试 7 用例）。

本轮新发现：0 条。AC 复验：AC-001/002/003/005 复验方式同 Round 1（re_verified）；AC-004 由 FAIL 转 re_verified——hook 已接线 `--probe` 且测试第 6 条文本断言防回退。coverage = 5 / 5。

总体判断：4 条 finding 全部处置到位，tsc 与 105 项测试通过，无未解决 critical/important，本轮 PASS。

reviewed_scope: 6a9b6cf66f209efc

verdict: PASS

## Round 3 复核（2026-08-13 22:40 UTC+8）

代码侧变化确认：以当前 `git diff c274da4d06ad162bdec1cd9acc9e0f45fa8f549e` 为准，业务文件（`src/bridge/config.ts`、`src/bridge/main.ts`、`src/bridge/server.ts`、`.claude/settings.json`、`docs/blueprint/architecture.md`）逐字核对与 Round 2 一致——`BRIDGE_SERVICE_ID` 导出（config.ts:180）、`/health` 同源（server.ts:265）、`--probe` 分支（main.ts:13-24）、`pathToFileURL` 顶部 import（main.ts:3）、hook 三态接线（settings.json:33）均无变化。唯一改动为 `tests/unit/bridge_config_health.test.ts` 的 `self_response()` mock 常量同源修正（`service: 'capture-all-bridge'` → `service: BRIDGE_SERVICE_ID`，第 2/8 行 import 与使用），行为等价、断言语义不变，属于测试侧清理。

f001~f004 复核结论维持「已消除」：均无回归，锚点行为（hook 复用 `--probe` 三态、入口非零退出、exit code 契约文档化、import 位置）与 Round 2 验收时一致。未发现新问题。

本轮验证：`npx tsc --noEmit` exit 0；`npx vitest run tests/unit/bridge_config_health.test.ts tests/unit/bridge_main_health_probe.test.ts tests/unit/agent_bridge_server.test.ts`：3 files / 105 tests passed。

本轮新发现：0 条。总体判断：无未解决 critical/important，代码侧无变化且测试全绿，本轮 PASS。

reviewed_scope: fe2485c5c76fad3d

verdict: PASS
