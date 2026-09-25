import { computed, ref, watch } from 'vue'
import { contentText, type Message } from '@earendil-works/pi-ai'
import { Agent, type AgentMessage, type ThinkingLevel } from '@earendil-works/pi-agent-core'
import type { Job, MasterResume } from '../data/types'
import type { ChatThread } from './threads'
import { uid } from '../data/resume'
import { getApiKey } from './keyring'
import { DEFAULT_MODEL, contextCharsFor, resolveModel, streamFn, type ModelChoice } from './models'
import { resolveSystemPrompt, loadAgentSettings } from './agentSettings'
import {
	draftingPartials,
	getChildren,
	getDefaultLeaf,
	getParent,
	getPathTo,
	markToolRunning,
	removeMessage,
	syncDraftingCalls,
	type ChatMsg,
} from './threads'
import { activeConversation, pushMessage, touchConversation, type Conversation } from './conversations'
import { agentToolsFor, type JobMutations } from './tools'
import { composeSystemPrompt } from './context'

function agentText(msg: AgentMessage): string {
	const m = msg as { content?: unknown }
	if (typeof m.content === 'string') return m.content
	if (Array.isArray(m.content)) {
		try {
			return contentText(m.content as Parameters<typeof contentText>[0])
		} catch {
			return ''
		}
	}
	return ''
}

/**
 * First assistant node of the run containing `id`: a run chains one node per
 * assistant turn (wisp-pro parity — the backend emits a new message per tool
 * round), so walk back over assistant nodes to the run start. Used to branch
 * retries/regenerations at the run level instead of mid-chain.
 */
export function runStartId(thread: ChatThread, id: string): string {
	let cur = id
	for (;;) {
		const parent = getParent(thread, cur)
		if (typeof parent !== 'string') break
		const pm = thread.messages[parent]
		if (!pm || pm.role !== 'assistant') break
		cur = parent
	}
	return cur
}

const TOOL_ARGS_DISPLAY_CHARS = 16000
// Kept generous so JSON results stay parseable for the tree view (a cut-off
// payload fails JSON.parse and falls back to plain text rendering).
const TOOL_RESULT_DISPLAY_CHARS = 8000
// Stored reasoning is display-only (the live transcript keeps full blocks),
// but still bounded so persisted threads stay small.
const REASONING_DISPLAY_CHARS = 6000

function truncateDisplay(text: string, max: number): string {
	const clean = text.trim()
	if (clean.length <= max) return clean
	return `${clean.slice(0, max).trimEnd()}…`
}

function summarizeToolArgs(args: unknown): string | undefined {
	if (args === undefined || args === null) return undefined
	try {
		const raw = typeof args === 'string' ? args : JSON.stringify(args)
		if (!raw || raw === '{}') return undefined
		return truncateDisplay(raw, TOOL_ARGS_DISPLAY_CHARS)
	} catch {
		return undefined
	}
}

function toolResultDisplay(result: unknown): { text?: string; isError?: boolean } {
	const r = result as { content?: unknown; isError?: unknown } | null | undefined
	if (!r || typeof r !== 'object') return {}
	let text: string | undefined
	try {
		const content = (r as { content?: unknown }).content
		if (typeof content === 'string') text = content
		else if (Array.isArray(content)) {
			text = contentText(content as Parameters<typeof contentText>[0])
		}
	} catch {
		text = undefined
	}
	const out: { text?: string; isError?: boolean } = {}
	if (text?.trim()) out.text = truncateDisplay(text, TOOL_RESULT_DISPLAY_CHARS)
	const isError = (r as { isError?: unknown }).isError
	if (isError === true) out.isError = true
	return out
}

/** Thinking-block text of an assistant message (ignored by contentText). */
function agentReasoning(msg: AgentMessage): string {
	const content = (msg as { content?: unknown }).content
	if (!Array.isArray(content)) return ''
	try {
		return content
			.filter(
				(block): block is { type: 'thinking'; thinking: unknown } =>
					!!block && typeof block === 'object' && (block as { type?: unknown }).type === 'thinking',
			)
			.map((block) => (typeof block.thinking === 'string' ? block.thinking : ''))
			.filter(Boolean)
			.join('\n')
	} catch {
		return ''
	}
}

function msgRole(msg: AgentMessage): string | undefined {
	return (msg as { role?: unknown }).role as string | undefined
}

function isToolResultMessage(msg: AgentMessage): boolean {
	return msgRole(msg) === 'toolResult'
}

