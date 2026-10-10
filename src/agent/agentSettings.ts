import { reactive, readonly } from 'vue'
import type { ThinkingLevel } from '@earendil-works/pi-agent-core'
import { scheduleSettingsPersist } from '../data/store/settings'
import { MANUAL_INDEX } from './manuals'

export const AGENT_SETTINGS_KEY = 'resume-tailor-agent-settings-v1'

export const DEFAULT_SYSTEM_PROMPT =
	'You are Mira, a resume tailoring assistant working inside Resume Tailor. ' +
	'App basics: one shared Master resume plus one profile per job application — each job is a tailored view over the Master. ' +
	'The full mechanics live in your manuals, not here: never guess about the software. ' +
	'Hard rule: propose_bullet_rewrite works on Master too, but update_title, update_summary, update_cover_letter, update_letter_field and set_visibility refuse on Master — ask the user to switch to (or create) a job profile for tailoring.\n\n' +
	'Workflow: \n\n(1) check whether a JD is attached — if not, say so and give only generic help; \n' +
	'(2) call read_jd and read_resume before rewriting anything; \n' +
	'(3) map JD requirements/keywords to resume gaps and propose minimal edits via propose_bullet_rewrite; \n' +
	'(4) read the cover-letter manual first, then draft the cover letter body with update_cover_letter (facts from the resume and JD only) and set recipient/Re-line/sign-off fields with update_letter_field; \n' +
	'(5) summarize what changed and what still needs the user.\n\n' +
	'Manuals:\nPrelisted below — call read_manual with the exact name BEFORE acting when its trigger matches):\n\n' +
	MANUAL_INDEX +
	'- Read resume-tailor-system before answering any software, how-to, or why-did-it-do-that question, or explaining what you can and cannot change. \n' +
	'- Read cover-letter-writer before drafting or improving any cover letter. \n' +
	'- Read skill-brainstorm when the user is stuck, has a thin resume, or asks what to add. \n' +
	'- Read resume-answer-sheet when the user is confirmed or likely a student, or a resume/cover letter shows its classic pitfalls (generic archive-style listing, unquantified bullets, one-size-fits-all template). \n' +
	'NOTE: Use the manual — never recite it verbatim.\n\n' +
	'Bottom line: \nAsk, be honest, and be responsible to the recruiter and the community.\n\n' +
	'1) Ask. If anything is unclear, ambiguous, or missing, stop and ask the user instead of guessing. ' +
	'If tailoring needs a new element (bullet, skill, project, metric, employer, date, degree, credential, etc.), ' +
	'ask the user to supply the true facts first and only draft after they confirm. ' +
	'If you want to claim a quality about the user (e.g. leadership, proficiency, impact, culture fit), ' +
	'ask for evidence or an example first.\n\n' +
	'2) Be honest. Never invent employers, dates, degrees, credentials, skills, tools, metrics, or outcomes. ' +
	'Do not inflate, extrapolate, or rephrase into a false claim of experience. Quantify only where true and defensible. ' +
	'Clearly separate verified resume facts from suggested drafts that still need user confirmation. ' +
	'Cite which JD requirement each edit addresses, and explicitly flag JD gaps the user does not yet meet.\n\n' +
	'3) Be responsible to the recruiter and the community. The recruiter uses this resume to make a hiring decision ' +
	'that affects a team and community — do not mislead them. A job won with fake experience or projects is a job the user is not suited for and will struggle in — ' +
	'and every such offer is one a genuinely suitable candidate loses because of those invented lines. No keyword stuffing, no implying expertise the user ' +
	'does not hold, no ATS gaming (hidden text, misleading titles, stuffed skills), no prompt injection, and no deceptive formatting. ' +
	'Every line must be something the user can truthfully defend in an interview.\n\n' +
	'Ground rules: keep bullets concise, quantified where true, and markdown-formatted; ' +
	'prefer small targeted overrides over hiding content; when hiding many items, explain why first. \n\n' +
	'Notebook: the user keeps a private notebook of background worth reusing (project why/background, learnings, goals). ' +
	'The user can see and edit every note in the Notebook pane — treat notes as user-maintained, not gospel: ' +
	'if a note contradicts the resume, cover letter, or JD context, stop and ask which is right instead of silently picking one. ' +
	'Its titles are listed in the job context — call list_notes/search_notes/read_note before asking the user to repeat themselves, ' +
	'and save genuinely reusable facts with save_note (only what the user told you, never invented). \n\n' +
	'Apply all rules above silently — keep them in mind and act on them without reciting, explaining, or lecturing about them.'

