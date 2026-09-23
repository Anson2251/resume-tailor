import { computed, ref, watch } from 'vue'
import { contentText, type Message } from '@earendil-works/pi-ai'
import { Agent, type AgentMessage } from '@earendil-works/pi-agent-core'
import type { Job, MasterResume } from '../data/types'
import type { ChatThread } from './threads'
import { uid } from '../data/resume'
import { getApiKey } from './keyring'
import { DEFAULT_MODEL, resolveModel, streamFn, type ModelChoice } from './models'
import { DEFAULT_SYSTEM_PROMPT, loadAgentSettings } from './agentSettings'
import { getChildren, getDefaultLeaf, getParent, getPathTo, removeMessage, type ChatMsg } from './threads'
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

/** Chat composable bound to one Job's persisted thread. */
export interface AgentChatOptions {
	systemPrompt?: string
	contextChars?: number
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

	const basePrompt = computed(
		() => opts.systemPrompt?.trim() || loadAgentSettings().systemPrompt || DEFAULT_SYSTEM_PROMPT,
	)
	const contextChars =
		typeof opts.contextChars === 'number' && Number.isFinite(opts.contextChars)
			? Math.min(50000, Math.max(1000, Math.round(opts.contextChars)))
			: loadAgentSettings().contextChars

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

	const agent = new Agent({
		initialState: {
			systemPrompt: buildSystemPrompt(),
			model: resolveModel(model.provider, model.id) ?? undefined,
			tools: agentToolsFor(job, master, mutate),
			messages: threadToTranscript(convo.value.thread, getDefaultLeaf(convo.value.thread), model),
		},
		streamFn,
		getApiKey: async (provider: string) => (await getApiKey(provider)) ?? undefined,
		convertToLlm: (msgs: AgentMessage[]) =>
			msgs.flatMap((m) => {
				const role = (m as { role?: string }).role
				// System carries the prompt plus tool declarations — dropping
				// it sends requests with no tools attached.
				if (role === 'user' || role === 'assistant' || role === 'toolResult' || role === 'system') {
					return [m as Message]
				}
				return []
			}),
		transformContext: async (msgs: AgentMessage[]) => {
			// Bound the context window but keep the leading system message(s)
			// intact: they carry the prompt and the tool declarations.
			// Truncate at message boundaries (newest retained) instead of
			// slicing one blob of text mid-message.
			const isSystem = (m: AgentMessage): boolean => (m as { role?: string }).role === 'system'
			const head = msgs.filter(isSystem)
			const rest = msgs.filter((m) => !isSystem(m))
			const sizes = rest.map((m) => agentText(m).length + 1)
			const total = sizes.reduce((a, b) => a + b, 0)
			if (total <= contextChars) return msgs
			let kept: AgentMessage[] = []
			let used = 0
			for (let i = rest.length - 1; i >= 0; i--) {
				const size = sizes[i]
				if (kept.length > 0 && used + size > contextChars) break
				kept.unshift(rest[i])
				used += size
				if (used >= contextChars) break
			}
			// Always keep at least the newest message so a request is never empty.
			if (!kept.length && rest.length) kept = [rest[rest.length - 1]]
			return [...head, ...kept]
		},
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
		// Only assistant turns belong in the draft bubble: the loop also
		// emits message_start/message_end for the echoed user message (and
		// tool results), which must neither overwrite the draft nor release
		// it — the draft is released once the whole run ends.
		const thread = convo.value.thread
		const role = (event as { message?: { role?: string } }).message?.role
		if (event.type === 'message_update') {
			const id = draftId.value
			if (role === 'assistant' && id && thread.messages[id]) {
				const text = agentText(event.message)
				// Never let an empty update wipe already-streamed text: error
				// turns arrive with empty content and would blank the bubble.
				if (text) thread.messages[id].text = text
			}
		} else if (event.type === 'message_end') {
			const id = draftId.value
			if (role === 'assistant' && id && thread.messages[id]) {
				const text = agentText(event.message)
				if (text) thread.messages[id].text = text
			}
		} else if (event.type === 'agent_end') {
			const id = draftId.value
			// Surface the provider's own error (any backend) instead of
			// failing silently with an emptied bubble.
			const failed = event.messages.find((m) => (m as { stopReason?: string }).stopReason === 'error') as
				{ errorMessage?: unknown } | undefined
			if (failed && typeof failed.errorMessage === 'string' && failed.errorMessage) {
				error.value = failed.errorMessage
			}
			// Don't persist empty failed drafts: they pollute the thread and
			// its replays. Partial streamed text (or a written error) stays.
			if (id && thread.messages[id] && !thread.messages[id].text.trim()) {
				removeMessage(thread, id)
			}
			touchConversation(convo.value)
			draftId.value = null
			sending.value = false
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
		const now = Date.now()
		const thread = convo.value.thread
		pushMessage(convo.value, { id: uid(), role: 'user', text, timestamp: now }, getDefaultLeaf(thread))
		const assistantId = uid()
		pushMessage(convo.value, { id: assistantId, role: 'assistant', text: '', timestamp: now }, getDefaultLeaf(thread))
		draftId.value = assistantId
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
			sending.value = false
		}
	}

	async function retry(): Promise<void> {
		const thread = convo.value.thread
		const leaf = getDefaultLeaf(thread)
		if (!leaf || sending.value) return
		const lastUser = [...getPathTo(thread, leaf)].reverse().find((m) => m.role === 'user')
		if (!lastUser) return
		const parent = getParent(thread, leaf)
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
		const parent = getParent(thread, assistantId)
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
		const draftParent = newUser ? newUser.id : parent
		if (newUser) {
			pushMessage(convo.value, { id: newUser.id, role: 'user', text: newUser.text, timestamp: Date.now() }, parent)
		}
		const assistantId = uid()
		pushMessage(convo.value, { id: assistantId, role: 'assistant', text: '', timestamp: Date.now() }, draftParent)
		draftId.value = assistantId
		try {
			await agent.prompt(toLlmText(userText) as unknown as AgentMessage)
		} catch (e) {
			const message = `Request failed: ${e instanceof Error ? e.message : String(e)}`
			const draft = thread.messages[assistantId]
			if (draft && !draft.text.trim()) draft.text = message
			else error.value = message
			draftId.value = null
			sending.value = false
		}
	}

	function stop(): void {
		agent.abort()
		sending.value = false
	}

	return { messages, sending, error, draftId, siblingInfo, send, stop, retry, regenerate, resendEdited }
}
