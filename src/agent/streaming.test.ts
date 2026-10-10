import { beforeEach, expect, it, vi } from 'vitest'
import { setApiKey } from './keyring'
import { DEFAULT_MODEL } from './models'
import { blankResume } from '../data/resume'
import { blankJob } from '../data/workspace'
import type { JobMutations, PatchResult } from './tools'
import { useAgentChat } from './useAgentChat'
import { activeConversation } from './conversations'
import { toolArgsJson, toolResultJson } from './threads'
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
		setLetterField: () => {},
		setVisibility: () => {},
		setTitle: () => {},
		setSummary: () => {},
		saveNote: () => null,
		deleteNote: () => false,
		patchNote: (): PatchResult => ({ ok: false, reason: 'not_found', matches: 0 }),
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

it('shows a preparing card while the model drafts the tool call', async () => {
	// The tool_use block arrives in chunks: the card must render from the
	// streamed partial (Preparing) long before execution starts (Running).
	const input = JSON.stringify({ title: 'Engineer' })
	const events = toolTurn('toolu_d', 'update_title', input)
		.split('\n\n')
		.filter(Boolean)
		.map((e) => new TextEncoder().encode(e + '\n\n'))
	let controller!: ReadableStreamDefaultController<Uint8Array>
	const stream = new ReadableStream<Uint8Array>({ start: (c) => (controller = c) })
	requests.length = 0
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			requests.push({ url, init })
			if (requests.length === 1) {
				return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
			}
			return new Response(textTurn('Done.'), {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
			})
		}),
	)
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
	})
	const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0))
	const cards = (): { id: string; name: string; status: string }[] =>
		Object.values(activeConversation(job.conversations, job.activeConversationId).thread.messages).flatMap((m) =>
			m.role === 'assistant' ? (m.toolCalls ?? []) : [],
		)
	const sending = chat.send('Retitle me.')
	// Feed stream head: message_start + tool_use start + first args delta.
	controller.enqueue(events[0])
	controller.enqueue(events[1])
	controller.enqueue(events[2])
	let drafting = cards()
	for (let i = 0; i < 200 && !drafting.some((c) => c.status === 'drafting'); i++) {
		await tick()
		drafting = cards()
	}
	expect(drafting).toContainEqual({ id: 'toolu_d', name: 'update_title', status: 'drafting' })
	// Finish the stream: execution flips the same card to running, then done.
	for (const chunk of events.slice(3)) controller.enqueue(chunk)
	controller.close()
	await sending
	expect(chat.error.value).toBe(null)
	expect(cards()).toContainEqual(expect.objectContaining({ id: 'toolu_d', name: 'update_title', status: 'done' }))
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

	// The call args are stored as JSON so the panel can render them as a tree.
	const thread = activeConversation(job.conversations, job.activeConversationId).thread
	const assistant = Object.values(thread.messages).find((m) => m.role === 'assistant')
	expect(assistant!.toolCalls).toHaveLength(1)
	expect(toolArgsJson(assistant!.toolCalls![0].args)).toBe(input)
})

/** One assistant turn whose text arrives as several incremental deltas (the loop accumulates them into cumulative partials). */
function textTurnChunked(deltas: string[]): string {
	const blocks = deltas.map(
		(c) =>
			'event: content_block_delta\n' +
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":${JSON.stringify(c)}}}\n\n`,
	)
	return [
		'event: message_start',
		'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
		'',
		'event: content_block_start',
		'data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}',
		'',
		...blocks,
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

it('keeps each assistant turn in its own node so post-tool output cannot overwrite it', async () => {
	// First assistant turn streams text AND a tool call; the follow-up turn
	// streams the final text. Wisp-pro parity: one node per turn, grouped in
	// the panel — the tool card sits on the requesting turn between the texts.
	mockFetch([textThenToolTurn('Checking the posting…', 'toolu_9', 'read_jd', '{}'), textTurn('Done.')])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
	})

	await chat.send('Tailor me.')

	expect(chat.error.value).toBe(null)
	const thread = activeConversation(job.conversations, job.activeConversationId).thread
	const assistants = Object.values(thread.messages)
		.filter((m) => m.role === 'assistant')
		.sort((a, b) => a.timestamp - b.timestamp)
	expect(assistants).toHaveLength(2)
	// Pre-tool text survived on the first turn; the follow-up lives on its own turn.
	expect(assistants[0].text).toContain('Checking the posting…')
	expect(assistants[0].text).not.toContain('Done.')
	expect(assistants[1].text).toContain('Done.')
	// The tool call is recorded on the requesting turn with its collapsed result.
	expect(assistants[0].toolCalls).toHaveLength(1)
	expect(assistants[0].toolCalls![0].name).toBe('read_jd')
	expect(assistants[0].toolCalls![0].status).toBe('done')
	expect(assistants[0].toolCalls![0].result?.trim().length).toBeGreaterThan(0)
	// read_jd returns a JSON payload, so the panel can render it as a tree.
	expect(toolResultJson(assistants[0].toolCalls![0].result)).not.toBe(null)
	expect(assistants[1].toolCalls ?? []).toHaveLength(0)
})

