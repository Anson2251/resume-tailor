import { beforeEach, expect, it } from 'vitest'
import {
	DEFAULT_MODEL,
	PROVIDERS,
	addCustomModel,
	addCustomProvider,
	findModelChoice,
	isModelEnabled,
	listProviders,
	modelLabel,
	models,
	modelsForProvider,
	pickDefaultModel,
	removeCustomModel,
	removeCustomProvider,
	resolveThinkingLevel,
	setModelEnabled,
	sortEnabledModels,
	providerHasEnabledModels,
	sortModelsByEnabled,
	sortProvidersByEnabled,
	thinkingControlFor,
	thinkingLevelsFor,
} from './models'
import { hydrateProviderSettings } from './providerSettings'

beforeEach(() => {
	hydrateProviderSettings({ customProviders: [], customModels: {}, enabledModels: [] })
})

it('registers every built-in pi-ai backend', () => {
	expect(PROVIDERS.length).toBe(41)
	const ids = PROVIDERS.map((p) => p.value)
	for (const id of ['anthropic', 'openai', 'google', 'openrouter']) {
		expect(ids).toContain(id)
	}
})

it('lists registry models for the key providers', () => {
	for (const id of ['anthropic', 'openai', 'google', 'openrouter']) {
		expect(modelsForProvider(id, true).length).toBeGreaterThan(0)
	}
	expect(modelsForProvider('', true)).toEqual([])
	expect(modelsForProvider('no-such-provider', true)).toEqual([])
})

it('keeps every model disabled until manually enabled', () => {
	for (const id of ['anthropic', 'openai', 'google', 'openrouter']) {
		expect(modelsForProvider(id)).toEqual([])
	}
	expect(isModelEnabled('anthropic', 'claude-sonnet-4-5')).toBe(false)
	expect(isModelEnabled(DEFAULT_MODEL.provider, DEFAULT_MODEL.id)).toBe(false)
})

it('lists only manually enabled models', () => {
	setModelEnabled('anthropic', 'claude-sonnet-4-5', true)
	expect(isModelEnabled('anthropic', 'claude-sonnet-4-5')).toBe(true)
	const listed = modelsForProvider('anthropic')
	expect(listed.map((m) => m.id)).toContain('claude-sonnet-4-5')
	// Other providers stay empty until something there is enabled too.
	expect(modelsForProvider('openai')).toEqual([])
	setModelEnabled('anthropic', 'claude-sonnet-4-5', false)
	expect(isModelEnabled('anthropic', 'claude-sonnet-4-5')).toBe(false)
	expect(modelsForProvider('anthropic')).toEqual([])
})

it('starts manually added models enabled', () => {
	addCustomModel('anthropic', { id: 'my-custom-test-model', name: 'My Custom' })
	try {
		expect(isModelEnabled('anthropic', 'my-custom-test-model')).toBe(true)
		expect(modelsForProvider('anthropic').map((m) => m.id)).toContain('my-custom-test-model')
	} finally {
		removeCustomModel('anthropic', 'my-custom-test-model')
	}
	expect(isModelEnabled('anthropic', 'my-custom-test-model')).toBe(false)
})

it('starts a custom provider seed model enabled and cleans up on delete', () => {
	addCustomProvider({
		id: 'test-opt-in-provider',
		name: 'Test Provider',
		baseUrl: 'https://example.test/v1',
		models: [{ id: 'test-model', name: 'Test Model' }],
	})
	try {
		expect(isModelEnabled('test-opt-in-provider', 'test-model')).toBe(true)
		expect(modelsForProvider('test-opt-in-provider').map((m) => m.id)).toContain('test-model')
	} finally {
		removeCustomProvider('test-opt-in-provider')
	}
	expect(modelsForProvider('test-opt-in-provider')).toEqual([])
})

it('resolves the default model from the registry', () => {
	expect(models.getModel(DEFAULT_MODEL.provider, DEFAULT_MODEL.id)).toBeDefined()
	expect(findModelChoice(DEFAULT_MODEL.provider, DEFAULT_MODEL.id)?.label).toBe(DEFAULT_MODEL.label)
})

it('falls back to provider/id for unknown models', () => {
	expect(findModelChoice('anthropic', 'no-such-model')).toBeUndefined()
	expect(modelLabel('anthropic', 'no-such-model')).toBe('anthropic/no-such-model')
})

it('hides reasoning for unknown models and models without reasoning', () => {
	expect(thinkingControlFor('anthropic', 'no-such-model')).toEqual({ kind: 'hidden' })
	expect(thinkingControlFor('', '')).toEqual({ kind: 'hidden' })
	expect(thinkingLevelsFor('anthropic', 'no-such-model')).toEqual(['off'])
	expect(thinkingLevelsFor('', '')).toEqual(['off'])
	expect(resolveThinkingLevel('anthropic', 'no-such-model', 'high')).toBe('off')
})

