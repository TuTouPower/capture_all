# 决策记录（ADR）

只记录已经确认、影响后续工作的非显然决策。追加新条目，不重写历史；决策被替代时，新条目通过"替代"字段引用旧编号。

条目格式：

```markdown
## NNN 标题（YYYY-MM-DD）

- 背景：为什么需要决策
- 选项：考虑过什么
- 结论：选了什么，为什么
- 替代：旧决策编号；无则写"无"
```

---

## 001 文档与工作流对齐 repo_template（2026-07-19）

- 背景：原使用 omni_powers heavy 工作流（merge gate / authorize / leader_checkpoint），活动入口分散在 `docs/omni_powers/**`，对齐 `repo_template` 后 agent 入口统一为 `AGENTS.md` + 四态 task 生命周期。
- 选项：A）保留 omni heavy 作为活动流程；B）切换为 template 四态 task 流程。
- 结论：选 B。omni_powers 整树归档到 `docs/archive/omni_powers/`；活动流程仅 `backlog` / `active` / `done` / `dropped` 四态。
- 替代：无

## 002 源码按三产品划分（2026-07-19）

- 背景：当前 `src/{background,content,popup,dashboard,devtools}` + `src/agent/{bridge,mcp,shared}` + `src/shared` 扁平堆叠，产品边界模糊。
- 选项：A）保留现状；B）按 monorepo `apps/*` + `packages/*`；C）在 `src/` 下按 `extension` / `bridge` / `mcp` 三产品划分 + 扁平 `src/shared`。
- 结论：选 C。明确扩展 / Bridge / MCP 三产品边界；跨产品共用放扁平 `src/shared/`（不强制再拆 `kernel/protocol/domain` 子层）；仅扩展专用进 `src/extension/shared/`。详见 `docs/refactor_plan.md`。
- 替代：无

## 003 shared 扁平化（2026-07-19）

- 背景：早期草案将 `src/shared` 拆为 `kernel/protocol/domain` 三个子包，且把现有 `src/shared/*` 笼统迁到 `src/extension/shared/`，过重且与实际依赖关系不符。
- 选项：A）三分 `kernel/protocol/domain`；B）扁平 `src/shared/` 仅按"是否扩展专用"做二分。
- 结论：选 B。规则：无 Chrome 扩展 surface 专属依赖、可被 bridge/mcp 或纯逻辑复用 → `src/shared/`；仅扩展会用 → `src/extension/shared/`。文件归属表见 `docs/refactor_plan.md` §4.3。
- 替代：无

## 004 源码搬家与测试 import 同 commit（2026-07-19）

- 背景：Phase 3 源码搬家若先迁源码、留下测试大面积红等 Phase 4 再修，中间窗口期无法验证。
- 选项：A）源码搬家与测试重组分离两 Phase；B）每个子 commit 内路径变更与受影响 `tests/**` 的 import 一起改完。
- 结论：选 B。Phase 3 各子 commit 必须 `npm test` 绿；Phase 4 只做测试目录分层。
- 替代：无

## 005 `_locales` 与 manifest 源码入 `src/extension/`（2026-07-19）

- 背景：MV3 打包时 `_locales/` 与 `manifest.json` 必须在扩展根。源码放仓库根还是 `src/extension/` 决定 vite/crx 配置形态。
- 选项：A）源码留根目录；B）源码迁 `src/extension/_locales/` 与 `src/extension/manifest.json`，构建时复制到 `artifacts/dist/`。
- 结论：选 B。避免"源码在 extension、清单却在根"双真相；构建产物路径不变（`artifacts/dist/_locales/`、`artifacts/dist/manifest.json`）。
- 替代：无

## 006 Bridge 仅绑定 127.0.0.1，token 优先级 CLI > env > persisted > generated（2026-07-19）

- 背景：本地 Agent 基础设施安全模型。
- 选项：A）允许配置外部地址；B）强制 `127.0.0.1`，token 多源降级。
- 结论：选 B。Bridge 仅绑定 `127.0.0.1`；token 优先级 `CLI > env > persisted file > generated`；生成文件 mode `0600`。instance_token 不得访问 MCP / CDP。详见 `op_blueprint/specs/agent_mcp.md`（已归档至 `docs/archive/omni_powers/op_blueprint/specs/agent_mcp.md`）。
- 替代：无

## 007 IndexedDB `capture_all_db` v3（2026-07-19）

