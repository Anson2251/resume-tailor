import { reactive, readonly } from 'vue'
import { scheduleSettingsPersist } from '../data/store/settings'

export const AGENT_SETTINGS_KEY = 'resume-tailor-agent-settings-v1'

export const DEFAULT_SYSTEM_PROMPT =
	'You are a resume tailoring assistant for a specific job application. ' +
	'The active job context (JD, tailored resume snapshot, cover letter draft) follows the rules below.\n\n' +
	'Workflow: (1) check whether a JD is attached — if not, say so and give only generic help; ' +
	'(2) call read_jd and read_resume before rewriting anything; ' +
	'(3) map JD requirements/keywords to resume gaps and propose minimal edits via rewrite tools; ' +
	'(4) draft the cover letter only from real resume facts; ' +
	'(5) summarize what changed and what still needs the user.\n\n' +
	'Ground rules: never invent employers, dates, degrees, or credentials; keep bullets concise, ' +
	'quantified where true, and markdown-formatted; prefer small targeted overrides over hiding content; ' +
	'when hiding many items, explain why first. Cite which JD requirement each edit addresses.'

export const DEFAULT_AGENT_SETTINGS = {
	provider: 'anthropic',
	modelId: 'claude-sonnet-4-5',
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	contextChars: 8000,
} as const

export interface AgentSettings {
	provider: string
	modelId: string
	systemPrompt: string
	contextChars: number
}

export type AgentSettingsState = AgentSettings

export function normalizeAgentSettings(raw: unknown): AgentSettings {
	const base: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }
	if (!raw || typeof raw !== 'object') return base
	const doc = raw as Partial<Record<keyof AgentSettings, unknown>>
	// Empty provider/modelId is a valid "not configured" state (wisp-pro parity).
	if (typeof doc.provider === 'string') base.provider = doc.provider.trim()
	if (typeof doc.modelId === 'string') base.modelId = doc.modelId.trim()
	if (typeof doc.systemPrompt === 'string' && doc.systemPrompt.trim()) base.systemPrompt = doc.systemPrompt
	if (typeof doc.contextChars === 'number' && Number.isFinite(doc.contextChars))
		base.contextChars = Math.min(50000, Math.max(1000, Math.round(doc.contextChars)))
	return base
}

function writeStored(state: AgentSettings): void {
	Object.assign(singleton, normalizeAgentSettings(state))
	scheduleSettingsPersist()
}

// Singleton reactive state so the settings page, AgentPanel and useAgentChat
// all observe the same values without a store library. Starts at defaults;
// App boot hydrates it from the store (or legacy keys) via hydrateAgentSettings.
const singleton = reactive<AgentSettings>({ ...DEFAULT_AGENT_SETTINGS })
const state = singleton

/** Replace live state from a store/migrated doc (App boot only). */
export function hydrateAgentSettings(raw: unknown): void {
	Object.assign(singleton, normalizeAgentSettings(raw))
}

let saveTimer: ReturnType<typeof setTimeout> | null = null

function persistSoon(): void {
	if (saveTimer !== null) clearTimeout(saveTimer)
	saveTimer = setTimeout(() => {
		saveTimer = null
		writeStored({ ...state })
	}, 250)
}

export function useAgentSettings(): { settings: Readonly<AgentSettingsState>; save: () => void; reset: () => void } {
	return {
		settings: readonly(state) as Readonly<AgentSettingsState>,
		save: () => {
			writeStored({ ...state })
		},
		reset: () => {
			Object.assign(state, { ...DEFAULT_AGENT_SETTINGS })
			writeStored({ ...state })
		},
	}
}

/** Mutable access for the settings page (autosave on change). */
export function useAgentSettingsMutable(): {
	settings: AgentSettingsState
	save: () => void
	markDirty: () => void
	reset: () => void
} {
	return {
		settings: state,
		save: () => writeStored({ ...state }),
		markDirty: persistSoon,
		reset: () => {
			Object.assign(state, { ...DEFAULT_AGENT_SETTINGS })
			writeStored({ ...state })
		},
	}
}

export function loadAgentSettings(): AgentSettings {
	return { ...state }
}

export function saveAgentSettings(next: AgentSettings): void {
	Object.assign(state, normalizeAgentSettings(next))
	writeStored({ ...state })
}
