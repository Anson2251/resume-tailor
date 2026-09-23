import type { Job, MasterResume } from '../data/types'
import { buildPreview } from '../data/workspace'

export const JD_CONTEXT_CHARS = 6000
export const RESUME_FIELD_CHARS = 1200
export const COVER_LETTER_CONTEXT_CHARS = 2000

export function truncate(text: string, max: number): string {
	if (!text) return ''
	const clean = text.trim()
	if (clean.length <= max) return clean
	return `${clean.slice(0, max).trimEnd()}…`
}

/** Compact, bounded snapshot of the tailored resume for the system prompt. */
export function resumeSnapshot(job: Job, master: MasterResume): string {
	const lines: string[] = []
	lines.push(`Target title: ${job.title || '(none)'}`)
	if (job.company || job.jobTitleTarget) {
		lines.push(`Target: ${[job.company, job.jobTitleTarget].filter(Boolean).join(' — ')}`)
	}
	lines.push(`Summary: ${truncate(job.summary || '(none)', 600)}`)
	try {
		const preview = buildPreview(master, job)
		const section = (name: string, items: { id: string; [k: string]: unknown }[], fields: string[]): void => {
			lines.push(`${name} (${items.length} shown):`)
			if (!items.length) {
				lines.push('  (none shown)')
				return
			}
			for (const item of items.slice(0, 12)) {
				const parts = fields
					.map((f) => {
						const v = item[f]
						if (v === undefined || v === null || v === '') return null
						return `${f}=${truncate(String(v), RESUME_FIELD_CHARS)}`
					})
					.filter(Boolean)
				lines.push(`  - id=${item.id} ${parts.join(' | ')}`)
			}
			if (items.length > 12) lines.push(`  … +${items.length - 12} more`)
		}
		section('Experience', preview.experience as never, ['role', 'company', 'startDate', 'endDate', 'bullets'])
		section('Projects', preview.projects as never, ['name', 'tech', 'bullets'])
		section('Education', preview.education as never, ['school', 'degree', 'field', 'details'])
		section('Skills', preview.skills as never, ['category', 'items'])
		for (const custom of preview.customSections || []) {
			section(`Custom/${custom.title}`, custom.items as never, ['heading', 'sub', 'dates', 'body'])
		}
	} catch {
		lines.push('(resume snapshot unavailable)')
	}
	lines.push(`Overrides: ${Object.keys(job.overrides || {}).length} customized item(s)`)
	return lines.join('\n')
}

export function jdBlock(job: Job): string {
	if (!job.jobDescription?.trim()) {
		return 'JD: NOT ATTACHED — ask the user to attach the posting PDF (JD PDF pane) before tailoring. Give only generic advice until then.'
	}
	const src = job.jdSource
	const label = src ? `${src.filename} (${src.pageCount} pages)` : 'attached'
	return [
		`JD: ATTACHED (${label}, ${job.jobDescription.length} chars)`,
		'--- JD text begins ---',
		truncate(job.jobDescription, JD_CONTEXT_CHARS),
		'--- JD text ends ---',
	].join('\n')
}

export function coverLetterBlock(job: Job): string {
	const text = (job.coverLetter || '').trim()
	if (!text) return 'Cover letter: empty draft.'
	return `Cover letter draft (${text.length} chars):\n${truncate(text, COVER_LETTER_CONTEXT_CHARS)}`
}

/** Grounded per-job context appended to the base system prompt on every request. */
export function buildJobContext(job: Job, master: MasterResume): string {
	return [
		`## Active job: ${job.name || '(untitled)'}`,
		jdBlock(job),
		'',
		'## Tailored resume snapshot',
		resumeSnapshot(job, master),
		'',
		`## ${coverLetterBlock(job)}`,
	].join('\n')
}

/** Base prompt + live job context. The base stays user-editable in settings. */
export function composeSystemPrompt(base: string, job: Job, master: MasterResume): string {
	const clean = (base || '').trim()
	return `${clean}\n\n---\n${buildJobContext(job, master)}`
}
