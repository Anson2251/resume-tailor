import { describe, expect, it } from 'vitest'
import { migrate } from './workspace'

describe('v2 profiles -> v3 jobs', () => {
	it('maps profiles to jobs with empty chat and readonly JD', () => {
		const v2 = {
			version: 2,
			master: { contact: {}, experience: [], projects: [], education: [], skills: [], customSections: [] },
			profiles: [
				{
					id: 'p1',
					name: 'Master',
					master: true,
					title: 'Eng',
					summary: 's',
					sections: [],
					view: { experience: [], projects: [], education: [], skills: [], custom: {} },
					overrides: {},
				},
			],
			activeProfileId: 'p1',
		}
		const ws = migrate(v2) as unknown as {
			version: number
			jobs: { kind: string; conversations: { thread: { entryId: null } }[]; activeConversationId: null }[]
			activeJobId: string
		}
		expect(ws.version).toBe(3)
		expect(ws.jobs[0].kind).toBe('master')
		expect(ws.jobs[0].conversations).toHaveLength(1)
		expect(ws.jobs[0].conversations[0].thread.entryId).toBe(null)
		expect(ws.activeJobId).toBe('p1')
	})

	it('migrates a legacy coverLetter string into letter.body', () => {
		const v3 = {
			version: 3,
			master: { contact: {}, experience: [], projects: [], education: [], skills: [], customSections: [] },
			jobs: [
				{
					id: 'j1',
					name: 'Acme',
					master: false,
					kind: 'job',
					title: '',
					summary: '',
					template: 'modern',
					accent: '#4f46e5',
					columns: 1,
					density: 1,
					font: null,
					jobTitleTarget: 'Frontend Engineer',
					jobDescription: '',
					jobUrl: '',
					coverLetter: 'Legacy draft body.',
					sections: [],
					view: { experience: [], projects: [], education: [], skills: [], custom: {} },
					overrides: {},
					conversations: [],
					activeConversationId: null,
				},
			],
			activeJobId: 'j1',
		}
		const ws = migrate(v3) as unknown as {
			jobs: { letter: { body: string; jobTitle: string }; letterTemplate: string }[]
		}
		expect(ws.jobs[0].letter.body).toBe('Legacy draft body.')
		expect(ws.jobs[0].letter.jobTitle).toBe('Frontend Engineer')
		expect(ws.jobs[0].letterTemplate).toBe('modern')
	})

	it('strips JD, title and summary from the master profile', () => {
		const raw = {
			version: 3,
			master: { contact: {}, experience: [], projects: [], education: [], skills: [], customSections: [] },
			jobs: [
				{
					id: 'm1',
					name: 'Master',
					master: true,
					kind: 'master',
					title: 'Should go',
					summary: 'Should go',
					template: 'modern',
					accent: '#4f46e5',
					columns: 1,
					density: 1,
					font: null,
					jobTitleTarget: '',
					jobDescription: 'Should go',
					jobUrl: '',
					sections: [],
					view: { experience: [], projects: [], education: [], skills: [], custom: {} },
					overrides: {},
					jdSource: { filename: 'jd.pdf', pageCount: 1, extractedAt: '', pdfRefId: 'x.pdf' },
					conversations: [],
					activeConversationId: null,
				},
			],
			activeJobId: 'm1',
		}
		const ws = migrate(raw) as unknown as {
			jobs: { title: string; summary: string; jobDescription: string; jdSource: null }[]
		}
		expect(ws.jobs[0].title).toBe('')
		expect(ws.jobs[0].summary).toBe('')
		expect(ws.jobs[0].jobDescription).toBe('')
		expect(ws.jobs[0].jdSource).toBe(null)
	})
})
