import { describe, expect, it, vi } from 'vitest'
import { agentToolsFor } from './tools'

describe('hybrid guard', () => {
	it('applies bullet overrides without confirm, flags mass-hide', async () => {
		const mutate = { applyOverride: vi.fn(), setCoverLetter: vi.fn(), setVisibility: vi.fn() }
		const tools = agentToolsFor({ id: 'j1', view: { experience: ['e1'] } } as never, mutate)
		const propose = tools.find((t) => t.name === 'propose_bullet_rewrite')!
		await propose.execute('call-1', { itemId: 'e1', field: 'bullets', value: '- shipped X' })
		expect(mutate.applyOverride).toHaveBeenCalledWith('e1', { bullets: '- shipped X' })
	})

	it('refuses mass-hide without mutating', async () => {
		const mutate = { applyOverride: vi.fn(), setCoverLetter: vi.fn(), setVisibility: vi.fn() }
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: ['e1', 'e2', 'e3', 'e4'] } } as never,
			mutate,
		)
		const vis = tools.find((t) => t.name === 'set_visibility')!
		const res = await vis.execute('call-2', { section: 'experience', ids: ['e1'] })
		expect(mutate.setVisibility).not.toHaveBeenCalled()
		expect(res.details).toMatchObject({ needsConfirm: true })
	})
})
