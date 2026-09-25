import { describe, expect, it } from 'vitest'
import {
	addMessage,
	blankThread,
	draftingPartials,
	getDefaultLeaf,
	getPathTo,
	getSiblings,
	markToolRunning,
	normalizeThread,
	removeMessage,
	syncDraftingCalls,
	toolArgsJson,
	toolResultJson,
	type ToolActivity,
} from './threads'

describe('runner', () => {
	it('runs', () => {
		expect(1 + 1).toBe(2)
	})
})

it('keeps only the selected branch on getPathTo', () => {
	const t = blankThread()
	addMessage(t, { id: 'u1', role: 'user', text: 'root', timestamp: 1 }, null)
	addMessage(t, { id: 'a1', role: 'assistant', text: 'b1', timestamp: 2 }, 'u1')
	addMessage(t, { id: 'a2', role: 'assistant', text: 'b2', timestamp: 3 }, 'u1')
	addMessage(t, { id: 'u2', role: 'user', text: 'follow', timestamp: 4 }, 'a2')
	expect(getPathTo(t, 'u2').map((m) => m.id)).toEqual(['u1', 'a2', 'u2'])
	expect(getDefaultLeaf(t)).toBe('u2')
})

it('removes empty failed drafts without breaking the thread', () => {
	const t = blankThread()
	addMessage(t, { id: 'u1', role: 'user', text: 'hi', timestamp: 1 }, null)
	addMessage(t, { id: 'a1', role: 'assistant', text: '', timestamp: 2 }, 'u1')
	removeMessage(t, 'a1')
	expect(t.messages['a1']).toBeUndefined()
	expect(getDefaultLeaf(t)).toBe('u1')
	expect(getPathTo(t, 'u1').map((m) => m.id)).toEqual(['u1'])
})

it('refuses to remove messages that have children', () => {
	const t = blankThread()
	addMessage(t, { id: 'u1', role: 'user', text: 'hi', timestamp: 1 }, null)
	addMessage(t, { id: 'a1', role: 'assistant', text: 'yo', timestamp: 2 }, 'u1')
	removeMessage(t, 'u1')
	expect(t.messages['u1']).toBeDefined()
	expect(getDefaultLeaf(t)).toBe('a1')
})

it('reports siblings for per-bubble navigation', () => {
	const t = blankThread()
	addMessage(t, { id: 'u1', role: 'user', text: 'hi', timestamp: 1 }, null)
	addMessage(t, { id: 'a1', role: 'assistant', text: 'one', timestamp: 2 }, 'u1')
	addMessage(t, { id: 'a2', role: 'assistant', text: 'two', timestamp: 3 }, 'u1')
	expect(getSiblings(t, 'a1')).toEqual({ ids: ['a1', 'a2'], index: 0 })
	expect(getSiblings(t, 'a2')).toEqual({ ids: ['a1', 'a2'], index: 1 })
	expect(getSiblings(t, 'u1')).toEqual({ ids: ['u1'], index: 0 })
	expect(getSiblings(t, 'missing')).toBe(null)
})

describe('tool activity persistence', () => {
	it('preserves toolCalls on assistant turns', () => {
		const raw = {
			entryId: 'u1',
			edges: { u1: null, a1: 'u1' },
			messages: {
				u1: { id: 'u1', role: 'user', text: 'hi', timestamp: 1 },
				a1: {
					id: 'a1',
					role: 'assistant',
					text: 'Checking…',
					timestamp: 2,
					toolCalls: [{ id: 't1', name: 'read_jd', args: '{}', result: 'ok', status: 'done' }],
				},
			},
			decisions: null,
		}
		const t = normalizeThread(raw)
		expect(t.messages['a1'].toolCalls).toEqual([
			{ id: 't1', name: 'read_jd', args: '{}', result: 'ok', status: 'done' },
		])
	})

	it('preserves reasoning on assistant turns and drops it elsewhere', () => {
		const raw = {
			entryId: 'u1',
			edges: { u1: null, a1: 'u1' },
			messages: {
				u1: { id: 'u1', role: 'user', text: 'hi', timestamp: 1, reasoning: 'should not stick' },
				a1: { id: 'a1', role: 'assistant', text: 'Checking…', timestamp: 2, reasoning: 'Let me think.' },
				a2: { id: 'a2', role: 'assistant', text: 'Done.', timestamp: 3, reasoning: 42 },
			},
			decisions: null,
		}
		const t = normalizeThread(raw)
		expect(t.messages['u1'].reasoning).toBeUndefined()
		expect(t.messages['a1'].reasoning).toBe('Let me think.')
		expect(t.messages['a2'].reasoning).toBeUndefined()
	})

	it('drops corrupt tool entries but keeps the message', () => {
		const raw = {
			entryId: 'u1',
			edges: { u1: null, a1: 'u1' },
			messages: {
				u1: { id: 'u1', role: 'user', text: 'hi', timestamp: 1 },
				a1: {
					id: 'a1',
					role: 'assistant',
					text: 'Done.',
					timestamp: 2,
					toolCalls: [{ id: '', name: '' }, null, { id: 't2', name: 'read_resume', status: 'bogus' }],
				},
			},
			decisions: null,
		}
		const t = normalizeThread(raw)
		expect(t.messages['a1'].toolCalls).toEqual([{ id: 't2', name: 'read_resume', status: 'done' }])
	})

	it('settles stale drafting entries as running (interrupted when idle)', () => {
		const raw = {
			entryId: 'u1',
			edges: { u1: null, a1: 'u1' },
			messages: {
				u1: { id: 'u1', role: 'user', text: 'hi', timestamp: 1 },
				a1: {
					id: 'a1',
					role: 'assistant',
					text: '',
					timestamp: 2,
					toolCalls: [{ id: 't9', name: 'read_jd', status: 'drafting' }],
				},
			},
			decisions: null,
		}
		const t = normalizeThread(raw)
		expect(t.messages['a1'].toolCalls).toEqual([{ id: 't9', name: 'read_jd', status: 'running' }])
	})
})

