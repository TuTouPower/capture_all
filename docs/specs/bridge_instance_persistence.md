# Spec — Bridge 实例状态持久化

Bridge 实例 registry 跨进程重启的持久化约定。

## 落盘路径

- Bridge 实例 registry 默认落盘到与 token 文件同目录的 `instances.json`（`$XDG_RUNTIME_DIR/capture-all/instances.json`，或 `CAPTURE_ALL_PROJECT_DIR/.local/instances.json` 兜底）。
- `CAPTURE_ALL_INSTANCES_FILE` 环境变量可覆盖路径；manual、`npm run bridge`、SessionStart hook、systemd unit 四条启动路径共享同一解析逻辑（`parse_bridge_cli_args`），不各发明位置。

## 持久化行为

- `persist()` 将实例清单（instance_id、label、token_hash、origin 扩展 ID 等）写盘，token 仅存哈希非明文，文件 mode 0600。
- `load_persisted()` 启动时恢复实例；**恢复实例的 `seen_at` 重置为启动时刻**，避免旧时间戳被 TTL+grace sweep 删除（停机超 35s 后重启仍可恢复）。
- **字段校验**：逐条校验载入条目（instance_id/token_hash/browser_label/origin_extension_id/extension_version/active_capture_id 类型与空值），畸形条目（缺字段、类型错、null 元素）跳过，不产生垃圾实例、不中止后续合法条目恢复。
- 恢复实例保留 token_hash，heartbeat 携原 instance_token 命中认证返回 200，零配置浏览器无需重新 pairing。
- 文件损坏或缺失时从空开始，不阻断启动。

## 语义

- 实例 registry 恢复后，`list_browsers` 能列出重启前已注册实例（含零配置），label 保留。
- 跨进程重启不依赖 pairing 状态（pairing 保持内存态；零配置恢复靠 registry 走 existing 分支）。

## 相关实现

- `src/bridge/registry.ts`：`persist()` / `load_persisted()` / `_set_extension_ttl_for_test`
- `src/bridge/config.ts`：`default_instances_file_path()` / `parse_bridge_cli_args`
- `tests/unit/bridge_registry_refactor.test.ts`：persist/load 往返、seen_at 重置、损坏/缺失文件、双实例恢复
