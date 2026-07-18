# Leader Checkpoint

## 断点

### current_task

T0011

### last_completed

T0010

### next_step

T0011 in_progress：用户于 2026-07-18 再次明确授权第 4 轮。范围固定为 scanner 完整值判定、独立 DB v3/14-store 契约、当前源码新鲜 build smoke；通过独立 review 前不得进入 evaluator、merge gate 或 T0012。

## 本批次（2026-07-18 intake）

主题：**按运行产品分区完成整仓目录改造，并在纯迁移总门后深化 modules**

### 基线

- Vitest: 90 files / 1079 tests 全绿
- 基础 Extension E2E: 1 passed
- Build: Extension、Bridge、MCP、zip 全部成功
- 固化对象: manifest 入口、IndexedDB v3 schema、Bridge route/auth 矩阵、token 四级 fallback、导出/XSS
- tracked-tree scanner 当前 22 findings 已分类；T0011 以精确规则治理，禁止目录级放行

### 任务拓扑

| 范围 | 内容 | gate |
|---|---|---|
| T0011 | 行为与产物基线 | 新批次起点 |
| T0012–T0020 | workspace + 三 packages/三产品纯迁移 | T0020 轨 A 总门 |
| T0021–T0030 | package 规范化、Extension/Bridge/MCP deep modules | 轨 B |
| T0031 | 测试树重组 | unit/integration/e2e 非零发现 |
| T0032 | 活动文档/CI/扫描/旧树收口 | 最终全矩阵 |

### 已确认决策

1. 目标结构采用 `apps/extension`、`apps/bridge`、`apps/mcp`、`packages/*`、分层 `tests/`、集中 `tooling/`
2. 允许破坏性源码路径升级，但不丢 IndexedDB 历史数据、不削弱 Bridge 安全
3. `artifacts/dist` 保持
4. Bridge token 保持 `CLI > env > persisted file > generated`，生成文件 mode `0600`
5. MCP token 对 Extension 数据路由 bootstrap 兼容保留；instance token 不得访问 MCP/CDP
6. 纯迁移与 interface 深化不交错；T0020 未通过不得启动 T0021
7. 当前 `.claude/settings.json` 用户修改保留，不纳入本批次 task workset
