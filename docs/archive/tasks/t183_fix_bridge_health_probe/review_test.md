# Task review t183（reviewer_focus: 测试）

- task：`t183_fix_bridge_health_probe`
- spec：`docs/tasks/t183_fix_bridge_health_probe/spec.md`
- diff_anchor：`c274da4d06ad162bdec1cd9acc9e0f45fa8f549e`
- target：`git diff c274da4d06ad162bdec1cd9acc9e0f45fa8f549e`
- round：1
- reviewed_at：2026-08-13 22:32 UTC+8

## Findings

### t183_test_f001 - AC-004 SessionStart hook 未复用探测逻辑，测试只覆盖机制不覆盖 hook

- 严重度：important
- 锚点：AC-004（SessionStart hook 复用同一探测逻辑，避免 shell 逻辑漂移）
- 位置：`.claude/settings.json:33`（tracked，diff 未改）；测试侧 `tests/unit/bridge_main_health_probe.test.ts:53-66`
- 问题：AC-004 的对象是 SessionStart hook，但 diff 未触碰 `.claude/settings.json`。hook 命令仍为 `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:17831/health 2>/dev/null | grep -q 200 && exit 0 ...`——正是本 task 要消除的「HTTP 200 即健康」独立 shell 判定：任意 200 服务占用 17831 时 hook 仍会跳过启动，探测逻辑漂移原样保留。新增测试 `run_bridge_probe` 三态行为 + main.ts 源码接线断言（`readFileSync` + 正则验证 `--probe` 分支调用 `run_bridge_probe`）只证明「入口存在且 main 内接线正确」，未证明「hook 复用该入口」。测试全绿（本 reviewer 重跑 1796 全过）而 AC-004 的可观测行为未达成——测试存在但验证的是机制而非 AC 的验收对象。
- 建议：实现侧把 hook 改为 `node "$root/artifacts/bridge/bridge.mjs" --probe http://127.0.0.1:17831` 判返回码（occupied 退出 2 不启动）；测试侧加一条断言 hook 配置引用 `--probe` 的用例（与现有源码接线测试同风格，读 `.claude/settings.json` 断言含 `--probe` 且不含 `grep -q 200`）。

### t183_test_f002 - AC-003「非零退出」未直接断言

- 严重度：minor
- 锚点：AC-003
- 位置：`tests/unit/bridge_main_health_probe.test.ts:38-40`
- 问题：occupied 用例只断言 `rejects.toThrow(/non-capture-all/)`，覆盖「明确错误、非 already listening」；「非零退出」由入口 glue（`src/bridge/main.ts` 底部 is_main 块 `process.exit(1)`）承担，无任何测试。`--probe` 的退出码映射（0/2/3）有源码文本断言，但 main 启动路径的退出码无覆盖。退出码属 AC-003 明确列出的可观察行为。
- 建议：可 spawn 子进程跑构建产物断言 exit code；或接受入口 glue 过薄在 task.md 处置表注明该路径未测（此时不算遗留 bug，仅记录覆盖边界）。

### t183_test_f003 - server 真实响应与 probe 识别字段跨文件一致性无集成测试

- 严重度：minor
- 锚点：AC-001/AC-002 联动的识别契约（spec 风险段：版本号变更导致探测误判，识别字段为 service 名）
- 位置：`src/bridge/config.ts:180`（`BRIDGE_SERVICE_ID` 常量）与 `src/bridge/server.ts:264`（硬编码 `'capture-all-bridge'`）分处两文件；`tests/unit/bridge_config_health.test.ts:5-21` 的 `self_response` mock 独立硬编码同一字符串
- 问题：config 测试的 fetch mock 与 server 真实响应各自独立硬编码标识字符串，无一条测试把「真实 create_bridge_server 的 /health 响应」喂给 `probe_bridge_health` 断言 healthy。若 config 的 `BRIDGE_SERVICE_ID` 或 server 的 service 字符串之一被改名，config 测试（mock 独立）与 server 测试（锚定字面量）仍各自全绿，身份漂移不被任何测试发现，生产启动判定随即误判。
- 建议：加一条集成断言——起真实 server（复用 `agent_bridge_server.test.ts` 的 `start_test_server` 模式），fetch 其 `/health` 响应直接喂 `probe_bridge_health`/`is_bridge_healthy`，断言 healthy。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：本轮为 Round 1，不适用。
- 改测方向复核：两处既有测试修改均为规格语义变更驱动，非迁就实现——① `agent_bridge_server.test.ts:183-189` `toEqual({ ok: true })` → `toMatchObject({ ok: true, service, bridge_version })`：AC-001 新增响应字段后旧断言必然失败，新断言锚定 AC-001 契约字段，合法；② `bridge_config_health.test.ts` 旧用例「`{ok:true}` → true」在 AC-002 语义下该响应属「非本服务」，改名并换 self mock，另新增 foreign → false 用例，合法。`toMatchObject` 属「有正当理由」的弱化（契约从 `{ok:true}` 扩为含标识字段，AC 不要求精确形状），不按危险模式处理。
- 本轮新发现：3 条（f001 important、f002 minor、f003 minor）。
- 未进表的提示：
  - `agent_bridge_server.test.ts:187` `bridge_version: expect.any(String)` 不验非空（生产 probe 要求 `length > 0`），可加 case。
  - `bridge_main_health_probe.test.ts:31-36` healthy 用例标题「不启动新 server」未断言 server 未创建，仅断言 stdout 消息。
  - config 测试未覆盖 content-type 缺失、`json()` 返回 `null`、service 名正确但 `ok:false` 等 probe 分支，均可加 case（非阻断）。
  - main.ts 源码接线断言（`readFileSync` + 正则）较脆弱，main.ts 结构重构即红；当前正则已转义 `\?` 且真实匹配（已重跑验证），验证对象真实，接受。
  - 危险模式逐条扫描无命中：无恒真断言、无删/反转 expect、无注释掉断言、无 `.skip`/`.only`、无 `eslint-disable`/`@ts-ignore`、无阈值掩盖、无条件跳过、无存在即通过；fetch mock 位于系统边界（HTTP 边界），未 mock 被测逻辑自身。
