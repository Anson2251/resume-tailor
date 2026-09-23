import { describe, expect, it, vi } from 'vitest'
import { agentToolsFor } from './tools'
import type { MasterResume } from '../data/types'

function masterWith(ids: string[]): MasterResume {
	return {
		contact: { fullName: '', email: '', phone: '', location: '', website: '', linkedin: '' },
		experience: ids.map((id) => ({
			id,
			role: 'Role',
			company: 'Co',
			location: '',
			startDate: '',
			endDate: '',
			current: false,
			bullets: '- did things',
		})),
		projects: [],
		education: [],
		skills: [],
		customSections: [],
	}
}

function mutate() {
	return {
		applyOverride: vi.fn(),
		setCoverLetter: vi.fn(),
		setVisibility: vi.fn(),
		setTitle: vi.fn(),
		setSummary: vi.fn(),
	}
}

describe('hybrid guard', () => {
	it('applies bullet overrides without confirm, flags mass-hide', async () => {
		const m = mutate()
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: ['e1'] }, overrides: {} } as never,
			masterWith(['e1']),
			m,
		)
		const propose = tools.find((t) => t.name === 'propose_bullet_rewrite')!
		await propose.execute('call-1', { itemId: 'e1', field: 'bullets', value: '- shipped X' })
		expect(m.applyOverride).toHaveBeenCalledWith('e1', { bullets: '- shipped X' })
	})

	it('refuses mass-hide without mutating', async () => {
		const m = mutate()
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: ['e1', 'e2', 'e3', 'e4'] }, overrides: {} } as never,
			masterWith(['e1', 'e2', 'e3', 'e4']),
			m,
		)
		const vis = tools.find((t) => t.name === 'set_visibility')!
		const res = await vis.execute('call-2', { section: 'experience', ids: ['e1'] })
		expect(m.setVisibility).not.toHaveBeenCalled()
		expect(res.details).toMatchObject({ needsConfirm: true })
	})

	it('rejects unknown item ids and fields without mutating', async () => {
		const m = mutate()
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: ['e1'] }, overrides: {} } as never,
			masterWith(['e1']),
			m,
		)
		const propose = tools.find((t) => t.name === 'propose_bullet_rewrite')!
		const badId = await propose.execute('call-3', { itemId: 'nope', field: 'bullets', value: 'x' })
		expect(m.applyOverride).not.toHaveBeenCalled()
		expect(badId.details).toMatchObject({ error: true })
		const badField = await propose.execute('call-4', { itemId: 'e1', field: 'nope', value: 'x' })
		expect(m.applyOverride).not.toHaveBeenCalled()
		expect(badField.details).toMatchObject({ error: true })
	})

	it('reports JD attach state instead of failing', async () => {
		const m = mutate()
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: [] }, overrides: {}, jobDescription: '' } as never,
			masterWith([]),
			m,
		)
		const readJd = tools.find((t) => t.name === 'read_jd')!
		const res = await readJd.execute('call-5', {})
		expect(JSON.parse((res.content[0] as { text: string }).text)).toMatchObject({ attached: false })
	})

	it('updates title and summary through dedicated tools', async () => {
		const m = mutate()
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: [] }, overrides: {}, title: '', summary: '' } as never,
			masterWith([]),
			m,
		)
		await tools.find((t) => t.name === 'update_title')!.execute('c6', { title: 'Frontend Engineer' })
		await tools.find((t) => t.name === 'update_summary')!.execute('c7', { summary: 'Builds things.' })
		expect(m.setTitle).toHaveBeenCalledWith('Frontend Engineer')
		expect(m.setSummary).toHaveBeenCalledWith('Builds things.')
	})
})
