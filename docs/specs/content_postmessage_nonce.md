# Spec — content postMessage 注入通道 combined 认证（nonce + per-start secret + per-message HMAC）

page 注入通道（network hook / websocket / storage）通过 `window.postMessage` 从页面 MAIN world 回传采集事件。为防页面脚本伪造，content 侧引入 combined 认证：**per-start nonce + per-start secret + per-message HMAC**（t121 引入 HMAC，本 spec 为 combined 契约的权威定义；旧「nonce 相等即认证」描述已废弃）。

## 通道

三个注入脚本（`network_hook` / `websocket_capture` / `storage_capture`）同构：

- content 每次 start 生成 per-start secret（`generate_secret()`：优先 `crypto.getRandomValues` 32B hex，http 非 secure context fallback）与 nonce（`generate_nonce()`：优先 `crypto.randomUUID`，fallback Math.random）。
- **secret 非 `window` 暴露**：secret 内联进注入脚本闭包（`page_script_preamble` / 各模块 build_page_script 的 `var SECRET = '...'`），不写 `window` 变量；注入脚本对每条采集消息计算 HMAC-SHA256 签名（`sign_str`，同步实现 `SYNC_HMAC_JS` 内联，content 侧 `content_hmac.ts` 同步校验）。
- nonce 经 `update_page_nonce` 注入无 guard 小脚本写 `window.__capture_all_*_nonce__`（MAIN world 变量，注入脚本 `post()` 每次发送动态读取附到消息）。
- content 接收端 `message_listener` 校验：**nonce 相等 + HMAC 签名匹配**，任一失败即丢弃。

## canonical payload 与签名覆盖

- 签名输入（canonical payload）：`source`、事件类型、关键字段（各通道按实现）与 nonce 的规范化序列——内容侧与注入脚本 `sign_str` 用同一同步实现与测试向量锁定（`content_hmac_vectors.test.ts`）。
- 签名覆盖发送消息的认证相关字段（source/nonce + 事件体），防止篡改后重签。

## 拒绝规则

- 缺失签名 / 畸形签名 / 签名不匹配 / nonce 过期（非 current_nonce）——一律丢弃，不落库、不转发。

## 生命周期

- per-start secret + nonce 旋转：每次 start 生成新 secret/nonce，注入脚本重注入持最新 secret（`page_script_reinstall_guard`：先还原上次 hook 再重装，stop→start 不断流）。
- stop→start 与扩展重建（reload/禁用→启用）均不破坏：注入脚本从 window 动态读 nonce，guard 还原后重装持最新 secret。
- 页面可直读 window nonce（伪造成本低），防护重点是跨采集伪造旧 nonce 失效 + per-message HMAC 抗伪造。

## 威胁模型边界（ADR-020）

- 防御对象：仅读取 `window` nonce 的普通页面（直接全局访问）——secret 不写 window，普通页面无法构造合法签名。
- 排除：观察注入过程的对抗页面（MutationObserver / DOM hook 拦截注入脚本文本可窃取内联 secret）——页面与扩展 MAIN world 同权，无隐藏共享通道，该暴露面不在本方案防御范围（t174 注释明确残余风险；executeScript func,args 迁移需 scripting 权限且页面级对抗仍可观察，不采纳，见 s007/d009）。
- 若产品需要完整对抗页面模型，另立 task（t174 非范围）。

## 相关实现

- `src/extension/content/content_page_script.ts`（preamble / reinstall guard / inject_script_element）、`network_hook.ts` / `websocket_capture.ts` / `storage_capture.ts`（三通道）、`content_hmac.ts`（同步 HMAC 双实现）
- `tests/unit/content_postmessage_nonce.test.ts`（nonce 校验 / 旋转 / 重启 / http fallback）、`tests/unit/content_hmac_vectors.test.ts`（HMAC 向量锁定双实现）
