import { builtinModels } from '@earendil-works/pi-ai/providers/all'
import { createProvider } from '@earendil-works/pi-ai'
import { envApiKeyAuth, openAICompletionsApi } from '@earendil-works/pi-ai/compat'
import type { Api, Model } from '@earendil-works/pi-ai'
import type { StreamFn, ThinkingLevel } from '@earendil-works/pi-agent-core'
import { loadProviderSettings, modelKey, saveProviderSettings, type CustomProvider } from './providerSettings'

export interface ModelChoice {
	provider: string
	id: string
	label: string
}

/** Every built-in pi-ai backend, registered up front. */
export const models = builtinModels()

function toChoice(provider: string, id: string, name: string | undefined): ModelChoice {
	return { provider, id, label: name?.trim() || id }
}

/** Built-in default; resolved against the registry so the label never drifts. */
export const DEFAULT_MODEL: ModelChoice = (() => {
	const provider = 'anthropic'
	const id = 'claude-sonnet-4-5'
	return toChoice(provider, id, models.getModel(provider, id)?.name)
})()

/** Builtin provider list, sourced from the pi-ai registration. */
export const PROVIDERS: { value: string; name: string }[] = models
	.getProviders()
	.map((p) => ({ value: p.id, name: p.name?.trim() || p.id }))

const builtinIds = new Set(PROVIDERS.map((p) => p.value))

function buildCustomProvider(entry: CustomProvider) {
	return createProvider({
		id: entry.id,
		name: entry.name,
		baseUrl: entry.baseUrl,
		auth: { apiKey: envApiKeyAuth(`${entry.name} API key`, []) },
		models: entry.models.map((m) => ({
			id: m.id,
			name: m.name || m.id,
			api: 'openai-completions' as const,
			provider: entry.id,
			baseUrl: entry.baseUrl,
			reasoning: false,
			input: ['text' as const],
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
			contextWindow: 128000,
			maxTokens: 4096,
		})),
		api: { 'openai-completions': openAICompletionsApi() },
	})
}

const registeredCustomIds = new Set<string>()

/**
 * (Re)register user-defined providers from the settings store. Skips ids
 * that collide with builtins so a corrupt save can never replace one.
 */
export function refreshCustomProviders(): void {
	for (const id of registeredCustomIds) {
		try {
			models.deleteProvider(id)
		} catch {
			/* already gone — ignore */
		}
	}
	registeredCustomIds.clear()
	for (const entry of loadProviderSettings().customProviders) {
		if (builtinIds.has(entry.id) || registeredCustomIds.has(entry.id)) continue
		try {
			models.setProvider(buildCustomProvider(entry))
			registeredCustomIds.add(entry.id)
		} catch {
			/* invalid entry — skip */
		}
	}
}

refreshCustomProviders()

/** All providers: builtins plus user-defined ones. */
export function listProviders(): { value: string; name: string; custom: boolean }[] {
	const customs = loadProviderSettings().customProviders.map((cp) => ({
		value: cp.id,
		name: cp.name,
		custom: true,
	}))
	return [...PROVIDERS.map((p) => ({ ...p, custom: false })), ...customs]
}

export function isCustomProvider(id: string): boolean {
	return loadProviderSettings().customProviders.some((cp) => cp.id === id)
}

/** User-added models for one provider (builtin customs, or the custom provider's own list). */
export function customModelsFor(provider: string): ModelChoice[] {
	if (!provider) return []
	const state = loadProviderSettings()
	if (isCustomProvider(provider)) {
		return (state.customProviders.find((cp) => cp.id === provider)?.models ?? []).map((m) =>
			toChoice(provider, m.id, m.name),
		)
	}
	return (state.customModels[provider] ?? []).map((m) => toChoice(provider, m.id, m.name))
}

export function isCustomModel(provider: string, id: string): boolean {
	return customModelsFor(provider).some((m) => m.id === id)
}

