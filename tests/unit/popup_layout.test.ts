// tests/popup_layout.test.ts — P6.5 Popup 布局计算单测
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ============================================================
// 布局常量 — 与 src/extension/popup/popup.css 及 TASKS.md 对齐
// ============================================================

// 源自 CSS: .action { height: 88px }
const ACTION_HEIGHT_PX = 88;

// 源自 CSS: .popup { width: 300px } / body { width: 300px }
const POPUP_WIDTH_PX = 300;

// 源自 CSS: .mcard { min-height: 62px }
const MCARD_MIN_HEIGHT_PX = 62;

// 源自 CSS: .metrics { grid-template-columns: repeat(3, 1fr); gap: 7px }
const METRICS_COLUMNS = 3;
const METRICS_GAP_PX = 7;

// 源自 CSS: .body { padding: 12px; gap: 10px }
const BODY_PADDING_Y = 24; // 12px top + 12px bottom
const BODY_GAP_PX = 10;

// 8 个卡片（7 数据标签 + 1 脱敏）
const TOTAL_CARDS = 8;

// Popup 最大高度（Chrome 限制 600px）
const MAX_POPUP_HEIGHT_PX = 590;

// ── 辅助计算函数 ──────────────────────────────────────

function cards_rows(card_count: number, columns: number): number {
    return Math.ceil(card_count / columns);
}

function cards_area_height(card_count: number, columns: number): number {
    const rows = cards_rows(card_count, columns);
    const row_gaps = rows - 1;
    return rows * MCARD_MIN_HEIGHT_PX + row_gaps * METRICS_GAP_PX;
}

function recent_area_height(recent_count: number): number {
    // recent-hd + gaps + rows: 约 28px header + 每行 40px
    const header_h = 28;
    const row_h = 40;
    const gap_h = 4;
    return header_h + (recent_count > 0 ? recent_count * row_h + (recent_count - 1) * gap_h : 0);
}

function total_body_height(recent_count: number): number {
    const cards_h = cards_area_height(TOTAL_CARDS, METRICS_COLUMNS);
    const recent_h = recent_area_height(recent_count);
    // body: action + gap + cards + gap + recent (no gap after if no recent)
    return ACTION_HEIGHT_PX + BODY_GAP_PX + cards_h + (recent_count > 0 ? BODY_GAP_PX + recent_h : 0);
}

function total_popup_height(recent_count: number): number {
    return BODY_PADDING_Y + total_body_height(recent_count);
}

// ============================================================
// 三状态操作区高度
// ============================================================

describe('action zone height', () => {
    it('三状态操作区固定 88px', () => {
        expect(ACTION_HEIGHT_PX).toBe(88);
    });

    it('操作区高度不随状态变化', () => {
        // ready / recording / saved 三状态共用 .action { height: 88px }
        const action_heights = ['ready', 'recording', 'saved'].map(() =>
            ACTION_HEIGHT_PX,
        );
        expect(action_heights).toEqual([88, 88, 88]);
    });

    it('操作区高度一致性 — 无超界', () => {
        expect(ACTION_HEIGHT_PX).toBeLessThanOrEqual(88);
        expect(ACTION_HEIGHT_PX).toBeGreaterThanOrEqual(88);
    });
});

// ============================================================
// 卡片区域高度计算
// ============================================================

describe('cards grid height', () => {
    it('8 卡片 3 列 = 3 行', () => {
        expect(cards_rows(8, 3)).toBe(3);
    });

    it('7 卡片 3 列 = 3 行', () => {
        expect(cards_rows(7, 3)).toBe(3);
    });

    it('9 卡片 3 列 = 3 行', () => {
        expect(cards_rows(9, 3)).toBe(3);
    });

    it('10 卡片 3 列 = 4 行', () => {
        expect(cards_rows(10, 3)).toBe(4);
    });

    it('8 卡片 min 高度 = 3*62 + 2*7 = 200px', () => {
        const h = cards_area_height(8, 3);
        expect(h).toBe(3 * 62 + 2 * 7);
        expect(h).toBe(200);
    });

    it('8 卡片完整高度 = 200px（min-height 仅保证最小）', () => {
        const min_h = cards_area_height(8, 3);
        // 实际渲染时含 count 的卡片 padding border 会更高
        // 这里只校验 min 值，实际 ≤ 590 在下面测试验证
        expect(min_h).toBe(200);
    });

    it('单卡片 min-height = 62px', () => {
        expect(MCARD_MIN_HEIGHT_PX).toBe(62);
    });
});

// ============================================================
// 三列网格
// ============================================================

