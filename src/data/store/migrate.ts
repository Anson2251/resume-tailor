import { LEGACY_STORAGE_KEY, STORAGE_KEY } from '../workspace'
import { blankSettingsDoc, normalizeSettingsDoc, type SettingsDoc } from './settings'

export const LEGACY_THEME_KEY = 'resume-tailor-theme'

function readJson(key: string): unknown | null {
	try {
		const raw = localStorage.getItem(key)
		if (!raw) return null
		return JSON.parse(raw) as unknown
	} catch {
		return null
	}
}

function take(key: string): void {
	try {
		localStorage.removeItem(key)
	} catch {
		/* ignore */
	}
}

export interface WebLegacy {
	workspaceRaw: unknown | null
	settings: SettingsDoc
	hadLegacy: boolean
}

/**
 * One-time production v2 migration (web): legacy localStorage keys become
 * store docs. Reads the v2/v1 workspace, theme, and settings keys, normalizes
 * them, and removes the legacy keys. Dev-tree state is intentionally NOT
 * migrated — only these production key names.
 */
export function migrateWebLegacy(): WebLegacy {
	const workspaceRaw = readJson(STORAGE_KEY) ?? readJson(LEGACY_STORAGE_KEY)
	const themeRaw = readLegacyString(LEGACY_THEME_KEY)
	const settings = normalizeSettingsDoc({
		theme: themeRaw,
		agent: readJson('resume-tailor-agent-settings-v1'),
		providers: readJson('resume-tailor-provider-settings-v1'),
	})
	const hadLegacy =
		workspaceRaw !== null ||
		themeRaw !== null ||
		localStorageHas('resume-tailor-agent-settings-v1') ||
		localStorageHas('resume-tailor-provider-settings-v1')
	if (hadLegacy) {
		take(STORAGE_KEY)
		take(LEGACY_STORAGE_KEY)
		take(LEGACY_THEME_KEY)
		take('resume-tailor-agent-settings-v1')
		take('resume-tailor-provider-settings-v1')
	}
	return { workspaceRaw, settings, hadLegacy }
}

function readLegacyString(key: string): string | null {
	try {
		return localStorage.getItem(key)
	} catch {
		return null
	}
}

function localStorageHas(key: string): boolean {
	try {
		return localStorage.getItem(key) !== null
	} catch {
		return false
	}
}

export function blankMigration(): WebLegacy {
	return { workspaceRaw: null, settings: blankSettingsDoc(), hadLegacy: false }
}
