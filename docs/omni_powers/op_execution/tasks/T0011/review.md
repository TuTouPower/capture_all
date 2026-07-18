# T0011 Review (Round 1)

## 裁决一：规格合规

### 验收标准覆盖

- **AC-1**：部分覆盖。manifest 入口与 build 脚本契约已固化，但 artifact smoke 在产物不存在时直接 `return`，会无证据假绿；本轮也未执行实际 build。
- **AC-2**：部分覆盖。已验证新建 v3 DB schema、现行/legacy store、keyPath/index，但未覆盖 spec 明确要求的 v1/v2/v3 fixture 升级与旧数据保留。
- **AC-3**：已有 Bridge 行为测试被全量 Vitest 执行，矩阵可作为索引；本 task diff 未新增相关行为证据。需在报告中准确引用实际测试结果，不能把矩阵描述本身当断言。
- **AC-4**：已有 export/escape 行为测试被全量 Vitest 执行，矩阵可作为索引；浏览器级 XSS 仍需 evaluator 验收。
- **AC-5**：部分覆盖。真实 secret 负例对普通文件有效，但当前整文件 allowlist 让 allowlisted 文件完全跳过扫描，文件后续混入真实 secret 也会逃逸。

### 偏航检查

- 实际工作集符合 `scripts/scan_tracked_tree.mjs`、结构层测试、fixture、report 白名单。
- 未触碰产品实现、spec、e2e、blueprint。

### 不变量检查

- INV-1：守住，未修改产品实现。
- INV-2：DB 版本与 store 集合未改；升级数据保留证据不足。
- INV-3：未修改 token fallback 实现；已有 config tests 全量通过。
- INV-4：未修改 Bridge 权限实现；已有 server tests 全量通过。
- INV-5：路径配置未改；实际产物 smoke 证据不足。

## 裁决二：测试可信

### 测试质量

- Scanner tests 通过真实子进程和临时 Git repo 验证 exit code，行为证据可信。
- IndexedDB tests 使用 fake IndexedDB 查询真实 schema，但只覆盖新建 v3。
- AC-1 多数断言读取配置/源码字符串；允许作为入口契约补充，不能替代实际 build/artifact smoke。
- AC-3/AC-4 可复用已有行为测试；`contract_matrix.json` 只算机器可读索引，不算独立行为证据。

### 危险模式扫描

1. `tests/baseline_smoke.test.ts` 产物不存在时条件 `return`，零断言通过。核心证据假绿，必须修复。
2. store 总数使用 `toBeGreaterThanOrEqual(14)`，未锁定冻结基线。
3. `get_session` 仅 `toBeDefined()`，未验证别名引用一致。
4. Scanner 整文件 allowlist 形成真实 secret 盲区。
5. 测试文件自身进入整文件 allowlist，进一步放大盲区。
6. 未发现 `.skip`、`.only`、删除既有断言或 timeout 放宽。

## 问题清单

| 问题 | 暂存 | 说明 |
|---|---|---|
| Artifact smoke 条件返回假绿 | 否 | 产物不存在必须失败；实际运行 build 并验证 `artifacts/dist`、Bridge、MCP、zip 入口。 |
| 缺少 v1/v2/v3 IndexedDB fixture 升级与旧数据保留 | 否 | 需从旧版本 fixture 打开至 v3，验证旧记录、legacy store、现行 schema。 |
| Store 数量断言过宽 | 否 | 冻结基线应使用精确集合/数量断言。 |
| `get_session` 别名断言过弱 | 否 | 验证与 `get_capture` 引用相等。 |
| 整文件 allowlist 导致真实 secret 逃逸 | 否 | 改为精确 finding exemption（文件 + finding 类型/行内容模式），仍扫描文件其他内容；加 allowlisted 文件混入真实 secret 的否证测试。 |
| AC-3/AC-4 证据表述不准确 | 否 | 复用已有行为测试可接受；报告应引用实际全量 Vitest 结果及相关测试文件，不能把 matrix 描述当测试。无需为“证明测试存在”新增源码字符串测试。 |
| `vite.config.ts` 的 `toContain('crx')` 过宽 | 否 | 精确验证插件 import/call，或由实际 build 结果承担主要证据。 |
| AC-1 源码快照断言占比高 | 【暂存:后续收敛】 | 软约束。实际 build/artifact smoke 补齐后不单独阻塞。 |
| Matrix verification 为人工描述 | 【暂存:架构决策】 | 本 task 可保留为索引；后续若成为 gate，应改为机器生成。 |

verdict: FAIL
