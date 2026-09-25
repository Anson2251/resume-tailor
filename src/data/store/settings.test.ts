import { describe, expect, it } from 'vitest'
import { blankSettingsDoc, collectSettingsDoc, normalizeSettingsDoc, setCurrentTheme } from './settings'
import { hydrateAgentSettings } from '../../agent/agentSettings'
import { DEFAULT_AGENT_SETTINGS } from '../../agent/agentSettings'
import { hydrateProviderSettings } from '../../agent/providerSettings'

describe('merged settings doc', () => {
	it('normalizes garbage to defaults', () => {
		expect(normalizeSettingsDoc(null)).toEqual(blankSettingsDoc())
		expect(normalizeSettingsDoc({ theme: 'neon', agent: null, providers: 42 })).toEqual(blankSettingsDoc())
	})

	it('keeps valid theme/agent/providers sections', () => {
		const doc = normalizeSettingsDoc({
			theme: 'dark',
			agent: { provider: 'openai', modelId: 'gpt-4o', systemPrompt: 'Hi.' },
			providers: { customProviders: [], customModels: {}, disabledModels: ['a/b'] },
		})
		expect(doc.theme).toBe('dark')
		expect(doc.agent.modelId).toBe('gpt-4o')
		expect(doc.providers.disabledModels).toEqual(['a/b'])
	})

	it('collects live singletons into a storable doc', () => {
		hydrateAgentSettings({ ...DEFAULT_AGENT_SETTINGS })
		hydrateProviderSettings({ customProviders: [], customModels: {}, disabledModels: [] })
		setCurrentTheme('light')
		const doc = collectSettingsDoc()
		expect(doc.version).toBe(1)
		expect(doc.theme).toBe('light')
		expect(doc.agent.provider).toBe(DEFAULT_AGENT_SETTINGS.provider)
		// Collect must deep-copy (mutating the doc must not touch live state).
		doc.providers.disabledModels.push('x/y')
		expect(collectSettingsDoc().providers.disabledModels).toEqual([])
	})
})