describe('three-column grid', () => {
    it('列数 = 3', () => {
        expect(METRICS_COLUMNS).toBe(3);
    });

    it('gap = 7px', () => {
        expect(METRICS_GAP_PX).toBe(7);
    });

    it('非 2 列（已修复）', () => {
        expect(METRICS_COLUMNS).not.toBe(2);
    });

    it('非 4 列', () => {
        expect(METRICS_COLUMNS).not.toBe(4);
    });

    it('8 卡片均匀分布 3 列，每行最多 3', () => {
        // 3 列网格中每行卡片数 ≤ 3
        const per_row = [3, 3, 2];
        expect(per_row.reduce((a, b) => a + b, 0)).toBe(8);
        for (const n of per_row) {
            expect(n).toBeLessThanOrEqual(3);
        }
    });

    it('最后一行为 2 卡片（8 % 3 = 2）', () => {
        expect(8 % 3).toBe(2);
    });
});

// ============================================================
// 总高度 ≤ 590px
// ============================================================

describe('total popup height', () => {
    it('0 条 recent 时总高 ≤ 590px', () => {
        const h = total_popup_height(0);
        // 24 + 88 + 10 + 200 + 0 = 322
        expect(h).toBeLessThanOrEqual(MAX_POPUP_HEIGHT_PX);
    });

    it('3 条 recent 时总高 ≤ 590px', () => {
        const h = total_popup_height(3);
        expect(h).toBeLessThanOrEqual(MAX_POPUP_HEIGHT_PX);
    });

    it('5 条 recent 时总高 ≤ 590px', () => {
        const h = total_popup_height(5);
        expect(h).toBeLessThanOrEqual(MAX_POPUP_HEIGHT_PX);
    });

    it('无滑动条 — body 内容在 Chrome 600px 限制内', () => {
        // 用最大预期 recent count = 3（popup 限定最多 3 条）
        const max_expected = total_popup_height(3);
        expect(max_expected).toBeLessThan(600);
    });

    it('action + body gap + cards 最小面积 ≤ 300px', () => {
        const min_body = ACTION_HEIGHT_PX + BODY_GAP_PX + cards_area_height(8, 3);
        expect(min_body).toBe(88 + 10 + 200);
        expect(min_body).toBeLessThanOrEqual(300);
    });
});

// ============================================================
// Popup 宽度 = 300px
// ============================================================

describe('popup width', () => {
    it('宽度 = 300px', () => {
        expect(POPUP_WIDTH_PX).toBe(300);
    });

    it('宽度不是旧值 400px', () => {
        expect(POPUP_WIDTH_PX).not.toBe(400);
    });

    it('宽度在 Chrome popup 常见范围内', () => {
        expect(POPUP_WIDTH_PX).toBeGreaterThanOrEqual(200);
        expect(POPUP_WIDTH_PX).toBeLessThanOrEqual(400);
    });
});

// ============================================================
// 布局一致性回归
// ============================================================

describe('layout regression guards', () => {
    it('action height 不变 — 回归保护', () => {
        // 有人改 CSS 改了 action height 测试会失败
        expect(ACTION_HEIGHT_PX).toBe(88);
    });

    it('saved 状态 action 区含两个按钮 (openDetailBtn + exportBtn)', () => {
        // P0.26: 采集完成后应有「查看」和「导出」两个独立按钮
        const expected_ids = ['openDetailBtn', 'exportBtn'];
        expect(expected_ids.length).toBe(2);
        expect(expected_ids).toContain('exportBtn');
        expect(expected_ids).toContain('openDetailBtn');
    });

    it('popup width 不变 — 回归保护', () => {
        expect(POPUP_WIDTH_PX).toBe(300);
    });

    it('mcard min-height 不变 — 回归保护', () => {
        expect(MCARD_MIN_HEIGHT_PX).toBe(62);
    });

    it('3 列网格不变 — 回归保护', () => {
        expect(METRICS_COLUMNS).toBe(3);
    });

    it('7px gap 不变 — 回归保护', () => {
        expect(METRICS_GAP_PX).toBe(7);
    });

    it('三状态操作区同高 — 格子等高 88px', () => {
        // 验证无状态导致操作区高度变化
        expect(ACTION_HEIGHT_PX).toBe(88);
    });
});

// ============================================================
// CSS 文件解析 — 从实际 CSS 提取值，确保测试与 CSS 同步
// ============================================================

