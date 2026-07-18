# 国际化与主题

实现：`src/shared/i18n.ts` / `src/shared/theme.ts`。

## 1. 国际化（i18n）

### 1.1 支持语言

中文（zh）、英文（en）。默认 locale 由 `DEFAULT_USER_CONFIG.locale = 'en'` 决定。

### 1.2 实现

- HTML 元素用 `data-i18n="<key>"` 标注。
- TypeScript 通过 `t(key)` 函数读取。
- 字符串集中在 `i18n.ts` 维护，不硬编码在组件里。

### 1.3 验证

- `tests/ui_strings.test.ts` — 用户可见字符串验证，确保用 Capture All / 全采 / 采集，不出现禁用术语。
- E2E `e2e-theme-i18n.spec.ts` — 主题与国际化切换。

## 2. 主题（theme）

### 2.1 三种

- 浅色（light）— 默认。
- 深色（dark）。
- 跟随系统（follow-system）— `DEFAULT_USER_CONFIG.theme = 'follow-system'`。

### 2.2 实现

通过 CSS Custom Properties 切换（见 `design_system.md`），令牌定义在 `src/shared/design_tokens.css`。`theme.ts` 负责读取用户配置 + 监听系统 prefers-color-scheme 变化。

## 3. 禁止

- 不硬编码中文 / 英文字符串到 UI。
- 不出现"深度采集 / 标准采集 / 模式 / 当前采集中 / 录制 / 记录"等禁用术语（见 `domain.md` §4）。

## 4. 关键文件

- `src/shared/i18n.ts`。
- `src/shared/theme.ts`。
- `src/shared/design_tokens.css`。
