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
})
