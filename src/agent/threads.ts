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
	let cur = t.entryId
	for (;;) {
		const kids = getChildren(t, cur)
		if (!kids.length) return cur
		cur = kids[kids.length - 1]
	}
}

export function getTree(t: ChatThread): { key: string; parent: string | null; children: string[] }[] {
	return Object.keys(t.messages).map((id) => ({ key: id, parent: t.edges[id] ?? null, children: getChildren(t, id) }))
}
