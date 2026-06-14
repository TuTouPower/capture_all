import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const project_root = resolve(__dirname, '..')
const dashboard_source = readFileSync(resolve(project_root, 'src/dashboard/dashboard.ts'), 'utf8')

describe('BUG-006: 采集上限 / 内联文本上限单位', () => {
    it('采集上限标签使用 MB 单位', () => {
        expect(dashboard_source).toMatch(/采集上限\s*\(MB\)/)
    })

    it('采集上限 input 的 step=1, min=1, max=1024', () => {
        expect(dashboard_source).toMatch(
            /data-cfg="max_body_capture_bytes"[^>]*min="1"[^>]*max="1024"[^>]*step="1"/
        )
    })

    it('采集上限 HTML value 以 MB 显示（除以 1048576）', () => {
        expect(dashboard_source).toMatch(
            /max_body_capture_bytes[^>]*value="[^"]*max_body_capture_bytes\s*\/\s*1048576/
        )
    })

    it('采集上限 persist 时乘回 1048576', () => {
        expect(dashboard_source).toMatch(
            /max_body_capture_bytes[\s\S]*\*\s*1048576/
        )
    })

    it('内联文本上限标签使用 KB 单位', () => {
        expect(dashboard_source).toMatch(/内联文本上限\s*\(KB\)/)
    })

    it('内联文本上限 input 的 step=1, min=0, max=1024', () => {
        expect(dashboard_source).toMatch(
            /data-cfg="inline_text_max_bytes"[^>]*min="0"[^>]*max="1024"[^>]*step="1"/
        )
    })

    it('内联文本上限 HTML value 以 KB 显示（除以 1024）', () => {
        expect(dashboard_source).toMatch(
            /inline_text_max_bytes[^>]*value="[^"]*inline_text_max_bytes\s*\/\s*1024/
        )
    })

    it('内联文本上限 persist 时乘回 1024', () => {
        expect(dashboard_source).toMatch(
            /inline_text_max_bytes[\s\S]*\*\s*1024/
        )
    })
})

describe('BUG-007: 日志级别字段跨越 2 列', () => {
    it('日志级别的 field div 有 span2 class', () => {
        expect(dashboard_source).toMatch(
            /class="field span2"[^>]*>[\s\S]*?<span[^>]*>日志级别<\/span>/
        )
    })
})

describe('BUG-008: 当前日志大小用 readonly input', () => {
    it('logSize 是 readonly input 而非 span', () => {
        expect(dashboard_source).toMatch(
            /<input\s+id="logSize"[^>]*readonly/
        )
    })

    it('logSize input 有 input mono class', () => {
        expect(dashboard_source).toMatch(
            /<input\s+id="logSize"\s+class="input mono"/
        )
    })

    it('wire_diagnostics_settings 用 .value 赋值而非 .textContent', () => {
        expect(dashboard_source).toMatch(
            /logSize[\s\S]*?\.value\s*=/
        )
    })
})
