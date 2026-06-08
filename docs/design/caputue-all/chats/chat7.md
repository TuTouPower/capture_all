# 按钮高度对齐

_Started 2026-06-08 08:17 UTC_

---

## User

就绪状态的弹出窗口的开始采集按钮，没有和采集中采集完成的按钮的样式对齐。你这个开始采集按钮比采集中的和采集完成的那些按钮要高度高很多。太粗

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: grep]_

_[tool: str_replace_edit]_

The issue is clear: the base `.cta` buttons (used in 采集中 / 采集完成) are `height: 52px` / `border-radius: 14px`, but `.cta-main` (开始采集) overrides them to `64px` / `16px`. Let me align them.Now `.cta-main` inherits the base `.cta` height (52px), radius (14px) and font-size (14px), keeping only its gradient and stronger shadow. Let me verify.

_[tool: done]_

已修复。开始采集按钮现在跟采集中/采集完成的按钮一样高了（52px 高、14px 圆角），只保留了它的蓝紫渐变和稍强的阴影。

