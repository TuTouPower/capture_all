// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DEFAULT_USER_CONFIG } from '../src/shared/constants'
import { set_user_config } from '../src/dashboard/dashboard_shared'
import {
    clamp_body_size_bytes,
    render_settings,
} from '../src/dashboard/dashboard_settings'

const project_root = resolve(__dirname, '..')
const src = readFileSync(resolve(project_root, 'src/dashboard/dashboard_settings.ts'), 'utf8')

describe('隐私风险提示', () => {
    it('在设置页渲染默认敏感采集项和脱敏边界', () => {
        set_user_config(DEFAULT_USER_CONFIG)
        const container = document.createElement('div')
        container.innerHTML = render_settings()
        const privacy_section = container.querySelector('#set-privacy')

        expect(privacy_section).not.toBeNull()
        expect(privacy_section?.textContent).toContain('请求体、响应体和输入值采集默认开启')
        expect(privacy_section?.textContent).toContain('可能包含凭据、Token、私密消息或个人信息')
        expect(privacy_section?.textContent).toContain('请求体和响应体只限制大小，不扫描内容中的敏感信息')
        expect(privacy_section?.textContent).toContain('密码输入始终不采集')
    });
});

describe('BUG-006: 采集上限 / 内联文本上限单位', () => {
    const BODY_MAX = 1024 * 1048576
    const INLINE_MAX = 1024 * 1024

    describe('字节 ↔ 显示单位 round-trip', () => {
        it('5242880 字节 → 5 MB → 保存回 5242880', () => {
            const display_mb = 5242880 / 1048576
            expect(display_mb).toBe(5)
            const saved = clamp_body_size_bytes(String(display_mb * 1048576), 5242880, BODY_MAX)
            expect(saved).toBe(5242880)
        })

        it('65536 字节 → 64 KB → 保存回 65536', () => {
            const display_kb = 65536 / 1024
            expect(display_kb).toBe(64)
            const saved = clamp_body_size_bytes(String(display_kb * 1024), 65536, INLINE_MAX)
            expect(saved).toBe(65536)
        })

        it('非整数 MB 会被 Math.round 四舍五入', () => {
            // 1536 * 1024 = 1572864 字节 = 1.5 MB
            const bytes = 1536 * 1024
            const display_mb = Math.round(bytes / 1048576)
            expect(display_mb).toBe(2) // 1.5 → 2
        })
    })

    describe('UI 约束验证', () => {
        it('采集上限最大 1024 MB（1 GB），保存不被夹', () => {
            const saved = clamp_body_size_bytes(String(1024 * 1048576), 5242880, BODY_MAX)
            expect(saved).toBe(1073741824)
        })

        it('内联文本上限最大 1024 KB（1 MB），保存不被夹', () => {
            const saved = clamp_body_size_bytes(String(1024 * 1024), 65536, INLINE_MAX)
            expect(saved).toBe(1048576)
        })

        it('超限值被夹到上限', () => {
            expect(clamp_body_size_bytes(String(2048 * 1048576), 5242880, BODY_MAX)).toBe(BODY_MAX)
            expect(clamp_body_size_bytes(String(2048 * 1024), 65536, INLINE_MAX)).toBe(INLINE_MAX)
        })

        it('非数字使用 fallback', () => {
            expect(clamp_body_size_bytes('abc', 5242880, BODY_MAX)).toBe(5242880)
        })

        it('负数返回 0', () => {
            expect(clamp_body_size_bytes('-100', 5242880, BODY_MAX)).toBe(0)
        })
    })
})

describe('BUG-007: 日志级别不与最大日志大小重叠', () => {
    it('日志级别 field 跨 2 列（span2）', () => {
        // render_settings 中日志级别 field 有 span2 class
        const match = src.match(/日志级别[\s\S]{0,200}span2|span2[\s\S]{0,200}日志级别/)
        expect(match).toBeTruthy()
    })
})

describe('BUG-008: 当前日志大小用 input 而非 span', () => {
    it('logSize 是 readonly input 元素', () => {
        // 渲染 HTML 中 logSize 是 input[readonly]，不是 span
        const input_match = src.match(/<input\s+id="logSize"[^>]*readonly/)
        expect(input_match).toBeTruthy()
    })

    it('wire_diagnostics_settings 对 logSize 赋 .value（非 .textContent）', () => {
        // 函数体内 logSize 用 .value = 赋值
        const fn_match = src.match(/function wire_diagnostics_settings[\s\S]*?^\}/m)
        expect(fn_match).toBeTruthy()
        expect(fn_match![0]).toMatch(/logSize[\s\S]*?\.value\s*=/)
        expect(fn_match![0]).not.toMatch(/logSize[\s\S]*?\.textContent\s*=/)
    })
})

describe('T0006: browser_no settings UI', () => {
    it('AC-1: 设置页集成区有浏览器编号输入（正整数），无 Token 必填提示', () => {
        set_user_config(DEFAULT_USER_CONFIG)
        const container = document.createElement('div')
        container.innerHTML = render_settings()
        const integrations = container.querySelector('#set-integrations')

        expect(integrations).not.toBeNull()

        const browser_no_input = integrations?.querySelector('[data-cfg="browser_no"]') as HTMLInputElement | null
        expect(browser_no_input).not.toBeNull()
        expect(browser_no_input?.type).toBe('number')
        expect(browser_no_input?.getAttribute('min')).toBe('1')
        expect(browser_no_input?.getAttribute('step')).toBe('1')

        const browser_label_input = integrations?.querySelector('[data-cfg="browser_label"]') as HTMLInputElement | null
        expect(browser_label_input).not.toBeNull()

        const advanced = integrations?.querySelector('#bridge-advanced')
        expect(advanced).not.toBeNull()
        const adv_content = advanced?.querySelector('#bridgeAdvContent')
        expect(adv_content).not.toBeNull()

        const status_area = integrations?.querySelector('#bridge-status-area')
        expect(status_area).not.toBeNull()

        expect(integrations?.textContent).not.toContain('必须填写')
    })

    it('AC-5: 旧配置仅有手贴 token 无 browser_no，升级后渲染不崩溃', () => {
        const legacy_config = {
            ...DEFAULT_USER_CONFIG,
            agent_bridge_enabled: true,
            agent_bridge_url: 'http://127.0.0.1:17831',
            agent_bridge_token: '<LEGACY_TOKEN>',
            agent_bridge_poll_interval_ms: 1000,
            browser_no: 0,
            browser_label: '',
        }
        set_user_config(legacy_config)
        const container = document.createElement('div')
        container.innerHTML = render_settings()

        const integrations = container.querySelector('#set-integrations')
        expect(integrations).not.toBeNull()

        const browser_no_input = integrations?.querySelector('[data-cfg="browser_no"]') as HTMLInputElement | null
        expect(browser_no_input).not.toBeNull()
        expect(browser_no_input?.value).toBe('')

        const token_input = integrations?.querySelector('[data-cfg="agent_bridge_token"]') as HTMLInputElement | null
        expect(token_input).not.toBeNull()
        expect(token_input?.value).toBe('<LEGACY_TOKEN>')

        const adv_toggle = integrations?.querySelector('#bridgeAdvToggle')
        expect(adv_toggle).not.toBeNull()
        expect(adv_toggle?.textContent).toContain('Legacy')
    })
})