function isFailedAssistant(msg: AgentMessage): boolean {
	if (msgRole(msg) !== 'assistant') return false
	const stop = (msg as { stopReason?: unknown }).stopReason
	return stop === 'error' || stop === 'aborted'
}

function toolCallIds(msg: AgentMessage): string[] {
	const content = (msg as { content?: unknown }).content
	if (!Array.isArray(content)) return []
	const ids: string[] = []
	for (const block of content) {
		if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'toolCall') {
			const id = (block as { id?: unknown }).id
			if (typeof id === 'string' && id) ids.push(id)
		}
	}
	return ids
}

/**
 * Drop `toolResult` messages that have no matching pending assistant
 * `toolCall` — sending them alone is a 400 on OpenAI-compatible APIs.
 * Also drops an incomplete trailing batch: if a non-tool message arrives
 * while some tool calls are still unanswered, the preceding assistant turn
 * (and its partial results) is removed so the request stays valid.
 */
export function dropOrphanToolResults(msgs: AgentMessage[]): AgentMessage[] {
	const out: AgentMessage[] = []
	let pending = new Set<string>()
	let batchStart = -1
	for (const m of msgs) {
		if (isToolResultMessage(m)) {
			const id = (m as { toolCallId?: unknown }).toolCallId
			if (typeof id === 'string' && pending.has(id)) {
				pending.delete(id)
				out.push(m)
			}
			// else: orphan result from a truncated batch — drop it.
			continue
		}
		if (msgRole(m) === 'assistant') {
			// A new assistant turn while the previous batch is incomplete
			// means results went missing — excise that whole batch first.
			if (pending.size > 0 && batchStart >= 0) {
				out.splice(batchStart)
			}
			batchStart = out.length
			pending = new Set(toolCallIds(m))
			out.push(m)
			continue
		}
		if (pending.size > 0) {
			// A user (or other) message with unanswered tool calls: the
			// batch can never complete — excise it, keep the boundary msg.
			if (batchStart >= 0) {
				out.splice(batchStart)
				batchStart = -1
			}
			pending = new Set()
		}
		batchStart = -1
		out.push(m)
	}
	return out
}

/**
 * Truncation budget for one transcript message. Text alone undercounts
 * tool calls (their content blocks hold no `text`), so include the
 * serialized tool-call arguments and tool-result ids — otherwise the
 * truncator thinks tool turns are free and slices batches apart.
 */
function messageSize(msg: AgentMessage): number {
	// Thinking blocks carry no `text` but can dominate the context window —
	// count them too, or truncation under-budgets reasoning models.
	let size = agentText(msg).length + agentReasoning(msg).length + 1
	try {
		const content = (msg as { content?: unknown }).content
		if (Array.isArray(content)) {
			for (const block of content) {
				if (block && typeof block === 'object' && (block as { type?: unknown }).type === 'toolCall') {
					const b = block as { name?: unknown; arguments?: unknown }
					size += String(b.name ?? '').length + JSON.stringify(b.arguments ?? {}).length
				}
			}
		}
		const tr = msg as { toolCallId?: unknown; toolName?: unknown }
		if (typeof tr.toolCallId === 'string') size += tr.toolCallId.length + String(tr.toolName ?? '').length
	} catch {
		/* size estimate only — ignore */
	}
	return size
}

function toAgentMessage(msg: ChatMsg, model: ModelChoice): AgentMessage | null {
	if (!msg.text?.trim()) return null
	if (msg.role === 'user') {
		return {
			role: 'user',
			content: [{ type: 'text', text: msg.text }],
			timestamp: msg.timestamp,
		} as unknown as AgentMessage
	}
	if (msg.role === 'assistant') {
		// Replayed history must satisfy the provider's AssistantMessage shape:
		// pi-ai usage accounting reads `usage.totalTokens`, so a bare
		// role+content object crashes the stream (stopReason "error").
		return {
			role: 'assistant',
			content: [{ type: 'text', text: msg.text }],
			api: 'unknown',
			provider: model.provider || 'unknown',
			model: model.id || 'unknown',
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
			stopReason: 'stop',
			timestamp: msg.timestamp,
		} as unknown as AgentMessage
	}
	return null
}

/** Persisted thread path → agent transcript (skips empty drafts and tool-only nodes). */
function threadToTranscript(thread: ChatThread, leafId: string | null, model: ModelChoice): AgentMessage[] {
	if (!leafId) return []
	return getPathTo(thread, leafId).flatMap((m) => {
		const msg = toAgentMessage(m, model)
		return msg ? [msg] : []
	})
}

