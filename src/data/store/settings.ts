import {
	DEFAULT_AGENT_SETTINGS,
	loadAgentSettings,
	normalizeAgentSettings,
	type AgentSettings,
} from '../../agent/agentSettings'
import {
	loadProviderSettings,
	normalizeProviderSettings,
	type ProviderSettingsState,
} from '../../agent/providerSettings'
import type { ThemeName } from '../types'
import { getStore } from './index'

export const SETTINGS_VERSION = 1

/** Single merged settings doc: theme + agent behavior + provider inventory. */
export interface SettingsDoc {
	version: 1
	theme: ThemeName | null
	agent: AgentSettings
	providers: ProviderSettingsState
	fairUseAcknowledged: boolean
}

export function blankSettingsDoc(): SettingsDoc {
	return {
		version: 1,
		theme: null,
		agent: { ...DEFAULT_AGENT_SETTINGS },
		providers: { customProviders: [], customModels: {}, enabledModels: [] },
		fairUseAcknowledged: false,
	}
}

export function normalizeSettingsDoc(raw: unknown): SettingsDoc {
	const base = blankSettingsDoc()
	if (!raw || typeof raw !== 'object') return base
	const doc = raw as Partial<Record<keyof SettingsDoc, unknown>>
	return {
		version: 1,
		theme: doc.theme === 'light' || doc.theme === 'dark' ? doc.theme : null,
		agent: normalizeAgentSettings(doc.agent),
		providers: normalizeProviderSettings(doc.providers),
		fairUseAcknowledged: doc.fairUseAcknowledged === true,
	}
}

// Theme lives in App.vue's reactive ref; this holder lets the debounced
// settings flush collect it without App reaching into the store module.
let currentTheme: ThemeName | null = null

export function setCurrentTheme(theme: ThemeName | null): void {
	currentTheme = theme
}

// First-run fair-use ack, same holder pattern: set once from App after the
// user acknowledges the notice, collected by the debounced flush.
let fairUseAcknowledged = false

export function setFairUseAcknowledged(value: boolean): void {
	fairUseAcknowledged = value
}

export function isFairUseAcknowledged(): boolean {
	return fairUseAcknowledged
}

/** Snapshot the live singletons into a storable doc. */
export function collectSettingsDoc(): SettingsDoc {
	const providers = loadProviderSettings()
	return {
		version: 1,
		theme: currentTheme,
		agent: loadAgentSettings(),
		fairUseAcknowledged,
		providers: {
			customProviders: JSON.parse(
				JSON.stringify(providers.customProviders),
			) as ProviderSettingsState['customProviders'],
			customModels: JSON.parse(JSON.stringify(providers.customModels)) as ProviderSettingsState['customModels'],
			enabledModels: [...providers.enabledModels],
		},
	}
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

/** Debounced write of the merged doc — the single funnel for all settings saves. */
export function scheduleSettingsPersist(): void {
	if (saveTimer !== null) clearTimeout(saveTimer)
	saveTimer = setTimeout(() => {
		saveTimer = null
		void persistSettingsNow()
	}, 300)
}

export async function persistSettingsNow(): Promise<void> {
	try {
		await getStore().setDoc('settings', collectSettingsDoc())
	} catch {
		/* store write failed — ignore, next save will retry */
	}
}
