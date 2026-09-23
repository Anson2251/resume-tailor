export interface ChatMsg {
	id: string
	role: 'user' | 'assistant' | 'tool'
	text: string
	timestamp: number
}

export interface ChatThread {
	entryId: string | null
	edges: Record<string, string | null>
	messages: Record<string, ChatMsg>
	decisions: number[] | null
}

export function blankThread(): ChatThread {
	return { entryId: null, edges: {}, messages: {}, decisions: null }
}

export function addMessage(t: ChatThread, msg: ChatMsg, parentId?: string | null): void {
	t.messages[msg.id] = msg
	const parent = parentId === undefined ? (t.entryId === null ? null : getDefaultLeaf(t)) : parentId
	t.edges[msg.id] = parent
	if (t.entryId === null && parent === null) t.entryId = msg.id
}

export function getParent(t: ChatThread, id: string): string | null | undefined {
	return t.edges[id]
}

export function getChildren(t: ChatThread, parentId: string): string[] {
	return Object.keys(t.edges).filter((id) => t.edges[id] === parentId)
}

export function getPathTo(t: ChatThread, leafId: string): ChatMsg[] {
	const ids: string[] = []
	let cur: string | null | undefined = leafId
	while (typeof cur === 'string') {
		ids.push(cur)
		if (cur === t.entryId) break
		cur = t.edges[cur]
		if (cur === undefined) break
	}
	ids.reverse()
	return ids.map((id) => t.messages[id]).filter(Boolean)
}

export function getDefaultLeaf(t: ChatThread): string | null {
	if (!t.entryId) return null
	// Derived branches from a root message create additional roots; the
	// viewed branch follows the most recent one (insertion order).
	const roots = getRoots(t)
	let cur = roots.length ? roots[roots.length - 1] : t.entryId
	for (;;) {
		const kids = getChildren(t, cur)
		if (!kids.length) return cur
		cur = kids[kids.length - 1]
	}
}

/** Root message ids (no parent) in insertion order. */
export function getRoots(t: ChatThread): string[] {
	return Object.keys(t.edges).filter((id) => t.edges[id] === null && t.messages[id])
}

export function getTree(t: ChatThread): { key: string; parent: string | null; children: string[] }[] {
	return Object.keys(t.messages).map((id) => ({ key: id, parent: t.edges[id] ?? null, children: getChildren(t, id) }))
}

/** All terminal message ids (no children) — each leaf is one selectable conversation branch. */
export function getLeaves(t: ChatThread): string[] {
	if (!t.entryId) return []
	const parents = new Set(Object.values(t.edges).filter((p): p is string => typeof p === 'string' && p.length > 0))
	return Object.keys(t.messages).filter((id) => !parents.has(id))
}

/** Siblings of a message (including itself) with its index — for per-bubble ‹ i/n › nav. */
export function getSiblings(t: ChatThread, id: string): { ids: string[]; index: number } | null {
	const parent = getParent(t, id)
	if (parent === undefined) return null
	const ids = parent === null ? getRoots(t) : getChildren(t, parent)
	if (!ids.includes(id)) return null
	return { ids, index: ids.indexOf(id) }
}

/** Remove a leaf message (e.g. an empty failed draft) without breaking the thread. */
export function removeMessage(t: ChatThread, id: string): void {
	if (!t.messages[id]) return
	if (getChildren(t, id).length > 0) return
	if (t.entryId === id) t.entryId = t.edges[id] ?? null
	delete t.edges[id]
	delete t.messages[id]
}

/**
 * Validate a persisted chat thread: keep only well-formed messages, drop
 * edges that point nowhere, and repair a dangling entry point. Corrupt
 * input yields a blank thread instead of breaking the agent panel.
 */
export function normalizeThread(raw: unknown): ChatThread {
	if (!raw || typeof raw !== 'object') return blankThread()
	const doc = raw as { entryId?: unknown; edges?: unknown; messages?: unknown; decisions?: unknown }
	const messages: ChatThread['messages'] = {}
	if (doc.messages && typeof doc.messages === 'object') {
		for (const [id, msg] of Object.entries(doc.messages as Record<string, unknown>)) {
			if (!id || !msg || typeof msg !== 'object') continue
			const m = msg as { id?: unknown; role?: unknown; text?: unknown; timestamp?: unknown }
			const role = m.role === 'user' || m.role === 'assistant' ? m.role : null
			if (!role) continue
			messages[id] = {
				id: typeof m.id === 'string' && m.id ? m.id : id,
				role,
				text: typeof m.text === 'string' ? m.text : '',
				timestamp: typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : 0,
			}
		}
	}
	if (!Object.keys(messages).length) return blankThread()
	const edges: Record<string, string | null> = {}
	if (doc.edges && typeof doc.edges === 'object') {
		for (const [id, parent] of Object.entries(doc.edges as Record<string, unknown>)) {
			if (!messages[id]) continue
			if (parent === null || (typeof parent === 'string' && messages[parent])) edges[id] = parent
		}
	}
	for (const id of Object.keys(messages)) {
		if (!(id in edges)) edges[id] = null
	}
	let entryId = typeof doc.entryId === 'string' && messages[doc.entryId] ? doc.entryId : null
	if (!entryId) {
		// Repair: pick the root (a message nobody points at) or fall back blank.
		const pointed = new Set(Object.values(edges).filter((p): p is string => typeof p === 'string'))
		entryId = Object.keys(messages).find((id) => !pointed.has(id)) ?? null
	}
	if (!entryId) return blankThread()
	return {
		entryId,
		edges,
		messages,
		decisions:
			Array.isArray(doc.decisions) && doc.decisions.every((d) => typeof d === 'number')
				? (doc.decisions as number[])
				: null,
	}
}