- 背景：采集数据持久化 schema。
- 选项：A）schema 可自由变更；B）版本化升级，保留历史数据兼容。
- 结论：选 B。`DB_VERSION = 3`，10 stores；升级路径不得丢 records。详见 `op_blueprint/specs/storage_indexeddb.md`（已归档）。
- 替代：无

## 008 多实例路由：browser_label + instance_id（2026-07-19）

- 背景：原 `browser_no`（1-99 数字）路由让人填编号、不直观；机器 ID（instance_id）已存在但只作次要路由键。
- 选项：A）保留 browser_no；B）取消 browser_no，改用 browser_label（人填备注）+ instance_id（机器生成）双键路由。
- 结论：选 B。条件强制 label：单实例零配置（默认路由）；多实例时若存在匿名实例，Bridge 在响应里加 warning，AI 调用未 specify target 时返回 `TARGET_AMBIGUOUS`。同 label enroll 顶替旧实例（防堆积，扩展重启路径）。MCP 工具参数 `target_instance_id` + `target_label`；二者都给时 `target_instance_id` 优先。详见 T008。
- 替代：无

## 009 CDP 状态按 sessionId+requestId 复合键索引（2026-07-19）

- 背景：启用 `Target.setAutoAttach(flatten:true)` 后 CDP requestId 仅在 session 范围内唯一，跨主页面/iframe/worker 子目标可能重复，原按 requestId 索引的 Map 会互相覆盖。
- 选项：A）保持 requestId 单键；B）改为 `${sessionId ?? 'root'}:${requestId}` 复合键。
- 结论：选 B。所有 CDP 状态（cdp_request_meta/cdp_body_results/streaming_requests/finished_before_stream/ws_connections/orphan_timers）用复合键。CDP 命令 requestId 与输出 request_id 字段仍用原值。详见 T022。
- 替代：无

## 010 SW capture 状态机 + generation token（2026-07-19）

- 背景：SW 用模块内存 `is_capturing` 管状态，无串行化（并发 start/stop 可同时通过入口检查）、SW 重启丢状态、异步 listener 跨采集写入。
- 选项：A）保持现有模块变量；B）引入 capture_state 单例模块（5 阶段状态机 + run_exclusive 串行化 + generation token + 持久化恢复）。
- 结论：选 B。`capture_state.ts` 单例，phase=idle/starting/capturing/stopping/rolling_back。run_exclusive 用 pending_promise 链串行化。generation 每次 begin_start 递增，listener 入口捕获 + await 后校验。持久化 4 个键到 chrome.storage.local，SW 重启 cleanup 恢复/终止旧采集。详见 T028-T034 spike + 实施。
- 替代：无

## 011 write_events 每次立即 flush（放弃 batch 优化换 durability）（2026-07-19）

- 背景：MV3 SW 可在 buffer 未达 FLUSH_BATCH_SIZE 时被回收，调用方收到成功但数据未落 IndexedDB。
- 选项：A）保持批量 buffer 优化；B）每次 write_events 立即 await flush_store。
- 结论：选 B。性能代价（失去 batch 合并）换 durability，MV3 SW 回收窗口不再丢数据。flush 失败 batch 放回 buffer 头部重试。详见 T038。
- 替代：无

## 012 分页聚合替代固定 100000 截断（2026-07-19）

- 背景：exporter.ts 与 agent_data_queries.ts 每类数据固定 limit=100000 静默截断，大采集无提示丢数据。
- 选项：A）提高固定上限；B）分页循环读取至耗尽。
- 结论：选 B。PAGE_SIZE=5000，循环 offset 直至 batch.length < PAGE_SIZE。Promise.all 并行 7 类。内存仍全量加载（流式输出留后续）。详见 T043。
- 替代：无

## 013 错误码渐进迁移：新码 + 别名兼容至 v2.0（2026-07-19）

- 背景：协议仍用 SESSION_NOT_FOUND/RECORDING_ALREADY_RUNNING/NO_ACTIVE_RECORDING 旧术语，与领域文档要求的 capture 术语冲突。直接迁移是 breaking change。
- 选项：A）一次性迁移所有错误码；B）新增 capture 系列新码 + 旧码保留为兼容别名 + ERROR_CODE_ALIASES 映射表。
- 结论：选 B。新增 CAPTURE_NOT_FOUND/CAPTURE_ALREADY_RUNNING/NO_ACTIVE_CAPTURE。旧码保留，dispatcher 暂继续返回旧码。新客户端可用新码或通过映射表转换。v2.0 移除旧码。详见 T057。
- 替代：无

