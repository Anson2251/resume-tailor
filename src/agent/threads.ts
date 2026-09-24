/** One tool invocation attached to an assistant turn (wisp-pro parity). */
export interface ToolActivity {
	id: string
	name: string
	/** Short JSON summary of the call arguments (display only). */
	args?: string
	/** Truncated result text (display only; the live LLM transcript is separate). */
	result?: string
	isError?: boolean
	status: 'running' | 'done'
}

export interface ChatMsg {
	id: string
	role: 'user' | 'assistant' | 'tool'
	text: string
	timestamp: number
	/**
	 * Streamed reasoning (thinking blocks) for this assistant turn, shown in
	 * a collapsed Thinking panel (wisp-pro parity). Display-only: the live
	 * LLM transcript keeps the full blocks (pi-agent re-sends them with
	 * signatures on post-tool follow-ups); persisted replays stay text-only.
	 */
	reasoning?: string
	/**
	 * Tool calls made during this assistant turn, in execution order. Each
	 * turn of a run is its own node (wisp-pro parity: one message per tool
	 * round), so cards render inside their requesting turn and the panel
	 * groups consecutive turns into one bubble — no text offsets needed.
	 */
	toolCalls?: ToolActivity[]
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
 * A stored JSON string as a tree source, or null when it isn't a valid JSON
 * object/array (plain text renders as code instead). Truncated payloads fail
 * the parse and fall back gracefully.
 */
function jsonTreeSource(text: string | undefined): string | null {
	if (!text) return null
	const clean = text.trim()
	if (clean[0] !== '{' && clean[0] !== '[') return null
	try {
		JSON.parse(clean)
		return clean
	} catch {
		return null
	}
}

/** The stored tool result as a JSON-tree source (null → render as `<pre>`). */
export function toolResultJson(result: string | undefined): string | null {
	return jsonTreeSource(result)
}

/** The stored tool args as a JSON-tree source (null → render as `<code>`). */
export function toolArgsJson(args: string | undefined): string | null {
	return jsonTreeSource(args)
}

/**
 * Keep only well-formed tool activity (display-only; drops corrupt entries).
 * A `running` entry persisted mid-run never resumes — the panel renders it
 * as interrupted while `sending` is false.
 */
function normalizeToolCalls(raw: unknown): { toolCalls: ToolActivity[] } | null {
	if (!Array.isArray(raw)) return null
	const out: ToolActivity[] = []
	for (const item of raw) {
		if (!item || typeof item !== 'object') continue
		const t = item as Record<string, unknown>
		if (typeof t['id'] !== 'string' || !t['id'] || typeof t['name'] !== 'string' || !t['name']) continue
		const status = t['status'] === 'running' ? 'running' : 'done'
		out.push({
			id: t['id'],
			name: t['name'],
			...(typeof t['args'] === 'string' ? { args: t['args'] } : null),
			...(typeof t['result'] === 'string' ? { result: t['result'] } : null),
			...(t['isError'] === true ? { isError: true } : null),
			status,
		})
	}
	return out.length ? { toolCalls: out } : null
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
			const m = msg as {
				id?: unknown
				role?: unknown
				text?: unknown
				timestamp?: unknown
				reasoning?: unknown
				toolCalls?: unknown
			}
			const role = m.role === 'user' || m.role === 'assistant' ? m.role : null
			if (!role) continue
			messages[id] = {
				id: typeof m.id === 'string' && m.id ? m.id : id,
				role,
				text: typeof m.text === 'string' ? m.text : '',
				timestamp: typeof m.timestamp === 'number' && Number.isFinite(m.timestamp) ? m.timestamp : 0,
				...(role === 'assistant' && typeof m.reasoning === 'string' && m.reasoning ? { reasoning: m.reasoning } : null),
				...(role === 'assistant' ? normalizeToolCalls(m.toolCalls) : null),
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
