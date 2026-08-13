# p042 content 顶层 listener 守卫抽行为级测试

- 来源：t155 遗留
- 内容：content_script.ts / service_worker.ts 顶层注册 chrome 监听致无法直接 import，部分 AC（onMessage 未知 action、start 并行通知、generation 守卫）用源码字符串扫描测试兜底。守住「revert 即失败」但测不出行为级回归（如 onMessage else 分支调用 sendResponse 但 return true 导致通道不 resolve）。后续将 onMessage handler、start 并行通知、generation 守卫逻辑抽成可 import 单元做行为级单测。
- 处理：t195
