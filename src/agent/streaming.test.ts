import { beforeEach, expect, it, vi } from 'vitest'
import { setApiKey } from './keyring'
import { DEFAULT_MODEL } from './models'
import { blankResume } from '../data/resume'
import { blankJob } from '../data/workspace'
import type { JobMutations } from './tools'
import { useAgentChat } from './useAgentChat'
import { activeConversation } from './conversations'
import type { Job } from '../data/types'

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

/** One assistant turn streaming partial text first, then a tool call. */
function textThenToolTurn(text: string, callId: string, name: string, inputJson: string): string {
	return [
		'event: message_start',
		'data: {"type":"message_start","message":{"id":"msg_3","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
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
		'event: content_block_start',
		`data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":${JSON.stringify(callId)},"name":${JSON.stringify(name)},"input":{}}}`,
		'',
		'event: content_block_delta',
		`data: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(inputJson)}}}`,
		'',
		'event: content_block_stop',
		'data: {"type":"content_block_stop","index":1}',
		'',
		'event: message_delta',
		'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":2}}',
		'',
		'event: message_stop',
		'data: {"type":"message_stop"}',
		'',
	].join('\n')
}

function errorResponse(status: number, body: string): Response {
	return new Response(body, { status, headers: { 'content-type': 'application/json' } })
}

const requests: { url: string; init: RequestInit }[] = []

function threadTexts(job: Job): string[] {
	return Object.values(activeConversation(job.conversations, job.activeConversationId).thread.messages).map(
		(m) => m.text,
	)
}

function mockFetch(responses: (string | Response)[]): void {
	requests.length = 0
	let n = 0
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			requests.push({ url, init })
			const body = responses[Math.min(n++, responses.length - 1)]
			if (typeof body !== 'string') return body
			return new Response(body, {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
			})
		}),
	)
}

function testMutate(seen: { overrides: [string, Record<string, string | boolean>][] }): JobMutations {
	return {
		applyOverride: (itemId, patch) => {
			seen.overrides.push([itemId, patch])
		},
		setCoverLetter: () => {},
		setVisibility: () => {},
		setTitle: () => {},
		setSummary: () => {},
	}
}

beforeEach(() => {
	vi.unstubAllGlobals()
})

it('streams a real pi-ai request with the keyring key', async () => {
	mockFetch([textTurn('Tailored.')])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})

	await chat.send('Tailor my bullets.')

	expect(chat.error.value).toBe(null)
	expect(requests.length).toBe(1)
	const [request] = requests

	// Auth: the keyring key must reach the provider as an API key header.
	const headers = new Headers(request.init.headers)
	expect(request.url).toContain('anthropic.com')
	expect(headers.get('x-api-key')).toBe('sk-test-key')

	// Payload: right model, system prompt outside the messages, user text,
	// and the agent tool declarations attached.
	const body = JSON.parse(String(request.init.body))
	expect(body.model).toBe('claude-sonnet-4-5')
	expect(JSON.stringify(body.system)).toContain('Test system prompt.')
	expect(JSON.stringify(body.messages)).toContain('Tailor my bullets.')
	expect(Array.isArray(body.tools)).toBe(true)
	expect(body.tools.map((t: { name: string }) => t.name)).toEqual(
		expect.arrayContaining([
			'read_resume',
			'read_jd',
			'propose_bullet_rewrite',
			'update_title',
			'update_summary',
			'update_cover_letter',
			'set_visibility',
		]),
	)

	// Result: the streamed text lands on the persisted thread.
	const texts = threadTexts(job)
	expect(texts).toContain('Tailor my bullets.')
	expect(texts).toContain('Tailored.')
})

it('runs a full tool round trip through the agent tools', async () => {
	const master = blankResume()
	const job = blankJob('Test job', master)
	const itemId = job.view.experience[0] ?? master.experience[0].id
	const input = JSON.stringify({ itemId, field: 'bullets', value: 'New body.' })
	mockFetch([toolTurn('toolu_1', 'propose_bullet_rewrite', input), textTurn('Done.')])
	await setApiKey('anthropic', 'sk-test-key')
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})

	await chat.send('Rewrite it.')

	expect(chat.error.value).toBe(null)
	expect(requests.length).toBe(2)

	// The tool executed against our mutations…
	expect(seen.overrides).toEqual([[itemId, { bullets: 'New body.' }]])

	// …and its result went back to the model referencing the call id…
	const followUp = JSON.parse(String(requests[1].init.body))
	expect(JSON.stringify(followUp.messages)).toContain('toolu_1')
	expect(JSON.stringify(followUp.messages)).toContain('tool_result')

	// …before the final text landed on the thread.
	const texts = threadTexts(job)
	expect(texts).toContain('Done.')
})