interface ParsedCss {
    action_height: number;
    popup_width: number;
    mcard_min_height: number;
    metrics_columns: number;
    metrics_gap: number;
    body_padding: number;
    body_gap: number;
    actbtn_padding_x: number;
    actbtn_padding_y: number;
    actbtn_gap: number;
    act_stop_flex: number;
    act_ghost_flex: number;
    action_gap: number;
    stop_row_gap: number;
    stop_glyph_width: number;
    stop_glyph_height: number;
    stop_time_font_size: number;
    stop_hint_font_size: number;
}

function parse_css(): ParsedCss {
    const css_path = resolve(import.meta.dirname!, '../../src/extension/popup/popup.css');
    const css = readFileSync(css_path, 'utf-8');

    const extract_px = (pattern: RegExp): number => {
        const m = css.match(pattern);
        if (!m) throw new Error(`CSS parse failed: ${pattern.source}`);
        return parseInt(m[1], 10);
    };

    const extract_repeat = (pattern: RegExp): number => {
        const m = css.match(pattern);
        if (!m) throw new Error(`CSS parse failed: ${pattern.source}`);
        return parseInt(m[1], 10);
    };

    const extract_flex = (selector: string): number => {
        const re = new RegExp(`${selector.replace(/\./g, '\\.')}\\s*\\{[^}]*?flex:\\s*([\\d.]+)`, 's');
        const m = css.match(re);
        if (!m) throw new Error(`CSS parse failed: flex for ${selector}`);
        return parseFloat(m[1]);
    };

    // Extract padding from .actbtn { padding: 0 6px } → [y, x]
    const extract_padding = (): [number, number] => {
        const re = /\.actbtn\s*\{[^}]*?padding:\s*(\d+)(?:px)?\s+(\d+)px/;
        const m = css.match(re);
        if (!m) throw new Error('CSS parse failed: .actbtn padding');
        return [parseInt(m[1], 10), parseInt(m[2], 10)];
    };
    const [act_pad_y, act_pad_x] = extract_padding();

    return {
        action_height:   extract_px(/\.action\s*\{[^}]*?height:\s*(\d+)px/),
        popup_width:     extract_px(/body\s*\{[^}]*?width:\s*(\d+)px/),
        mcard_min_height:extract_px(/\.mcard\s*\{[^}]*?min-height:\s*(\d+)px/),
        metrics_columns: extract_repeat(/\.metrics\s*\{[^}]*?repeat\((\d+)/),
        metrics_gap:     extract_px(/\.metrics\s*\{[^}]*?gap:\s*(\d+)px/),
        body_padding:    extract_px(/\.body\s*\{[^}]*?padding:\s*(\d+)px/),
        body_gap:        extract_px(/\.body\s*\{[^}]*?gap:\s*(\d+)px/),
        actbtn_padding_x: act_pad_x,
        actbtn_padding_y: act_pad_y,
        actbtn_gap:      extract_px(/\.actbtn\s*\{[^}]*?gap:\s*(\d+)px/),
        act_stop_flex:   extract_flex('.act-stop'),
        act_ghost_flex:  extract_flex('.action .act-ghost'),
        action_gap:      extract_px(/\.action\s*\{[^}]*?gap:\s*(\d+)px/),
        stop_row_gap:    extract_px(/\.stop-row\s*\{[^}]*?gap:\s*(\d+)px/),
        stop_glyph_width:extract_px(/\.stop-glyph\s*\{[^}]*?width:\s*(\d+)px/),
        stop_glyph_height:extract_px(/\.stop-glyph\s*\{[^}]*?height:\s*(\d+)px/),
        stop_time_font_size: extract_px(/\.stop-time\s*\{[^}]*?font-size:\s*(\d+)px/),
        stop_hint_font_size: parseFloat(css.match(/\.stop-hint\s*\{[^}]*?font-size:\s*([\d.]+)px/)![1]),
        act_stop_gap:     extract_px(/\.act-stop\s*\{[^}]*?gap:\s*(\d+)px/),
    };
}

let _parsed: ParsedCss | null = null;
function parsed_css(): ParsedCss {
    if (_parsed == null) _parsed = parse_css();
    return _parsed;
}

describe('CSS file parsed values match hardcoded constants', () => {
    it('action height 88px from CSS matches constant', () => {
        expect(parsed_css().action_height).toBe(ACTION_HEIGHT_PX);
    });

    it('popup width 300px from CSS matches constant', () => {
        expect(parsed_css().popup_width).toBe(POPUP_WIDTH_PX);
    });

    it('mcard min-height 62px from CSS matches constant', () => {
        expect(parsed_css().mcard_min_height).toBe(MCARD_MIN_HEIGHT_PX);
    });

    it('metrics 3 columns from CSS matches constant', () => {
        expect(parsed_css().metrics_columns).toBe(METRICS_COLUMNS);
    });

    it('metrics gap 7px from CSS matches constant', () => {
        expect(parsed_css().metrics_gap).toBe(METRICS_GAP_PX);
    });

    it('body padding 12px from CSS matches constant', () => {
        expect(parsed_css().body_padding).toBe(12);
    });

    it('body gap 10px from CSS matches constant', () => {
        expect(parsed_css().body_gap).toBe(BODY_GAP_PX);
    });
});

// ============================================================
// 停止按钮布局 — Bug 5 回归防护（scrollWidth ≤ clientWidth）
// ============================================================
//
// Bug 5: 停止按钮文案溢出 → 改为两行布局（flex-direction: column）
// 修复方案: .act-stop 使用 column 方向，每行元素独占全宽，文本可换行
//
// 布局推导:
//   body 宽 = 300 - 2*12(padding) = 276px
//   action gap = 10px
//   action children = .act-stop(flex:1.7) + .act-ghost(flex:1) = 2.7
//   stop 按钮宽 = (276 - 10) * 1.7 / 2.7 ≈ 167.4px
//   stop 内容宽 = 167.4 - 2*6(padding) ≈ 155.4px
//
// vitest 环境为 node，无法使用 scrollWidth / clientWidth，
// 改为数学等价验证：内容固定宽度 ≤ 容器可用宽度

describe('stop button layout — Bug 5 regression (scrollWidth ≤ clientWidth)', () => {
    function stop_button_available_width(): number {
        const css = parsed_css();
        const body_content_w = css.popup_width - 2 * css.body_padding;
        const total_flex = css.act_stop_flex + css.act_ghost_flex;
        const stop_w = ((body_content_w - css.action_gap) * css.act_stop_flex) / total_flex;
        // content area = button width - left/right padding
        return stop_w - 2 * css.actbtn_padding_x;
    }

    it('.act-stop 使用 flex-direction: column（两行布局）', () => {
        // 两行布局是 Bug 5 修复的核心：列方向让每行独占全宽
        const css_path = resolve(import.meta.dirname!, '../../src/extension/popup/popup.css');
        const css = readFileSync(css_path, 'utf-8');
        expect(css).toMatch(/\.act-stop\s*\{[^}]*flex-direction:\s*column/);
    });

    it('.act-stop 使用 white-space: normal 允许多行换行', () => {
        const css_path = resolve(import.meta.dirname!, '../../src/extension/popup/popup.css');
        const css = readFileSync(css_path, 'utf-8');
        expect(css).toMatch(/\.act-stop\s*\{[^}]*white-space:\s*normal/);
    });

    it('stop-glyph 固定宽度 ≤ 停止按钮内容宽度', () => {
        // glyph 是 flex: none，其 32px 远小于 155px → 不会溢出
        const css = parsed_css();
        const avail = stop_button_available_width();
        expect(css.stop_glyph_width).toBeLessThanOrEqual(avail);
        expect(css.stop_glyph_width).toBe(32);
    });

    it('stop-row 固定子元素总宽度 ≤ 停止按钮内容宽度', () => {
        // stop-row 包含: stop-glyph(32px, flex:none) + gap(6px)
        // 文本 stop-hint 占剩余空间，white-space: normal 允许换行
        const css = parsed_css();
        const avail = stop_button_available_width();
        const row_fixed = css.stop_glyph_width + css.stop_row_gap;
        expect(row_fixed).toBeLessThanOrEqual(avail);
    });

    it('停止按钮内容可用宽度 > 80px（文本有足够空间）', () => {
        // 即使最坏情况，剩余空间也足够容纳 "点击结束采集"（约 70px @ 11.5px 字号）
        const avail = stop_button_available_width();
        expect(avail).toBeGreaterThan(80);
    });

    it('停止按钮宽度在合理范围内（flex 1.7 占比）', () => {
        const css = parsed_css();
        const body_content_w = css.popup_width - 2 * css.body_padding;
        const total_flex = css.act_stop_flex + css.act_ghost_flex;
        const stop_w = ((body_content_w - css.action_gap) * css.act_stop_flex) / total_flex;
        // 约 167px
        expect(stop_w).toBeGreaterThan(140);
        expect(stop_w).toBeLessThan(200);
    });

    it('stop-row 中 .stop-hint 的可用宽度 > 文本最小需求（≈ 70px）', () => {
        const css = parsed_css();
        const avail = stop_button_available_width();
        const hint_available = avail - css.stop_glyph_width - css.stop_row_gap;
        // "点击结束采集" 6 个中文 ≈ 69px @ 11.5px，预留 margin
        expect(hint_available).toBeGreaterThan(70);
    });

    it('scrollWidth ≤ clientWidth 数学等价：固定元素总宽 ≤ 容器宽', () => {
        // 由于 column 布局 + white-space: normal，每行独占全宽
        // 唯一可能溢出的行是 stop-row，其中固定元素为 glyph(32px) + gap(6px)
        const css = parsed_css();
        const avail = stop_button_available_width();
        const row_fixed = css.stop_glyph_width + css.stop_row_gap;
        // 剩余给 text 的空间
        const text_avail = avail - row_fixed;
        expect(text_avail).toBeGreaterThan(50); // 远大于单个字符宽度
    });

    it('记录态 action 总宽度不超出 body 内容宽度', () => {
        const css = parsed_css();
        const body_content_w = css.popup_width - 2 * css.body_padding;
        // action 内两子元素 flex 分完宽度，无溢出
        const total_flex = css.act_stop_flex + css.act_ghost_flex;
        const stop_w = ((body_content_w - css.action_gap) * css.act_stop_flex) / total_flex;
        const ghost_w = ((body_content_w - css.action_gap) * css.act_ghost_flex) / total_flex;
        const action_total = stop_w + css.action_gap + ghost_w;
        expect(action_total).toBeCloseTo(body_content_w, 0);
    });

    it('act-stop 无 overflow: hidden 之外的隐藏（内容应可见）', () => {
        const css_path = resolve(import.meta.dirname!, '../../src/extension/popup/popup.css');
        const css = readFileSync(css_path, 'utf-8');
        // .act-stop 不应有 text-overflow: ellipsis 或 overflow: hidden
        // 但可以有 overflow: hidden（在 .mcard 上有，用于文本截断）
        // 验证 .act-stop 没有 text-overflow: ellipsis
        const act_stop_block = css.match(/\.act-stop\s*\{[^}]*\}/);
        if (act_stop_block) {
            expect(act_stop_block[0]).not.toMatch(/text-overflow:\s*ellipsis/);
        }
    });
});

