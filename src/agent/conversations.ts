import { uid } from '../data/resume'
import { addMessage, blankThread, getDefaultLeaf, getLeaves, getPathTo, type ChatMsg, type ChatThread } from './threads'

/**
 * Sessions layer (wisp-pro parity): each job owns a list of conversations,
 * and each conversation owns one branchable chat thread. Session CRUD is
 * plain array ops here; branching (retry/siblings/decisions) stays inside
 * `threads.ts` / `panes.ts` and is untouched by session switches.
 */
export interface Conversation {
	id: string
	/** Empty means "derive from the first user message" (see `conversationTitle`). */
	title: string
	updatedAt: number
	thread: ChatThread
}

export function blankConversation(): Conversation {
	return { id: uid(), title: '', updatedAt: Date.now(), thread: blankThread() }
}

export function blankConversations(): Conversation[] {
	return [blankConversation()]
}

/** The conversation `useAgentChat` should bind to (last resort: a fresh blank). */
export function activeConversation(conversations: Conversation[], activeId: string | null): Conversation {
	return conversations.find((c) => c.id === activeId) ?? conversations[0] ?? blankConversation()
}

export function touchConversation(convo: Conversation): void {
	convo.updatedAt = Date.now()
}

/** Migrate a legacy single `ChatThread` into a one-item conversation list. */
export function conversationsFromThread(thread: ChatThread): Conversation[] {
	return [{ id: uid(), title: '', updatedAt: Date.now(), thread }]
}

/** Display title: user rename wins, else first user message, else fallback. */
export function conversationTitle(convo: Conversation, max = 42): string {
	if (convo.title.trim()) return convo.title.trim()
	const leaf = getDefaultLeaf(convo.thread)
	const firstUser = leaf ? getPathTo(convo.thread, leaf).find((m) => m.role === 'user') : undefined
	const clean = (firstUser?.text ?? '').replace(/\s+/g, ' ').trim()
	if (!clean) return 'New conversation'
	return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

export function conversationSize(convo: Conversation): number {
	const leaf = getDefaultLeaf(convo.thread)
	return leaf ? getPathTo(convo.thread, leaf).length : 0
}

export function conversationBranches(convo: Conversation): string[] {
	return getLeaves(convo.thread)
}

/** Append a message to a conversation's thread and bump its recency. */
export function pushMessage(convo: Conversation, msg: ChatMsg, parentId?: string | null): void {
	addMessage(convo.thread, msg, parentId)
	touchConversation(convo)
}

/**
 * Delete one conversation. The list never empties: deleting the last one
 * yields a fresh blank conversation (the panel always needs a bind target).
 * Returns the id that should become active afterwards.
 */
export function deleteConversation(conversations: Conversation[], id: string): string {
	const index = conversations.findIndex((c) => c.id === id)
	if (index === -1) return id
	conversations.splice(index, 1)
	if (!conversations.length) {
		const fresh = blankConversation()
		conversations.push(fresh)
		return fresh.id
	}
	return conversations[Math.min(index, conversations.length - 1)].id
}
