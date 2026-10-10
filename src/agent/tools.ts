import { Type } from '@earendil-works/pi-ai'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { CUSTOM_ITEM_FIELDS, SECTION_FIELDS, isSectionKey, readField } from '../data/resume'
import { buildPreview } from '../data/workspace'
import type { ContentItem, Job, MasterResume, MemoryNote } from '../data/types'
import { JD_CONTEXT_CHARS, NOTE_BODY_CHARS, truncate } from './context'
import { MANUAL_BODY_CHARS, MANUALS, getManual, manualBodyFor } from './manuals'

export interface JobMutations {
	applyOverride: (itemId: string, patch: Record<string, string | boolean>) => void
	setCoverLetter: (text: string) => void
	setLetterField: (field: string, value: string | boolean) => void
	setVisibility: (section: string, ids: string[]) => void
	setTitle: (title: string) => void
	setSummary: (summary: string) => void
	saveNote: (note: { id?: string; title: string; body: string }) => MemoryNote | null
	deleteNote: (id: string) => boolean
	patchNote: (id: string, search: string, replace: string) => PatchResult
}

/** Outcome of a notebook string patch: exactly-one-match replaces, anything else refuses. */
export type PatchResult =
	| { ok: true; note: MemoryNote; beforeChars: number; afterChars: number }
	| { ok: false; reason: 'not_found' | 'no_match' | 'multiple' | 'too_long'; matches: number }

/**
 * Exact-phrase patch on one note body. Pure (mutates the passed-in note on
 * success) so the panel and tests share it: zero or 2+ matches refuse with
 * the count, so the caller narrows the search string instead of guessing.
 */
export function patchNoteInList(notes: MemoryNote[], id: string, search: string, replace: string): PatchResult {
	const note = notes.find((n) => n.id === id)
	if (!note) return { ok: false, reason: 'not_found', matches: 0 }
	if (!search) return { ok: false, reason: 'no_match', matches: 0 }
	const matches = note.body.split(search).length - 1
	if (matches === 0) return { ok: false, reason: 'no_match', matches: 0 }
	if (matches > 1) return { ok: false, reason: 'multiple', matches }
	const next = note.body.replace(search, replace)
	if (next.length > 8000) return { ok: false, reason: 'too_long', matches: 1 }
	const beforeChars = note.body.length
	note.body = next
	note.updatedAt = Date.now()
	return { ok: true, note, beforeChars, afterChars: next.length }
}

const ok = (text: string, details: Record<string, unknown> = {}) => ({
	content: [{ type: 'text' as const, text }],
	details,
})

const err = (text: string, details: Record<string, unknown> = {}) => ({
	content: [{ type: 'text' as const, text: `Error: ${text}` }],
	details: { error: true, ...details },
})

/**
 * Master holds the shared canonical content — job tailoring (title, summary,
 * visibility, letter) refuses on it with guidance. Field rewrites stay allowed:
 * on Master they refine the shared wording. Reads and chat coaching stay available.
 */
function masterGuard(job: Job): ReturnType<typeof err> | null {
	if (job.kind !== 'master') return null
	return err(
		'This is the Master profile (shared canonical content). Title, summary, visibility, and cover letter live on job profiles — switch to a job to tailor those. Field rewrites are allowed here and refine the shared wording.',
	)
}

function allMasterItems(master: MasterResume): Map<string, { item: ContentItem; section: string }> {
	const byId = new Map<string, { item: ContentItem; section: string }>()
	const put = (section: string, list: ContentItem[] | undefined): void => {
		for (const item of list || []) byId.set(item.id, { item, section })
	}
	put('experience', master.experience)
	put('projects', master.projects)
	put('education', master.education)
	put('skills', master.skills)
	for (const s of master.customSections || []) put(s.id, s.items)
	return byId
}

function allowedFields(section: string): string[] | null {
	if (isSectionKey(section)) return SECTION_FIELDS[section]
	// Custom-section ids accept the generic custom item fields.
	return CUSTOM_ITEM_FIELDS
}

function fieldAllowed(itemId: string, field: string, master: MasterResume): { section: string } | { error: string } {
	const found = allMasterItems(master).get(itemId)
	if (!found) return { error: `Unknown item id "${itemId}". Call read_resume first to list valid ids.` }
	const fields = allowedFields(found.section)
	if (!fields || !fields.includes(field)) {
		return {
			error: `Field "${field}" is not editable on this item. Allowed: ${(fields || []).join(', ') || '(none)'}.`,
		}
	}
	return { section: found.section }
}