it('offers a think toggle for reasoning models without a multi-level map', () => {
	// The default model (Claude Sonnet 4.5) has reasoning but no level map:
	// provider-default effort, so a switch instead of a slider.
	expect(thinkingControlFor(DEFAULT_MODEL.provider, DEFAULT_MODEL.id)).toEqual({
		kind: 'toggle',
		onLevel: 'medium',
	})
	expect(thinkingLevelsFor(DEFAULT_MODEL.provider, DEFAULT_MODEL.id)).toEqual(['off', 'medium'])
})

it('offers a think toggle for single-level-map models', () => {
	// Opus 4.6 maps max only.
	expect(thinkingControlFor('anthropic', 'claude-opus-4-6')).toEqual({ kind: 'toggle', onLevel: 'max' })
})

it('keeps the on/off intent on toggle models instead of clamping to off', () => {
	expect(resolveThinkingLevel('anthropic', 'claude-opus-4-6', 'max')).toBe('max')
	// A stored effort has no meaning on a switch: any non-off level keeps
	// thinking on at the toggle level, so model switches never silently
	// disable it.
	expect(resolveThinkingLevel('anthropic', 'claude-opus-4-6', 'medium')).toBe('max')
	expect(resolveThinkingLevel('anthropic', 'claude-opus-4-6', 'off')).toBe('off')
	expect(resolveThinkingLevel(DEFAULT_MODEL.provider, DEFAULT_MODEL.id, 'high')).toBe('medium')
	expect(resolveThinkingLevel(DEFAULT_MODEL.provider, DEFAULT_MODEL.id, 'off')).toBe('off')
})

it('lists adjustable levels in slider order for a thinking model', () => {
	expect(thinkingLevelsFor('openai', 'gpt-5')).toEqual(['off', 'minimal', 'low', 'medium', 'high'])
	expect(resolveThinkingLevel('openai', 'gpt-5', 'medium')).toBe('medium')
	// Stored max is unsupported there: clamp down to the nearest supported.
	expect(resolveThinkingLevel('openai', 'gpt-5', 'max')).toBe('high')
	expect(resolveThinkingLevel('openai', 'gpt-5', 'off')).toBe('off')
})

it('sorts providers with enabled models first, alphabetical within each group', () => {
	// Nothing enabled: one alphabetical group.
	hydrateProviderSettings({ customProviders: [], customModels: {}, enabledModels: [] })
	const plain = sortProvidersByEnabled(listProviders())
	const plainNames = plain.map((p) => p.name)
	expect(plainNames).toEqual([...plainNames].sort((a, b) => a.localeCompare(b)))
	hydrateProviderSettings({
		customProviders: [],
		customModels: {},
		enabledModels: ['openai/gpt-5', 'anthropic/claude-sonnet-4-5'],
	})
	const sorted = sortProvidersByEnabled(listProviders())
	expect(providerHasEnabledModels('openai')).toBe(true)
	expect(providerHasEnabledModels('anthropic')).toBe(true)
	const firstWithout = sorted.findIndex((p) => !providerHasEnabledModels(p.value))
	expect(firstWithout).toBe(2)
	expect(
		sorted
			.slice(0, 2)
			.map((p) => p.value)
			.sort(),
	).toEqual(['anthropic', 'openai'])
	for (const group of [sorted.slice(0, firstWithout), sorted.slice(firstWithout)]) {
		const names = group.map((p) => p.name)
		expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
	}
})

it('sorts a provider\u2019s models with enabled first, alphabetical within each group', () => {
	hydrateProviderSettings({ customProviders: [], customModels: {}, enabledModels: ['openai/gpt-5'] })
	const sorted = sortModelsByEnabled('openai', modelsForProvider('openai', true))
	expect(sorted[0]?.id).toBe('gpt-5')
	const rest = sorted.slice(1)
	expect(rest.some((m) => isModelEnabled('openai', m.id))).toBe(false)
	const labels = rest.map((m) => m.label)
	expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b)))
})

it('sorts enabled models by provider, label, id and defaults to the first', () => {
	const unsorted = [
		{ provider: 'openai', providerName: 'OpenAI', id: 'gpt-5', label: 'GPT-5' },
		{ provider: 'anthropic', providerName: 'Anthropic', id: 'claude-sonnet-4-5', label: 'Sonnet' },
		{ provider: 'anthropic', providerName: 'Anthropic', id: 'claude-opus-4-6', label: 'Opus' },
	]
	const sorted = sortEnabledModels(unsorted)
	expect(sorted.map((m) => m.id)).toEqual(['claude-opus-4-6', 'claude-sonnet-4-5', 'gpt-5'])
	// Stored default wins while still enabled.
	expect(pickDefaultModel(sorted, 'openai', 'gpt-5')?.id).toBe('gpt-5')
	// Unknown, empty, or disabled stored defaults fall back to the first sorted.
	expect(pickDefaultModel(sorted, 'anthropic', 'no-such-model')?.id).toBe('claude-opus-4-6')
	expect(pickDefaultModel(sorted, '', '')?.id).toBe('claude-opus-4-6')
	expect(pickDefaultModel([], 'openai', 'gpt-5')).toBeNull()
})
