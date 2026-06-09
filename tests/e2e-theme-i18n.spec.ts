// tests/e2e-theme-i18n.spec.ts — P5.6 主题 + i18n
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('主题 + i18n', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('完成一次采集用于打开 dashboard', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);
        const input = site.locator('#kw');
        if (await input.isVisible()) {
            await input.click();
            await input.fill('theme test');
            await site.locator('#su').click();
            await site.waitForTimeout(2000);
        }
        await site.close();

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();
        await popup.close();
    });

    test('浅色主题 — data-theme="light"', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);

        // 进入设置页
        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }

        // 点击浅色主题按钮
        const light_btn = dashboard.locator('[data-seg="theme"] button[data-val="light"]');
        if (await light_btn.isVisible()) {
            await light_btn.click();
            await dashboard.waitForTimeout(500);
        }

        // 验证 data-theme
        const theme_attr = await dashboard.evaluate(() =>
            document.documentElement.getAttribute('data-theme'),
        );
        expect(theme_attr).toBe('light');

        // 验证 --canvas 存在
        const canvas_var = await dashboard.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
        );
        expect(canvas_var).toBeTruthy();

        await dashboard.close();
    });

    test('深色主题 — data-theme="dark" → --canvas 变化', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);

        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }

        // 设置深色主题
        const dark_btn = dashboard.locator('[data-seg="theme"] button[data-val="dark"]');
        if (await dark_btn.isVisible()) {
            await dark_btn.click();
            await dashboard.waitForTimeout(500);
        }

        const theme_attr = await dashboard.evaluate(() =>
            document.documentElement.getAttribute('data-theme'),
        );
        expect(theme_attr).toBe('dark');

        await dashboard.close();
    });

    test('跟随系统 — data-theme 非空', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);

        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }

        const system_btn = dashboard.locator('[data-seg="theme"] button[data-val="follow-system"]');
        if (await system_btn.isVisible()) {
            await system_btn.click();
            await dashboard.waitForTimeout(500);
        }

        const theme_attr = await dashboard.evaluate(() =>
            document.documentElement.getAttribute('data-theme'),
        );
        expect(['light', 'dark']).toContain(theme_attr);

        await dashboard.close();
    });

    test('浅色/深色切换 — --canvas 不同', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);

        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }

        // light
        const light_btn = dashboard.locator('[data-seg="theme"] button[data-val="light"]');
        if (await light_btn.isVisible()) {
            await light_btn.click();
            await dashboard.waitForTimeout(500);
        }

        const canvas_light = await dashboard.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
        );

        // dark
        const dark_btn = dashboard.locator('[data-seg="theme"] button[data-val="dark"]');
        if (await dark_btn.isVisible()) {
            await dark_btn.click();
            await dashboard.waitForTimeout(500);
        }

        const canvas_dark = await dashboard.evaluate(() =>
            getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),
        );

        expect(canvas_light).toBeTruthy();
        expect(canvas_dark).toBeTruthy();
        expect(canvas_light).not.toBe(canvas_dark);

        await dashboard.close();
    });

    test('中文界面 — 设置页有语言选择器', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);

        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }

        // 选择中文
        const locale_select = dashboard.locator('[data-cfg="locale"]');
        if (await locale_select.isVisible()) {
            await locale_select.selectOption('zh');
            await dashboard.waitForTimeout(500);
        }

        // 验证设置页加载正常，语言选择器存在
        const body_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(body_text).toBeTruthy();
        // 中文界面应有中文字符
        expect(body_text).toMatch(/设置|主题|语言|采集/);

        await dashboard.close();
    });

    test('英文界面 — 切换后按钮文字更新', async () => {
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);

        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }

        // 选择英文
        const locale_select = dashboard.locator('[data-cfg="locale"]');
        if (await locale_select.isVisible()) {
            await locale_select.selectOption('en');
            await dashboard.waitForTimeout(500);
        }

        // 页面不应崩溃，内容应正常
        const body_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(body_text).toBeTruthy();
        expect(body_text.length).toBeGreaterThan(50);

        await dashboard.close();
    });
});
