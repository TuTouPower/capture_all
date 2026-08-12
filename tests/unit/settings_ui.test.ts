// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { DEFAULT_USER_CONFIG } from '../../src/shared/constants'
import { set_user_config } from '../../src/extension/dashboard/dashboard_shared'
import {
    clamp_body_size_bytes,
    render_settings,
    wire_settings,
} from '../../src/extension/dashboard/dashboard_settings'
import { set_locale } from '../../src/extension/shared/i18n'

// set_locale 会写 chrome.storage.local；wire_settings 会走 runtime.sendMessage（get_app_log_size），提供最小 mock
const runtime_send_message = vi.fn(async () => ({ success: true, data: { size_bytes: 0 } }))
vi.stubGlobal('chrome', {
    runtime: { id: 'test-ext', sendMessage: runtime_send_message },
    storage: { local: { set: vi.fn(), get: vi.fn(async () => ({})) } },
})

// 默认 en；需要断言中文渲染的用例内切到 zh
beforeEach(() => { set_locale('en') })

describe('隐私风险提示', () => {
    it('在设置页渲染默认敏感采集项和脱敏边界', () => {
        set_locale('zh')
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
        set_locale('zh')
        set_user_config(DEFAULT_USER_CONFIG)
        const container = document.createElement('div')
        container.innerHTML = render_settings()
        const log_level_field = [...container.querySelectorAll<HTMLElement>('.field')]
            .find((el) => el.textContent?.includes('日志级别'))
        expect(log_level_field?.classList.contains('span2')).toBe(true)
    })
})

describe('BUG-008: 当前日志大小用 input 而非 span', () => {
    it('logSize 渲染为 readonly input 元素', () => {
        set_locale('zh')
        set_user_config(DEFAULT_USER_CONFIG)
        const container = document.createElement('div')
        container.innerHTML = render_settings()
        const log_size = container.querySelector('#logSize')
        expect(log_size).not.toBeNull()
        expect(log_size?.tagName).toBe('INPUT')
        expect(log_size?.hasAttribute('readonly')).toBe(true)
    })

    it('wire 后 logSize 通过 .value 更新（非 .textContent）', async () => {
        set_locale('zh')
        set_user_config(DEFAULT_USER_CONFIG)
        document.body.innerHTML = '<div id="content"></div>'
        const content = document.getElementById('content')!
        content.innerHTML = render_settings()
        runtime_send_message.mockResolvedValue({ success: true, data: { size_bytes: 5 * 1024 * 1024 } })
        wire_settings()
        await new Promise((r) => setTimeout(r, 0))
        const log_size = document.getElementById('logSize') as HTMLInputElement
        expect(log_size).not.toBeNull()
        expect(log_size.value).toBe('5.0 MB')
        expect(log_size.textContent).not.toContain('5.0')
        document.body.innerHTML = ''
    })
})

describe('browser_label settings UI', () => {
    it('AC-1: 设置页集成区有浏览器备注输入，无 Token 必填提示', () => {
        set_user_config(DEFAULT_USER_CONFIG)
        const container = document.createElement('div')
        container.innerHTML = render_settings()
        const integrations = container.querySelector('#set-integrations')

        expect(integrations).not.toBeNull()

        const browser_label_input = integrations?.querySelector('[data-cfg="browser_label"]') as HTMLInputElement | null
        expect(browser_label_input).not.toBeNull()

        // browser_no input must not exist anymore (T008 removed it)
        const browser_no_input = integrations?.querySelector('[data-cfg="browser_no"]')
        expect(browser_no_input).toBeNull()

        const advanced = integrations?.querySelector('#bridge-advanced')
        expect(advanced).not.toBeNull()
        const adv_content = advanced?.querySelector('#bridgeAdvContent')
        expect(adv_content).not.toBeNull()

        const status_area = integrations?.querySelector('#bridge-status-area')
        expect(status_area).not.toBeNull()

        expect(integrations?.textContent).not.toContain('必须填写')
    })

    it('AC-5: 旧配置仅有手贴 token 无 browser_label，升级后渲染不崩溃', () => {
        const legacy_config = {
            ...DEFAULT_USER_CONFIG,
            agent_bridge_enabled: true,
            agent_bridge_url: 'http://127.0.0.1:17831',
            agent_bridge_token: '<LEGACY_TOKEN>',
            agent_bridge_poll_interval_ms: 1000,
            browser_label: '',
        }
        set_user_config(legacy_config)
        const container = document.createElement('div')
        container.innerHTML = render_settings()

        const integrations = container.querySelector('#set-integrations')
        expect(integrations).not.toBeNull()

        const browser_label_input = integrations?.querySelector('[data-cfg="browser_label"]') as HTMLInputElement | null
        expect(browser_label_input).not.toBeNull()
        expect(browser_label_input?.value).toBe('')

        const token_input = integrations?.querySelector('[data-cfg="agent_bridge_token"]') as HTMLInputElement | null
        expect(token_input).not.toBeNull()
        expect(token_input?.value).toBe('<LEGACY_TOKEN>')

        const adv_toggle = integrations?.querySelector('#bridgeAdvToggle')
        expect(adv_toggle).not.toBeNull()
        expect(adv_toggle?.textContent).toContain('Legacy')
    })
})
