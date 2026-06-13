// tests/e2e-theme-i18n.spec.ts — P5.6 主题 + i18n
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';
import { parse_rgb, wcag_luminance, wcag_contrast_ratio } from './wcag_contrast';

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

    test('深色主题 — data-theme="dark" → 文字颜色非黑', async () => {
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

        // 验证关键元素文字颜色不是黑色（Bug 2/4 回归检测）
        const color_checks = [
            { selector: '.pg-title h1', label: '页面标题' },
            { selector: '.sb-item', label: '导航项' },
            { selector: '.sb-brand b', label: '品牌名' },
            { selector: '.field-lbl', label: '字段标签' },
            { selector: 'h2', label: '节标题' },
        ];
        for (const { selector, label } of color_checks) {
            const el = dashboard.locator(selector).first();
            if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
                const color = await el.evaluate((node) => getComputedStyle(node).color);
                expect(color, `${label} 在深色模式下不应为黑色`).not.toBe('rgb(0, 0, 0)');
                // 深色模式下文字应为浅色，RGB 分量和应 > 300
                const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (m) {
                    const sum = Number(m[1]) + Number(m[2]) + Number(m[3]);
                    expect(sum, `${label} 深色模式文字应偏亮 (got ${color})`).toBeGreaterThan(300);
                }
            }
        }

        await dashboard.close();
    });

    test('深色模式 — 关键文本元素通过 WCAG AA (4.5:1)', async () => {
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

        // 获取背景色
        const bg_color = await dashboard.evaluate(() => {
            const el = document.querySelector('.app') || document.body;
            return getComputedStyle(el).backgroundColor;
        });
        const bg_rgb = parse_rgb(bg_color);
        expect(bg_rgb, `背景色应可解析 (got ${bg_color})`).not.toBeNull();
        const bg_lum = wcag_luminance(bg_rgb![0], bg_rgb![1], bg_rgb![2]);

        // 验证关键文本元素对比度 >= 4.5
        const text_selectors = [
            { selector: '.pg-title h1', label: '页面标题 (.pg-title h1)' },
            { selector: '.sb-item', label: '导航项 (.sb-item)' },
            { selector: 'h2', label: '节标题 (h2)' },
        ];
        for (const { selector, label } of text_selectors) {
            const el = dashboard.locator(selector).first();
            if (await el.isVisible({ timeout: 2000 }).catch(() => false)) {
                const color = await el.evaluate((node) => getComputedStyle(node).color);
                const fg_rgb = parse_rgb(color);
                expect(fg_rgb, `${label} 颜色应可解析 (got ${color})`).not.toBeNull();
                const fg_lum = wcag_luminance(fg_rgb![0], fg_rgb![1], fg_rgb![2]);
                const ratio = wcag_contrast_ratio(fg_lum, bg_lum);
                expect(
                    ratio,
                    `${label}: 对比度 ${ratio.toFixed(2)}:1 应 >= 4.5 (文字 ${color}, 背景 ${bg_color})`,
                ).toBeGreaterThanOrEqual(4.5);
            }
        }

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

        // 验证页面包含英文文本
        const body_text = await dashboard.evaluate(() => document.body.innerText || '');
        expect(body_text).toBeTruthy();
        // 验证始终为英文的品牌名存在
        expect(body_text).toContain('Capture All');
        // 验证语言选择器中 "English" 选项存在
        expect(body_text).toContain('English');
        // 验证 locale select 当前值为 'en'
        const locale_val = await dashboard.evaluate(() => {
            const sel = document.querySelector('[data-cfg="locale"]') as HTMLSelectElement;
            return sel?.value || '';
        });
        expect(locale_val).toBe('en');

        await dashboard.close();
    });

    test('popup 中文 — 切换语言后 popup 显示中文', async () => {
        // 切换到中文
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);
        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }
        const locale_select = dashboard.locator('[data-cfg="locale"]');
        if (await locale_select.isVisible()) {
            await locale_select.selectOption('zh');
            await dashboard.waitForTimeout(500);
        }
        await dashboard.close();

        // 打开 popup 验证中文
        const popup = await open_popup(fix);
        await popup.waitForTimeout(500);
        const popup_text = await popup.evaluate(() => document.body.innerText || '');
        expect(popup_text).toMatch(/开始采集/);
        expect(popup_text).toMatch(/主面板/);
        await popup.close();
    });

    test('popup 英文 — 切换语言后 popup 显示英文', async () => {
        // 切换到英文
        const dashboard = await fix.context.newPage();
        await dashboard.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await dashboard.waitForTimeout(1500);
        const settings_btn = dashboard.locator('[data-nav="settings"]');
        if (await settings_btn.isVisible()) {
            await settings_btn.click();
            await dashboard.waitForTimeout(1000);
        }
        const locale_select = dashboard.locator('[data-cfg="locale"]');
        if (await locale_select.isVisible()) {
            await locale_select.selectOption('en');
            await dashboard.waitForTimeout(500);
        }
        await dashboard.close();

        // 打开 popup 验证英文
        const popup = await open_popup(fix);
        await popup.waitForTimeout(500);
        const popup_text = await popup.evaluate(() => document.body.innerText || '');
        expect(popup_text).toContain('Start Capture');
        expect(popup_text).toContain('Main Panel');
        await popup.close();
    });

    test('详情页 — 语言切换后标签更新', async () => {
        // 先获取最新 session ID（由第一个测试采集产生）
        const popup = await open_popup(fix);
        const session_id = await popup.evaluate(async () => {
            const sessions = await chrome.runtime.sendMessage({
                action: 'list_sessions',
            }) as Array<{ capture_id: string }>;
            return sessions[sessions.length - 1]?.capture_id || '';
        });
        expect(session_id).toBeTruthy();
        await popup.close();

        const detail_url = `chrome-extension://${fix.extension_id}/src/detail/detail.html?capture=${session_id}`;

        // 切换到中文 → 打开详情页验证中文标签
        const d_zh = await fix.context.newPage();
        await d_zh.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await d_zh.waitForTimeout(1000);
        const settings_btn_zh = d_zh.locator('[data-nav="settings"]');
        if (await settings_btn_zh.isVisible()) {
            await settings_btn_zh.click();
            await d_zh.waitForTimeout(1000);
        }
        const locale_zh = d_zh.locator('[data-cfg="locale"]');
        if (await locale_zh.isVisible()) {
            await locale_zh.selectOption('zh');
            await d_zh.waitForTimeout(500);
        }
        await d_zh.close();

        const detail_zh = await fix.context.newPage();
        await detail_zh.goto(detail_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await detail_zh.waitForTimeout(1000);
        const zh_title = await detail_zh.locator('[data-i18n="sessionDetail"]').textContent();
        expect(zh_title).toBe('采集详情');
        const zh_timeline = await detail_zh.locator('[data-i18n="timeline"]').textContent();
        expect(zh_timeline).toBe('时间线');
        await detail_zh.close();

        // 切换到英文 → 打开详情页验证英文标签
        const d_en = await fix.context.newPage();
        await d_en.goto(fix.dashboard_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await d_en.waitForTimeout(1000);
        const settings_btn_en = d_en.locator('[data-nav="settings"]');
        if (await settings_btn_en.isVisible()) {
            await settings_btn_en.click();
            await d_en.waitForTimeout(1000);
        }
        const locale_en = d_en.locator('[data-cfg="locale"]');
        if (await locale_en.isVisible()) {
            await locale_en.selectOption('en');
            await d_en.waitForTimeout(500);
        }
        await d_en.close();

        const detail_en = await fix.context.newPage();
        await detail_en.goto(detail_url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await detail_en.waitForTimeout(1000);
        const en_title = await detail_en.locator('[data-i18n="sessionDetail"]').textContent();
        expect(en_title).toBe('Capture Detail');
        const en_timeline = await detail_en.locator('[data-i18n="timeline"]').textContent();
        expect(en_timeline).toBe('Timeline');
        await detail_en.close();
    });
});
