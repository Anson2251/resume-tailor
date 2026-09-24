import { beforeEach, expect, it } from 'vitest'
import {
	DEFAULT_AGENT_SETTINGS,
	hydrateAgentSettings,
	loadAgentSettings,
	normalizeAgentSettings,
	saveAgentSettings,
} from './agentSettings'

beforeEach(() => {
	hydrateAgentSettings({ ...DEFAULT_AGENT_SETTINGS })
})

it('loads defaults on first run', () => {
	expect(loadAgentSettings()).toEqual({ ...DEFAULT_AGENT_SETTINGS })
})

it('round-trips provider, model, prompt, context chars and thinking level', () => {
	saveAgentSettings({
		provider: 'openai',
		modelId: 'gpt-4o',
		systemPrompt: 'Be concise.',
		contextChars: 16000,
		thinkingLevel: 'medium',
	})
	expect(loadAgentSettings()).toEqual({
		provider: 'openai',
		modelId: 'gpt-4o',
		systemPrompt: 'Be concise.',
		contextChars: 16000,
		thinkingLevel: 'medium',
	})
})

it('keeps the "not configured" empty state', () => {
	saveAgentSettings({ provider: '', modelId: '', systemPrompt: 'x', contextChars: 8000, thinkingLevel: 'off' })
	const loaded = loadAgentSettings()
	expect(loaded.provider).toBe('')
	expect(loaded.modelId).toBe('')
})

it('falls back to off for unknown thinking levels', () => {
	expect(normalizeAgentSettings({ thinkingLevel: 'ultra' }).thinkingLevel).toBe('off')
	expect(normalizeAgentSettings({ thinkingLevel: 'high' }).thinkingLevel).toBe('high')
	expect(normalizeAgentSettings({}).thinkingLevel).toBe('off')
})

it('clamps context chars into range', () => {
	expect(normalizeAgentSettings({ contextChars: 999999 }).contextChars).toBe(50000)
	expect(normalizeAgentSettings({ contextChars: 5 }).contextChars).toBe(1000)
})

it('hydrates from a store doc and falls back to defaults', () => {
	hydrateAgentSettings({ provider: 'openai', modelId: 'gpt-4o', systemPrompt: 'Hi.', contextChars: 12000 })
	expect(loadAgentSettings().provider).toBe('openai')
	hydrateAgentSettings(null)
	expect(loadAgentSettings()).toEqual({ ...DEFAULT_AGENT_SETTINGS })
})