/**
 * Job-scoped tools. Reads are grounded in the resolved preview + attached JD;
 * writes validate ids/fields first and return before/after diffs so the UI
 * preview/finetune loop stays visible. Destructive mass-hides refuse to mutate
 * and return `needsConfirm` for the UI confirm modal.
 */
export function agentToolsFor(job: Job, master: MasterResume, mutate: JobMutations): AgentTool[] {
	const readResume: AgentTool = {
		name: 'read_resume',
		label: 'Read resume',
		description:
			'Read the full tailored resume for the active job: title, summary, and every shown item with its id and fields. Pass section (experience|projects|education|skills or a custom section id) to narrow it.',
		parameters: Type.Object({ section: Type.Optional(Type.String()) }),
		execute: async (_id, params) => {
			const p = params as { section?: string }
			try {
				const preview = buildPreview(master, job)
				const sections: Record<string, unknown> = {
					experience: preview.experience,
					projects: preview.projects,
					education: preview.education,
					skills: preview.skills,
				}
				for (const custom of preview.customSections || []) sections[custom.id] = custom.items
				const payload: Record<string, unknown> = {
					title: job.title,
					summary: truncate(job.summary || '', 2000),
					overrides: Object.keys(job.overrides || {}).length,
					letter: {
						recipientTitle: job.letter?.recipientTitle || null,
						jobTitle: job.letter?.jobTitle || null,
						bodyChars: (job.letter?.body || '').length,
						body: truncate(job.letter?.body || '', 4000),
					},
				}
				if (p.section) {
					if (!(p.section in sections)) return err(`Unknown section "${p.section}".`)
					payload.section = p.section
					payload.items = sections[p.section]
				} else {
					payload.shownCounts = {
						experience: preview.experience.length,
						projects: preview.projects.length,
						education: preview.education.length,
						skills: preview.skills.length,
					}
					payload.sections = sections
				}
				return ok(JSON.stringify(payload), {})
			} catch (e) {
				return err(`Could not read the resume: ${e instanceof Error ? e.message : String(e)}`)
			}
		},
	}

	const readJd: AgentTool = {
		name: 'read_jd',
		label: 'Read job description',
		description:
			'Read the attached job description for the active job. Returns attached:false when no JD PDF has been attached yet.',
		parameters: Type.Object({}),
		execute: async () => {
			const text = (job.jobDescription || '').trim()
			if (!text) {
				if (job.kind === 'master') {
					return ok(
						JSON.stringify({
							attached: false,
							hint: 'Master holds no JD by design. Ask the user to switch to a job profile (or create one) and attach the posting there.',
						}),
						{ attached: false },
					)
				}
				return ok(
					JSON.stringify({
						attached: false,
						hint: 'No JD attached. Ask the user to attach the posting PDF in the JD PDF pane; give only generic advice until then.',
					}),
					{ attached: false },
				)
			}
			return ok(
				JSON.stringify({
					attached: true,
					company: job.company || null,
					role: job.jobTitleTarget || null,
					filename: job.jdSource?.filename ?? null,
					pageCount: job.jdSource?.pageCount ?? null,
					chars: text.length,
					text: truncate(text, JD_CONTEXT_CHARS),
				}),
				{ attached: true },
			)
		},
	}

	const rewriteField: AgentTool = {
		name: 'propose_bullet_rewrite',
		label: 'Rewrite field',
		description:
			'Rewrite one resume field (e.g. experience bullets, project highlights). On a job this saves a per-job override; on Master it refines the shared wording for every job. Get valid item ids from read_resume first.',
		parameters: Type.Object({ itemId: Type.String(), field: Type.String(), value: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { itemId: string; field: string; value: string }
			if (!p.itemId || !p.field || typeof p.value !== 'string') {
				return err('itemId, field and value are all required.')
			}
			if (p.value.length > 8000) return err('Value is too long (max 8000 chars). Keep rewrites concise.')
			const check = fieldAllowed(p.itemId, p.field, master)
			if ('error' in check) return err(check.error)
			const found = allMasterItems(master).get(p.itemId)
			const before = found ? readField(found.item, p.field) : undefined
			const overrideBefore = job.overrides?.[p.itemId]?.[p.field]
			mutate.applyOverride(p.itemId, { [p.field]: p.value })
			return ok(
				`Override applied: ${p.itemId}.${p.field} (${String(before ?? '').length} → ${p.value.length} chars).`,
				{
					itemId: p.itemId,
					field: p.field,
					before: overrideBefore ?? before ?? null,
					after: p.value,
				},
			)
		},
	}

	const updateTitle: AgentTool = {
		name: 'update_title',
		label: 'Update title',
		description: 'Replace the job-tailored resume title (the headline role shown under the name).',
		parameters: Type.Object({ title: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { title: string }
			const blocked = masterGuard(job)
			if (blocked) return blocked
			if (typeof p.title !== 'string') return err('title is required.')
			if (p.title.length > 160) return err('Title is too long (max 160 chars).')
			const before = job.title || ''
			mutate.setTitle(p.title)
			return ok(`Title updated (${before.length} → ${p.title.length} chars).`, { before, after: p.title })
		},
	}

	const updateSummary: AgentTool = {
		name: 'update_summary',
		label: 'Update summary',
		description: 'Replace the job-tailored professional summary (markdown). Keep it concise and JD-aligned.',
		parameters: Type.Object({ summary: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { summary: string }
			const blocked = masterGuard(job)
			if (blocked) return blocked
			if (typeof p.summary !== 'string') return err('summary is required.')
			if (p.summary.length > 4000) return err('Summary is too long (max 4000 chars).')
			const before = (job.summary || '').length
			mutate.setSummary(p.summary)
			return ok(`Summary updated (${before} → ${p.summary.length} chars).`, { beforeChars: before })
		},
	}

	const updateCoverLetter: AgentTool = {
		name: 'update_cover_letter',
		label: 'Update cover letter',
		description:
			'Replace the cover letter body (markdown). Only use facts from the resume and JD. Header, recipient and signature render automatically.',
		parameters: Type.Object({ text: Type.String() }),
		execute: async (_id, params) => {
			const text = (params as { text: string }).text
			const blocked = masterGuard(job)
			if (blocked) return blocked
			if (typeof text !== 'string') return err('text is required.')
			if (text.length > 12000) return err('Cover letter is too long (max 12000 chars).')
			const before = (job.letter?.body || '').length
			mutate.setCoverLetter(text)
			return ok(`Cover letter updated (${before} → ${text.length} chars).`, { beforeChars: before })
		},
	}

	const LETTER_FIELDS = [
		'recipientTitle',
		'recipientAddress',
		'jobTitle',
		'postingNumber',
		'showReLine',
		'signoff',
		'dateMode',
		'dateCustom',
		'credentialLine',
	] as const

	const updateLetterField: AgentTool = {
		name: 'update_letter_field',
		label: 'Update letter field',
		description:
			'Update one structured cover-letter field (recipient, Re line, sign-off, date). Use update_cover_letter for the body text.',
		parameters: Type.Object({ field: Type.String(), value: Type.Union([Type.String(), Type.Boolean()]) }),
		execute: async (_id, params) => {
			const p = params as { field: string; value: string | boolean }
			const blocked = masterGuard(job)
			if (blocked) return blocked
			if (!(LETTER_FIELDS as readonly string[]).includes(p.field)) {
				return err(`Unknown letter field "${p.field}". Allowed: ${LETTER_FIELDS.join(', ')}.`)
			}
			if (p.field === 'showReLine') {
				if (typeof p.value !== 'boolean') return err('showReLine needs a boolean value.')
			} else if (p.field === 'dateMode') {
				if (p.value !== 'auto' && p.value !== 'custom') return err('dateMode must be "auto" or "custom".')
			} else {
				if (typeof p.value !== 'string') return err(`${p.field} needs a string value.`)
				if (p.value.length > 2000) return err(`${p.field} is too long (max 2000 chars).`)
			}
			mutate.setLetterField(p.field, p.value)
			return ok(`Letter field ${p.field} updated.`, { field: p.field, after: p.value })
		},
	}

	const setVisibility: AgentTool = {
		name: 'set_visibility',
		label: 'Set visibility',
		description:
			'Set which item ids are shown for one resume section. Get current ids from read_resume. Hiding more than half needs user confirmation.',
		parameters: Type.Object({ section: Type.String(), ids: Type.Array(Type.String()) }),
		execute: async (_id, params) => {
			const p = params as { section: string; ids: string[] }
			const blocked = masterGuard(job)
			if (blocked) return blocked
			const view = job.view as unknown as Record<string, string[]>
			const shown = view[p.section]
			if (!Array.isArray(shown)) {
				return err(`Unknown section "${p.section}". Use a repeatable section id from read_resume (not "summary").`)
			}
			const byId = allMasterItems(master)
			const unknown = p.ids.filter((id) => !byId.has(id))
			if (unknown.length) return err(`Unknown item ids: ${unknown.join(', ')}.`)
			const wrongSection = p.ids.filter((id) => byId.get(id)?.section !== p.section)
			if (wrongSection.length) {
				return err(`These ids do not belong to section "${p.section}": ${wrongSection.join(', ')}.`)
			}
			if (shown.length > 0 && p.ids.length < shown.length / 2) {
				return {
					content: [
						{
							type: 'text',
							text: `Refused: hiding ${shown.length - p.ids.length} of ${shown.length} items needs user confirmation.`,
						},
					],
					details: { needsConfirm: true, section: p.section, ids: p.ids },
				}
			}
			const removed = shown.filter((id) => !p.ids.includes(id))
			const added = p.ids.filter((id) => !shown.includes(id))
			mutate.setVisibility(p.section, p.ids)
			return ok(`Visibility updated for ${p.section}: ${p.ids.length} shown (+${added.length}/-${removed.length}).`, {
				section: p.section,
				added,
				removed,
			})
		},
	}

	const readManual: AgentTool = {
		name: 'read_manual',
		label: 'Read manual',
		description:
			'Read one Mira manual by exact name for its full guidance. Check dynamically when the trigger matches: app-behavior questions, cover-letter drafting, or brainstorming with no ideas. Names and triggers are listed in the system prompt.',
		parameters: Type.Object({ name: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { name: string }
			if (typeof p.name !== 'string' || !p.name.trim()) {
				return err(`Manual name is required. Available: ${MANUALS.map((m) => m.name).join(', ')}.`)
			}
			const manual = getManual(p.name)
			if (!manual) {
				return err(`Unknown manual "${p.name}". Available: ${MANUALS.map((m) => m.name).join(', ')}.`)
			}
			const { body, truncated } = manualBodyFor(manual, MANUAL_BODY_CHARS)
			return ok(
				JSON.stringify({
					name: manual.name,
					description: manual.description,
					chars: manual.chars,
					truncated,
					body,
				}),
				{ manual: manual.name },
			)
		},
	}

	const listNotes: AgentTool = {
		name: 'list_notes',
		label: 'List notes',
		description:
			'List the private notebook index: note ids, titles, and short previews. Call read_note for the full body of one.',
		parameters: Type.Object({}),
		execute: async () => {
			const notes = master.notes || []
			return ok(
				JSON.stringify({
					count: notes.length,
					notes: notes.map((n) => ({
						id: n.id,
						title: n.title || '(untitled)',
						preview: truncate(n.body || '', 120),
						updatedAt: n.updatedAt || 0,
					})),
				}),
				{ count: notes.length },
			)
		},
	}

	const findNote = (key: string): MemoryNote | undefined => {
		const notes = master.notes || []
		const clean = (key || '').trim()
		if (!clean) return undefined
		return notes.find((n) => n.id === clean) || notes.find((n) => (n.title || '').trim() === clean)
	}

	const readNote: AgentTool = {
		name: 'read_note',
		label: 'Read note',
		description: 'Read one private notebook note by id or exact title. Use list_notes first to find it.',
		parameters: Type.Object({ key: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { key: string }
			if (typeof p.key !== 'string' || !p.key.trim()) return err('key (id or title) is required.')
			const note = findNote(p.key)
			if (!note) return err(`No note found for "${p.key}". Call list_notes to see titles.`)
			return ok(
				JSON.stringify({
					id: note.id,
					title: note.title,
					chars: (note.body || '').length,
					body: truncate(note.body || '', NOTE_BODY_CHARS),
				}),
				{ id: note.id },
			)
		},
	}

	/** ~120-char snippet around the first query hit, for search results. */
	function snippetFor(body: string, query: string, radius = 60): string {
		const text = body || ''
		const idx = text.toLowerCase().indexOf(query.toLowerCase())
		if (idx === -1) return truncate(text, 120)
		const start = Math.max(0, idx - radius)
		const end = Math.min(text.length, idx + query.length + radius)
		return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`
	}

	const searchNotes: AgentTool = {
		name: 'search_notes',
		label: 'Search notes',
		description:
			'Full-text search across private notebook titles and bodies. Returns matching notes with snippets — call read_note for the full body of one.',
		parameters: Type.Object({ query: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { query: string }
			if (typeof p.query !== 'string' || !p.query.trim()) return err('query is required.')
			const q = p.query.trim().toLowerCase()
			const hits = (master.notes || []).filter((n) =>
				`${n.title || ''}\n${n.body || ''}`.toLowerCase().includes(q),
			)
			return ok(
				JSON.stringify({
					query: p.query.trim(),
					count: hits.length,
					notes: hits.slice(0, 10).map((n) => ({
						id: n.id,
						title: n.title || '(untitled)',
						matchedTitle: (n.title || '').toLowerCase().includes(q),
						snippet: snippetFor(n.body || '', q),
					})),
				}),
				{ count: hits.length },
			)
		},
	}

	const saveNote: AgentTool = {
		name: 'save_note',
		label: 'Save note',
		description:
			'Save background worth reusing to the private notebook (project why/background, learnings, career goals). Upserts by id, else by exact title match, else creates. Never invent facts — only save what the user told you.',
		parameters: Type.Object({
			title: Type.String(),
			body: Type.String(),
			id: Type.Optional(Type.String()),
		}),
		execute: async (_id, params) => {
			const p = params as { title: string; body: string; id?: string }
			if (typeof p.title !== 'string' || typeof p.body !== 'string') return err('title and body are required.')
			if (!p.title.trim() && !p.body.trim()) return err('Empty note — nothing to save.')
			if (p.title.length > 120) return err('Title is too long (max 120 chars).')
			if (p.body.length > 8000) return err('Body is too long (max 8000 chars).')
			const saved = mutate.saveNote({ id: p.id, title: p.title, body: p.body })
			if (!saved) return err('Could not save the note.')
			return ok(`Note saved: "${saved.title || '(untitled)'}".`, { id: saved.id })
		},
	}

	const patchNote: AgentTool = {
		name: 'patch_note',
		label: 'Patch note',
		description:
			'Exact-phrase search-replace inside one private notebook note body. Fails when the search text is absent or matches more than once — then read the note and retry with a longer unique string.',
		parameters: Type.Object({ id: Type.String(), search: Type.String(), replace: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { id: string; search: string; replace: string }
			if (typeof p.id !== 'string' || !p.id.trim()) return err('id is required (see list_notes).')
			if (typeof p.search !== 'string' || !p.search) return err('search is required and must be non-empty.')
			if (typeof p.replace !== 'string') return err('replace is required (use "" to delete the phrase).')
			if (p.replace.length > 8000) return err('Replacement is too long (max 8000 chars).')
			const res = mutate.patchNote(p.id.trim(), p.search, p.replace)
			if (!res.ok) {
				if (res.reason === 'multiple')
					return err(
						`Search text matches ${res.matches} times — retry with a longer unique string. Nothing was changed.`,
					)
				if (res.reason === 'no_match')
					return err('Search text not found in that note. Call read_note to see its exact wording.')
				if (res.reason === 'too_long')
					return err('Patched body would exceed 8000 chars. Shorten the replacement or split the edit.')
				return err(`No note found for "${p.id}". Call list_notes to see ids.`)
			}
			return ok(`Patched note "${res.note.title || '(untitled)'}" (${res.beforeChars} → ${res.afterChars} chars).`, {
				id: res.note.id,
				beforeChars: res.beforeChars,
				afterChars: res.afterChars,
			})
		},
	}

	const deleteNote: AgentTool = {
		name: 'delete_note',
		label: 'Delete note',
		description: 'Delete one private notebook note by id. Use list_notes first to find it.',
		parameters: Type.Object({ id: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { id: string }
			if (typeof p.id !== 'string' || !p.id.trim()) return err('id is required.')
			const done = mutate.deleteNote(p.id.trim())
			if (!done) return err(`No note found for "${p.id}".`)
			return ok('Note deleted.', { id: p.id.trim() })
		},
	}

	return [
		readResume,
		readJd,
		readManual,
		listNotes,
		readNote,
		searchNotes,
		saveNote,
		patchNote,
		deleteNote,
		rewriteField,
		updateTitle,
		updateSummary,
		updateCoverLetter,
		updateLetterField,
		setVisibility,
	]
}
