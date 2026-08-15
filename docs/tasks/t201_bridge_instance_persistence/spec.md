# Task spec

## 背景

Bridge 的实例 registry 全在内存(`instances_file` 未配置时 `persist()/load_persisted()` 直接 return)。bridge 进程重启 → 已注册实例、label、origin 绑定全部丢失 → 零配置浏览器(依赖 pairing/token 恢复)无法重新 enroll,陷入 401 死循环,只有配了 `agent_bridge_token` 的实例能回来。实测:bridge 重启后 `list_browsers` 从 2 个实例掉到 1 个(fce16433 零配置实例消失)。`registry.ts` 的持久化代码已完整实现(t169 注释明确"重启恢复绑定实例"),只缺接入启动 env。

## 契约区

### 范围

- 给 bridge 各启动路径接入 `CAPTURE_ALL_INSTANCES_FILE`,使实例 registry 落盘、重启后恢复。
- 启动路径:manual(`node artifacts/bridge/bridge.mjs`)、`npm run bridge`、SessionStart hook、systemd unit(`docs/guides/deployment.md`)。
- 持久化验证:registry `persist()` 写盘、`load_persisted()` 启动恢复、token_hash 非明文、文件权限 0600。
- 文档更新:`docs/guides/mcp_usage.md`、`docs/guides/deployment.md` 补充实例文件配置。

### 非范围

- 不改 pairing 状态持久化(`pairing_state` 保持内存态;零配置实例恢复靠 registry 里有它走 existing 分支,不依赖 pairing)。
- 不改 enroll 认证模型(首次 enroll 仍要求 mcp token 或 pairing code)。
- 不实现实例文件轮转/清理(超出本 task)。
- 不处理"已配 token 但实例文件指向其他机器"等跨环境场景。

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

- [ ] AC-001:设置 `CAPTURE_ALL_INSTANCES_FILE=<path>` 启动 bridge,首次 enroll 两个实例后 kill 进程重启;`list_browsers` 能列出重启前已注册的两个实例(含零配置实例),且实例 label 保留。[deploy]
- [ ] AC-002:同一实例重启后,heartbeat 带原 instance_id 命中 registry existing 分支(origin 绑定匹配),不再 401,无需重新 pairing/token。
- [ ] AC-003:实例文件以 JSON 写入,含 `token_hash` 而非明文 token,文件权限 0600。
- [ ] AC-004:实例文件损坏或缺失时,`load_persisted()` 从空开始,不影响 bridge 启动(不崩溃、可正常 enroll 新实例)。
- [ ] AC-005:`npm run bridge` 与 manual 启动方式在设置 `CAPTURE_ALL_INSTANCES_FILE` 后行为一致(均可持久化并恢复)。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001:可自动测试——registry `persist()` 写文件、`load_persisted()` 恢复,验证两个实例含零配置场景的 label/绑定。
- AC-002:可自动测试——写入含 origin 绑定的实例文件,load 后 heartbeat 命中 existing 分支不 401。
- AC-003:可自动测试——persist 产物校验含 token_hash 非明文 + 文件 mode 0600。
- AC-004:可自动测试——损坏 JSON / 缺失文件下 load_persisted 不抛错。
- AC-005:可自动测试——`npm run bridge` 与 manual 共用同一 config 解析路径,单测覆盖 config 读取 env。

## 上下文区

- 来源:p052(2026-08-16 核实;bridge 重启丢实例,零配置浏览器无法恢复)

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- systemd unit 与 SessionStart hook 的进程级恢复:`node` 进程由外部拉起,单测不覆盖;AC-001 标 `[deploy]` 由人工验证。
- pairing 状态跨重启:非本 task 范围,不测。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 用临时目录作 `instances_file` 测试 persist/load;断言文件内容含实例字段、权限 0600、token 为 hash。
- 覆盖损坏文件、缺失文件、正常恢复三条路径。
- 复用现有 `bridge_registry_refactor.test.ts` 的 registry 构造方式。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险:实例文件含实例元数据,若落在非加密盘有信息泄露面(含 instance_id、token_hash、扩展 ID)。回退:文件 mode 0600 已限制;删除文件即回到内存态(等价现状)。
- 风险:load 恢复的实例 seen_at 是旧时间戳,可能立即被判离线(sweep)。回退:load 时可将 seen_at 重置为启动时刻,或依赖心跳续活;需实现侧确认。

### 依赖与约束

- registry `persist()/load_persisted()` 已实现(registry.ts),本 task 不重构。
- `config.ts` 已读 `CAPTURE_ALL_INSTANCES_FILE` env(72 行),`server.ts:429` 已把 `config.instances_file` 传给 registry。
- 启动路径需在 manual/hook/systemd 处补 env 注入,属接入而非改 bridge 核心。

### Finalization 时更新的 blueprint

- `docs/guides/mcp_usage.md`:补充 `CAPTURE_ALL_INSTANCES_FILE` 配置示例
- `docs/guides/deployment.md`:systemd unit 增加 Environment 实例文件路径
