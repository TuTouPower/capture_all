# p054 dashboard settings onChanged 监听器累积泄漏

- 现象：设置页每次进入(wire_settings)都新增一个 chrome.storage.onChanged 监听器,无 removeListener,多次导航后累积多个监听器重复触发快照更新与重渲染。
- 影响：重复监听器导致冗余重渲染(性能开销),及回填时多次 set_user_config(幂等但浪费)。
- 根因：`src/extension/dashboard/dashboard_settings.ts` wire_bridge_status 的 `chrome.storage?.onChanged?.addListener` 每次 wire 都注册,未在页面卸载/重渲染时移除。dashboard 是单页导航,wire_settings 多次调用。
- 分类：产品缺陷(资源泄漏级)。
- 来源：t202 Round 1 code review t202_code_f001。
- 已扫同类：dashboard 内其他 addListener(dashboard.ts / detail 等)是否同样累积需核实——设置页为单例导航,本条目聚焦 settings。
- 测试缺口：无监听器计数/去重测试。
- 线索：`src/extension/dashboard/dashboard_settings.ts` wire_bridge_status
- 处理：t202
