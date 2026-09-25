import type { CoverLetter, MasterResume } from './types'

export const LETTER_SIGNOFF_DEFAULT = 'Sincerely,'

/** Credential default from the first (most recent) education entry. */
export function defaultCredentialLine(master: MasterResume): string {
	const edu = master.education?.[0]
	const degree = (edu?.degree || '').trim()
	const school = (edu?.school || '').trim()
	if (!degree && !school) return ''
	if (!degree) return school
	if (!school) return `${degree} Candidate`
	return `${degree} Candidate | ${school}`
}

export function blankLetter(jobTitle = '', credentialLine = ''): CoverLetter {
	return {
		recipientTitle: '',
		recipientAddress: '',
		jobTitle,
		postingNumber: '',
		showReLine: true,
		body: '',
		signoff: LETTER_SIGNOFF_DEFAULT,
		dateMode: 'auto',
		dateCustom: '',
		credentialLine,
	}
}

function str(value: unknown): string {
	return typeof value === 'string' ? value : ''
}

/** Normalize raw persisted JSON into a fully typed letter. */
export function normalizeLetter(raw: any, fallbackJobTitle = '', fallbackCredential = ''): CoverLetter {
	const clean = blankLetter()
	if (!raw || typeof raw !== 'object') {
		clean.jobTitle = fallbackJobTitle
		clean.credentialLine = fallbackCredential
		return clean
	}
	clean.recipientTitle = str(raw.recipientTitle)
	clean.recipientAddress = str(raw.recipientAddress)
	const jobTitle = str(raw.jobTitle)
	clean.jobTitle = jobTitle || fallbackJobTitle
	clean.postingNumber = str(raw.postingNumber).slice(0, 60)
	clean.showReLine = raw.showReLine === undefined ? true : raw.showReLine === true
	// Legacy v3 saves kept the draft as a top-level coverLetter string.
	const body = str(raw.body) || str((raw as { coverLetter?: unknown }).coverLetter)
	clean.body = body
	const signoff = str(raw.signoff)
	clean.signoff = signoff || LETTER_SIGNOFF_DEFAULT
	clean.dateMode = raw.dateMode === 'custom' ? 'custom' : 'auto'
	clean.dateCustom = str(raw.dateCustom).slice(0, 60)
	const credential = str(raw.credentialLine)
	clean.credentialLine = credential || fallbackCredential
	return clean
}

/** `Re: <title> (Posting <n>)` — empty unless the line is enabled with a title. */
export function composeReLine(letter: Pick<CoverLetter, 'jobTitle' | 'postingNumber' | 'showReLine'>): string {
	if (!letter.showReLine) return ''
	const title = (letter.jobTitle || '').trim()
	if (!title) return ''
	const posting = (letter.postingNumber || '').trim()
	return posting ? `Re: ${title} (Posting ${posting})` : `Re: ${title}`
}

/** Display date for the letter header. */
export function letterDate(letter: Pick<CoverLetter, 'dateMode' | 'dateCustom'>, now = new Date()): string {
	if (letter.dateMode === 'custom') return (letter.dateCustom || '').trim()
	return now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

/** Sender contact line: `email | website | phone | region`. */
export function letterContactLine(contact: MasterResume['contact']): string {
	return [contact.email, contact.website, contact.phone, contact.location]
		.map((s) => (s || '').trim())
		.filter(Boolean)
		.join(' | ')
}
