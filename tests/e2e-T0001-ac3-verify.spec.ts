// tests/e2e-T0001-ac3-verify.spec.ts — AC-3 专项验证：缩放复位后所有标记可见
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe('T0001 AC-3 修复验证', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('AC-3: 切换列表再切回轨道视图，缩放复位且所有标记可见', async () => {
        const popup = await open_popup(fix);
        await popup.waitForTimeout(300);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(4000);
        const kw = site.locator('#kw');
        if (await kw.isVisible({ timeout: 3000 }).catch(() => false)) {
            await kw.click();
            await kw.fill('test');
            await site.locator('#su').click();
            await site.waitForTimeout(5000);
        }
        await site.close();

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(2000);
        await expect(popup.locator('.act-done')).toBeVisible();

        const [detail] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await detail.waitForLoadState('domcontentloaded');
        await detail.waitForTimeout(2500);
        await popup.close();

        const first_row = detail.locator('.dt-row').first();
        if (await first_row.isVisible({ timeout: 3000 }).catch(() => false)) {
            await first_row.click();
            await detail.waitForTimeout(1500);
        }

        const trace_btn = detail.locator('[data-view="trace"]');
        if (await trace_btn.isVisible({ timeout: 2000 })) {
            await trace_btn.click();
            await detail.waitForTimeout(1000);
        }

        await detail.waitForSelector('#tlLanes', { state: 'visible', timeout: 5000 }).catch(() => {});
        await detail.waitForTimeout(500);

        const slider = detail.locator('#tlZoom');
        await expect(slider).toBeVisible({ timeout: 5000 });

        // 改为非默认值
        await slider.fill('80');
        await detail.waitForTimeout(600);

        const val_modified = await detail.evaluate(() => {
            const sl = document.getElementById('tlZoom') as HTMLInputElement | null;
            return sl ? Number(sl.value) : -1;
        });
        expect(val_modified, '修改后 slider 应为 80').toBe(80);

        // 切到 list
        const list_btn = detail.locator('[data-view="list"]');
        await expect(list_btn).toBeVisible({ timeout: 3000 });
        await list_btn.click();
        await detail.waitForTimeout(600);

        // 切回 trace
        const trace_btn2 = detail.locator('[data-view="trace"]');
        await expect(trace_btn2).toBeVisible({ timeout: 3000 });
        await trace_btn2.click();
        await detail.waitForTimeout(1000);

        await detail.waitForSelector('#tlLanes', { state: 'visible', timeout: 5000 }).catch(() => {});
        await detail.waitForTimeout(500);

        // 读取状态
        const val_restored = await detail.evaluate(() => {
            const sl = document.getElementById('tlZoom') as HTMLInputElement | null;
            return sl ? Number(sl.value) : -1;
        });

        const hidden_count = await detail.evaluate(() => {
            return document.querySelectorAll('#tlLanes .tl-hidden').length;
        });
        const visible_count = await detail.evaluate(() => {
            const ticks = document.querySelectorAll('.tl-tick');
            let count = 0;
            ticks.forEach((t) => { if (!t.classList.contains('tl-hidden')) count++; });
            return count;
        });
        const total_ticks = await detail.evaluate(() => document.querySelectorAll('.tl-tick').length);

        console.log(`[AC-3] total=${total_ticks} visible=${visible_count} hidden=${hidden_count} slider=${val_restored}`);

        if (hidden_count > 0) {
            const hidden_info = await detail.evaluate(() => {
                const hidden = document.querySelectorAll('#tlLanes .tl-hidden');
                const infos: string[] = [];
                hidden.forEach((el) => {
                    const h = el as HTMLElement;
                    infos.push(`left=${h.style.left} lane=${h.closest('.tl-lane')?.getAttribute('data-lane') || '?'}`);
                });
                return infos.join(' | ');
            });
            console.log(`[AC-3] Hidden marker details: ${hidden_info}`);
        }

        // 硬门
        expect(hidden_count, 'AC-3: 复位后不应有隐藏标记').toBe(0);
        expect(visible_count, 'AC-3: 所有标记应可见').toBe(total_ticks);

        await detail.close();
    });
});
