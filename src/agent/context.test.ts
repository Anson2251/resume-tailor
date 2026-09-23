import { describe, expect, it } from 'vitest'
import { blankResume } from '../data/resume'
import { blankJob } from '../data/workspace'
import { buildJobContext, composeSystemPrompt } from './context'

describe('job context grounding', () => {
	it('warns when no JD is attached', () => {
		const master = blankResume()
		const job = blankJob('Test job', master)
		job.jobDescription = ''
		const ctx = buildJobContext(job, master)
		expect(ctx).toContain('NOT ATTACHED')
	})

	it('embeds the JD excerpt and resume snapshot when attached', () => {
		const master = blankResume()
		const job = blankJob('Acme job', master)
		job.company = 'Acme'
		job.jobTitleTarget = 'Frontend Engineer'
		job.jobDescription = 'We need Vue and TypeScript experience.'
		job.summary = 'Frontend engineer.'
		const ctx = buildJobContext(job, master)
		expect(ctx).toContain('ATTACHED')
		expect(ctx).toContain('Vue and TypeScript')
		expect(ctx).toContain('Frontend engineer.')
	})

	it('appends live context after the editable base prompt', () => {
		const master = blankResume()
		const job = blankJob('Test job', master)
		const composed = composeSystemPrompt('Be concise.', job, master)
		expect(composed.startsWith('Be concise.')).toBe(true)
		expect(composed).toContain('Active job:')
	})
})
