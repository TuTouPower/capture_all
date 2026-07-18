# Capture All UI统一

_Started 2026-06-08 02:16 UTC_

---

## User

本产品的英文名改成 Capture All. 你检索一下，所有的 record trace 等词汇都统一成 capture。中文名所有的录制 采集 记录等词汇都统一成 采集。把开始录制和开始深度录制都改成开始采集。我希望你这个就绪，采集中和采集保存这几个UI是统一的。这几个窗口的第一行都是就绪/采集中 时间/采集完成 时间，然后后面是标准采集还是深度采集。然后第二行是开始采集 停止采集+实时详情 打开详情 导出 开始新采集。然后第三行是采集的那些内容的标签，比如 cookie 请求体 Dom 变化等 ui 要统一。最下面是最近采集。

## Assistant

_[tool: list_files]_

I'll explore the project structure first to understand what we're working with.

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: read_file]_

Let me read the CSS, detail files, and look at the current screenshots to understand the full design.

_[tool: view_image]_

_[tool: read_file]_

Let me view the current popup states and read the detail files.

_[tool: grep]_

Let me grep for all the terms that need to be unified across files.

_[tool: grep]_

_[tool: grep]_

The PRD in uploads/ is a source doc — I'll leave it alone and focus on the UI files. Let me grep within the record-all UI files specifically.

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

The PRD is a source doc — I'll leave `uploads/` alone. Let me check the remaining UI files for any terms.

_[tool: update_todos]_

I have a clear picture now. Let me lay out the plan.

_[tool: view_image]_

_[tool: view_image]_

Let me quickly view the ready and saved states to ground the redesign.

_[tool: str_replace_edit]_

Now I'll rewrite the popup. First the unified view components:

_[tool: str_replace_edit]_

Now the terminology and the `SavedView` call:

_[tool: str_replace_edit]_

Now the CSS. Let me replace the old chip/stat styles with the unified tag styles:

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

Now the HTML titles and the detail workbench terminology:

_[tool: str_replace_edit]_

_[tool: grep]_

Let me verify no user-facing "Record All" / 录制 remain, then update comment headers in bulk.

_[tool: grep]_

All remaining are comment headers. Let me update them in bulk:

_[tool: run_script]_

_[tool: show_html]_

Now let me verify the popup renders correctly across all states.

_[tool: show_html]_

Ready state looks great. Let me check the recording and saved states.

_[tool: multi_screenshot]_

_[tool: update_todos]_

All three states are unified and consistent — same row structure (status+mode / actions / capture tags / recent), with the capture tags now sharing one UI across Ready (toggles), Recording, and Saved (counts). Let me finalize.

_[tool: done]_

_[tool: fork_verifier_agent]_

完成。主要改动：

**命名统一**
- 英文名全部改为 **Capture All**（标题、品牌名、舞台标识、注释头）
- 中文里录制/记录/采集统一为**采集**：采集控制台、采集中、采集完成、最近采集、停止采集等
- 「开始录制」「开始深度录制」统一为**开始采集**

**三个状态 UI 统一**（就绪 / 采集中 / 采集完成）现在共用同一套结构：
- **第一行**：状态（就绪 · 绿点 / 采集中 · 计时 / 采集完成 · 时长）+ 右侧模式（标准采集 · 深度采集 切换或徽标）
- **第二行**：操作按钮（开始采集 / 停止采集+实时详情 / 打开详情·导出·开始新采集）
- **第三行**：统一的采集内容标签（用户操作、网络请求、响应体、DOM 变化、Cookie/Storage 等）—— 就绪态可点选，采集/完成态显示实时计数
- **最下方**：最近采集

「采集中·警告」和「采集设置」也沿用同一框架。详情工作台同步更新为 Capture All / 采集中。

注：`uploads/` 里的 PRD 是原始素材，未改动。「Stack Trace / 堆栈跟踪」是通用技术术语，保留未动——如需也改告诉我。

