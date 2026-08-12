# Task review t130（reviewer_focus: 测试）

- task：`t130_keyboard_password_guard`
- spec：`docs/tasks/t130_keyboard_password_guard/spec.md`
- diff_anchor：`4cf960b1918f8eb0dc5572dc692c41fb2fdccd19`
- target：`git diff 4cf960b1918f8eb0dc5572dc692c41fb2fdccd19`
- round：1
- reviewed_at：2026-08-12 13:30 UTC+8

## Findings

本 Round 无 finding。以下为核对过程记录。

### 覆盖核对（AC-001/002/003）

- AC-001：`keyboard_capture.test.ts:95-107`（password + keydown，断言 key/code null、key_status masked）与 `:109-119`（password + keyup，断言 action=keyup、key null）共同覆盖 keydown/keyup 两条击键路径的置空行为。
- AC-002：`:96`、`:110` 两用例均以 `keyboard_capture_mode: 'all'` + `redact_data: false` 启动，断言密码框击键仍不产出明文 key/code，直接验证「不受脱敏开关影响」。
- AC-003：`:121-130`（text input，断言 key='a'、code='KeyA'、key_status='captured'）覆盖非密码框行为不变；既有用例 `:74-81`（email input）、`:83-87`（非 input 元素）、`:67-72`（all + redact_data=false 保留 key/code）保持通过，与修前语义一致，未改动任何既有用例。

### 测试可信核对

- 三用例均 import 真实 `start_keyboard_capture`（`keyboard_capture.test.ts:5`），通过 jsdom `dispatchEvent(new KeyboardEvent(...))` 触达生产逻辑 `build_key_event`，无平行实现、无 mock 内部模块；唯一 mock `sender` 位于模块出口回调边界，合规。
- 断言目标为模块可观察输出（经 sender 发出的 `key_data`），非内部状态。
- 双向判别有效：password 用例断言 `target_input_type === 'password'`（`:106`）证明守卫确实作用于真密码框而非空转；非密码用例断言 key 保留（`:127-128`）防止守卫被实现成「全量置空」这类过宽逻辑。
- 纯同步 DOM 派发，无异步时序/漏 await 问题。

### 危险模式扫描

逐条命中情况：恒真断言、删除/反转 expect、注释掉断言、弱化断言、删测试、`.skip`/`.only`、eslint-disable/ts-ignore、mock 被测逻辑、阈值掩盖、条件跳过、`.value=` 冒充真实交互、存在即通过——全部未命中。键盘模拟用 `new KeyboardEvent` + `dispatchEvent`，为 jsdom 合法输入模拟，非 AC 要求之外的交互冒充。

## 结论

- 前轮 finding 复核：Round 1，无前轮。
- 改测方向复核：无。diff 对既有测试零修改，全部为新增用例，不存在「迁就实现」的改测。
- 本轮新发现：0 条。
- 未进表的提示：范围外可选扩展——keyup 用例（`:116-118`）只断言 `key` null，未复断言 `code` null 与 `key_status` masked；因 keydown/keyup 共用同一 `build_key_event` 与同一 `masked` 判定（`keyboard_capture.ts:76`），且 keydown 用例已全量断言 code/key_status，共享路径覆盖闭合，不构成覆盖缺口，仅提示。无系统性缺口。
- 总体判断：三条 AC 覆盖闭合、断言判别充分、无危险模式命中、无既有测试改动，测试可信且有效。
- 系统性 follow-up：无。

### AC 复验方式

- AC-001：`re_verified` — 静态核对 `keyboard_capture.test.ts:102-104`（keydown 断言 key/code null、key_status masked）与 `:118`（keyup 断言 key null），并对齐生产判定 `keyboard_capture.ts:76`（`config.redact_data || is_password_input(event.target)`）与 `:59-61`（`type === 'password'` 判定）。未运行测试（只读约束），复验依据为断言本身与生产代码一致性。
- AC-002：`re_verified` — 核对 `:96`、`:110` 两用例配置均为 all + redact_data=false，断言 key/code null，直接覆盖 AC 所述组合。
- AC-003：`re_verified` — 核对 `:127-129`（text input key/code/key_status 保留）与既有 email/非 input 用例未被改动。

coverage = 3 / 3

reviewed_scope: cecef0889a5180a5

verdict: PASS

## Round 2 (2026-08-12 13:37 UTC+8)

复核触发：code 轴 f001 修复（`is_password_input` 由 `event.target` 改为 `event.composedPath()[0]`，`src/extension/content/keyboard_capture.ts:60-63`）+ 新增 shadow DOM 测试（`tests/unit/keyboard_capture.test.ts:132-149`）。当前 diff 指纹 `c941cccd916efc93`。