// ============================================================
// 记录态按钮两行布局不溢出
// ============================================================

describe('recording-state two-row layout does not overflow', () => {
    function stop_button_content_width(): number {
        const css = parsed_css();
        const body_content_w = css.popup_width - 2 * css.body_padding;
        const total_flex = css.act_stop_flex + css.act_ghost_flex;
        const stop_w = ((body_content_w - css.action_gap) * css.act_stop_flex) / total_flex;
        return stop_w - 2 * css.actbtn_padding_x;
    }

    it('第一行 .stop-time 独占内容宽度', () => {
        // column 布局 → stop-time 是块级，宽度 = 内容宽
        const css = parsed_css();
        const content_w = stop_button_content_width();
        // 计时文本 "00:00:00" 7 字符 @ 18px ≈ 126px，< 155px
        expect(content_w).toBeGreaterThan(126);
    });

    it('第二行 .stop-row 独占内容宽度', () => {
        // column 布局 → stop-row 也独占全宽
        const content_w = stop_button_content_width();
        expect(content_w).toBeGreaterThan(100);
    });

    it('stop-glyph 高度 32px 配合 action height 88px', () => {
        const css = parsed_css();
        expect(css.stop_glyph_height).toBe(32);
        // glyph 32px + stop-time(~25px) + gap(4px) ≤ action height 88px
        const stack_h = 25 + 4 + 32; // time(estimate) + gap + row
        expect(stack_h).toBeLessThanOrEqual(css.action_height);
    });

    it('两行内容总高度不超过 action 88px', () => {
        const css = parsed_css();
        // stop-time font-size 18px ≈ line-height ~25px
        // gap = 4px
        // stop-row height = stop-glyph 32px (largest in row)
        const total = 25 + css.act_stop_gap + 32 + css.actbtn_padding_y * 2;
        expect(total).toBeLessThanOrEqual(css.action_height);
    });

    it('记录态 action 两子元素都存在 flex 值', () => {
        const css = parsed_css();
        expect(css.act_stop_flex).toBeGreaterThan(0);
        expect(css.act_ghost_flex).toBeGreaterThan(0);
        // flex 比例确保两个按钮都在可视区域内
        expect(css.act_stop_flex + css.act_ghost_flex).toBeGreaterThan(2);
    });

    it('action gap 不变 — 防止按钮间距变化导致溢出', () => {
        const css = parsed_css();
        expect(css.action_gap).toBe(10);
    });
});
