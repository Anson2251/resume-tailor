import { describe, expect, it } from 'vitest'
import { addMessage, blankThread, getDefaultLeaf, getPathTo } from './threads'

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