/** Opt-in check: a model is usable only after the user enables it manually. */
export function isModelEnabled(provider: string, id: string): boolean {
	return loadProviderSettings().enabledModels.includes(modelKey(provider, id))
}

/**
 * Every model for one provider: builtins plus customs, minus disabled ones
 * unless `includeDisabled` is set (the provider detail needs the full list
 * to render its toggles). Nothing is enabled by default — the caller only
 * sees models the user has opted in to.
 */
export function modelsForProvider(provider: string, includeDisabled = false): ModelChoice[] {
	if (!provider) return []
	let builtin: ModelChoice[] = []
	try {
		builtin = models.getModels(provider).map((m) => toChoice(provider, m.id, m.name))
	} catch {
		builtin = []
	}
	const builtinIds = new Set(builtin.map((m) => m.id))
	const customs = customModelsFor(provider).filter((m) => !builtinIds.has(m.id))
	const all = [...builtin, ...customs]
	if (includeDisabled) return all
	const enabled = new Set(loadProviderSettings().enabledModels)
	return all.filter((m) => enabled.has(modelKey(provider, m.id)))
}

/**
 * Runtime model lookup: registry first, then custom models on builtin
 * providers (cloned from a same-provider template so streaming works).
 */
export function resolveModel(provider: string, id: string): Model<Api> | undefined {
	if (!provider || !id) return undefined
	const direct = models.getModel(provider, id)
	if (direct) return direct
	const custom = customModelsFor(provider).find((m) => m.id === id)
	if (!custom) return undefined
	let template: Model<Api> | undefined
	try {
		template = models.getModels(provider)[0]
	} catch {
		template = undefined
	}
	if (!template) return undefined
	return { ...template, id: custom.id, name: custom.label }
}

/** Resolve a stored provider/modelId pair to a labeled choice, if known. */
export function findModelChoice(provider: string, id: string): ModelChoice | undefined {
	const model = resolveModel(provider, id)
	return model ? toChoice(provider, model.id, model.name) : undefined
}

/** Human label for the configured model, falling back to `provider/id`. */
export function modelLabel(provider: string, id: string): string {
	return findModelChoice(provider, id)?.label ?? `${provider}/${id}`
}

/** Rough chars-per-token for budgeting char-measured history against token windows. */
export const CHARS_PER_TOKEN = 4
/** Output headroom kept out of the history budget (capped so small windows stay usable). */
const OUTPUT_RESERVE_TOKENS = 4096
/** Budget floor and unknown-model fallback (matches the retired manual default). */
export const FALLBACK_CONTEXT_CHARS = 8000

/**
 * History budget in characters, derived from the pi-ai SDK's per-model
 * `contextWindow` (tokens) minus output headroom. Custom models inherit
 * their same-provider template's window via resolveModel; custom providers
 * carry the 128k estimate from buildCustomProvider.
 */
export function contextCharsFor(provider: string, id: string): number {
	const model = resolveModel(provider, id)
	if (!model || !Number.isFinite(model.contextWindow) || model.contextWindow <= 0) return FALLBACK_CONTEXT_CHARS
	const reserve = Math.min(Math.max(model.maxTokens || 0, 0), OUTPUT_RESERVE_TOKENS)
	return Math.max(1000, Math.round((model.contextWindow - reserve) * CHARS_PER_TOKEN))
}

/** Enable or disable one model row (opt-in: off unless explicitly enabled). */
export function setModelEnabled(provider: string, id: string, enabled: boolean): void {
	const state = loadProviderSettings()
	const key = modelKey(provider, id)
	const next = state.enabledModels.filter((entry) => entry !== key)
	if (enabled) next.push(key)
	state.enabledModels = next
	saveProviderSettings()
}

/** Add a user-defined model to a builtin or custom provider.
 * Manually adding a model counts as opting in, so it starts enabled. */