it('never duplicates follow-up chunks: each chunk replaces its own turn text', async () => {
	// Regression for "Tools / Tools / Tools are / Tools are working…": the
	// follow-up turn streams several chunks, each arriving as a cumulative
	// partial. Replacing the turn text keeps every chunk exactly once.
	mockFetch([
		textThenToolTurn('Checking…', 'toolu_9', 'read_jd', '{}'),
		textTurnChunked(['Tools', ' are', ' working.']),
	])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
	})

	await chat.send('Tailor me.')

	expect(chat.error.value).toBe(null)
	const thread = activeConversation(job.conversations, job.activeConversationId).thread
	const assistants = Object.values(thread.messages).filter((m) => m.role === 'assistant')
	expect(assistants).toHaveLength(2)
	const followUp = assistants.find((m) => m.text.includes('working.'))
	expect(followUp).toBeDefined()
	expect(followUp!.text).toBe('Tools are working.')
	const allText = assistants.map((m) => m.text).join('\n')
	expect(allText.split('Tools are').length - 1).toBe(1)
})

it('signals waiting (not streaming) while the post-tool follow-up is pending', async () => {
	// The follow-up response is gated: after the tool result comes back the
	// run sits between turns — sending, but no turn streaming. The panel
	// shows the typing dots again in exactly this window.
	let releaseFollowUp!: () => void
	const followUpGate = new Promise<void>((resolve) => {
		releaseFollowUp = resolve
	})
	requests.length = 0
	let n = 0
	const responses = [toolTurn('toolu_wait', 'read_jd', '{}'), textTurn('Done.')]
	vi.stubGlobal(
		'fetch',
		vi.fn(async (url: string, init: RequestInit) => {
			requests.push({ url, init })
			const idx = Math.min(n++, responses.length - 1)
			if (idx === 1) await followUpGate
			return new Response(responses[idx], {
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
			})
		}),
	)
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
	})

	const sending = chat.send('Check the JD.')
	await vi.waitFor(() => expect(requests.length).toBe(2))
	expect(chat.sending.value).toBe(true)
	expect(chat.assistantStreaming.value).toBe(false)

	releaseFollowUp()
	await sending

	expect(chat.error.value).toBe(null)
	expect(chat.sending.value).toBe(false)
	expect(chat.assistantStreaming.value).toBe(false)
})

/** One assistant turn: thinking chunks, then text, then a tool call. */
function thinkingTextToolTurn(
	thinkingChunks: string[],
	text: string,
	callId: string,
	name: string,
	inputJson: string,
): string {
	const thinkingBlocks = thinkingChunks.map(
		(c) =>
			'event: content_block_delta\n' +
			`data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":${JSON.stringify(c)}}}\n\n`,
	)
	return [
		'event: message_start',
		'data: {"type":"message_start","message":{"id":"msg_4","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5","stop_reason":null,"stop_sequence":null,"usage":{"input_tokens":1,"output_tokens":1}}}',
		'',
		'event: content_block_start',
		'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
		'',
		...thinkingBlocks,
		'event: content_block_stop',
		'data: {"type":"content_block_stop","index":0}',
		'',
		'event: content_block_start',
		'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
		'',
		'event: content_block_delta',
		`data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":${JSON.stringify(text)}}}`,
		'',
		'event: content_block_stop',
		'data: {"type":"content_block_stop","index":1}',
		'',
		'event: content_block_start',
		`data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":${JSON.stringify(callId)},"name":${JSON.stringify(name)},"input":{}}}`,
		'',
		'event: content_block_delta',
		`data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":${JSON.stringify(inputJson)}}}`,
		'',
		'event: content_block_stop',
		'data: {"type":"content_block_stop","index":2}',
		'',
		'event: message_delta',
		'data: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":2}}',
		'',
		'event: message_stop',
		'data: {"type":"message_stop"}',
		'',
	].join('\n')
}

it('captures thinking per turn and carries it into the post-tool follow-up', async () => {
	// Reasoning models think before answering and calling tools. The thinking
	// is stored on the turn for the Thinking panel, while pi-agent keeps the
	// full blocks (with signatures) in its live transcript and re-sends them
	// on the post-tool follow-up — our pass-through convertToLlm preserves that.
	mockFetch([
		thinkingTextToolTurn(['Let me ', 'check the posting…'], 'Checking…', 'toolu_think', 'read_jd', '{}'),
		textTurn('Done.'),
	])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const chat = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
	})

	await chat.send('Tailor me.')

	expect(chat.error.value).toBe(null)
	expect(requests.length).toBe(2)
	const thread = activeConversation(job.conversations, job.activeConversationId).thread
	const assistants = Object.values(thread.messages).filter((m) => m.role === 'assistant')
	expect(assistants).toHaveLength(2)
	// Thinking landed on the requesting turn, exactly once, beside the text.
	expect(assistants[0].reasoning).toBe('Let me check the posting…')
	expect(assistants[0].text).toBe('Checking…')
	expect(assistants[0].toolCalls).toHaveLength(1)
	// …and pi-agent carried it into the post-tool follow-up request.
	const followUp = JSON.parse(String(requests[1].init.body))
	expect(JSON.stringify(followUp.messages)).toContain('Let me check the posting…')
	expect(assistants[1].text).toBe('Done.')
	expect(assistants[1].reasoning ?? '').toBe('')
})

it('rehydrates the persisted thread on remount so history survives', async () => {
	mockFetch([textTurn('First reply.'), textTurn('Second reply.')])
	await setApiKey('anthropic', 'sk-test-key')
	const master = blankResume()
	const job = blankJob('Test job', master)
	const seen = { overrides: [] as [string, Record<string, string | boolean>][] }
	const first = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
	})
	await first.send('Hello')

	// Simulate a remount (pane/job switch): a fresh composable on the same job.
	const second = useAgentChat(job, master, testMutate(seen), DEFAULT_MODEL, {
		systemPrompt: 'Test system prompt.',
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
