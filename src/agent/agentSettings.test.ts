import { beforeEach, expect, it } from 'vitest'
import {
	DEFAULT_AGENT_SETTINGS,
	DEFAULT_SYSTEM_PROMPT,
	extractExtraPrompt,
	hydrateAgentSettings,
	loadAgentSettings,
	normalizeAgentSettings,
	resolveSystemPrompt,
	saveAgentSettings,
} from './agentSettings'

beforeEach(() => {
	hydrateAgentSettings({ ...DEFAULT_AGENT_SETTINGS })
})

it('loads defaults on first run', () => {
	expect(loadAgentSettings()).toEqual({ ...DEFAULT_AGENT_SETTINGS })
})

it('round-trips provider, model, prompt and thinking level', () => {
	saveAgentSettings({
		provider: 'openai',
		modelId: 'gpt-4o',
		systemPrompt: 'Be concise.',
		thinkingLevel: 'medium',
	})
	expect(loadAgentSettings()).toEqual({
		provider: 'openai',
		modelId: 'gpt-4o',
		systemPrompt: 'Be concise.',
		thinkingLevel: 'medium',
	})
})

it('keeps the "not configured" empty state', () => {
	saveAgentSettings({ provider: '', modelId: '', systemPrompt: 'x', thinkingLevel: 'off' })
	const loaded = loadAgentSettings()
	expect(loaded.provider).toBe('')
	expect(loaded.modelId).toBe('')
})

it('falls back to off for unknown thinking levels', () => {
	expect(normalizeAgentSettings({ thinkingLevel: 'ultra' }).thinkingLevel).toBe('off')
	expect(normalizeAgentSettings({ thinkingLevel: 'high' }).thinkingLevel).toBe('high')
	expect(normalizeAgentSettings({}).thinkingLevel).toBe('off')
})

it('ignores the retired contextChars setting (per-model SDK windows now)', () => {
	const normalized = normalizeAgentSettings({ contextChars: 999999 })
	expect('contextChars' in normalized).toBe(false)
	expect(normalized).toEqual({ ...DEFAULT_AGENT_SETTINGS })
})

it('hydrates from a store doc and falls back to defaults', () => {
	hydrateAgentSettings({ provider: 'openai', modelId: 'gpt-4o', systemPrompt: 'Hi.', contextChars: 12000 })
	expect(loadAgentSettings().provider).toBe('openai')
	hydrateAgentSettings(null)
	expect(loadAgentSettings()).toEqual({ ...DEFAULT_AGENT_SETTINGS })
})

it('resolves the locked core when no extra instructions exist', () => {
	expect(resolveSystemPrompt('')).toBe(DEFAULT_SYSTEM_PROMPT)
	expect(resolveSystemPrompt('   ')).toBe(DEFAULT_SYSTEM_PROMPT)
	expect(resolveSystemPrompt(null)).toBe(DEFAULT_SYSTEM_PROMPT)
})

it('appends extra instructions to the locked core instead of replacing it', () => {
	const resolved = resolveSystemPrompt('Prefer British English.')
	expect(resolved.startsWith(DEFAULT_SYSTEM_PROMPT)).toBe(true)
	expect(resolved).toContain('Prefer British English.')
})

it('migrates stock override-era prompts to empty extras', () => {
	expect(extractExtraPrompt(DEFAULT_SYSTEM_PROMPT)).toBe('')
	expect(normalizeAgentSettings({ systemPrompt: DEFAULT_SYSTEM_PROMPT }).systemPrompt).toBe('')
	// Any older stock-shaped prompt (same prefix/end markers) also collapses.
	const oldStock =
		'You are a resume tailoring assistant for a specific job application. ' +
		'Ground rules: never invent. Cite which JD requirement each edit addresses.'
	expect(extractExtraPrompt(oldStock)).toBe('')
	expect(normalizeAgentSettings({ systemPrompt: oldStock }).systemPrompt).toBe('')
})

it('preserves genuine custom prompts as appended extras', () => {
	expect(normalizeAgentSettings({ systemPrompt: 'Hi.' }).systemPrompt).toBe('Hi.')
	expect(normalizeAgentSettings({ systemPrompt: '' }).systemPrompt).toBe('')
})

it('keeps only minimal app grounding in the core prompt (details live in manuals)', () => {
	expect(DEFAULT_SYSTEM_PROMPT).toContain('Master')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('update_letter_field')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('propose_bullet_rewrite')
	// Mechanics moved to the system manual — the prompt must not duplicate them.
	expect(DEFAULT_SYSTEM_PROMPT).not.toContain('copy-on-write')
})

it('preinjects the manual name+description index into the core prompt', () => {
	expect(DEFAULT_SYSTEM_PROMPT).toContain('read_manual')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('cover-letter-writer:')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('resume-tailor-system:')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('skill-brainstorm:')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('resume-answer-sheet:')
})

it('guides manual use per trigger (system questions, letters, stuck users)', () => {
	expect(DEFAULT_SYSTEM_PROMPT).toContain('resume-tailor-system before answering')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('cover-letter-writer before drafting')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('skill-brainstorm when the user is stuck')
	expect(DEFAULT_SYSTEM_PROMPT).toContain('resume-answer-sheet when the user is confirmed or likely a student')
})