- 总体判断：测试可信度与 AC-001/002/003/005 覆盖合格且全绿，但 AC-004 的验收对象（SessionStart hook）未复用探测逻辑且无测试覆盖，f001 未解决即 FAIL。
- 系统性 follow-up：无（f001 属本 task 范围修复项，非跨 task 基础设施缺口；已用 `scripts/repo_template/task.py list` 只读核对，无等价 task）。

### AC 复验方式

- AC-001：`re_verified`——重跑 `agent_bridge_server.test.ts` 通过；真实 server 断言 200 + service/bridge_version 字段；`src/bridge/server.ts:264` 代码查证响应体。
- AC-002：`re_verified`——重跑 `bridge_config_health.test.ts` 通过；foreign 2xx → false、非 JSON 2xx → false 两用例断言即 AC 语义，触达真实 `probe_bridge_health`。
- AC-003：`re_verified`（部分）——occupied 用例 `rejects.toThrow(/non-capture-all/)` 重跑通过；「非零退出」仅代码查证入口 glue `process.exit(1)`，未跑子进程断言（见 f002）。
- AC-004：`re_verified`（测试动作）/ AC 未达成——`run_bridge_probe` 三态与 main 接线断言重跑通过；但 hook（`.claude/settings.json:33`）实测仍用 `curl | grep -q 200` 独立判定，未复用 `--probe`，AC 可观测行为未满足（见 f001）。
- AC-005：`re_verified`——新增 config/main 测试全量重跑通过（`npx vitest run tests/unit` 188 文件 1796 测试全绿）。
- coverage = 5 / 5（AC-004 行注明未达成，见 f001）

reviewed_scope: ef650bb92fa61641

verdict: FAIL

## Round 2 复核 (2026-08-13 22:37 UTC+8)

### 前轮 finding 复核（以 diff 与重跑为准）

- f001（important，AC-004）：**已消除**。实现侧 `.claude/settings.json:33` hook 改为 `node "$root/artifacts/bridge/bridge.mjs" --probe http://127.0.0.1:17831`，按 `$probe` 三态判定（healthy→exit 0；occupied→stderr 提示且不启动；其他→启动），旧的 `curl | grep -q 200` 独立判定已移除；测试侧 `bridge_main_health_probe.test.ts:57-67` 新增文本断言（SessionStart 段含 `--probe`/`$probe`/`healthy`/`occupied`、不含 `grep -q 200`），验证对象真实（tracked hook 命令）。AC-004 可观测行为达成，测试重跑通过。
- f002（minor，AC-003）：**已消除**。`bridge_main_health_probe.test.ts:40-46` occupied 用例补入口 glue 源码断言 `expect(main_src).toMatch(/process\.exit\(1\)/)`（仅精确命中 is_main 块 `process.exit(1)`，不误配 --probe 分支的 `process.exit(status === ...)`），非零退出路径获覆盖，重跑通过。
- f003（minor）：**已消除**。`src/bridge/config.ts` 导出 `BRIDGE_SERVICE_ID` 单一来源，`src/bridge/server.ts:264` 改引用常量；`bridge_main_health_probe.test.ts:69-76` 新增同源断言（server.ts 源码含 `service: BRIDGE_SERVICE_ID` + 常量值 `toBe('capture-all-bridge')`），叠加 `agent_bridge_server.test.ts` 真实响应行为断言，防漂移双向兜底。以「同源断言 + 值断言」形式替代原建议的集成测试，防漂移目标等价达成，无弱化。

### 本轮新发现

- 0 条。新测试均无危险模式命中（无恒真/弱化/skip/only/ts-ignore/条件跳过）；`split('"SessionStart"')[1]` 缺失时 `toMatch` 抛错会红，真实验证非恒真。

### 未进表提示

- `bridge_config_health.test.ts:9` 的 `self_response` mock 仍硬编码 `'capture-all-bridge'` 字面量，未用 `BRIDGE_SERVICE_ID` 常量；常量值变更时该文件自身仍绿，但已被常量值断言与 server 行为断言兜底捕获，仅整洁度问题，不阻断。

### 验证动作

- `npx vitest run tests/unit/bridge_main_health_probe.test.ts tests/unit/bridge_config_health.test.ts tests/unit/agent_bridge_server.test.ts`：3 文件 105 用例全绿。
- `npx tsc --noEmit`：exit 0。

reviewed_scope: 6a9b6cf66f209efc

verdict: PASS

## Round 3 复核 (2026-08-13 22:39 UTC+8)

### 前轮未进表提示复核

- 常量同源修正：**已消除**。`bridge_config_health.test.ts:2` import `BRIDGE_SERVICE_ID`，`:9` `self_response` 改用 `service: BRIDGE_SERVICE_ID`，与 `bridge_main_health_probe.test.ts` 一致，`capture-all-bridge` 字面量不再散落于测试 mock；config 测试 mock 与生产探针共享同一事实来源。

### 本轮新发现

- 0 条。

### 验证动作

- `npx vitest run tests/unit/bridge_config_health.test.ts`：11 用例全绿。
- `npx tsc --noEmit`：exit 0。

reviewed_scope: fe2485c5c76fad3d

verdict: PASS