function toLlmText(text: string): Message[] {
	return [{ role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }]
}

/**
 * Bound the context window but keep the leading system message(s) intact:
 * they carry the prompt and the tool declarations. Truncate at message
 * boundaries (newest retained) instead of slicing one blob of text
 * mid-message. Truncation is tool-pair safe: a `toolResult` without its
 * preceding assistant `toolCall` is a 400 on OpenAI-compatible APIs
 * ("Messages with role 'tool' must be a response to a preceding message
 * with 'tool_calls'"). Exported pure for tests (no settings knob remains —
 * callers pass the model's derived budget).
 */
export function truncateTranscript(msgs: AgentMessage[], budgetChars: number): AgentMessage[] {
	const isSystem = (m: AgentMessage): boolean => (m as { role?: string }).role === 'system'
	const head = msgs.filter(isSystem)
	// Strip failed assistant turns first so a previous error is never
	// re-sent and can never strand a tool batch mid-sequence.
	const clean = msgs.filter((m) => !isSystem(m) && !isFailedAssistant(m))
	const sizes = clean.map((m) => messageSize(m))
	const total = sizes.reduce((a, b) => a + b, 0)
	if (total <= budgetChars) {
		// Even without truncation the transcript can hold an orphan
		// (e.g. a persisted error stripped above left a dangling
		// toolResult) — sweep it before returning.
		return [...head, ...dropOrphanToolResults(clean)]
	}
	let start = clean.length
	let used = 0
	for (let i = clean.length - 1; i >= 0; i--) {
		const size = sizes[i]
		if (start < clean.length && used + size > budgetChars) break
		start = i
		used += size
		if (used >= budgetChars) break
	}
	// Always keep at least the newest message so a request is never empty.
	if (start >= clean.length && clean.length) start = clean.length - 1
	// Expand backwards past a leading toolResult so the batch's
	// assistant toolCall stays attached (validity beats budget).
	while (start > 0 && isToolResultMessage(clean[start])) start--
	let kept = clean.slice(start)
	// A transcript that starts with toolResults is corrupt — drop the
	// orphans rather than sending an invalid request.
	while (kept.length && isToolResultMessage(kept[0])) kept = kept.slice(1)
	kept = dropOrphanToolResults(kept)
	// Last resort: never send a head-only (or empty) request.
	if (!kept.length && clean.length) {
		const fallback = [...clean].reverse().find((m) => msgRole(m) === 'user')
		kept = fallback ? [fallback] : [clean[clean.length - 1]]
		kept = dropOrphanToolResults(kept)
		if (!kept.length && clean.length) kept = [clean[clean.length - 1]]
	}
	return [...head, ...kept]
}

/** Chat composable bound to one Job's persisted thread. */
export interface AgentChatOptions {
	systemPrompt?: string
	thinkingLevel?: ThinkingLevel
}

