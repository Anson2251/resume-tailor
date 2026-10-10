import type { Job, MasterResume } from '../data/types'
import { buildPreview } from '../data/workspace'

export const JD_CONTEXT_CHARS = 6000
export const RESUME_FIELD_CHARS = 1200
export const COVER_LETTER_CONTEXT_CHARS = 2000
export const NOTE_BODY_CHARS = 4000

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
	const letter = job.letter
	const text = (letter?.body || '').trim()
	const header = [
		letter?.recipientTitle?.trim(),
		letter?.jobTitle?.trim(),
		letter?.postingNumber?.trim() ? `Posting ${letter.postingNumber.trim()}` : '',
	]
		.filter(Boolean)
		.join(' | ')
	if (!text) return `Cover letter: empty draft.${header ? ` (${header})` : ''}`
	return `Cover letter draft (${text.length} chars)${header ? ` — ${header}` : ''}:\n${truncate(text, COVER_LETTER_CONTEXT_CHARS)}`
}

/** Index-only notebook block: titles go into every prompt, bodies stay behind read_note. */
export function notebookBlock(master: MasterResume): string {
	const notes = master?.notes || []
	if (!notes.length) return 'Notebook: empty — no private notes yet. If the user shares background worth reusing, save it with save_note.'
	const titles = notes.map((n) => n.title?.trim() || '(untitled)').slice(0, 30)
	const extra = notes.length > 30 ? ` (+${notes.length - 30} more)` : ''
	return [
		`Notebook: ${notes.length} private note(s) — ${titles.join(' | ')}${extra}`,
		'Check list_notes / search_notes / read_note before asking the user to repeat background they may have written down.',
	].join('\n')
}

/** Grounded per-job context appended to the base system prompt on every request. */
export function buildJobContext(job: Job, master: MasterResume): string {
	const scope =
		job.kind === 'master'
			? '## Scope: MASTER profile (shared canonical content). Coach freely and refine wording with propose_bullet_rewrite — title/summary/visibility/letter tools refuse on Master. Ask the user to switch to (or create) a job profile for tailoring.'
			: null
	return [
		`## Active job: ${job.name || '(untitled)'}`,
		...(scope ? [scope, ''] : []),
		jdBlock(job),
		'',
		'## Tailored resume snapshot',
		resumeSnapshot(job, master),
		'',
		notebookBlock(master),
		'',
		`## ${coverLetterBlock(job)}`,
	].join('\n')
}

/** Base prompt + live job context. The base stays user-editable in settings. */
export function composeSystemPrompt(base: string, job: Job, master: MasterResume): string {
	const clean = (base || '').trim()
	return `${clean}\n\n---\n${buildJobContext(job, master)}`
}
