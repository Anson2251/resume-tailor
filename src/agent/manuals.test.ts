import { describe, expect, it } from 'vitest'
import { MANUALS, MANUAL_BODY_CHARS, MANUAL_INDEX, getManual, manualBodyFor, parseManual } from './manuals'

describe('manual frontmatter', () => {
	it('parses name, description and body', () => {
		const parsed = parseManual('---\nname: demo\ndescription: Does things.\n---\n\n# Body\n')
		expect(parsed.name).toBe('demo')
		expect(parsed.description).toBe('Does things.')
		expect(parsed.body).toBe('# Body')
	})

	it('joins continued description lines', () => {
		const parsed = parseManual('---\nname: demo\ndescription: Line one.\n  Line two.\n---\nBody\n')
		expect(parsed.description).toBe('Line one. Line two.')
	})
})

describe('manual registry', () => {
	it('registers three manuals with non-empty bodies', () => {
		expect(MANUALS.map((m) => m.name)).toEqual(['cover-letter-writer', 'resume-tailor-system', 'skill-brainstorm'])
		for (const m of MANUALS) {
			expect(m.description.length).toBeGreaterThan(20)
			expect(m.body.length).toBeGreaterThan(100)
		}
	})

	it('preinjects a name+description index with no bodies', () => {
		expect(MANUAL_INDEX).toContain('cover-letter-writer:')
		expect(MANUAL_INDEX).toContain('resume-tailor-system:')
		expect(MANUAL_INDEX).toContain('skill-brainstorm:')
		expect(MANUAL_INDEX.length).toBeLessThan(2000)
	})

	it('looks up by exact trimmed name only', () => {
		expect(getManual('  cover-letter-writer  ')?.name).toBe('cover-letter-writer')
		expect(getManual('nope')).toBeUndefined()
		expect(getManual('')).toBeUndefined()
	})

	it('truncates long bodies over budget', () => {
		const long = getManual('cover-letter-writer')!
		const { body, truncated } = manualBodyFor(long, 100)
		expect(truncated).toBe(true)
		expect(body.length).toBeLessThanOrEqual(101)
		const { truncated: small } = manualBodyFor(long, MANUAL_BODY_CHARS * 10)
		expect(small).toBe(false)
	})
})