export function useAgentChat(
	job: Job,
	master: MasterResume,
	mutate: JobMutations,
	model: ModelChoice = DEFAULT_MODEL,
	opts: AgentChatOptions = {},
) {
	const sending = ref(false)
	const draftId = ref<string | null>(null)
	const error = ref<string | null>(null)
	/**
	 * True while an assistant turn is actively streaming (between its
	 * message_start and message_end). The panel shows the typing dots when
	 * `sending` but not streaming — before the first token and in the gap
	 * after tool results come back, while the follow-up turn is pending.
	 */
	const assistantStreaming = ref(false)

	const basePrompt = computed(() => resolveSystemPrompt(opts.systemPrompt?.trim() || loadAgentSettings().systemPrompt))
	// History budget comes from the pi-ai SDK's per-model context window
	// (tokens → chars); the panel remounts on model change (App agentKey)
	// so a switch picks up the new model's budget automatically.
	const contextChars = contextCharsFor(model.provider, model.id)

	// Session binding (wisp-pro parity): the live transcript follows the
	// job's active conversation; switching sessions replays that session's
	// branch instead of a stale transcript.
	const convo = computed<Conversation>(() => activeConversation(job.conversations, job.activeConversationId))

	const activeLeafId = computed(() => getDefaultLeaf(convo.value.thread))
	const messages = computed(() => (activeLeafId.value ? getPathTo(convo.value.thread, activeLeafId.value) : []))
	const siblingInfo = computed(() => {
		const leaf = activeLeafId.value
		if (!leaf) return null
		const parent = getParent(convo.value.thread, leaf)
		if (!parent) return null
		const siblings = getChildren(convo.value.thread, parent)
		return { index: siblings.indexOf(leaf), total: siblings.length }
	})

	const buildSystemPrompt = (): string => composeSystemPrompt(basePrompt.value, job, master)

	// The assistant node of the current turn being streamed. A run produces
	// one node per assistant turn (wisp-pro parity: a new message per tool
	// round); chunks of a turn arrive as cumulative partials and REPLACE
	// that turn's text, so no cross-turn merging is ever needed.
	let runTurnId: string | null = null

	const agent = new Agent({
		initialState: {
			systemPrompt: buildSystemPrompt(),
			model: resolveModel(model.provider, model.id) ?? undefined,
			// Reasoning effort the loop forwards as `reasoning` on every
			// request, including post-tool follow-ups.
			thinkingLevel: opts.thinkingLevel ?? 'off',
			tools: agentToolsFor(job, master, mutate),
			messages: threadToTranscript(convo.value.thread, getDefaultLeaf(convo.value.thread), model),
		},
		streamFn,
		getApiKey: async (provider: string) => (await getApiKey(provider)) ?? undefined,
		convertToLlm: (msgs: AgentMessage[]) =>
			msgs.flatMap((m) => {
				const role = (m as { role?: string }).role
				// Failed turns must never reach the provider: an `error`/`aborted`
				// assistant has no valid wire form and re-sending it poisons the
				// next request after a failure.
				if (role === 'assistant' && isFailedAssistant(m)) return []
				// System carries the prompt plus tool declarations — dropping
				// it sends requests with no tools attached.
				if (role === 'user' || role === 'assistant' || role === 'toolResult' || role === 'system') {
					return [m as Message]
				}
				return []
			}),
		transformContext: async (msgs: AgentMessage[]) => truncateTranscript(msgs, contextChars),
	})

	/** Refresh the leading system message so JD/title/summary edits land on the next request. */
	function refreshSystemPrompt(): void {
		const next = buildSystemPrompt()
		const current = agent.state.messages
		if (!current.length || (current[0] as { role?: string }).role !== 'system') return
		const [head, ...tail] = current
		const headMsg = head as { content?: unknown; [k: string]: unknown }
		if (headMsg.content === next) return
		agent.state.messages = [{ ...head, content: next } as AgentMessage, ...tail]
	}

	/** Replay a persisted branch into the live transcript (keeps the system head). */
	function syncTranscript(thread: ChatThread, leafId: string | null): void {
		const current = agent.state.messages
		const head = current.length && (current[0] as { role?: string }).role === 'system' ? [current[0]] : []
		agent.state.messages = [...head, ...threadToTranscript(thread, leafId, model)]
	}

	// Branch navigation (sibling cycling, conversation picker, clear) edits the
	// persisted thread outside this composable — replay it when idle so the next
	// request sees the selected branch instead of a stale transcript. Session
	// switches replay the newly active conversation's thread the same way.
	watch([activeLeafId, () => job.activeConversationId], ([leaf]) => {
		if (!sending.value) syncTranscript(convo.value.thread, leaf)
	})

	agent.subscribe((event) => {
		// Only assistant turns belong in the draft nodes: the loop also
		// emits message_start/message_end for the echoed user message (and
		// tool results), which must neither create turns nor release the
		// run — the run is released once the whole run ends.
		const thread = convo.value.thread
		/** The turn node chunks and tool activity belong to. */
		const currentTurn = (): ChatMsg | undefined => {
			const id = runTurnId ?? draftId.value
			const node = id ? thread.messages[id] : undefined
			return node && node.role === 'assistant' ? node : undefined
		}
		// Tool activity is recorded on the requesting turn (wisp-pro parity:
		// tool calls ride on the assistant message): the bubble shows each
		// call collapsed with its result, followed by the next turn's text.
		if (event.type === 'tool_execution_start') {
			const turn = currentTurn()
			if (turn) {
				const calls = turn.toolCalls ?? (turn.toolCalls = [])
				markToolRunning(calls, event.toolCallId, event.toolName, summarizeToolArgs(event.args))
			}
			return
		}
		if (event.type === 'tool_execution_end') {
			const turn = currentTurn()
			if (turn) {
				const calls = turn.toolCalls ?? (turn.toolCalls = [])
				const display = toolResultDisplay(event.result)
				const found = calls.find((c) => c.id === event.toolCallId)
				if (found) {
					found.status = 'done'
					if (display.text !== undefined) found.result = display.text
					if (display.isError === true || event.isError === true) found.isError = true
				} else {
					calls.push({
						id: event.toolCallId,
						name: event.toolName,
						status: 'done',
						...(display.text !== undefined ? { result: display.text } : null),
						...(display.isError === true || event.isError === true ? { isError: true } : null),
					})
				}
			}
			return
		}
		const role = (event as { message?: { role?: string } }).message?.role
		if (event.type === 'message_start') {
			// Every assistant turn starts here (exactly one start per turn).
			// Chain a fresh node past a turn that already has content; reuse
			// the eagerly created first draft while it is still empty.
			// (Also fires for the echoed user message / tool results.)
			if (role !== 'assistant' || !draftId.value) return
			assistantStreaming.value = true
			const turn = currentTurn()
			if (!turn) {
				runTurnId = draftId.value
				return
			}
			if (turn.text || turn.reasoning || turn.toolCalls?.length) {
				const nextId = uid()
				pushMessage(
					convo.value,
					{ id: nextId, role: 'assistant', text: '', timestamp: Date.now() },
					getDefaultLeaf(thread),
				)
				runTurnId = nextId
			}
		} else if (event.type === 'message_update' || event.type === 'message_end') {
			// The loop also emits these for the echoed user message and for
			// tool results — only assistant turns belong in the draft nodes.
			if (role !== 'assistant') return
			if (event.type === 'message_end') assistantStreaming.value = false
			const turn = currentTurn()
			if (!turn) return
			// Partials of one turn are cumulative, so REPLACE the turn fields.
			// Empty updates never wipe: error turns arrive with empty content.
			const text = agentText(event.message)
			if (text) turn.text = text
			const reasoning = agentReasoning(event.message)
			if (reasoning.trim()) turn.reasoning = truncateDisplay(reasoning, REASONING_DISPLAY_CHARS)
			// Tool calls draft before they execute: surface a Preparing card
			// from the streamed partials so argument drafting never looks stalled.
			syncDraftingCalls(turn.toolCalls ?? (turn.toolCalls = []), draftingPartials(event.message))
		} else if (event.type === 'agent_end') {
			const id = draftId.value
			// Surface the provider's own error (any backend) instead of
			// failing silently with an emptied bubble.
			const failed = event.messages.find((m) => (m as { stopReason?: string }).stopReason === 'error') as
				{ errorMessage?: unknown } | undefined
			if (failed && typeof failed.errorMessage === 'string' && failed.errorMessage) {
				error.value = failed.errorMessage
			}
			// Don't persist an empty trailing turn: it pollutes the thread and
			// its replays. Partial streamed text (or a written error) stays,
			// as does a turn that ran tools — its cards stay visible.
			// Earlier turns always have content (a new node only chains past
			// a non-empty one), so only the last turn can be dropped.
			const lastId = runTurnId ?? id
			const last = lastId ? thread.messages[lastId] : undefined
			if (
				last &&
				last.role === 'assistant' &&
				!last.text.trim() &&
				!last.reasoning?.trim() &&
				!last.toolCalls?.length
			) {
				removeMessage(thread, lastId as string)
			}
			touchConversation(convo.value)
			draftId.value = null
			runTurnId = null
			sending.value = false
			assistantStreaming.value = false
		}
	})

	function ensureConfigured(): boolean {
		if (!model.provider || !model.id) {
			error.value = 'No model configured. Open Agent settings to choose one.'
			return false
		}
		return true
	}

	async function send(text: string): Promise<void> {
		if (!text.trim() || sending.value) return
		error.value = null
		if (!ensureConfigured()) return
		const key = await getApiKey(model.provider)
		if (!key) {
			error.value = `No API key for ${model.provider}. Open Agent settings to add one.`
			return
		}
		if (!resolveModel(model.provider, model.id)) {
			error.value = `Model ${model.provider}/${model.id} not found in the pi-ai catalog.`
			return
		}
		refreshSystemPrompt()
		sending.value = true
		assistantStreaming.value = false
		const now = Date.now()
		const thread = convo.value.thread
		pushMessage(convo.value, { id: uid(), role: 'user', text, timestamp: now }, getDefaultLeaf(thread))
		const assistantId = uid()
		pushMessage(convo.value, { id: assistantId, role: 'assistant', text: '', timestamp: now }, getDefaultLeaf(thread))
		draftId.value = assistantId
		runTurnId = assistantId
		try {
			await agent.prompt(toLlmText(text) as unknown as AgentMessage)
		} catch (e) {
			const message = `Request failed: ${e instanceof Error ? e.message : String(e)}`
			const draft = thread.messages[assistantId]
			// Keep already-streamed partial text; only a still-empty draft
			// becomes the error note so the failure stays visible in-thread.
			if (draft && !draft.text.trim()) draft.text = message
			else error.value = message
			draftId.value = null
			runTurnId = null
			sending.value = false
			assistantStreaming.value = false
		}
	}

	async function retry(): Promise<void> {
		const thread = convo.value.thread
		const leaf = getDefaultLeaf(thread)
		if (!leaf || sending.value) return
		const lastUser = [...getPathTo(thread, leaf)].reverse().find((m) => m.role === 'user')
		if (!lastUser) return
		// Branch at the run start so a multi-turn run (chained assistant
		// nodes) is superseded whole instead of mid-chain. Single-turn runs
		// are unchanged: the run start IS the leaf.
		const parent = getParent(thread, runStartId(thread, leaf))
		await runTurn(parent ?? null, lastUser.text)
	}

	/**
	 * Regenerate the reply to one assistant bubble (wisp-pro parity): a new
	 * sibling is added under the same parent and re-run with the nearest
	 * preceding user text. Falls back to the default-leaf retry when the id
	 * is unknown.
	 */
	async function regenerate(assistantId: string): Promise<void> {
		const thread = convo.value.thread
		const target = thread.messages[assistantId]
		if (!target || sending.value) return
		if (target.role !== 'assistant') return
		// Any turn of a run regenerates the whole run (sibling of its first
		// turn); the id may come from a grouped bubble's later turn.
		const parent = getParent(thread, runStartId(thread, assistantId))
		const path = [...getPathTo(thread, assistantId)].reverse()
		const userText = path.find((m) => m.role === 'user')?.text
		if (!userText) return
		await runTurn(parent ?? null, userText)
	}

	/**
	 * Edit-and-resend (derive): the edited user text becomes a NEW sibling
	 * branch (the original subtree is kept) and is sent immediately.
	 */
	async function resendEdited(userId: string, text: string): Promise<void> {
		const thread = convo.value.thread
		const clean = text.trim()
		if (!clean || !thread.messages[userId] || sending.value) return
		const parent = getParent(thread, userId)
		await runTurn(parent ?? null, clean, { id: uid(), text: clean })
	}

	/** Shared turn runner: sync to the parent branch, append a fresh assistant
	 * draft (plus a new user node for derives), and prompt. Used by
	 * retry/regenerate/resendEdited. */
	async function runTurn(
		parent: string | null,
		userText: string,
		newUser?: { id: string; text: string },
	): Promise<void> {
		const thread = convo.value.thread
		error.value = null
		if (!ensureConfigured()) return
		refreshSystemPrompt()
		// Replay the parent branch so the new turn doesn't inherit a
		// superseded assistant/tool transcript.
		syncTranscript(thread, parent)
		sending.value = true
		assistantStreaming.value = false
		const draftParent = newUser ? newUser.id : parent
		if (newUser) {
			pushMessage(convo.value, { id: newUser.id, role: 'user', text: newUser.text, timestamp: Date.now() }, parent)
		}
		const assistantId = uid()
		pushMessage(convo.value, { id: assistantId, role: 'assistant', text: '', timestamp: Date.now() }, draftParent)
		draftId.value = assistantId
		runTurnId = assistantId
		try {
			await agent.prompt(toLlmText(userText) as unknown as AgentMessage)
		} catch (e) {
			const message = `Request failed: ${e instanceof Error ? e.message : String(e)}`
			const draft = thread.messages[assistantId]
			if (draft && !draft.text.trim()) draft.text = message
			else error.value = message
			draftId.value = null
			runTurnId = null
			sending.value = false
			assistantStreaming.value = false
		}
	}

	function stop(): void {
		agent.abort()
		sending.value = false
	}

	return {
		messages,
		sending,
		assistantStreaming,
		error,
		draftId,
		siblingInfo,
		send,
		stop,
		retry,
		regenerate,
		resendEdited,
	}
}
