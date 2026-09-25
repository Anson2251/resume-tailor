import { describe, expect, it } from 'vitest'
import { blankLetter, composeReLine, defaultCredentialLine, letterDate, normalizeLetter } from './letter'
import { blankResume, sampleResume } from './resume'

describe('cover letter helpers', () => {
	it('builds the credential default from the first education entry', () => {
		expect(defaultCredentialLine(sampleResume())).toBe('B.S. Candidate | State University')
		expect(defaultCredentialLine(blankResume())).toBe('')
	})

	it('composes the Re line, dropping empty parts', () => {
		expect(composeReLine(blankLetter('Frontend Engineer', ''))).toBe('Re: Frontend Engineer')
		expect(composeReLine({ ...blankLetter('Role', ''), postingNumber: '123' })).toBe('Re: Role (Posting 123)')
		expect(composeReLine({ ...blankLetter('Role', ''), showReLine: false })).toBe('')
		expect(composeReLine(blankLetter('', ''))).toBe('')
	})

	it('formats auto vs custom dates', () => {
		const fixed = new Date(2026, 8, 24)
		expect(letterDate(blankLetter(), fixed)).toBe(
			fixed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
		)
		expect(letterDate({ dateMode: 'custom', dateCustom: '24 Sept 2026' } as never, fixed)).toBe('24 Sept 2026')
	})

	it('migrates a legacy coverLetter string into body', () => {
		const letter = normalizeLetter({ coverLetter: 'Dear team…' }, 'Role', 'Cred')
		expect(letter.body).toBe('Dear team…')
		expect(letter.jobTitle).toBe('Role')
		expect(letter.credentialLine).toBe('Cred')
		expect(letter.signoff).toBe('Sincerely,')
		expect(letter.showReLine).toBe(true)
	})

	it('falls back safely on garbage input', () => {
		const letter = normalizeLetter(null, 'Role', '')
		expect(letter.body).toBe('')
		expect(letter.dateMode).toBe('auto')
		const weird = normalizeLetter({ showReLine: 'no', dateMode: 'whenever' })
		expect(weird.showReLine).toBe(false)
		expect(weird.dateMode).toBe('auto')
	})
})
