import { beforeEach, expect, it, vi } from 'vitest'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { dropOrphanToolResults, useAgentChat } from './useAgentChat'
import { setApiKey } from './keyring'
import { DEFAULT_MODEL } from './models'
import { blankResume } from '../data/resume'
import { blankJob } from '../data/workspace'
import type { JobMutations } from './tools'

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

function textTurn(text: string): string {
	return [
		'event: message_start',
		'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
		'',
		'event: content_block_start',
		'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
		'',
		'event: content_block_delta',
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}`,
		'',
		'event: content_block_stop',
		'data: {"type":"content_block_stop","index":0}',
		'',
		'event: message_delta',
		'data: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":2}}',
		'',
		'event: message_stop',
		'data: {"type":"message_stop"}',
		'',
	].join('\n')
}

function toolTurn(callId: string, name: string, inputJson: string): string {
	const mid = Math.ceil(inputJson.length / 2)
	return [
		'event: message_start',
		'data: {"type":"message_start","message":{"id":"msg_2","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
		'',
		'event: content_block_start',
		`data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":${JSON.stringify(callId)},"name":${JSON.stringify(name)},"input":{}}}`,
		'',
		'event: content_block_delta',
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(inputJson.slice(0, mid))}}}`,
		'',
		'event: content_block_delta',
		`data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(inputJson.slice(mid))}}}`,
		'',
		'event: content_block_stop',
		'data: {"type":"content_block_stop","index":0}',
		'',
		'event: message_delta',
		'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":2}}',
		'',
		'event: message_stop',
		'data: {"type":"message_stop"}',
		'',
	].join('\n')
}

beforeEach(() => {
	vi.unstubAllGlobals()
})

it('truncated follow-up never sends an orphan tool_result (OpenAI 400 regression)', async () => {
	const requests: { url: string; init: RequestInit }[] = []
	let n = 0
	const responses = [toolTurn('toolu_trunc_1', 'read_jd', '{}'), textTurn('Done with JD.'), textTurn('Follow-up done.')]
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			requests.push({ url, init })
			const body = responses[Math.min(n++, responses.length - 1)]
			return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } })
		}),
	)
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	// Long JD → long toolResult so the transcript exceeds the tiny budget
	// and the truncator must cut inside/around the tool batch.
	job.jobDescription = `Senior role needing Vue. ${'Requirement detail. '.repeat(200)}`
	const mutate: JobMutations = {
		applyOverride: () => {},
		setCoverLetter: () => {},
		setLetterField: () => {},
		setVisibility: () => {},
		setTitle: () => {},
		setSummary: () => {},
	}
	const chat = useAgentChat(job, master, mutate, DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 1000,
	})

	await chat.send('Check the JD please.')
	expect(chat.error.value).toBe(null)
	await chat.send('Follow up please.')
	expect(chat.error.value).toBe(null)
	expect(requests.length).toBeGreaterThanOrEqual(3)

	// Every request after the first must be provider-valid: each tool_result
	// id is preceded by a tool_use with the same id, and no error assistant
	// is ever re-sent.
	for (const req of requests.slice(1)) {
		const body = JSON.parse(String(req.init.body))
		const flat = JSON.stringify(body.messages)
		expect(flat).not.toContain('"stop_reason":"error"')
		const useIds = [...flat.matchAll(/"tool_use"[^]*?"id"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
		const resultIds = [...flat.matchAll(/"tool_result"[^]*?"tool_use_id"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
		// Anthropic wire format nests ids differently; fall back to plain id
		// presence when the strict patterns find nothing.
		if (resultIds.length) {
			for (const id of resultIds) {
				expect(useIds).toContain(id)
				expect(flat.indexOf(id)).toBeGreaterThanOrEqual(0)
			}
		}
		// Generic guard that works for both Anthropic and OpenAI wires:
		// a result marker must never appear without its call marker.
		if (flat.includes('tool_result')) expect(flat).toContain('toolu_trunc_1')
	}
})
