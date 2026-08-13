# d009 MAIN world secret 传递暴露面

- 来源：s007 spike
- 结论：`<script>` 元素 textContent 注入使 per-start HMAC secret 明文落 DOM 文本（页面可同步读取）；`chrome.scripting.executeScript` func,args 不落 DOM 但需新增 `scripting` 权限且页面级对抗仍可观察（hook 函数调用）——executeScript 仅提升隐蔽性，不解决对抗页面模型（ADR-020 已排除）。
- 证据：manifest.json 无 scripting 权限；content_page_script.ts:23-27 字面量注入；ADR-020 威胁模型排除。
- 影响：t174 采用「注释残余风险 + spec combined 契约」路径；executeScript 迁移不采纳（权限 + 成本）；完整对抗页面模型另立 task。
- 现状：有效
