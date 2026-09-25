import { expect, it } from 'vitest'
import { decisionsForLeaf, oppositePreviewTab, resolvePaneViews, selectSibling, syncPreviewTabs } from './panes'
import { addMessage, blankThread, getDefaultLeaf } from './threads'

it('keeps Form in one pane only', () => {
	expect(resolvePaneViews('form', 'form')).toEqual(['form', 'preview'])
	expect(resolvePaneViews('form', 'agent')).toEqual(['form', 'agent'])
	expect(resolvePaneViews('agent', 'agent')).toEqual(['agent', 'agent'])
})

it('keeps two preview panes on alternative views', () => {
	expect(oppositePreviewTab('resume')).toBe('letter')
	expect(oppositePreviewTab('letter')).toBe('resume')
	// The kept pane holds its tab; the other takes the opposite.
	expect(syncPreviewTabs('preview', 'preview', 'resume', 'resume', 'b')).toEqual(['letter', 'resume'])
	expect(syncPreviewTabs('preview', 'preview', 'letter', 'letter', 'a')).toEqual(['letter', 'resume'])
	// Untouched when only one preview is present or tabs already differ.
	expect(syncPreviewTabs('preview', 'agent', 'resume', 'resume', 'a')).toEqual(['resume', 'resume'])
	expect(syncPreviewTabs('preview', 'preview', 'resume', 'letter', 'a')).toEqual(['resume', 'letter'])
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
