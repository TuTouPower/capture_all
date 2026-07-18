// @vitest-environment jsdom
// tests/sidebar_resize.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub localStorage
const store: Record<string, string> = {};
const mock_storage = {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear: vi.fn(() => { for (const k of Object.keys(store)) delete store[k]; }),
};
vi.stubGlobal('localStorage', mock_storage);

// Stub document.documentElement.style.setProperty
const css_vars: Record<string, string> = {};
const mock_style = {
    setProperty: vi.fn((k: string, v: string) => { css_vars[k] = v; }),
    getPropertyValue: vi.fn((k: string) => css_vars[k] ?? ''),
};
Object.defineProperty(document.documentElement, 'style', { value: mock_style, configurable: true });

// Import after stubs
import { wire_sidebar_resize } from '../src/extension/dashboard/sidebar_resize';

function create_handle(): HTMLElement {
    const el = document.createElement('div');
    document.body.appendChild(el);
    return el;
}

describe('sidebar_resize', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        for (const k of Object.keys(store)) delete store[k];
        for (const k of Object.keys(css_vars)) delete css_vars[k];
    });

    it('从 localStorage 读取已保存宽度并设置 CSS 变量', () => {
        store['sidebar_width'] = '280';
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'sidebar_width',
            css_var: '--sidebar-w',
            default_px: 232,
            min_px: 160,
            max_px: 400,
        });
        expect(mock_style.setProperty).toHaveBeenCalledWith('--sidebar-w', '280px');
    });

    it('无 localStorage 值时使用默认宽度', () => {
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'sidebar_width',
            css_var: '--sidebar-w',
            default_px: 232,
            min_px: 160,
            max_px: 400,
        });
        expect(mock_style.setProperty).toHaveBeenCalledWith('--sidebar-w', '232px');
    });

    it('mousemove 拖拽更新 CSS 变量', () => {
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'sidebar_width',
            css_var: '--sidebar-w',
            default_px: 232,
            min_px: 160,
            max_px: 400,
        });
        // Simulate mousedown
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 232 }));
        // Simulate mousemove
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 280 }));
        expect(mock_style.setProperty).toHaveBeenCalledWith('--sidebar-w', '280px');
        // Cleanup
        window.dispatchEvent(new MouseEvent('mouseup'));
    });

    it('宽度 clamp 到 min/max', () => {
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'sidebar_width',
            css_var: '--sidebar-w',
            default_px: 232,
            min_px: 160,
            max_px: 400,
        });
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 232 }));
        // Drag below min
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50 }));
        expect(mock_style.setProperty).toHaveBeenCalledWith('--sidebar-w', '160px');
        // Drag above max
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 999 }));
        expect(mock_style.setProperty).toHaveBeenCalledWith('--sidebar-w', '400px');
        window.dispatchEvent(new MouseEvent('mouseup'));
    });

    it('mouseup 保存到 localStorage', () => {
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'sidebar_width',
            css_var: '--sidebar-w',
            default_px: 232,
            min_px: 160,
            max_px: 400,
        });
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 232 }));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
        window.dispatchEvent(new MouseEvent('mouseup'));
        expect(mock_storage.setItem).toHaveBeenCalledWith('sidebar_width', '300');
    });

    it('settings_nav_width 默认方向：鼠标右移 = 变宽', () => {
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'settings_nav_width',
            css_var: '--set-nav-w',
            default_px: 196,
            min_px: 140,
            max_px: 320,
        });
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 200 }));
        // Moving right = wider (default direction)
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 256 }));
        // 196 + (256 - 200) = 252
        expect(mock_style.setProperty).toHaveBeenCalledWith('--set-nav-w', '252px');
        window.dispatchEvent(new MouseEvent('mouseup'));
    });

    it('direction=left 时反向计算宽度', () => {
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'right_panel_width',
            css_var: '--right-panel-w',
            default_px: 300,
            min_px: 200,
            max_px: 500,
            direction: 'left',
        });
        handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 200 }));
        // Moving right = narrower (left direction)
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 256 }));
        // 300 - (256 - 200) = 244
        expect(mock_style.setProperty).toHaveBeenCalledWith('--right-panel-w', '244px');
        window.dispatchEvent(new MouseEvent('mouseup'));
    });

    it('双击 handle 重置为默认宽度', () => {
        store['sidebar_width'] = '300';
        const handle = create_handle();
        wire_sidebar_resize({
            handle,
            storage_key: 'sidebar_width',
            css_var: '--sidebar-w',
            default_px: 232,
            min_px: 160,
            max_px: 400,
        });
        handle.dispatchEvent(new MouseEvent('dblclick'));
        expect(mock_style.setProperty).toHaveBeenCalledWith('--sidebar-w', '232px');
        expect(mock_storage.setItem).toHaveBeenCalledWith('sidebar_width', '232');
    });
});