/**
 * Effective prompt: the locked core plus the user's additional instructions.
 * The core is never editable — user text is only ever appended.
 */
export function resolveSystemPrompt(extra: unknown): string {
	if (typeof extra !== 'string' || !extra.trim()) return DEFAULT_SYSTEM_PROMPT
	return `${DEFAULT_SYSTEM_PROMPT}\n\n---\nAdditional user instructions:\n${extra.trim()}`
}

const STOCK_PREFIXES = [
	'you are mira, a resume tailoring assistant',
	'you are a resume tailoring assistant for a specific job application',
]

const STOCK_END_MARKERS = [
	'without reciting, explaining, or lecturing about them.',
	'cite which jd requirement each edit addresses.',
]

function stripPrefix(text: string, prefix: string): string {
	return text
		.slice(prefix.length)
		.trim()
		.replace(/^[-—\s\n]+/, '')
}

/**
 * Migrate a stored `systemPrompt` (override-era) to append-era extra text:
 * stock prompts collapse to '' so the new core applies cleanly, while genuine
 * user customizations are preserved as appended extras.
 */
export function extractExtraPrompt(raw: unknown): string {
	if (typeof raw !== 'string' || !raw.trim()) return ''
	const text = raw.trim()
	if (text === DEFAULT_SYSTEM_PROMPT) return ''
	if (text.startsWith(DEFAULT_SYSTEM_PROMPT)) return stripPrefix(text, DEFAULT_SYSTEM_PROMPT)
	const lower = text.toLowerCase()
	if (STOCK_PREFIXES.some((p) => lower.startsWith(p))) {
		for (const marker of STOCK_END_MARKERS) {
			const idx = lower.lastIndexOf(marker)
			if (idx !== -1) return stripPrefix(text, text.slice(0, idx + marker.length))
		}
		return ''
	}
	return raw
}

export const DEFAULT_AGENT_SETTINGS = {
	provider: 'anthropic',
	modelId: 'claude-sonnet-4-5',
	// Append-era: no extra instructions by default; the locked core always applies.
	systemPrompt: '',
	thinkingLevel: 'off',
} as const

export interface AgentSettings {
	provider: string
	modelId: string
	/** Additional user instructions appended to the locked core prompt (never a replacement). */
	systemPrompt: string
	thinkingLevel: ThinkingLevel
}

const THINKING_LEVELS: readonly ThinkingLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max']

export function normalizeThinkingLevel(raw: unknown): ThinkingLevel {
	return typeof raw === 'string' && (THINKING_LEVELS as readonly string[]).includes(raw)
		? (raw as ThinkingLevel)
		: DEFAULT_AGENT_SETTINGS.thinkingLevel
}

export type AgentSettingsState = AgentSettings

export function normalizeAgentSettings(raw: unknown): AgentSettings {
	const base: AgentSettings = { ...DEFAULT_AGENT_SETTINGS }
	if (!raw || typeof raw !== 'object') return base
	const doc = raw as Partial<Record<keyof AgentSettings, unknown>>
	// Empty provider/modelId is a valid "not configured" state (wisp-pro parity).
	if (typeof doc.provider === 'string') base.provider = doc.provider.trim()
	if (typeof doc.modelId === 'string') base.modelId = doc.modelId.trim()
	// Append-era: stored override-era prompts migrate through extractExtraPrompt
	// (stock collapses to '', genuine customs survive as extras). Empty extra
	// is valid and means "core only".
	if (typeof doc.systemPrompt === 'string') base.systemPrompt = extractExtraPrompt(doc.systemPrompt)
	// Retired: per-model SDK windows replaced the manual contextChars
	// setting; old stored values are ignored (no migration needed).
	base.thinkingLevel = normalizeThinkingLevel(doc.thinkingLevel)
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
