import { computed, ref } from 'vue'
import { contentText, type Message } from '@earendil-works/pi-ai'
import { Agent, type AgentMessage } from '@earendil-works/pi-agent-core'
import type { Job } from '../data/types'
import { uid } from '../data/resume'
import { getApiKey } from './keyring'
import { DEFAULT_MODEL, models, streamFn, type ModelChoice } from './models'
import { addMessage, getChildren, getDefaultLeaf, getParent, getPathTo } from './threads'
import { agentToolsFor, type JobMutations } from './tools'

const SYSTEM_PROMPT =
	'You are a resume tailoring assistant. You help rewrite bullets and summaries for a specific job, ' +
	'draft cover letters, and coach the user. Use the provided tools to read the resume and apply edits. ' +
	'Never invent employers, dates, or credentials. Keep bullets concise and markdown-formatted.'

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

function toLlmText(text: string): Message[] {
	return [{ role: 'user', content: [{ type: 'text', text }], timestamp: Date.now() }]
}

/** Chat composable bound to one Job's persisted thread. */
export function useAgentChat(job: Job, mutate: JobMutations, model: ModelChoice = DEFAULT_MODEL) {
	const sending = ref(false)
	const draftId = ref<string | null>(null)
	const error = ref<string | null>(null)

	const activeLeafId = computed(() => getDefaultLeaf(job.chat))
	const messages = computed(() =>
		activeLeafId.value ? getPathTo(job.chat, activeLeafId.value) : [],
	)
	const siblingInfo = computed(() => {
		const leaf = activeLeafId.value
		if (!leaf) return null
		const parent = getParent(job.chat, leaf)
		if (!parent) return null
		const siblings = getChildren(job.chat, parent)
		return { index: siblings.indexOf(leaf), total: siblings.length }
	})

	const agent = new Agent({
		initialState: {
			systemPrompt: SYSTEM_PROMPT,
			model: models.getModel(model.provider, model.id) ?? undefined,
			tools: agentToolsFor(job, mutate),
		},
		streamFn,
		getApiKey: async (provider: string) => (await getApiKey(provider)) ?? undefined,
		convertToLlm: (msgs: AgentMessage[]) =>
			msgs.flatMap((m) => {
				const role = (m as { role?: string }).role
				if (role === 'user' || role === 'assistant' || role === 'toolResult') return [m as Message]
				return []
			}),
		transformContext: async (msgs: AgentMessage[]) => {
			const joined = msgs
				.map((m) => agentText(m))
				.join('\n')
				.slice(-8000)
			return [{ role: 'user', content: joined } as unknown as AgentMessage]
		},
	})

	agent.subscribe((event) => {
		if (event.type === 'message_update') {
			const id = draftId.value
			if (id && job.chat.messages[id]) job.chat.messages[id].text = agentText(event.message)
		} else if (event.type === 'message_end') {
			const t = agentText(event.message)
			const id = draftId.value
			if (id && job.chat.messages[id]) job.chat.messages[id].text = t
			draftId.value = null
		} else if (event.type === 'agent_end') {
			sending.value = false
		}
	})

	async function send(text: string): Promise<void> {
		if (!text.trim() || sending.value) return
		error.value = null
		const key = await getApiKey(model.provider)
		if (!key) {
			error.value = `No API key for ${model.provider}. Open Agent settings to add one.`
			return
		}
		if (!models.getModel(model.provider, model.id)) {
			error.value = `Model ${model.provider}/${model.id} not found in the pi-ai catalog.`
			return
		}
		sending.value = true
		const now = Date.now()
		addMessage(job.chat, { id: uid(), role: 'user', text, timestamp: now }, getDefaultLeaf(job.chat))
		const assistantId = uid()
		addMessage(job.chat, { id: assistantId, role: 'assistant', text: '', timestamp: now }, getDefaultLeaf(job.chat))
		draftId.value = assistantId
		try {
			await agent.prompt(toLlmText(text) as unknown as AgentMessage)
		} catch (e) {
			job.chat.messages[assistantId].text = `Request failed: ${e instanceof Error ? e.message : String(e)}`
			draftId.value = null
			sending.value = false
		}
	}

	async function retry(): Promise<void> {
		const leaf = getDefaultLeaf(job.chat)
		if (!leaf || sending.value) return
		const parent = getParent(job.chat, leaf)
		const lastUser = [...getPathTo(job.chat, leaf)].reverse().find((m) => m.role === 'user')
		if (!lastUser) return
		sending.value = true
		const assistantId = uid()
		addMessage(
			job.chat,
			{ id: assistantId, role: 'assistant', text: '', timestamp: Date.now() },
			parent,
		)
		draftId.value = assistantId
		try {
			await agent.prompt(toLlmText(lastUser.text) as unknown as AgentMessage)
		} catch (e) {
			job.chat.messages[assistantId].text = `Request failed: ${e instanceof Error ? e.message : String(e)}`
			draftId.value = null
			sending.value = false
		}
	}

	function stop(): void {
		agent.abort()
		sending.value = false
	}

	return { messages, sending, error, draftId, siblingInfo, send, stop, retry }
}
