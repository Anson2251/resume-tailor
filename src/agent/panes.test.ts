import { expect, it } from 'vitest'
import { decisionsForLeaf, resolvePaneViews, selectSibling } from './panes'
import { addMessage, blankThread, getDefaultLeaf } from './threads'

it('keeps Form in one pane only', () => {
	expect(resolvePaneViews('form', 'form')).toEqual(['form', 'preview'])
	expect(resolvePaneViews('form', 'agent')).toEqual(['form', 'agent'])
	expect(resolvePaneViews('agent', 'agent')).toEqual(['agent', 'agent'])
})

it('cycles siblings and records decisions', () => {
	const t = blankThread()
	addMessage(t, { id: 'u1', role: 'user', text: 'root', timestamp: 1 }, null)
	addMessage(t, { id: 'a1', role: 'assistant', text: 'b1', timestamp: 2 }, 'u1')
	addMessage(t, { id: 'a2', role: 'assistant', text: 'b2', timestamp: 3 }, 'u1')
	expect(getDefaultLeaf(t)).toBe('a2')
	expect(selectSibling(t, 'a2', 1)).toBe('a1')
	expect(getDefaultLeaf(t)).toBe('a1')
	expect(t.decisions).toEqual(decisionsForLeaf(t, 'a1'))
})
