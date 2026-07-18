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

# T0011 Review (Round 2)

## 裁决一：规格合规

### Round 1 blocker 复核

- Artifact smoke 条件返回、实际 build、Bridge/MCP/zip 产物检查：已修复。
- v1/v2/v3 fixture、真实升级、旧数据保留：核心路径已修复。
- Store 集合/数量、deprecated alias 精确断言：已修复。
- AC-3/AC-4 行为证据表述、宽泛 Vite 断言：已修复。
- Scanner 整文件 allowlist：已收窄，但仍存在真实 secret 绕过。

### 验收标准覆盖

- AC-1：reviewer 范围内通过；基础 Playwright 留 evaluator。
- AC-2：部分通过。升级与 records 保留已验证，但 fixture 声明的逐 store `key_path`/`indexes` 未在升级后完整比对。
- AC-3：通过 reviewer 证据要求。
- AC-4：reviewer 范围内通过；浏览器级 XSS 留 evaluator。
- AC-5：失败。Scanner 新增启发式和 exemption 仍可放过真实 credential。

### 不变量检查

- INV-1、INV-3、INV-4、INV-5：守住。
- INV-2：版本、store 集合和数据保留已锁定；完整 schema 矩阵证据仍不足。

## 裁决二：测试可信

### 已修复

- 无条件返回、skip、零断言 artifact smoke。
- 真实旧版本 DB 升级与 records 查询。
- 精确 store 集合/数量及 alias 引用一致。
- Scanner 临时 Git repo + CLI 行为测试及同文件否证。

### 剩余阻断

1. `has_credential_assignment()` 对任意 source 行包含 `line_pattern: /` 时全局返回 false，可通过注释绕过真实 secret。
2. `is_embedded_regex_match` 仅凭 credential 前后出现 `/` 判定 regex，可让普通 assignment 逃逸。
3. 任意含 `${...}` 的模板字符串都判安全，硬编码 secret 前缀加插值可逃逸。
4. 部分 exemption 未完整锚定行尾；scanner 自测 exemption 只匹配 `API_KEY=`/`api_key: 'sk-` 前缀，可豁免真实值。
5. v1/v2/v3 fixture 的 `key_path`/`indexes` 字段未被测试消费，多个 store schema 漂移仍可能假绿。

## 问题清单

| 问题 | 暂存 | 说明 |
|---|---|---|
| Scanner 存在全局和模式级 secret bypass | 否 | 删除内容短路与 slash 启发式；模板只允许纯安全动态值；exemption 必须完整行匹配；新增四类绕过否证。 |
| IndexedDB 完整 keyPath/index 矩阵未执行 | 否 | 升级后逐 store 查询 `keyPath`/`indexNames`，与冻结 v3 schema matrix 精确比较。 |

第 2 轮仍有范围内 blocker。按 heavy review 上限转 `blocked_by=quality`。

verdict: FAIL

# T0011 Review (Round 3)

## 裁决一：规格合规

### Round 2 blocker 复核

- `line_pattern` 全局短路、slash 启发式、宽泛正则 exemption：已删除。
- Exemption 改为 `path + label + exact line SHA-256`：原行尾追加绕过已关闭。
- v1/v2/v3 升级后逐 store 查询 `keyPath`/`indexNames`：已增加，但 legacy store 的生产建库 schema 仍未被独立验证。
- 模板字符串 secret bypass：未关闭；新规则仍允许短静态 secret 与 placeholder 前缀绕过。

### 不变量检查

- INV-1、INV-3、INV-4、INV-5：守住；未修改产品实现。
- INV-2：未被测试完整冻结。`DB_VERSION` 期望直接引用生产常量，生产版本改为 v4 时测试仍通过；4 个 legacy store schema 由 fixture 预建后与 fixture 自比，生产建库定义漂移可逃逸。

## 裁决二：测试可信

### 已修复

- 原 4 个 scanner 绕过样例均形成真实 CLI/临时 Git repo 否证。
- v1/v2/v3 records 保留继续逐 store 深比较。
- 现行 10 个非 legacy store 可由 v1 升级路径验证生产创建结果。

### 剩余阻断

1. `is_safe_dynamic_template()` 将静态片段不超过 8 字符、未命中特定品牌前缀的模板判安全。``const API_KEY = `hunter2${runtime_id}`;``、``API_KEY = `AKIA${suffix}``` 均可错误通过。
2. `placeholder_value_pattern` 仅匹配值前缀。`${RUNTIME_ID}hunter2`、`${RUNTIME_ID:-hunter2}`、`process.env.API_KEY || "hunter2"` 可错误通过。
3. DB v3 未用冻结字面契约断言；将生产 `DB_VERSION` 从 3 改为 4，baseline tests 仍全绿。
4. `sessions`、`events`、`console_logs`、`error_log` 在所有 fixture 中预建。升级测试比较的是 fixture 创建 schema 与 v3 fixture；空库测试只精确检查 5 个代表 store，因此 4 个 legacy store 的生产 `keyPath`/index 漂移仍可逃逸。
5. Artifact smoke 只读取 ignored `artifacts/`，不生成或验证产物新鲜度。干净 checkout 直接 `npm test` 会失败；保留陈旧产物时，删除 Bridge 源码或破坏 build script 仍可通过该 smoke。

## 验证摘要

- focused Vitest：PASS，20 tests。
- full Vitest：PASS，92 files / 1099 tests。
- tracked-tree scanner：PASS，409 files。
- build：PASS，Extension、Bridge、MCP、zip 均生成。
- mutation/反例：短静态模板 secret、placeholder/default secret、DB v4、legacy schema 漂移、陈旧 artifact 均可复现假绿。

## 问题清单

| 问题 | 暂存 | 说明 |
|---|---|---|
| Scanner 仍有模板与 placeholder secret bypass | 否 | 动态值必须完整解析为纯表达式；不得按静态片段长度或值前缀判安全。补短 secret、默认值、拼接值否证。 |
| DB v3 未冻结 | 否 | 使用独立冻结常量/fixture 版本断言 `3`，不得把生产 `DB_VERSION` 同时当 expected。 |
| Legacy schema 未由生产空库路径完整验证 | 否 | 空库经 `init_db()` 后，与独立冻结 schema 对全部 14 store 精确比较。 |
| Artifact smoke 可读取陈旧产物 | 否 | 明确 build 前置并在隔离输出目录验证当前构建，或将 smoke 绑定到实际 build 命令；禁止依赖工作区残留。 |

第 3 轮仍 FAIL。用户授权的额外 review 轮已用尽；恢复 `blocked_by=quality`，不得进入 evaluator、merge gate 或 T0012。

verdict: FAIL
