import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const project_root = resolve(__dirname, '..')

describe('popup main-panel URL', () => {
    it('opens the dashboard (main panel) at the built extension source path', () => {
        const popup_source = readFileSync(resolve(project_root, 'src/popup/popup.ts'), 'utf8')
        const match = popup_source.match(/chrome\.runtime\.getURL\('([^']+\.html)'/)

        expect(match?.[1]).toBe('src/dashboard/dashboard.html')
        expect(existsSync(resolve(project_root, match?.[1] ?? ''))).toBe(true)
    })
})
