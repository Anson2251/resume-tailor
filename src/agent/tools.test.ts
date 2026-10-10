import { describe, expect, it, vi } from 'vitest'
import { agentToolsFor, patchNoteInList } from './tools'
import type { MasterResume } from '../data/types'
import type { PatchResult } from './tools'

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
		notes: [],
	}
}

function mutate() {
	return {
		applyOverride: vi.fn(),
		setCoverLetter: vi.fn(),
		setLetterField: vi.fn(),
		setVisibility: vi.fn(),
		setTitle: vi.fn(),
		setSummary: vi.fn(),
		saveNote: vi.fn(() => null),
		deleteNote: vi.fn(() => false),
		patchNote: vi.fn((): PatchResult => ({ ok: false, reason: 'not_found', matches: 0 })),
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

	it('writes the letter body and structured fields through letter tools', async () => {
		const m = mutate()
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: [] }, overrides: {}, letter: { body: 'old' } } as never,
			masterWith([]),
			m,
		)
		await tools.find((t) => t.name === 'update_cover_letter')!.execute('c8', { text: 'New body.' })
		expect(m.setCoverLetter).toHaveBeenCalledWith('New body.')
		const field = tools.find((t) => t.name === 'update_letter_field')!
		await field.execute('c9', { field: 'recipientTitle', value: 'Hiring Team' })
		expect(m.setLetterField).toHaveBeenCalledWith('recipientTitle', 'Hiring Team')
		const bad = await field.execute('c10', { field: 'nope', value: 'x' })
		expect(m.setLetterField).toHaveBeenCalledTimes(1)
		expect(bad.details).toMatchObject({ error: true })
	})

	it('refuses job tailoring on master but allows field rewrites', async () => {		const m = mutate()
		const tools = agentToolsFor(
			{
				id: 'm1',
				kind: 'master',
				view: { experience: ['e1'] },
				overrides: {},
				title: '',
				summary: '',
				letter: { body: '' },
			} as never,
			masterWith(['e1']),
			m,
		)
		// Refined writing is allowed on Master (shared wording).
		await tools
			.find((t) => t.name === 'propose_bullet_rewrite')!
			.execute('master-rewrite', { itemId: 'e1', field: 'bullets', value: '- tailored' })
		expect(m.applyOverride).toHaveBeenCalledWith('e1', { bullets: '- tailored' })
		// Job tailoring refuses on Master.
		const calls: [string, Record<string, unknown>][] = [
			['update_title', { title: 'Role' }],
			['update_summary', { summary: 'Summary.' }],
			['update_cover_letter', { text: 'Body.' }],
			['update_letter_field', { field: 'recipientTitle', value: 'Team' }],
			['set_visibility', { section: 'experience', ids: ['e1'] }],
		]
		for (const [name, args] of calls) {
			const res = await tools.find((t) => t.name === name)!.execute(`master-${name}`, args)
			expect(res.details).toMatchObject({ error: true })
		}
		expect(m.setTitle).not.toHaveBeenCalled()
		expect(m.setSummary).not.toHaveBeenCalled()
		expect(m.setCoverLetter).not.toHaveBeenCalled()
		expect(m.setLetterField).not.toHaveBeenCalled()
		expect(m.setVisibility).not.toHaveBeenCalled()
		const jd = await tools.find((t) => t.name === 'read_jd')!.execute('master-jd', {})
		expect(JSON.parse((jd.content[0] as { text: string }).text)).toMatchObject({ attached: false })
	})
})

describe('read_manual', () => {
	it('reads a manual by exact name', async () => {
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: [] }, overrides: {} } as never,
			masterWith([]),
			mutate(),
		)
		const res = await tools.find((t) => t.name === 'read_manual')!.execute('m1', { name: 'skill-brainstorm' })
		expect(res.details).toMatchObject({ manual: 'skill-brainstorm' })
		expect(JSON.parse((res.content[0] as { text: string }).text)).toMatchObject({ name: 'skill-brainstorm' })
	})

	it('rejects unknown and empty names without mutating', async () => {
		const m = mutate()
		const tools = agentToolsFor(
			{ id: 'j1', view: { experience: [] }, overrides: {} } as never,
			masterWith([]),
			m,
		)
		const read = tools.find((t) => t.name === 'read_manual')!
		const bad = await read.execute('m2', { name: 'nope' })
		expect(bad.details).toMatchObject({ error: true })
		const empty = await read.execute('m3', { name: '  ' })
		expect(empty.details).toMatchObject({ error: true })
		expect(m.applyOverride).not.toHaveBeenCalled()
	})

	it('works on master (read-only)', async () => {
		const tools = agentToolsFor(
			{ id: 'm1', kind: 'master', view: { experience: [] }, overrides: {} } as never,
			masterWith([]),
			mutate(),
		)
		const res = await tools.find((t) => t.name === 'read_manual')!.execute('m4', { name: 'resume-tailor-system' })
		expect(res.details).toMatchObject({ manual: 'resume-tailor-system' })
	})
})

