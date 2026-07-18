// tests/e2e-dashboard-list.spec.ts — 采集列表：3条记录 / 无旧概念列 / 无旧卡片 / 空态验证
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

// 从 FORBIDDEN_STRINGS 中剔除 "记录"（"采集记录"是合法 UI 文案）
const FORBIDDEN_CHECK = ['深度采集', '标准采集', '就绪', 'Record All', 'record_all', '录制'];

test.describe('Dashboard 空态 P4.11', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('无采集记录时 dashboard 显示空态占位 + 计数为 0 且不崩溃', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded' });
        await dashboard.waitForTimeout(2000);

        // 有空态占位文案
        const body_text = await dashboard.innerText('body');
        expect(body_text).toContain('暂无采集记录');

        // 计数为 0
        expect(body_text).toContain('共 0 条');

        // 无数据行
        const rows = dashboard.locator('tr[data-open]');
        await expect(rows).toHaveCount(0);

        await dashboard.close();
    });

    test('弹窗无最近采集时显示空态占位', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);

        const body_text = await popup.innerText('body');
        // recent_empty 占位 — i18n key noCaptures，默认 locale='en'
        expect(body_text).toContain('No captures yet');

        await popup.close();
    });
});

test.describe('Dashboard 采集列表 P4.10', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('完成3次采集 → 列表显示3条 → 无"模式"列 → 无模式筛选 → 无"当前采集中"卡片', async () => {
        // 执行 3 次采集
        for (let i = 0; i < 3; i++) {
            const popup = await open_popup(fix);
            await popup.waitForTimeout(300);

            await popup.locator('#startBtn').click();
            await popup.waitForTimeout(500);

            const site_url = i === 0 ? TEST_SITES.baidu
                : i === 1 ? TEST_SITES.qq
                : TEST_SITES.sina;
            const site = await open_site(fix, site_url);
            await site.waitForTimeout(3000);
            await site.close();

            await popup.bringToFront();
            await popup.waitForTimeout(500);
            await popup.locator('#stopBtn').click();
            await popup.waitForTimeout(1500);
            await expect(popup.locator('.act-done')).toBeVisible();

            if (i < 2) {
                // 开始新采集
                await popup.locator('#newBtn').click();
                await popup.waitForTimeout(500);
            }
            await popup.close();
        }

        // 打开 dashboard 主面板（采集列表）
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.evaluate(() => {
                (document.querySelector('#panelBtn') as HTMLElement)?.click();
            }),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 验证采集列表有 3 条记录
        const rows = dashboard.locator('tr[data-open]');
        const row_count = await rows.count();
        expect(row_count, '采集列表应有不少于 3 条记录').toBeGreaterThanOrEqual(3);

        // 验证无"模式"列：表头不应包含"模式"
        const headers = dashboard.locator('th');
        const header_texts: string[] = [];
        const h_count = await headers.count();
        for (let i = 0; i < h_count; i++) {
            header_texts.push((await headers.nth(i).textContent()) || '');
        }
        const mode_in_headers = header_texts.some((t) => t.includes('模式'));
        expect(mode_in_headers, '表头不应包含"模式"列').toBe(false);

        // 验证无模式筛选器
        const filter_bar = await dashboard.locator('.cap-filterbar').textContent();
        expect(filter_bar, '筛选栏不应含"模式"').not.toContain('模式');

        // 验证无「当前采集中」卡片
        const body_html = await dashboard.innerHTML('body');
        expect(body_html, '页面不应含"当前采集中"').not.toContain('当前采集中');
        expect(body_html, '页面不应含"深度采集"').not.toContain('深度采集');
        expect(body_html, '页面不应含"标准采集"').not.toContain('标准采集');

        // 验证禁止字符串都不出现（不包括"记录"，因"采集记录"是合法文案）
        for (const s of FORBIDDEN_CHECK) {
            expect(body_html, `页面不应含禁止字符串: "${s}"`).not.toContain(s);
        }

        await dashboard.close();
        await popup.close();
    });
});
