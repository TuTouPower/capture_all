import { expect, test } from '@playwright/test';
import { launch_extension } from '../../tests/e2e-helpers';

const EXPECTED_NAV_ITEMS = ['采集记录', '当前采集', '导出任务', '设置'];

test.describe('T0003 dashboard 导航与设置集成', () => {
    let fixture: Awaited<ReturnType<typeof launch_extension>>;

    test.beforeAll(async () => {
        fixture = await launch_extension();
    });

    test.afterAll(async () => {
        await fixture.context.close();
    });

    test('AC-1 dashboard 侧边栏仅显示 4 个指定入口', async () => {
        const dashboard = await fixture.context.newPage();
        await dashboard.goto(fixture.dashboard_url, { waitUntil: 'domcontentloaded' });

        const nav_items = dashboard.locator('.sb-item');
        await expect(nav_items).toHaveCount(4);
        await expect(nav_items).toHaveText(EXPECTED_NAV_ITEMS);
        await expect(dashboard.locator('.sb-item').filter({ hasText: /MCP|集成/ })).toHaveCount(0);

        await dashboard.close();
    });

    test('AC-2 设置页显示 MCP Bridge 集成配置', async () => {
        const dashboard = await fixture.context.newPage();
        await dashboard.goto(fixture.dashboard_url, { waitUntil: 'domcontentloaded' });
        await dashboard.locator('.sb-item').filter({ hasText: '设置' }).click();

        await expect(dashboard.locator('#set-integrations')).toBeVisible();
        await expect(dashboard.locator('[data-sw="agent_bridge_enabled"]')).toBeVisible();
        await expect(dashboard.locator('[data-cfg="agent_bridge_url"]')).toBeVisible();
        await expect(dashboard.locator('[data-cfg="agent_bridge_poll_interval_ms"]')).toBeVisible();

        // agent_bridge_token 在折叠的高级选项中，需先展开
        await dashboard.locator('#bridgeAdvToggle').click();
        await dashboard.waitForTimeout(300);
        await expect(dashboard.locator('[data-cfg="agent_bridge_token"]')).toBeVisible();

        await dashboard.close();
    });
});