export function addCustomModel(provider: string, model: { id: string; name: string }): void {
	const state = loadProviderSettings()
	const entry = { id: model.id, name: model.name?.trim() || model.id }
	const custom = state.customProviders.find((cp) => cp.id === provider)
	if (custom) {
		if (custom.models.some((m) => m.id === entry.id)) return
		custom.models.push(entry)
	} else {
		const list = state.customModels[provider] ?? []
		if (list.some((m) => m.id === entry.id)) return
		list.push(entry)
		state.customModels[provider] = list
	}
	const key = modelKey(provider, entry.id)
	if (!state.enabledModels.includes(key)) state.enabledModels = [...state.enabledModels, key]
	saveProviderSettings()
	refreshCustomProviders()
}

/** Delete a user-defined model (plus its enabled flag, if any). */
export function removeCustomModel(provider: string, id: string): void {
	const state = loadProviderSettings()
	const custom = state.customProviders.find((cp) => cp.id === provider)
	if (custom) {
		custom.models = custom.models.filter((m) => m.id !== id)
	} else {
		state.customModels[provider] = (state.customModels[provider] ?? []).filter((m) => m.id !== id)
	}
	const key = modelKey(provider, id)
	state.enabledModels = state.enabledModels.filter((entry) => entry !== key)
	saveProviderSettings()
	refreshCustomProviders()
}

/** Register a fully user-defined (OpenAI-compatible) provider.
 * Its seed model was added manually, so it starts enabled. */
export function addCustomProvider(entry: CustomProvider): void {
	const state = loadProviderSettings()
	if (state.customProviders.some((cp) => cp.id === entry.id)) return
	state.customProviders.push(entry)
	for (const m of entry.models) {
		const key = modelKey(entry.id, m.id)
		if (!state.enabledModels.includes(key)) state.enabledModels = [...state.enabledModels, key]
	}
	saveProviderSettings()
	refreshCustomProviders()
}

/** Delete a user-defined provider, its models, and its enabled flags. */
export function removeCustomProvider(id: string): void {
	const state = loadProviderSettings()
	state.customProviders = state.customProviders.filter((cp) => cp.id !== id)
	state.enabledModels = state.enabledModels.filter((entry) => !entry.startsWith(`${id}/`))
	saveProviderSettings()
	refreshCustomProviders()
}

/** Bound stream function for `new Agent({ streamFn })`. */
export const streamFn: StreamFn = (model, ctx, opts) => models.streamSimple(model, ctx, opts)

/** Reasoning-effort stops in slider order. `off` is always available. */
export const THINKING_LEVELS: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

/**
 * Adjustable reasoning levels for one model: `off` plus every level the
 * model's `thinkingLevelMap` maps to a native value. Unknown models (or maps
 * with nothing adjustable, e.g. `{"off": null}`) yield `['off']` — the UI
 * hides the slider then.
 */
export function thinkingLevelsFor(provider: string, id: string): ThinkingLevel[] {
	if (!provider || !id) return ['off']
	const map = resolveModel(provider, id)?.thinkingLevelMap as Partial<Record<ThinkingLevel, string | null>> | undefined
	if (!map) return ['off']
	const out: ThinkingLevel[] = ['off']
	for (const level of THINKING_LEVELS) {
		if (level === 'off') continue
		if (typeof map[level] === 'string' && (map[level] as string).length > 0) out.push(level)
	}
	return out
}

/**
 * Clamp a stored level to what the model supports: the highest supported
 * level at or below the stored one, else `off` (never silently upgrade —
 * higher reasoning costs more). Unknown models yield `off`; the agent can't
 * run them anyway until they resolve.
 */
export function resolveThinkingLevel(provider: string, id: string, stored: ThinkingLevel): ThinkingLevel {
	if (!provider || !id) return stored
	const supported = new Set(thinkingLevelsFor(provider, id))
	if (supported.size <= 1) return 'off'
	if (supported.has(stored)) return stored
	const order = THINKING_LEVELS as readonly ThinkingLevel[]
	let idx = order.indexOf(stored)
	if (idx < 0) return 'off'
	while (idx >= 0 && !supported.has(order[idx])) idx--
	return idx >= 0 ? order[idx] : 'off'
}