describe('drafting tool cards', () => {
	it('extracts tool-call partials from streamed messages', () => {
		expect(draftingPartials(null)).toEqual([])
		expect(draftingPartials({ content: 'nope' })).toEqual([])
		expect(
			draftingPartials({
				content: [
					{ type: 'text', text: 'Checking…' },
					{ type: 'toolCall', id: 'c1', name: 'read_jd', arguments: {} },
					{ type: 'toolCall', id: '', name: 'x' },
				],
			}),
		).toEqual([{ id: 'c1', name: 'read_jd' }])
	})

	it('upserts drafting cards by stable id without touching settled ones', () => {
		const calls: ToolActivity[] = [{ id: 'done1', name: 'read_resume', status: 'done', result: 'ok' }]
		expect(syncDraftingCalls(calls, [{ id: 'c1', name: 'read_jd' }])).toBe(true)
		expect(calls).toEqual([
			{ id: 'done1', name: 'read_resume', status: 'done', result: 'ok' },
			{ id: 'c1', name: 'read_jd', status: 'drafting' },
		])
		// Repeat deltas are idempotent; a resolving name updates the placeholder.
		expect(syncDraftingCalls(calls, [{ id: 'c1', name: '' }])).toBe(false)
		const nameless: ToolActivity[] = [{ id: 'c2', name: '…', status: 'drafting' }]
		expect(syncDraftingCalls(nameless, [{ id: 'c2', name: 'read_jd' }])).toBe(true)
		expect(nameless[0].name).toBe('read_jd')
	})

	it('flips drafting cards to running on execution start', () => {
		const calls: ToolActivity[] = [{ id: 'c1', name: 'read_jd', status: 'drafting' }]
		markToolRunning(calls, 'c1', 'read_jd', '{"section":"x"}')
		expect(calls).toEqual([{ id: 'c1', name: 'read_jd', status: 'running', args: '{"section":"x"}' }])
		// Unknown ids push fresh running cards (execution without streamed deltas).
		markToolRunning(calls, 'c2', 'read_resume', undefined)
		expect(calls[1]).toEqual({ id: 'c2', name: 'read_resume', status: 'running' })
		// Settled cards are never clobbered.
		markToolRunning(calls, 'c2', 'other', '{}')
		expect(calls[1]).toEqual({ id: 'c2', name: 'read_resume', status: 'running' })
	})
})

describe('toolResultJson', () => {
	it('returns the source for JSON objects and arrays', () => {
		expect(toolResultJson('{"attached":false}')).toBe('{"attached":false}')
		expect(toolResultJson('  [1, 2]\n')).toBe('[1, 2]')
	})

	it('returns null for plain text, primitives, and cut-off payloads', () => {
		expect(toolResultJson(undefined)).toBe(null)
		expect(toolResultJson('')).toBe(null)
		expect(toolResultJson('Override applied: e1.bullets (12 → 34 chars).')).toBe(null)
		expect(toolResultJson('123')).toBe(null)
		expect(toolResultJson('{"attached":false')).toBe(null)
	})

	it('applies the same JSON detection to stored args', () => {
		expect(toolArgsJson('{"itemId":"e1","field":"bullets"}')).toBe('{"itemId":"e1","field":"bullets"}')
		expect(toolArgsJson(undefined)).toBe(null)
		expect(toolArgsJson('{"itemId":"e1"')).toBe(null)
	})
})

it('follows the newest root after deriving from a root message', () => {
	const t = blankThread()
	addMessage(t, { id: 'u1', role: 'user', text: 'one', timestamp: 1 }, null)
	addMessage(t, { id: 'a1', role: 'assistant', text: 'reply', timestamp: 2 }, 'u1')
	addMessage(t, { id: 'u2', role: 'user', text: 'two', timestamp: 3 }, null)
	expect(getDefaultLeaf(t)).toBe('u2')
	expect(getSiblings(t, 'u1')).toEqual({ ids: ['u1', 'u2'], index: 0 })
	expect(getPathTo(t, 'u2').map((m) => m.id)).toEqual(['u2'])
})