### 修复后生产实现核对

修复前守卫 `is_password_input(event.target)` 在 shadow DOM 场景失效：事件穿过 shadow boundary 后，document 级监听器收到的 `event.target` 被 retarget 为 shadow host（非 `HTMLInputElement`），`instanceof` 判空 → 守卫漏过，密码明文入库。修复后 `const t = event.composedPath()[0]` 取事件传播路径首个元素（恒为实际事件目标，不受 retarget 影响），shadow 内 password input 仍判为 masked。修复方向与失败场景吻合。

### 新增 shadow DOM 测试评估（:132-149）

- **覆盖合理性**：shadow DOM 内密码框是 AC-001 的真实场景（网页密码框常处组件 shadow DOM 内），该测试补上了 Round 1 未覆盖的 retarget 分支，强化 AC-001/002。
- **判别力（非假绿）**：`composed: true` 事件从 shadow 内 `input[type=password]` 派发，断言 key/code null、key_status masked。若守卫仍停留在 `event.target` 版本，`event.target` 为 host → `instanceof HTMLInputElement` false → key 泄露为明文，测试变红。测试对「守卫是否经 composedPath 取实际目标」有真实判别力。
- **断言可观察**：全部断言 sender 出口发出的 `key_data`（key/code/key_status），非内部状态、非存在性断言。
- **危险模式扫描**：无恒真/弱化/注释/跳过/mock 误用/阈值掩盖/条件跳过/程序赋值冒充交互。

### 既有 3 个 password 用例复核（修复后仍有效）

非 shadow 场景（input 直接挂 `document.body`），事件路径 `composedPath()[0]` 与 `event.target` 恒等（均为 input 自身），`is_password_input(event)` 结果与修复前一致：

- `:95-107` password keydown：masked=true，key/code null，key_status masked，target_input_type='password' ✓
- `:109-119` password keyup：masked=true，key null ✓
- `:121-130` text input：masked=false（非 password 且 redact_data=false），key='a'/code='KeyA'/key_status='captured' ✓

既有非密码用例（email `:74-81`、非 input `:83-87`、all 保留 `:67-72`）均不受影响：非 password input 的 `composedPath()[0].type !== 'password'`，判定不变。

### 本轴前轮 finding 复核

- 测试轴 Round 1 零 finding，无复核对象。
- 本 task 唯一修复（code 轴 f001）对应的 shadow DOM 新增测试经本轮评估有效，无换形式弱化。

## 结论（Round 2）

- 前轮 finding 复核：测试轴 Round 1 零 finding；code 轴 f001 修复对应测试（shadow DOM 用例）已验证有效。
- 改测方向复核：无。既有 3 个 password 用例未修改，shadow DOM 用例为增量新增。
- 本轮新发现：0 条。
- 未进表的提示：jsdom 对 `event.target` 在 shadow boundary 外的 retarget 模拟精度弱于真实浏览器——若旧实现（`event.target`）在本环境同样通过，说明该用例对 jsdom 的判别力低于真实浏览器；但生产修复本身（composedPath）在 jsdom 29 与真实浏览器均成立，不构成缺陷，仅披露环境边界。可选覆盖扩展：shadow DOM 场景未断言 `target_input_type`（生产 `:104` 仍取 `event.target`，shadow 下为 host 的 null），不在本 task AC 内。
- 总体判断：修复后测试轴覆盖闭合（AC-001 增加 shadow DOM 分支、AC-002 组合保持、AC-003 行为不变），新增用例有判别力，既有用例不受守卫改造影响，无假绿。
- 系统性 follow-up：无。

### AC 复验方式（Round 2）

- AC-001：`re_verified` — 静态核对 `keyboard_capture.test.ts:95-107`（password keydown）、`:109-119`（password keyup）、`:132-149`（shadow DOM password keydown）三用例断言 key/code null 与 key_status masked，对齐生产 `keyboard_capture.ts:60-63`（composedPath[0]）与 `:78`（`config.redact_data || is_password_input(event)`）。未运行测试，复验依据为断言与生产代码一致性。
- AC-002：`re_verified` — 三个 password 用例启动配置均为 all + redact_data=false（`:96`、`:110`、`:133`），断言 key/code null。
- AC-003：`re_verified` — 核对 `:127-129`（text input 保留 key/code/key_status）与既有 email/非 input 用例未被修改。

coverage = 3 / 3

reviewed_scope: c941cccd916efc93

verdict: PASS
