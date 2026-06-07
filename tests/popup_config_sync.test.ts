import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const project_root = resolve(__dirname, '..')
const popup_source = readFileSync(resolve(project_root, 'src/popup/popup.ts'), 'utf8')

describe('popup config listeners update in-memory user_config', () => {
    const listeners = [
        { name: 'redactData', control: 'redactData.checked', field: 'redact_data' },
        { name: 'systemTimeTimezone', control: 'systemTimeTimezone.value', field: 'system_time_timezone' },
        { name: 'detailTimeDisplayMode', control: 'detailTimeDisplayMode.value', field: 'detail_time_display_mode' },
        { name: 'exportDirectory', control: 'exportDirectory.value', field: 'export_directory' },
        { name: 'exportFilenameTemplate', control: 'export_filename_template', field: 'export_filename_template' },
        { name: 'exportSaveAs', control: 'exportSaveAs.checked', field: 'export_save_as' },
    ]

    for (const { name, field } of listeners) {
        it(`${name} listener updates user_config.${field} before save`, () => {
            const pattern = new RegExp(
                `${name}\\.addEventListener\\('change'[^}]*` +
                `user_config\\s*=\\s*\\{[^}]*${field}`,
                's'
            )
            expect(popup_source).toMatch(pattern)
        })
    }
})
