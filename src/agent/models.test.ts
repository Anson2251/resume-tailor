import { expect, it } from 'vitest'
import {
	DEFAULT_MODEL,
	PROVIDERS,
	findModelChoice,
	modelLabel,
	models,
	modelsForProvider,
	resolveThinkingLevel,
	thinkingLevelsFor,
} from './models'

it('registers every built-in pi-ai backend', () => {
	expect(PROVIDERS.length).toBe(41)
	const ids = PROVIDERS.map((p) => p.value)
	for (const id of ['anthropic', 'openai', 'google', 'openrouter']) {
		expect(ids).toContain(id)
	}
})

it('lists registry models for the key providers', () => {
	for (const id of ['anthropic', 'openai', 'google', 'openrouter']) {
		expect(modelsForProvider(id).length).toBeGreaterThan(0)
	}
	expect(modelsForProvider('')).toEqual([])
	expect(modelsForProvider('no-such-provider')).toEqual([])
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
