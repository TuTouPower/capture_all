// tests/e2e-consistency.spec.ts — popup 与 dashboard 7标签名称/顺序/计数一致性
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES, REQUIRED_LABELS } from './e2e-helpers';

test.describe('Popup-Dashboard 一致性 P4.9', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('完成采集 → popup 7标签名+计数 → dashboard 对比 → 完全一致', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);

        // 开始采集
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 在百度搜索触发各类事件
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(3000);
        const search_input = site.locator('#kw');
        if (await search_input.isVisible({ timeout: 3000 }).catch(() => false)) {
            await search_input.click();
            await search_input.fill('capture all consistency test');
            await site.locator('#su').click();
            await site.waitForTimeout(4000);
        }
        await site.close();

        // 停止采集
        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 读取 popup 的 7 标签名称和计数（跳过第8个 mask 卡）
        const popup_labels = await popup.evaluate(() => {
            const cards = document.querySelectorAll('.mcard');
            const result: { label: string; count: number }[] = [];
            cards.forEach((card) => {
                const lbl = card.querySelector('.mcard-lbl')?.textContent?.trim() || '';
                const n = card.querySelector('.mcard-n')?.textContent?.trim() || '';
                const data_key = (card as HTMLElement).dataset.key;
                if (data_key && data_key !== 'mask') {
                    result.push({ label: lbl, count: parseInt(n.replace(/,/g, ''), 10) || 0 });
                }
            });
            return result;
        });

        expect(popup_labels.length, 'popup 应有 7 个数据标签').toBe(7);

        // 打开 dashboard 详情
        const [detail_page] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await detail_page.waitForLoadState('domcontentloaded');
        await detail_page.waitForTimeout(2000);

        // 读取 dashboard 概览页的 7 标签名称和计数
        const dashboard_labels = await detail_page.evaluate(() => {
            // dt-metrics 区域（详情页顶部指标按钮）
            const metrics = document.querySelectorAll('.dt-metric');
            if (metrics.length >= 7) {
                const result: { label: string; count: number }[] = [];
                metrics.forEach((m) => {
                    const lbl = m.querySelector('.dt-metric-lbl')?.textContent?.trim() || '';
                    const val = m.querySelector('.dt-metric-val')?.textContent?.trim() || '';
                    result.push({ label: lbl, count: parseInt(val.replace(/,/g, ''), 10) || 0 });
                });
                return result.slice(0, 7);
            }
            // fallback: overview 面板中的 rel-row
            const rel_rows = document.querySelectorAll('.rel-row');
            const result: { label: string; count: number }[] = [];
            rel_rows.forEach((row) => {
                const t = row.querySelector('.rel-t')?.textContent?.trim() || '';
                const ev = row.querySelector('.rel-ev')?.textContent?.trim() || '';
                if (ev && result.length < 7) {
                    result.push({ label: ev, count: parseInt(t.replace(/,/g, ''), 10) || 0 });
                }
            });
            return result;
        });

        expect(dashboard_labels.length, 'dashboard 应有 7 个指标').toBe(7);

        // 验证 dashboard 标签名称与 REQUIRED_LABELS 一致（dashboard 硬编码中文）
        for (let i = 0; i < REQUIRED_LABELS.length; i++) {
            expect(dashboard_labels[i].label, `dashboard 第${i}个标签应为 ${REQUIRED_LABELS[i]}`)
                .toBe(REQUIRED_LABELS[i]);
        }

        // 逐项对比计数：popup 与 dashboard 按索引一一对应
        // 允许 <=1 差异（popup 在 stop 时快照，dashboard 在 flush_all 后读取，
        // stopped_event 可能导致 event_count +1）
        for (let i = 0; i < 7; i++) {
            const diff = Math.abs(dashboard_labels[i].count - popup_labels[i].count);
            expect(diff, `dashboard "${dashboard_labels[i].label}" 计数(${dashboard_labels[i].count})与 popup(${popup_labels[i].count})差异应<=1`)
                .toBeLessThanOrEqual(1);
        }

        await detail_page.close();
        await popup.close();
    });
});
