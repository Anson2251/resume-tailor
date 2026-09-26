import { beforeEach, describe, expect, it, vi } from 'vitest'
import { blankMigration, migrateWebLegacy } from './migrate'

function stubStorage(seed: Record<string, string>): void {
	const backing = new Map(Object.entries(seed))
	vi.stubGlobal('localStorage', {
		getItem: (key: string) => backing.get(key) ?? null,
		setItem: (key: string, value: string) => void backing.set(key, value),
		removeItem: (key: string) => void backing.delete(key),
		clear: () => backing.clear(),
	} satisfies Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'clear'>)
}

beforeEach(() => {
	vi.unstubAllGlobals()
})

describe('production v2 migration', () => {
	it('returns blanks when no legacy keys exist', () => {
		stubStorage({})
		expect(migrateWebLegacy()).toEqual(blankMigration())
	})

	it('migrates workspace, theme and settings keys, then clears them', () => {
		const backing: Record<string, string> = {
			'resume-tailor-data-v2': JSON.stringify({ version: 2, master: null, profiles: [] }),
			'resume-tailor-theme': 'dark',
			'resume-tailor-agent-settings-v1': JSON.stringify({ provider: 'openai', modelId: 'gpt-4o' }),
			'resume-tailor-provider-settings-v1': JSON.stringify({ enabledModels: ['a/b'] }),
		}
		stubStorage(backing)
		const result = migrateWebLegacy()
		expect(result.hadLegacy).toBe(true)
		expect(result.workspaceRaw).toMatchObject({ version: 2 })
		expect(result.settings.theme).toBe('dark')
		expect(result.settings.agent.provider).toBe('openai')
		expect(result.settings.providers.enabledModels).toEqual(['a/b'])
		// Legacy keys are consumed.
		for (const key of Object.keys(backing)) {
			expect(localStorage.getItem(key)).toBe(null)
		}
	})

	it('drops legacy opt-out disabledModels: inventory restarts fully disabled', () => {
		stubStorage({
			'resume-tailor-provider-settings-v1': JSON.stringify({ disabledModels: ['a/b'] }),
		})
		const result = migrateWebLegacy()
		expect(result.settings.providers.enabledModels).toEqual([])
	})
})
