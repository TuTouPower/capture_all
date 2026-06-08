# Record All — 待完成任务

已完成任务见：`docs/archive/record_all_completed_tasks.md`

---

### P1：控制台日志与运行时异常分离（未开始）

- [ ] 将 console 输出和 JS 运行时异常从类型定义、采集入口、存储写入上彻底分开
  - 当前问题：`exception_capture.ts` 构造 `ConsoleLog` 对象，通过 `handle_console_log` 回调写入，类型和入口混在一起
  - 新增独立类型 `ExceptionLog`（或类似命名），与 `ConsoleLog` 区分
  - `exception_capture.ts` 使用独立的回调和写入路径，不再走 `handle_console_log`
  - `write_logs` / `write_exceptions` 分开，各自写入对应的 IndexedDB store
  - 确认 IndexedDB 已有 `error_logs` store 是否被正确使用，若未使用则接上
  - 更新 `data_capture_labels.md` 文档

### P1：DOM 被动变化采集（未开始）

- [ ] 增加 MutationObserver 采集被动 DOM 变化（子树增删、属性变更等）
  - 与现有 `dom_change`（用户交互触发的 input/change/focus/blur）区分
  - 考虑新增 type 如 `dom_mutation` 或复用 `dom_change` 加 `action: 'mutation'`
  - 需评估性能影响，考虑节流/采样策略
  - 采集内容：节点增删、属性变更、文本内容变更
  - 需在 `data_capture_labels.md` 同步更新文档
