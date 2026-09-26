import { beforeEach, expect, it } from 'vitest'
import {
	DEFAULT_MODEL,
	PROVIDERS,
	addCustomModel,
	addCustomProvider,
	findModelChoice,
	isModelEnabled,
	modelLabel,
	models,
	modelsForProvider,
	removeCustomModel,
	removeCustomProvider,
	resolveThinkingLevel,
	setModelEnabled,
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

it('offers only off for models without adjustable reasoning', () => {
	expect(thinkingLevelsFor('anthropic', 'no-such-model')).toEqual(['off'])
	expect(thinkingLevelsFor('', '')).toEqual(['off'])
	// The default model has no thinking map in the catalog.
	expect(thinkingLevelsFor(DEFAULT_MODEL.provider, DEFAULT_MODEL.id)).toEqual(['off'])
})

it('clamps a stored thinking level down to supported levels, never up', () => {
	expect(resolveThinkingLevel('anthropic', 'no-such-model', 'high')).toBe('off')
	// A hypothetical wide-open model is out of reach here; exercise the clamp
	// path through a model that only supports max: anything lower stays, and
	// stored highs resolve through the same rule.
	expect(resolveThinkingLevel('anthropic', 'claude-opus-4-6', 'max')).toBe('max')
	expect(resolveThinkingLevel('anthropic', 'claude-opus-4-6', 'medium')).toBe('off')
})

it('lists adjustable levels in slider order for a thinking model', () => {
	expect(thinkingLevelsFor('openai', 'gpt-5')).toEqual(['off', 'minimal', 'low', 'medium', 'high'])
	expect(resolveThinkingLevel('openai', 'gpt-5', 'medium')).toBe('medium')
	// Stored max is unsupported there: clamp down to the nearest supported.
	expect(resolveThinkingLevel('openai', 'gpt-5', 'max')).toBe('high')
	expect(resolveThinkingLevel('openai', 'gpt-5', 'off')).toBe('off')
})
