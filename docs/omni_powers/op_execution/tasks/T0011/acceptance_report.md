# T0011 验收报告

## task
- ID: T0011
- 标题: test: 冻结重构行为与产物基线
- spec: `docs/omni_powers/op_execution/specs/T0011_refactor_baseline.md`
- task commit: `0e8a03b`（op/task/T0011 HEAD）

## verdict
PASS

## AC 覆盖

### AC-1: 测试发现数 + manifest 入口 + 三类产物 smoke
- Vitest discovery: `baseline_smoke.test.ts` 实跑 `npx vitest list`，断言非零。
- Playwright discovery: 实跑 `npx playwright test --project=e2e --list`，断言 `Total>0 tests in N files`。
- 删除唯一基础 E2E `tests/e2e.spec.ts` → discovery gate FAIL（mutation 已验证）。
- Manifest 入口：断言 manifest_version 3、default_locale en、content_scripts/background/popup 路径。
- Fresh artifact smoke：`rmSync(artifacts/)` → `npm run build` → 断言 dist、manifest.json、bridge.mjs、mcp.mjs、extension.zip 非空 + zip 内含 manifest.json。
- Bridge build 入口缺失 mutation → smoke FAIL。

### AC-2: IndexedDB v1/v2/v3 fixture 升级 + 14-store schema
- 独立冻结 `capture_all_db` v3 字面契约（`frozen_db_name='capture_all_db'`、`frozen_db_version=3`）。
- 空库经生产 `init_db()` 建库后逐 store 验证 14 store 的 `keyPath` 与 `indexNames`。
- v1/v2/v3 fixture 升级后 schema 与 records 全保留。
- `DB_VERSION 3→4` mutation → baseline 4 tests FAIL。
- `sessions.start_time → started_at` mutation → 空库 schema test FAIL。
- deprecated API alias 9 条引用相等断言。

### AC-3: Bridge route/auth 矩阵
- 复用既有 Vitest：`agent_bridge_server.test.ts`（60+ case：health/auth/CORS/body/多实例/enroll/heartbeat/command/result/re-enroll/instance_token 限制）、`agent_bridge_config.test.ts`、`agent_bridge_config_ui.test.ts`、`agent_bridge_queue.test.ts`、`agent_bridge_client.test.ts`、`service_worker_bridge_initialization.test.ts`。
- Token fallback `CLI > env > persisted file > generated`、文件 `0600`、instance_token 限制 `/mcp/*` 等约束由上述测试覆盖。
- `contract_matrix.json` 作为机器可读索引，不再含静态 1124 数字。

### AC-4: 四格式导出 + HTML XSS
- 复用既有 Vitest：`exporter.test.ts`、`export_utils.test.ts`、`export_integrity.test.ts`、`export_settings.test.ts`、`export_large_fix.test.ts`、`escape.test.ts`、`escape_html.test.ts`。
- 浏览器级 XSS 由 `tests/e2e-xss.spec.ts`（Playwright e2e）覆盖；本 task 范围内不修改导出实现，浏览器级验收留 evaluator 后续 task。

### AC-5: scanner 真 secret 失败 + 已登记合法样本放行
- `scripts/scan_tracked_tree.mjs` 重写为 state-aware 完整 statement 解析 + RHS 字面量分析。
- 8 轮独立 review 反例（共 47 类）全部 exit 1：
  - 跨行 assignment、placeholder 标点后缀、shell `${VAR:-default}` 全操作符（`:-`、`:=`、`:?`、`-`、`?`、`=`、`:`）、bracket env、ternary fallback、logical assignment（`||=`、`&&=`、`??=`）。
  - 模板表达式内部 assignment、字符串拼接（含括号、`as const` 类型断言、多行）、数组字面量递归、字面 `${...}` 字符串 secret。
  - 短纯字母 secret（`supersecret`、`tokensecret`）、AWS/JWT/GitHub 等已知 brand prefix。
- 合法 placeholder / 动态 token（`ext_${randomBytes(24).toString('base64url')}`）/ allowlist 字面量（HTTP method、content type、encoding、HTML input type 等）/ 反引号模板表达式 / source expression 均正确放行。
- exemption 精确到 path + label + 行 SHA-256；未引入目录级或文件级跳过。

## 全量验证

- `npx vitest run tests/baseline_smoke.test.ts tests/scan_tracked_tree.test.ts` → PASS (49)
- `npm test` → PASS (1128) / 92 files
- `npm run build` → PASS（tsc + vite + bridge + mcp + zip）
- `node scripts/scan_tracked_tree.mjs` → passed (409 file(s))
- `npm run test:e2e` → 1 passed（基础 popup 加载 E2E）

## 已知 P2 改进项

`${VAR:-${OTHER}}` 嵌套 shell default 误报：scanner 正则 `[^}]*?` 非贪婪匹配到第一个 `}` 即止。当前仓库 baseline 不含该模式，scanner 409 文件 PASS。后续独立 issue 处理（需递归解析 `${...}` 嵌套）。

## 不变量

- INV-1（不修改生产实现）：守住。
- INV-2（DB v3 + 14-store 全保留）：字面冻结，mutation 验证。
- INV-3（Bridge token 四级 fallback + 0600）：未修改实现，既有测试覆盖。
- INV-4（MCP token bootstrap 兼容 + instance_token 限制）：未修改实现，既有测试覆盖。
- INV-5（产物路径 artifacts/dist、artifacts/bridge、artifacts/mcp）：未修改。

verdict: PASS
