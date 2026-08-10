// tests/unit/popup_category_capture_gates.test.ts
// 验证 popup 分类开关映射到采集门控（P1-9）
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sw_src = readFileSync(resolve(__dirname, '..', '..', 'src', 'extension', 'background', 'service_worker.ts'), 'utf8');
const content_src = readFileSync(resolve(__dirname, '..', '..', 'src', 'extension', 'content', 'content_script.ts'), 'utf8');
const popup_src = readFileSync(resolve(__dirname, '..', '..', 'src', 'extension', 'popup', 'popup.ts'), 'utf8');

describe('popup 分类开关门控 (T106)', () => {
    test('AC-001: capture_network 开关映射到 config 且 SW 尊重', () => {
        expect(popup_src).toMatch(/capture_network:\s*toggles\.request_count !== false/);
        expect(sw_src).toMatch(/if \(config\.capture_network\) \{\s*start_network_capture/);
    });

    test('AC-002: 类别开关映射到采集门控（cookie/storage/error/event/nav）', () => {
        // SW cookie 门控
        expect(sw_src).toMatch(/cookie_change_count_enabled !== false\) \{\s*start_cookie_capture/);
        // SW exception 门控（error_count_enabled 独立于 console，含重试路径）
        expect(sw_src).toMatch(/error_count_enabled !== false\)/);
        expect(sw_src).toMatch(/current_config\.error_count_enabled !== false && !is_exception_active\(\)/);
        // content dom（用户行为）/ storage 门控
        expect(content_src).toMatch(/event_count_enabled !== false\) \{\s*start_mouse_capture/);
        expect(content_src).toMatch(/storage_change_count_enabled !== false\) \{\s*start_storage_capture/);
        // content 导航门控（page_load + handler + visibility）
        expect(content_src).toMatch(/nav_count_enabled !== false\)/);
        expect(content_src).toMatch(/if \(!nav_enabled\) return;/);
        // background 导航门控（tab_switch/tab_created/tab_url_change）
        expect(sw_src).toMatch(/nav_count_enabled === false\) return; \/\/ T106/);
    });

    test('AC-003: 开关缺省视为开启（回归）', () => {
        expect(sw_src).toMatch(/cookie_change_count_enabled !== false/);
        expect(sw_src).toMatch(/error_count_enabled !== false/);
        expect(content_src).toMatch(/event_count_enabled !== false/);
        expect(content_src).toMatch(/storage_change_count_enabled !== false/);
    });
});
