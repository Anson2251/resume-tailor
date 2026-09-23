import { reactive } from 'vue'
import { scheduleSettingsPersist } from '../data/store/settings'

export const PROVIDER_SETTINGS_KEY = 'resume-tailor-provider-settings-v1'

export interface CustomModel {
	id: string
	name: string
}

export interface CustomProvider {
	id: string
	name: string
	baseUrl: string
	models: CustomModel[]
}

export interface ProviderSettingsState {
	customProviders: CustomProvider[]
	/** Builtin provider id -> user-added models. */
	customModels: Record<string, CustomModel[]>
	/** Disabled models as `providerId/modelId` strings. */
	disabledModels: string[]
}

const BLANK: ProviderSettingsState = { customProviders: [], customModels: {}, disabledModels: [] }

export const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,48}$/

export function disabledKey(provider: string, id: string): string {
	return `${provider}/${id}`
}

function cleanModel(raw: unknown): CustomModel | null {
	const doc = raw as { id?: unknown; name?: unknown } | null
	if (!doc || typeof doc.id !== 'string' || !doc.id.trim()) return null
	return { id: doc.id.trim(), name: typeof doc.name === 'string' && doc.name.trim() ? doc.name.trim() : doc.id.trim() }
}

function cleanModels(raw: unknown): CustomModel[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	const out: CustomModel[] = []
	for (const item of raw) {
		const model = cleanModel(item)
		if (!model || seen.has(model.id)) continue
		seen.add(model.id)
		out.push(model)
	}
	return out
}

export function normalizeBaseUrl(input: string): string | null {
	const value = input.trim().replace(/\/+$/, '')
	if (!value) return null
	try {
		const url = new URL(value)
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
		return url.toString().replace(/\/+$/, '')
	} catch {
		return null
	}
}

/** Error message, or null when the provider id is usable. */
export function validateProviderId(id: string, taken: string[]): string | null {
	const value = id.trim().toLowerCase()
	if (!value) return 'Enter a provider id.'
	if (!PROVIDER_ID_PATTERN.test(value)) return 'Use lowercase letters, numbers, and dashes.'
	if (taken.includes(value)) return 'That provider id is already taken.'
	return null
}

/** Error message, or null when the model id is usable within the provider. */
export function validateModelId(id: string, taken: string[]): string | null {
	const value = id.trim()
	if (!value) return 'Enter a model id.'
	if (/\s/.test(value)) return 'Model ids cannot contain spaces.'
	if (taken.includes(value)) return 'That model id already exists for this provider.'
	return null
}

export function normalizeProviderSettings(raw: unknown): ProviderSettingsState {
	const base: ProviderSettingsState = { customProviders: [], customModels: {}, disabledModels: [] }
	if (!raw || typeof raw !== 'object') return base
	const doc = raw as Partial<Record<keyof ProviderSettingsState, unknown>>
	const taken: string[] = []
	if (Array.isArray(doc.customProviders)) {
		for (const item of doc.customProviders) {
			const entry = item as Partial<CustomProvider> | null
			if (!entry || typeof entry !== 'object') continue
			const id = typeof entry.id === 'string' ? entry.id.trim().toLowerCase() : ''
			const baseUrl = typeof entry.baseUrl === 'string' ? normalizeBaseUrl(entry.baseUrl) : null
			const models = cleanModels(entry.models)
			if (!id || !PROVIDER_ID_PATTERN.test(id) || taken.includes(id) || !baseUrl || !models.length) continue
			taken.push(id)
			base.customProviders.push({
				id,
				name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : id,
				baseUrl,
				models,
			})
		}
	}
	if (doc.customModels && typeof doc.customModels === 'object') {
		for (const [provider, models] of Object.entries(doc.customModels)) {
			const cleaned = cleanModels(models)
			if (provider && cleaned.length) base.customModels[provider] = cleaned
		}
	}
	if (Array.isArray(doc.disabledModels)) {
		const seen = new Set<string>()
		for (const entry of doc.disabledModels) {
			if (typeof entry !== 'string' || !entry.includes('/') || seen.has(entry)) continue
			seen.add(entry)
			base.disabledModels.push(entry)
		}
	}
	return base
}

function writeStored(state: ProviderSettingsState): void {
	Object.assign(singleton, normalizeProviderSettings(state))
	scheduleSettingsPersist()
}

const singleton = reactive<ProviderSettingsState>({ ...BLANK, customModels: {} })
const state = singleton

/** Replace live state from a store/migrated doc (App boot only). */
export function hydrateProviderSettings(raw: unknown): void {
	Object.assign(singleton, normalizeProviderSettings(raw))
}

/**
 * The live reactive state (do not mutate directly — use the helpers in
 * `models.ts`/settings UI, then call `saveProviderSettings()`).
 */
export function loadProviderSettings(): ProviderSettingsState {
	return state
}

export function saveProviderSettings(next?: ProviderSettingsState): void {
	if (next) Object.assign(state, normalizeProviderSettings(next))
	writeStored({
		customProviders: state.customProviders,
		customModels: state.customModels,
		disabledModels: state.disabledModels,
	})
}

export function resetProviderSettings(): void {
	Object.assign(state, { customProviders: [], customModels: {}, disabledModels: [] })
	writeStored({ customProviders: [], customModels: {}, disabledModels: [] })
}
