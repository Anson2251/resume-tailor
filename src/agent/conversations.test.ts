import { describe, expect, it } from 'vitest'
import {
	activeConversation,
	blankConversation,
	blankConversations,
	conversationSize,
	conversationTitle,
	conversationsFromThread,
	deleteConversation,
	pushMessage,
} from './conversations'
import { addMessage, blankThread } from './threads'

describe('sessions', () => {
	it('creates blank conversation lists with an active target', () => {
		const list = blankConversations()
		expect(list).toHaveLength(1)
		expect(activeConversation(list, null).id).toBe(list[0].id)
		expect(activeConversation(list, 'missing').id).toBe(list[0].id)
	})

	it('derives titles from the first user message until renamed', () => {
		const convo = blankConversation()
		expect(conversationTitle(convo)).toBe('New conversation')
		pushMessage(convo, { id: 'u1', role: 'user', text: 'Tailor my bullets please', timestamp: 1 }, null)
		expect(conversationTitle(convo)).toBe('Tailor my bullets please')
		expect(conversationSize(convo)).toBe(1)
		convo.title = '  Interview prep  '
		expect(conversationTitle(convo)).toBe('Interview prep')
	})

	it('migrates a legacy thread into one conversation', () => {
		const thread = blankThread()
		addMessage(thread, { id: 'u1', role: 'user', text: 'hello', timestamp: 1 }, null)
		const list = conversationsFromThread(thread)
		expect(list).toHaveLength(1)
		expect(conversationTitle(list[0])).toBe('hello')
		expect(conversationSize(list[0])).toBe(1)
	})

	it('deletes sessions and never empties the list', () => {
		const a = blankConversation()
		const b = blankConversation()
		const list = [a, b]
		expect(deleteConversation(list, 'missing')).toBe('missing')
		expect(deleteConversation(list, a.id)).toBe(b.id)
		expect(list).toHaveLength(1)
		const next = deleteConversation(list, b.id)
		expect(list).toHaveLength(1)
		expect(list[0].id).toBe(next)
		expect(conversationTitle(list[0])).toBe('New conversation')
	})

	it('bumps recency on new messages', () => {
		const convo = { ...blankConversation(), updatedAt: 0 }
		pushMessage(convo, { id: 'u1', role: 'user', text: 'hi', timestamp: 1 }, null)
		expect(convo.updatedAt).toBeGreaterThan(0)
	})
})