describe('notebook', () => {
	it('lists and reads notes by id or title', async () => {
		const master = masterWith([])
		master.notes = [
			{ id: 'n1', title: 'Why I built X', body: 'Background story', updatedAt: 1 },
			{ id: 'n2', title: 'Learnings', body: 'What I learnt', updatedAt: 2 },
		]
		const tools = agentToolsFor({ id: 'j1', view: { experience: [] }, overrides: {} } as never, master, mutate())
		const list = await tools.find((t) => t.name === 'list_notes')!.execute('n-list', {})
		expect(JSON.parse((list.content[0] as { text: string }).text)).toMatchObject({ count: 2 })
		const read = await tools.find((t) => t.name === 'read_note')!.execute('n-read', { key: 'Learnings' })
		expect(JSON.parse((read.content[0] as { text: string }).text)).toMatchObject({ id: 'n2' })
		const missing = await tools.find((t) => t.name === 'read_note')!.execute('n-miss', { key: 'nope' })
		expect(missing.details).toMatchObject({ error: true })
	})

	it('saves and deletes notes through mutate', async () => {
		const master = masterWith([])
		const saved: { id?: string; title: string; body: string }[] = []
		const m = {
			...mutate(),
			saveNote: (note: { id?: string; title: string; body: string }) => {
				saved.push(note)
				return { id: 'n9', title: note.title, body: note.body, updatedAt: 0 }
			},
			deleteNote: () => true,
		}
		const tools = agentToolsFor({ id: 'j1', view: { experience: [] }, overrides: {} } as never, master, m as never)
		const res = await tools.find((t) => t.name === 'save_note')!.execute('n-save', { title: 'Goals', body: 'Staff engineer' })
		expect(res.details).toMatchObject({ id: 'n9' })
		expect(saved).toHaveLength(1)
		const empty = await tools.find((t) => t.name === 'save_note')!.execute('n-empty', { title: '  ', body: '  ' })
		expect(empty.details).toMatchObject({ error: true })
		const del = await tools.find((t) => t.name === 'delete_note')!.execute('n-del', { id: 'n9' })
		expect(del.details).toMatchObject({ id: 'n9' })
	})

	it('searches titles and bodies with snippets', async () => {
		const master = masterWith([])
		master.notes = [
			{ id: 'n1', title: 'Why I built X', body: 'A long background story about the Vue migration project', updatedAt: 1 },
			{ id: 'n2', title: 'Learnings', body: 'Unrelated cooking notes', updatedAt: 2 },
		]
		const tools = agentToolsFor({ id: 'j1', view: { experience: [] }, overrides: {} } as never, master, mutate())
		const search = tools.find((t) => t.name === 'search_notes')!
		const res = await search.execute('n-search', { query: 'vue migration' })
		const parsed = JSON.parse((res.content[0] as { text: string }).text)
		expect(parsed.count).toBe(1)
		expect(parsed.notes[0]).toMatchObject({ id: 'n1' })
		expect(parsed.notes[0].snippet).toContain('Vue migration')
		const titleHit = await search.execute('n-search-title', { query: 'learnings' })
		expect(JSON.parse((titleHit.content[0] as { text: string }).text).count).toBe(1)
		const miss = await search.execute('n-search-miss', { query: 'quantum' })
		expect(JSON.parse((miss.content[0] as { text: string }).text).count).toBe(0)
		const empty = await search.execute('n-search-empty', { query: '   ' })
		expect(empty.details).toMatchObject({ error: true })
	})

	it('patches one exact phrase and refuses zero or multiple matches', () => {
		const notes = [
			{ id: 'n1', title: 'Solo', body: 'I built X with Vue in 2024.', updatedAt: 0 },
			{ id: 'n2', title: 'Dupe', body: 'Vue is great. I love Vue.', updatedAt: 0 },
		]
		const solo = patchNoteInList(notes, 'n1', 'with Vue', 'with React')
		expect(solo.ok).toBe(true)
		if (solo.ok) expect(solo.note.body).toBe('I built X with React in 2024.')
		expect(notes[0].body).toBe('I built X with React in 2024.')
		expect(patchNoteInList(notes, 'n1', 'missing phrase', 'x')).toMatchObject({ ok: false, reason: 'no_match' })
		const multi = patchNoteInList(notes, 'n2', 'Vue', 'Svelte')
		expect(multi).toMatchObject({ ok: false, reason: 'multiple', matches: 2 })
		expect(notes[1].body).toBe('Vue is great. I love Vue.')
		expect(patchNoteInList(notes, 'nope', 'Vue', 'x')).toMatchObject({ ok: false, reason: 'not_found' })
		expect(patchNoteInList(notes, 'n1', '', 'x')).toMatchObject({ ok: false, reason: 'no_match' })
	})

	it('reports patch outcomes through the tool without mutating on refusal', async () => {
		const master = masterWith([])
		master.notes = [{ id: 'n1', title: 'Solo', body: 'I built X with Vue in 2024.', updatedAt: 0 }]
		const tools = agentToolsFor({ id: 'j1', view: { experience: [] }, overrides: {} } as never, master, {
			...mutate(),
			patchNote: (id: string, search: string, replace: string) =>
				patchNoteInList(master.notes, id, search, replace),
		} as never)
		const patch = tools.find((t) => t.name === 'patch_note')!
		const res = await patch.execute('n-patch', { id: 'n1', search: 'with Vue', replace: 'with React' })
		expect(res.details).toMatchObject({ id: 'n1' })
		expect(master.notes[0].body).toBe('I built X with React in 2024.')
		const multi = await patch.execute('n-patch-multi', { id: 'n1', search: ' ', replace: '-' })
		expect(multi.details).toMatchObject({ error: true })
		expect((multi.content[0] as { text: string }).text).toContain('Nothing was changed')
		const badId = await patch.execute('n-patch-id', { id: 'nope', search: 'x', replace: 'y' })
		expect(badId.details).toMatchObject({ error: true })
		const emptySearch = await patch.execute('n-patch-empty', { id: 'n1', search: '', replace: 'y' })
		expect(emptySearch.details).toMatchObject({ error: true })
	})
})
