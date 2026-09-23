import { Type } from '@earendil-works/pi-ai'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import type { Job } from '../data/types'

export interface JobMutations {
	applyOverride: (itemId: string, patch: Record<string, string | boolean>) => void
	setCoverLetter: (text: string) => void
	setVisibility: (section: string, ids: string[]) => void
}

const ok = (text: string) => ({ content: [{ type: 'text' as const, text }], details: {} })

/**
 * Four job-scoped tools. Hybrid rule lives here: drafts apply directly;
 * hiding more than half the shown items refuses to mutate and returns
 * `needsConfirm` so the UI can open a confirm modal instead.
 */
export function agentToolsFor(job: Job, mutate: JobMutations): AgentTool[] {
	const readResume: AgentTool = {
		name: 'read_resume',
		label: 'Read resume',
		description: 'Read the tailored resume preview and job description for the active job.',
		parameters: Type.Object({ section: Type.Optional(Type.String()) }),
		execute: async (_id, params) => {
			const p = params as { section?: string }
			const view = job.view as unknown as Record<string, unknown>
			const payload = p.section
				? { section: p.section, shown: view[p.section] ?? null }
				: {
						title: job.title,
						summary: job.summary,
						shownCounts: {
							experience: job.view.experience.length,
							projects: job.view.projects.length,
							education: job.view.education.length,
							skills: job.view.skills.length,
						},
						overrides: Object.keys(job.overrides).length,
						jobDescription: job.jobDescription,
						coverLetter: job.coverLetter,
					}
			return { content: [{ type: 'text', text: JSON.stringify(payload) }], details: {} }
		},
	}

	const proposeBulletRewrite: AgentTool = {
		name: 'propose_bullet_rewrite',
		label: 'Rewrite bullet',
		description: 'Rewrite one resume field as a per-job override (e.g. experience bullets).',
		parameters: Type.Object({ itemId: Type.String(), field: Type.String(), value: Type.String() }),
		execute: async (_id, params) => {
			const p = params as { itemId: string; field: string; value: string }
			mutate.applyOverride(p.itemId, { [p.field]: p.value })
			return ok(`Override applied: ${p.itemId}.${p.field}`)
		},
	}

	const updateCoverLetter: AgentTool = {
		name: 'update_cover_letter',
		label: 'Update cover letter',
		description: 'Replace the job cover letter draft (markdown).',
		parameters: Type.Object({ text: Type.String() }),
		execute: async (_id, params) => {
			mutate.setCoverLetter((params as { text: string }).text)
			return ok('Cover letter updated.')
		},
	}

	const setVisibility: AgentTool = {
		name: 'set_visibility',
		label: 'Set visibility',
		description: 'Set which item ids are shown for one resume section.',
		parameters: Type.Object({ section: Type.String(), ids: Type.Array(Type.String()) }),
		execute: async (_id, params) => {
			const p = params as { section: string; ids: string[] }
			const shown = (job.view as unknown as Record<string, string[]>)[p.section]
			if (Array.isArray(shown) && shown.length > 0 && p.ids.length < shown.length / 2) {
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
			mutate.setVisibility(p.section, p.ids)
			return ok(`Visibility updated for ${p.section}: ${p.ids.length} shown.`)
		},
	}

	return [readResume, proposeBulletRewrite, updateCoverLetter, setVisibility]
}
