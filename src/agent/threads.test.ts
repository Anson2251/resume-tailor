import { describe, expect, it } from 'vitest'
import { addMessage, blankThread, getDefaultLeaf, getPathTo, getSiblings, removeMessage } from './threads'

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

it('follows the newest root after deriving from a root message', () => {
	const t = blankThread()
	addMessage(t, { id: 'u1', role: 'user', text: 'one', timestamp: 1 }, null)
	addMessage(t, { id: 'a1', role: 'assistant', text: 'reply', timestamp: 2 }, 'u1')
	addMessage(t, { id: 'u2', role: 'user', text: 'two', timestamp: 3 }, null)
	expect(getDefaultLeaf(t)).toBe('u2')
	expect(getSiblings(t, 'u1')).toEqual({ ids: ['u1', 'u2'], index: 0 })
	expect(getPathTo(t, 'u2').map((m) => m.id)).toEqual(['u2'])
})
