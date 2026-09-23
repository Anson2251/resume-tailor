import { expect, it } from 'vitest'
import { DEFAULT_MODEL, PROVIDERS, findModelChoice, modelLabel, models, modelsForProvider } from './models'

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