## 014 event_id 改用 crypto.randomUUID（2026-07-19）

- 背景：event_id 用 Date.now()+Math.random()*1e6+counter，多 frame/SW 重启 counter 归零可碰撞。
- 选项：A）保持原有生成方式；B）优先用 crypto.randomUUID()。
- 结论：选 B。优先 crypto.randomUUID()（MV3 SW + content + browser 均支持），fallback 旧实现用于非 secure context。详见 T059。
- 替代：无

## 015 Cookie 按 tab domain 过滤（2026-07-19）

- 背景：chrome.cookies.onChanged 是全局事件，采集期间其他标签页及后台站点 cookie 也会进入当前 capture。
- 选项：A）保持全局采集；B）按目标 tab URL domain 过滤。
- 结论：选 B。extract_target_domains 从 tab URL hostname 提取所有父域（含 dot 前缀），cookie.domain 匹配才采集。最小采集原则。详见 T051。
- 替代：无

## 016 外部 Bridge URL allowlist 仅 127.0.0.1（2026-07-19）

- 背景：external_cdp_bridge_client 直接拼 config.bridge_url 不验证，配置被篡改时 token 泄漏到远端。
- 选项：A）保持不校验；B）仅允许 http(s)://127.0.0.1/localhost/[::1]。
- 结论：选 B。validate_bridge_url 解析 URL，拒绝非 http(s)/非本机/含凭据/fragment/非根 path。返回 origin 规范化。详见 T052。
- 替代：无

## 017 stop drain 顺序：先停生产者再翻 flag（2026-07-19）

- 背景：stop_capture 先翻 is_capturing=false，回调入口看到 false 直接返回，stop 到生产者真正停止之间的事件被丢弃。
- 选项：A）保持先翻 flag；B）进入 stopping 后不翻 flag，先停生产者 + drain，再翻 flag + 写 stopped。
- 结论：选 B。capture_state.phase=stopping 拒绝新命令但继续接当前 generation 回调。先停生产者 -> flush_all drain -> 翻 is_capturing=false -> 写 stopped event（含 drain 后最终 stats）-> 清持久化键 -> idle。详见 T031。
- 替代：无

## 018 零配置自动连接：loopback origin 直通 + 中文数字自动编号 + MCP token 文件回退（2026-07-22）

- 背景：扩展装上要用户手填 Token 并通过 `/pair` 配对码才能首次 enroll；MCP 客户端 `.mcp.json` 硬编码 Token 又与 SessionStart hook 自生成 Token 对不上，整条链路对普通用户不可用。
- 选项：A）保持 pairing 硬门槛 + 手填 Token；B）loopback 内凭 chrome-extension origin 直通 enroll，Bridge 自生成 MCP Token，MCP 客户端按 `env > 持久化文件`自动读取，扩展未填 label 时按到达顺序自动编号。
- 结论：选 B。
    - **Bridge enroll**：去掉「扩展 origin + 非 dev_mode 必须过 pairing」硬门槛；保留 `is_allowed_extension_origin`（`chrome-extension://<32-char-id>`）防本机非扩展页面伪造。pairing 端点保留为可选增强（扩展显式传 `pairing_code` 才校验；跨机 / 高安全场景）。
    - **自动编号**：扩展 enroll 时未传 label，Bridge 调 `next_default_label` 分配中文数字（一/二/三…，跳过自定义 label，取已用最大序号 +1）。自定义 label 顶替逻辑保留；自动编号 label 由 `next_default_label` 保证唯一不触发顶替。heartbeat 未传 label 时保留已分配的默认编号（覆盖 T047 的「显式清空为 null」：清空 = 回到默认编号）。
    - **MCP token 文件回退**：`resolve_client_token(env, file_path)` env 优先，缺省读 `$XDG_RUNTIME_DIR/capture-all/bridge_token`（mode 0600）。`.mcp.json` 默认不再出现明文 Token。
- 安全不变量：instance_token 与 MCP token 仍分离（硬约束保留）；自登记端点仅签发 instance_token，不暴露 MCP token；保留 127.0.0.1 绑定。
- 替代：A 方案要求用户读文档生成 / 复制 Token，违反「装上即用」目标；不予采纳。详见 T091。
