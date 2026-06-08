// tests/e2e-ui-audit.spec.ts — UI 审计：无旧概念残留
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, FORBIDDEN_STRINGS } from './e2e-helpers';

test.describe.serial('UI 审计', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('popup 不包含任何旧概念字符串', async () => {
        const popup = await open_popup(fix);

        // 检查状态 1
        let html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `状态 1: 不应包含 "${s}"`).not.toContain(s);
        }

        // 状态 2
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(1000);
        html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `状态 2: 不应包含 "${s}"`).not.toContain(s);
        }

        // 停止并检查状态 3
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        html = await popup.innerHTML('body');
        for (const s of FORBIDDEN_STRINGS) {
            expect(html, `状态 3: 不应包含 "${s}"`).not.toContain(s);
        }

        await popup.close();
    });

    test('popup 标题正确', async () => {
        const popup = await open_popup(fix);
        const title = await popup.title();
        expect(title).toMatch(/Capture All|全采/);
        await popup.close();
    });

    test('开始按钮有渐变背景', async () => {
        const popup = await open_popup(fix);
        const start_btn = popup.locator('#startBtn');
        await expect(start_btn).toBeVisible();
        const bg = await start_btn.evaluate(el => getComputedStyle(el).backgroundImage);
        expect(bg, '按钮应有渐变背景').toContain('gradient');
        await popup.close();
    });
});