it('rehydrates the persisted thread on remount so history survives', async () => {
	mockFetch([textTurn('First reply.'), textTurn('Second reply.')])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const first = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})
	await first.send('Hello')

	// Simulate a remount (pane/job switch): a fresh composable on the same job.
	const second = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})
	await second.send('Follow up')

	expect(requests.length).toBe(2)
	const followUp = JSON.parse(String(requests[1].init.body))
	const flat = JSON.stringify(followUp.messages)
	expect(flat).toContain('Hello')
	expect(flat).toContain('First reply.')
	expect(flat).toContain('Follow up')
})

it('grounds the system prompt with the attached JD', async () => {
	mockFetch([textTurn('Noted.')])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	job.jobDescription = 'We need Vue and TypeScript experience.'
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})
	await chat.send('Tailor me.')

	const body = JSON.parse(String(requests[0].init.body))
	expect(JSON.stringify(body.system)).toContain('Vue and TypeScript')
})

it('keeps streamed text when a later provider request fails', async () => {
	// Request 1 streams partial text plus a tool call; request 2 fails like
	// the DeepSeek 400. The error turn must not blank the streamed text, the
	// provider error must surface, and no empty draft may persist.
	mockFetch([
		textThenToolTurn('Checking the posting…', 'toolu_9', 'read_jd', '{}'),
		errorResponse(400, JSON.stringify({ error: { message: 'Bad Request: tool mismatch', type: 'invalid_request' } })),
	])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})

	await chat.send('Tailor me.')

	expect(requests.length).toBe(2)
	const texts = threadTexts(job)
	expect(texts).toContain('Tailor me.')
	// The streamed partial survived the later failure instead of emptying.
	expect(texts.some((t) => t.includes('Checking the posting'))).toBe(true)
	expect(texts.every((t) => t.trim().length > 0)).toBe(true)
	// The provider's own error is exposed for diagnosis.
	expect(chat.error.value).toBeTruthy()
})

it('regenerates one assistant bubble as a new sibling', async () => {
	mockFetch([textTurn('First answer.'), textTurn('Second answer.')])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})

	await chat.send('Question?')
	const firstTexts = threadTexts(job)
	expect(firstTexts).toContain('First answer.')
	const assistantId = Object.values(
		activeConversation(job.conversations, job.activeConversationId).thread.messages,
	).find((m) => m.role === 'assistant')!.id

	await chat.regenerate(assistantId)

	expect(requests.length).toBe(2)
	const texts = threadTexts(job)
	const all = Object.values(activeConversation(job.conversations, job.activeConversationId).thread.messages).map(
		(m) => m.text,
	)
	// The original reply is kept; the viewed branch shows the regenerated one.
	expect(all).toContain('First answer.')
	expect(texts).toContain('Second answer.')
	// The rerun reused the same user text.
	expect(JSON.stringify(requests[1].init.body)).toContain('Question?')
})

it('resends edited user text as a derived sibling branch', async () => {
	mockFetch([textTurn('Reply one.'), textTurn('Reply two.')])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
		contextChars: 8000,
	})

	await chat.send('Original wording')
	const thread = activeConversation(job.conversations, job.activeConversationId).thread
	const userId = Object.values(thread.messages).find((m) => m.role === 'user')!.id

	await chat.resendEdited(userId, 'Edited wording')

	expect(requests.length).toBe(2)
	const texts = threadTexts(job)
	const all = Object.values(activeConversation(job.conversations, job.activeConversationId).thread.messages).map(
		(m) => m.text,
	)
	// Derive keeps the original subtree and adds the edited branch.
	expect(all).toContain('Original wording')
	expect(texts).toContain('Edited wording')
	expect(texts).toContain('Reply two.')
	expect(JSON.stringify(requests[1].init.body)).toContain('Edited wording')
})
