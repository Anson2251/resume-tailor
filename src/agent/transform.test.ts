import { expect, it } from 'vitest'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { dropOrphanToolResults, truncateTranscript } from './useAgentChat'

function user(text: string): AgentMessage {
	return { role: 'user', content: text, timestamp: 1 } as unknown as AgentMessage
}

function assistantText(text: string): AgentMessage {
	return {
		role: 'assistant',
		content: [{ type: 'text', text }],
		api: 'unknown',
		provider: 'anthropic',
		model: 'test',
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: 'stop',
		timestamp: 2,
	} as unknown as AgentMessage
}

function assistantTool(callId: string, name = 'read_jd'): AgentMessage {
	return {
		role: 'assistant',
		content: [{ type: 'toolCall', id: callId, name, arguments: {} }],
		api: 'unknown',
		provider: 'anthropic',
		model: 'test',
		usage: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 0,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason: 'toolUse',
		timestamp: 3,
	} as unknown as AgentMessage
}

function toolResult(callId: string, name = 'read_jd'): AgentMessage {
	return {
		role: 'toolResult',
		toolCallId: callId,
		toolName: name,
		content: [{ type: 'text', text: 'ok' }],
		isError: false,
		timestamp: 4,
	} as unknown as AgentMessage
}

it('keeps a complete tool batch intact', () => {
	const msgs = [user('hi'), assistantTool('a'), toolResult('a'), assistantText('done')]
	expect(dropOrphanToolResults(msgs)).toEqual(msgs)
})

it('drops a leading orphan toolResult (truncated batch split)', () => {
	// Regression for OpenAI 400: "Messages with role 'tool' must be a
	// response to a preceding message with 'tool_calls'". A context
	// truncator that slices between the assistant toolCall and its result
	// leaves exactly this shape.
	const msgs = [toolResult('a'), assistantText('done'), user('follow up')]
	const out = dropOrphanToolResults(msgs)
	expect(out.map((m) => (m as { role?: string }).role)).toEqual(['assistant', 'user'])
})

it('drops only the orphaned sibling, keeping the matched result', () => {
	const msgs = [assistantTool('a'), toolResult('WRONG'), toolResult('a'), assistantText('done')]
	const out = dropOrphanToolResults(msgs)
	expect(out).toHaveLength(3)
	expect((out[1] as { toolCallId?: string }).toolCallId).toBe('a')
})

it('excises an incomplete batch when the results never arrive', () => {
	const msgs = [user('hi'), assistantTool('a'), user('never mind')]
	const out = dropOrphanToolResults(msgs)
	expect(out.map((m) => (m as { role?: string }).role)).toEqual(['user', 'user'])
})

it('truncateTranscript never strands a toolResult under a tiny budget (OpenAI 400 regression)', () => {
	const sys = { role: 'system', content: 'prompt', timestamp: 0 } as unknown as AgentMessage
	const bigArgs = { q: 'z'.repeat(500) }
	const call = {
		...assistantTool('a'),
		content: [{ type: 'toolCall', id: 'a', name: 'read_jd', arguments: bigArgs }],
	} as unknown as AgentMessage
	const bigResult = {
		...toolResult('a'),
		content: [{ type: 'text', text: 'y'.repeat(900) }],
	} as unknown as AgentMessage
	// Sizes (~10 + ~524 + ~909 + ~5 + ~10) force the window to land exactly
	// on the toolResult, so the truncator must expand backwards and keep the
	// assistant toolCall attached (validity beats budget).
	const msgs = [sys, user('qqq-opener'), call, bigResult, assistantText('done'), user('follow up')]
	const out = truncateTranscript(msgs, 1000)
	const roles = out.map((m) => (m as { role?: string }).role)
	expect(roles[0]).toBe('system')
	expect(roles[1]).not.toBe('toolResult')
	expect(roles.at(-1)).toBe('user')
	// Every kept toolResult still has its assistant toolCall ahead of it.
	const callIds = new Set<string>()
	for (const m of out) {
		const content = (m as { content?: { type?: string; id?: string }[] }).content
		for (const block of content ?? []) if (block?.type === 'toolCall' && block.id) callIds.add(block.id)
	}
	for (const m of out) {
		if ((m as { role?: string }).role === 'toolResult') {
			expect(callIds.has((m as { toolCallId?: string }).toolCallId ?? '')).toBe(true)
		}
	}
	// The batch survived (not silently dropped) while the old opener did not.
	const flat = JSON.stringify(out)
	expect(flat).toContain('z'.repeat(500))
	expect(flat).not.toContain('qqq-opener')
})
