# Capture All — TASKS.md

> 基准：`docs/design/caputue-all/project/record-all/` (commit `f7fe756`)
> 已完成任务（✅）归档至 `docs/archive/completed_tasks_2026-06-13.md`

---

## P0 · 功能缺陷（待修复）

### ⛔ P0.60 capture_id 含冗余 `capture_` 前缀，导出文件名默认带 ID 段
- **状态**：待修复 — 2026-06-13
- **现象**：
  1. capture_id 值形如 `capture_1781359011242_ui1gk45`，前缀 `capture_` 冗余（字段名已表明语义，前缀纯属重复）。
  2. 默认导出文件名包含 capture_id 段，例：`capture_all_capture_1781359011242_ui1gk45_2026-06-13_22-55-26.zip`，过长且 ID 对人类无意义。
- **要求**：

  **(1) capture_id 去 `capture_` 前缀**

  - 当前：`capture_1781359011242_ui1gk45`
  - 改为：`1781359011242_ui1gk45`（`<时间戳毫秒>_<随机7字符>`）
  - 涉及修改点（待实现时核对）：
    - `src/background/session_manager.ts` `generate_capture_id()`
    - `src/popup/popup.ts` 中 `capture_${Date.now()}_${random}` 模板
    - `src/background/agent_command_dispatcher.ts` 同模板
    - 任何字符串拼接 `capture_` + id 的位置
  - **兼容性**：旧 IndexedDB 数据中已存的 `capture_*` 记录需保留可读。读取时若发现旧前缀，按需做透明剥离或保留原值（不强制迁移）。新增的 capture 一律用新格式。
  - 用户可见处（popup、dashboard、detail）不应显示 `capture_` 前缀。

  **(2) 默认导出文件名模板**

  - 当前默认：`{capture_id}_{date}.{ext}`（导致文件名巨长）
  - 改为默认：`capture_{date}.{ext}`，例 `capture_20260613_225526.zip`
  - `{date}` 紧凑格式 `YYYYMMDD_HHMMSS`（无连字符、无冒号，文件系统友好）
  - 默认模板**不含** `{capture_id}`；用户若想保留 ID 可在设置里自定义模板。
  - 同步检查 `UserConfig.export_filename_template` 默认值、`build_export_filename` 实现、`export_settings.ts` 中的占位符替换逻辑。

- **测试要求**（先 RED 再 GREEN）：
  1. `generate_capture_id()` 返回值不包含 `capture_` 子串。
  2. `generate_capture_id()` 仍含 `_`（两段结构保留）。
  3. 默认文件名模板渲染结果形如 `capture_20260613_225526.zip`，无 capture_id 段。
  4. 紧凑日期格式不含 `-` `:` ` `。
  5. 用户自定义模板仍可使用 `{capture_id}` 占位符（向后兼容）。

- **影响范围**：
  - IndexedDB 已有数据保留（不迁移）
  - 用户配置 `export_filename_template` 若显式含 `{capture_id}` 仍按用户意愿渲染
  - 文档（data_model.md / data_flow.md / PRD）需同步更新示例

### ⛔ P0.61 导出目录不记忆 — filename 子目录与 saveAs=true 互相冲突
- **状态**：待修复 — 2026-06-13
- **现象**：用户在设置里配置 `export_capture_directory`（如 `captures`），导出采集记录/日志时弹出的保存对话框初始位置仍是 Chrome 记忆的目录（Downloads 根或上次任意位置），**完全无视**配置的子目录。用户每次都要手动导航到目标目录。
- **根因**：`src/shared/export_utils.ts:24-29` `download_blob()` 同时启用了两个互相冲突的机制：

  | 机制 | 行为 | 当前状态 |
  |------|------|---------|
  | `filename` 带子目录（`captures/foo.zip`） | Chrome 自动保存到 `Downloads/captures/`，不弹框 | ✓ 启用 |
  | `saveAs: true` | 强制弹保存对话框，初始位置由 Chrome 内部记忆 | ✓ 启用 |

  两者同时开 → 对话框弹出，Chrome 用自己的"上次保存位置"作为初始目录，filename 里的子目录段被忽略。用户每次都要重新导航。

- **Chrome API 限制**（已确认）：
  - `chrome.downloads.download` 的 `saveAs` 对话框**初始目录不可由扩展控制** — 这是 Chrome 平台限制
  - 但 `filename` 参数可带相对子目录（相对 Downloads 根），Chrome 自动建子目录直接保存
  - 当前代码两条路都开了，等于都没生效

- **历史修复为何反复失败**：
  - **P0.40-R1**：加 `last_dir` 持久化（`chrome.downloads.search()` 取上次路径回填）→ 失败。原因：search 返回磁盘**绝对路径**，download 只收**相对路径**，回填必然失败并覆盖用户配置目录。
  - **P0.53**：移除 `last_dir`，改靠 `saveAs` 让 Chrome 记忆 → 失败。原因：Chrome saveAs 记忆不可控（跨会话/重启常丢），且 saveAs=true 时 filename 的 dir 段被忽略。
  - 两次都在错误的二选一里打转，没意识到"filename 子目录直接保存"这条路径。

