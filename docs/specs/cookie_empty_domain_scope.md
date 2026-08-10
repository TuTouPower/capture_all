# Spec — Cookie 目标域为空不退化全浏览器

Cookie 采集仅监听目标 tab domain 范围内的 cookie 变更，不因目标域无法解析而退化为全浏览器采集。

## 语义

- `extract_target_domains` 仅接受 http/https 协议 URL；about:/chrome:/chrome-extension: 等非 web 协议解析为空域。
- `start_cookie_capture` 空域时**不注册** `cookies.onChanged` listener，并记录 `Cookie capture skipped: no target domain` 降级信号；URL 就绪后由调用方重新 start。
- `matches_target` 空集 fail-closed（返回 false），防未来空域注册路径静默全量。
- 非空域按 domain 过滤（回归）。

## 相关实现

- `src/extension/background/cookie_capture.ts`
- `tests/unit/cookie_empty_domain_scope.test.ts`：空域 skip / 域名过滤回归 / 降级状态测试
