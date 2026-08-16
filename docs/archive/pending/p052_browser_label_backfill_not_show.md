# p052 默认浏览器编号回填后扩展设置页仍不显示

- 现象：新装/已运行扩展,bridge 已分配「1 号/2 号」,但扩展设置页「备注名（可选）」输入框仍为空,只显示占位符「如：Mac Chrome Dev」,用户无法看到自己的编号。
  - 期望：编号在设置页可见、可编辑。
  - 实际：备注名空;且「状态」显示「未连接」(但 bridge 侧实例在线)。
  - 复现：截图 `.scratch/PixPin_2026-08-15_19-35-39.png`(1号)、`_19-40-43.png`(2号),build 19:28:01 最新产物;扩展已 reload;bridge `get_status` 显示 2 号在线但仍空。
- 影响：扩展设置页无法展示/管理浏览器编号;「未连接」状态误导用户。功能面：dashboard 设置 UI、bridge label 回填链路。
- 根因（已确认）：
  1. **bridge 进程未重启,跑旧代码(主因)**：bridge Node 进程 pid 29290 于 18:59:34 启动,而心跳回带 `data.browser_label` 的改动 19:26 写入、19:28:02 构建进 `bridge.mjs`。进程内存仍为 18:59 旧版,心跳响应 `{ok:true}` 无 `data.browser_label`,扩展 `send_heartbeat` 解析 `body.data?.browser_label` = undefined → 回填不触发。扩展 reload 无效,因为问题在 bridge 进程侧。
     - 验证：`stat bridge.mjs` 19:28 含新码;`ps` 进程 18:59 启动。磁盘新 ≠ 进程内存新,Node 需重启。
  2. **dashboard 内存快照不刷新(次因,独立缺陷)**：`get_user_config` 返回 `dashboard_state.ts:85` 的 `_state.user_config`,仅在页面加载时(`dashboard.ts:111`)从 storage 读一次,无 `storage.onChanged` 监听。即便回填写入 storage,已打开页面不重新加载也不显示。
  3. **「未连接」为静态死文本**：`dashboard_settings.ts:105` 固定渲染 NotConnected,不代表真实连接状态。
- 测试缺口：现有回填测试覆盖 enroll/心跳/401 路径但均为**单测,不覆盖「扩展↔bridge 双进程」集成**——bridge 旧进程场景无测试能 catch;dashboard 快照不刷新、「未连接」死文本均无测试。补测方向：集成层验证心跳响应字段;dashboard 从 storage 实时读或监听变更。
- 线索：`.scratch/PixPin_2026-08-15_19-35-39.png`、`_19-40-43.png`、`artifacts/bridge/bridge.mjs`
- 处理：t202