- **修复方案（A — 推荐）**：根据用户是否配置目录切换 saveAs：
  ```ts
  export async function download_blob(blob, filename, opts?) {
      const has_dir = filename.includes('/');
      const url = URL.createObjectURL(blob);
      const download_id = await chrome.downloads.download({
          url,
          filename,
          saveAs: !has_dir,  // 配了目录→不弹框直接存；没配→弹框让 Chrome 记忆
      });
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return download_id;
  }
  ```

  - 用户配置 `export_capture_directory` → saveAs=false，filename 带 dir，Chrome 自动存到 `Downloads/{dir}/`，**目录一定生效**
  - 用户未配置 → saveAs=true，filename 不带 dir，让 Chrome 记忆，用户可手动选

- **测试要求**（先 RED 再 GREEN）：
  1. mock `chrome.downloads.download`，构造 `filename = 'captures/foo.zip'`，断言 `saveAs === false`
  2. 构造 `filename = 'foo.zip'`（无 dir），断言 `saveAs === true`
  3. 构造 `filename = 'logs/bar.log'`，断言 `saveAs === false`
  4. E2E：用户配置 `export_capture_directory = 'captures'` → 导出 → 文件实际出现在 `Downloads/captures/` 下（不弹对话框）

- **影响文件**：
  - `src/shared/export_utils.ts` — `download_blob()` saveAs 逻辑
  - `tests/export_utils.test.ts` — saveAs 切换测试
  - `tests/e2e-export.spec.ts` / `tests/e2e-export-content.spec.ts` — 配置目录后不弹框验证

- **影响范围**：
  - popup / dashboard / detail 三处导出入口都走 `download_blob`，一处修复全覆盖
  - 用户配置行为：配置了目录 = 直接保存（不弹框）；没配置 = 弹框（保持现行体验）
  - 若用户既配置目录又想每次确认，需要额外加 UserConfig 字段（如 `export_always_prompt`），本次不做

---

## 测试审计报告 (2026-06-12)

10 组并行审计，检查「测试通过但功能不工作」的脱节模式。

### 审计发现汇总

| 组 | 范围 | 脱节数 | 严重度 |
|----|------|--------|--------|
| 1 | popup_layout | 全部 54 测试 | **严重** |
| 2 | export_settings/system_time | 2 | 高 |
| 3 | dashboard | 3 + 1 潜伏 bug | 高 |
| 4 | E2E export | 5 | 高 |
| 5 | E2E detail tabs | 5/8 tab 未覆盖 | 高 |
| 6 | settings | 2 | 中 |
| 7 | network | 6 | **严重** |
| 8 | E2E capture | 5 | 高 |
| 9 | agent/bridge | 0 | ✅ 干净 |
| 10 | 剩余单元测试 | 6 | 高 |

### 关键发现

**G1 popup** — `popup_layout.test.ts` 54 个测试全部是布局常量断言（宽/高/列数），零交互测试。所有按钮的 click handler、chrome.runtime.sendMessage 调用、状态转换逻辑均无测试覆盖。

**G7 network** — `resolve_resource_type()` 仅在 webRequest 路径被调用，CDP 初次存储和 `network_correlator.ts` 三个构建函数（`merge_matched`/`build_cdp_only_request`/`build_web_request_only_request`）全部直接透传原始 type 值，不归一化。测试未覆盖 CDP PascalCase 输入。

**G3 dashboard** — `event_category.ts` 潜伏 bug：`category_for_event_type()` 对 `network_request`/`console_event`/`capture_config_changed` 等会错误落到 `'dom_data'` category（目前因生产者显式设 category 未触发）。

**G2 export** — `export_session()` 硬编码文件名 `capture_all_${id}.${ext}`，`build_export_filename()` 及 `{date}` 模板从未参与实际下载路径。`migrate_iana_timezone()` 测试仅纯函数，不覆盖 `load_user_config()` 完整加载路径。

**G4 E2E export** — 未断言 filename 含 date、未断言 `started_at` 非 UTC、未断言 `system_time_timezone` 非空、未断言 `resource_type` 无 PascalCase、`console_events` 非空用条件跳过。

**G5 E2E detail** — 8 个 tab 中 5 个未验证（user_action/navigation/cookie/error/config），selector 与实际 DOM 不匹配。

**G8 E2E capture** — 停止采集不验证 `success=true` 返回值；CDP 测试不验证 `response_body` 非空；状态测试缺多个元素。

**G10 单元测试** — `session_manager` 测试自测自（不调生产代码）、`console_capture` 测试不触 CDP 监听器、`redaction` 测试的脱敏函数在 `exporter.ts` 中零调用、`tab_events` 不覆盖受限 URL 重试、`ui_strings` 不扫 `session` 残留词、`event_category` 仅覆盖 2/20+ 映射。

### 脱节模式分类

1. **纯函数测试，不知生产调用方**（最常见）：函数被完整测试但无人验证它在真实路径被调用。例：`build_export_filename`、redaction 函数。
2. **DOM 存在性断言，无交互验证**：断言元素 id/class 存在，不模拟 click、不验证事件副作用。例：popup_layout 全部测试。
3. **mock 数据与小写/标准值，CDP 实际给 PascalCase**：例：network 测试全用小写输入，CDP 给 `Document`/`Fetch`。
4. **条件跳过代替强制断言**：`if (length > 0) { expect... }` 掩盖零数据问题。
