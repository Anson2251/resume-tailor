import { getChildren, getParent, type ChatThread } from './threads'

export type PaneView = 'form' | 'preview' | 'agent' | 'jdpdf'

/** Form may only be open in one pane — the other falls back to Preview. */
export function resolvePaneViews(a: PaneView, b: PaneView): [PaneView, PaneView] {
	if (a === 'form' && b === 'form') return ['form', 'preview']
	return [a, b]
}

/** Child indices from the entry message down to the leaf (wisp thread_decisions). */
export function decisionsForLeaf(t: ChatThread, leafId: string): number[] {
	const path: string[] = []
	let cur: string | null | undefined = leafId
	while (typeof cur === 'string') {
		path.unshift(cur)
		if (cur === t.entryId) break
		cur = t.edges[cur]
		if (cur === undefined) break
	}
	const decisions: number[] = []
	for (let i = 1; i < path.length; i++) decisions.push(getChildren(t, path[i - 1]).indexOf(path[i]))
	return decisions
}

/**
 * Move the viewed branch to the next/previous sibling by reordering children
 * (the default leaf is always the last child). Persists decisions.
 */
export function selectSibling(t: ChatThread, leafId: string, dir: 1 | -1): string {
	const parent = getParent(t, leafId)
	if (!parent) return leafId
	const sibs = getChildren(t, parent)
	if (sibs.length < 2) return leafId
	const next = sibs[(sibs.indexOf(leafId) + dir + sibs.length) % sibs.length]
	for (const id of sibs) {
		if (id === next) continue
		const v = t.edges[id]
		delete t.edges[id]
		t.edges[id] = v
	}
	const v = t.edges[next]
	delete t.edges[next]
	t.edges[next] = v
	t.decisions = decisionsForLeaf(t, next)
	return next
}
