import coverLetterRaw from './manuals/cover-letter.md?raw'
import resumeTailorRaw from './manuals/resume-tailor.md?raw'
import skillBrainstormRaw from './manuals/skill-brainstorm.md?raw'

export interface Manual {
	name: string
	description: string
	body: string
	chars: number
}

/** Per-read body budget so one manual can't eat the context window. */
export const MANUAL_BODY_CHARS = 12000

interface Frontmatter {
	name: string
	description: string
	body: string
}

/**
 * Minimal frontmatter parser (no dependency): expects
 * `---\nname: ...\ndescription: ...\n---\n<body>`.
 * The description may span multiple continued lines.
 */
export function parseManual(raw: string): Frontmatter {
	const text = raw.replace(/\r\n/g, '\n')
	const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
	if (!match) return { name: '', description: '', body: text.trim() }
	const [, header, body] = match
	let name = ''
	const descLines: string[] = []
	let inDesc = false
	for (const line of (header ?? '').split('\n')) {
		const nameMatch = line.match(/^name:\s*(.+?)\s*$/)
		if (nameMatch) {
			name = nameMatch[1] ?? ''
			inDesc = false
			continue
		}
		const descMatch = line.match(/^description:\s*(.*)$/)
		if (descMatch) {
			descLines.push((descMatch[1] ?? '').trim())
			inDesc = true
			continue
		}
		if (inDesc && /^\s+\S/.test(line)) {
			descLines.push(line.trim())
			continue
		}
		inDesc = false
	}
	return { name: name.trim(), description: descLines.join(' ').trim(), body: (body ?? '').trim() }
}

function toManual(raw: string): Manual {
	const parsed = parseManual(raw)
	return { name: parsed.name, description: parsed.description, body: parsed.body, chars: parsed.body.length }
}

export const MANUALS: Manual[] = [toManual(coverLetterRaw), toManual(resumeTailorRaw), toManual(skillBrainstormRaw)]

/**
 * Preinjected index (yaml name + description only): baked into the system
 * prompt so Mira always knows what exists and when to read one, without
 * spending a tool call to list them.
 */
export const MANUAL_INDEX: string = MANUALS.map((m) => `- ${m.name}: ${m.description}`).join('\n')

/** Exact-name lookup (trimmed); returns undefined for unknown names. */
export function getManual(name: string): Manual | undefined {
	const clean = (name || '').trim()
	if (!clean) return undefined
	return MANUALS.find((m) => m.name === clean)
}

/** Body slice for one tool read; sets truncated when over budget. */
export function manualBodyFor(manual: Manual, maxChars: number = MANUAL_BODY_CHARS): { body: string; truncated: boolean } {
	if (manual.body.length <= maxChars) return { body: manual.body, truncated: false }
	return { body: `${manual.body.slice(0, maxChars).trimEnd()}…`, truncated: true }
}
