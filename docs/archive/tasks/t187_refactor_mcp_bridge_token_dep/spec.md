# Task spec

## 背景

MCP 的 `token_resolver.ts` 从 `../bridge/config` 导入 token 文件类型、默认路径与读取逻辑，违反架构依赖方向（`mcp ──✗── bridge`，运行时只走 HTTP）。`bridge/config.ts` 同时包含 Bridge CLI 解析、token 文件契约、token 生成/持久化、Bridge token resolution 与健康检查。MCP 为复用只读 token 文件逻辑被迫依赖拥有 Bridge 启动职责的模块。

## 契约区

### 范围

- 将 Node 专用 token 文件类型、默认路径与读取逻辑移到中立模块（如 `src/shared/node_bridge_token_file.ts`）。
- Bridge config 与 MCP resolver 同向依赖该中立模块。
- Bridge 专属 CLI、token 生成/持久化、health probe 留在 `src/bridge/config.ts`。
- 增加 import-boundary 测试/脚本，拒绝 `src/{extension,bridge,mcp}` 互相导入。

### 非范围

- 不改变 token 文件格式与读取行为。
- 不改变 MCP/Bridge 运行时通信（仍走 HTTP）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->
只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。
<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->
每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。
<!-- /规范 -->

- [ ] AC-001：MCP 不再从 `src/bridge` 导入任何符号，token 文件逻辑经中立模块获得。
- [ ] AC-002：Bridge config 与 MCP resolver 均依赖中立模块，token 文件格式/读取行为不变。
- [ ] AC-003：新增 import-boundary 测试拒绝 `src/{extension,bridge,mcp}` 之间互相导入。
- [ ] AC-004：既有 MCP token fallback 与 Bridge config 测试通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->
逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。
<!-- /规范 -->

- 全部 AC 可自动测试：import 图静态检查 + 既有单测。

## 上下文区

- 来源：ARCH-002（2026-08-13 核实，`d8970e7` T091 引入，`8fa73b7` 扩充失败原因类型）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->
已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。
<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->
mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。
<!-- /规范 -->

- import-boundary 测试/脚本扫描跨产品导入；既有单测保证行为不变。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->
尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。
<!-- /规范 -->

- `src/shared` 是否允许 Node API：结论=不允许。`src/shared` 被 extension 浏览器 bundle 引用（Vite 打包），含 `node:` import 会破坏 MV3 构建；且架构依赖表规定 shared 中立。中立 token 文件模块建 `src/node_shared/bridge_token_file.ts`（Node-only，2026-08-13 按 architecture.md 依赖表与 extension 打包路径核实）。

### 风险与回退

- 风险：把 Node API 放入 shared 污染浏览器 bundle。
- 回退：若 shared 不宜含 Node API，建独立 `src/node_shared/` 层并在 blueprint 记录，仍禁止产品横向依赖。

### 依赖与约束

- 遵循 `docs/blueprint/architecture.md:145-155` 依赖表。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：记录中立模块或 `node_shared` 层依赖决策。
