# Spike report

## 问题

`chrome.scripting.executeScript({ world:'MAIN', func, args })` 传递 per-start HMAC secret 的暴露面，是否比当前 `<script>` 元素 `textContent` 字面量注入（`var SECRET = '${secret}'`）更隐蔽，以及迁移成本。

## 成功判据

- 明确 executeScript 路径的暴露面（secret 是否落 DOM 文本、页面能否同步读取）与前置条件（manifest 权限）。
- 结论支撑 AC-002 的「迁移注入方式」或「注释残余风险」二选一决策。

## 尝试

- 读 `src/extension/content/content_page_script.ts` 注入机制：`inject_script_element` 用 `document.createElement('script').textContent = script_text`——SECRET 明文在脚本文本，脚本经 `<script>` 插入 DOM，页面可读 `script.textContent`/拦截 `appendChild`/MutationObserver 同步读取。
- 读 `src/extension/manifest.json`：**无 `scripting` 权限**——`chrome.scripting.executeScript` 需要 `"scripting"` 权限（MV3），当前不可用。
- 推理 executeScript func,args 暴露面：func 源码（含 SECRET 变量名，值在 args）经 V8 参数传递，不落 DOM 文本；页面无引用读 args。但注入 func 本身仍可在 MAIN world 被 Function.prototype 原型链观察（页面可 hook 函数调用），且页面级对抗（hook 所有注入脚本函数调用）超出「不观察注入过程的页面」边界——与 ADR-020 威胁模型排除一致。
- 迁移成本评估：三通道（network_hook / storage_capture / websocket_capture）注入点改造为 executeScript + manifest 加 `scripting` 权限 + CSP/时序兼容 + 注入诊断重写 + 测试更新。

## 证据

- manifest.json 无 `scripting` 权限（grep 确认）。
- `content_page_script.ts:23-27` `page_script_preamble` 字面量注入 SECRET；`storage_capture.ts:55` 同。
- ADR-020（decisions.md）威胁模型明确排除对抗页面（页面与扩展 MAIN world 同权，无隐藏共享通道）。

## 结论

executeScript func,args 确实不把 secret 落 DOM 文本（比字面量隐蔽），但需要新增 `scripting` 权限 + 三通道注入重构，成本高且权限变更敏感；且页面级对抗（hook 注入脚本函数调用）仍可观察——executeScript 只是提升隐蔽性，不解决 ADR-020 排除的对抗页面模型。**决策：不迁移 executeScript**，采用 AC-002 允许的「注释明确残余风险 + spec 明示」路径；完整对抗页面模型另立 task（spec 非范围）。

## 是否采纳

- 决定：否（executeScript 迁移）；采纳「注释残余风险 + spec combined 契约」
- 理由：无 scripting 权限、迁移成本高、对抗页面模型本就排除；AC-002 字面允许注释残余风险。
- 后续 task：t174
