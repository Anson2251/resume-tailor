import { Type } from '@earendil-works/pi-ai'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { CUSTOM_ITEM_FIELDS, SECTION_FIELDS, isSectionKey, readField } from '../data/resume'
import { buildPreview } from '../data/workspace'
import type { ContentItem, Job, MasterResume } from '../data/types'
import { JD_CONTEXT_CHARS, truncate } from './context'

export interface JobMutations {
	applyOverride: (itemId: string, patch: Record<string, string | boolean>) => void
	setCoverLetter: (text: string) => void
	setVisibility: (section: string, ids: string[]) => void
	setTitle: (title: string) => void
	setSummary: (summary: string) => void
}

const ok = (text: string, details: Record<string, unknown> = {}) => ({
	content: [{ type: 'text' as const, text }],
	details,
})

const err = (text: string, details: Record<string, unknown> = {}) => ({
	content: [{ type: 'text' as const, text: `Error: ${text}` }],
	details: { error: true, ...details },
})

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
		return { error: `Field "${field}" is not editable on this item. Allowed: ${(fields || []).join(', ') || '(none)'}.` }
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
			'Rewrite one resume field as a per-job override (e.g. experience bullets, project highlights, summary-adjacent fields). Get valid item ids from read_resume first.',
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
			return ok(`Override applied: ${p.itemId}.${p.field} (${String(before ?? '').length} → ${p.value.length} chars).`, {
				itemId: p.itemId,
				field: p.field,
				before: overrideBefore ?? before ?? null,
				after: p.value,
			})
		},
	}

	const updateTitle: AgentTool = {
		name: 'update_title',
		label: 'Update title',
		description: 'Replace the job-tailored resume title (the headline role shown under the name).',
		parameters: Type.Object({ title: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { title: string }
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
		description: 'Replace the job cover letter draft (markdown). Only use facts from the resume and JD.',
		parameters: Type.Object({ text: Type.String() }),
		execute: async (_id, params) => {
			const text = (params as { text: string }).text
			if (typeof text !== 'string') return err('text is required.')
			if (text.length > 12000) return err('Cover letter is too long (max 12000 chars).')
			const before = (job.coverLetter || '').length
			mutate.setCoverLetter(text)
			return ok(`Cover letter updated (${before} → ${text.length} chars).`, { beforeChars: before })
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
			const view = job.view as unknown as Record<string, string[]>
			const shown = view[p.section]
			if (!Array.isArray(shown)) {
				return err(
					`Unknown section "${p.section}". Use a repeatable section id from read_resume (not "summary").`,
				)
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

	return [readResume, readJd, rewriteField, updateTitle, updateSummary, updateCoverLetter, setVisibility]
}
