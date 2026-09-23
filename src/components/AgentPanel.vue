<script setup lang="ts">
import { computed, ref } from 'vue'
import { FwbDropdown } from 'flowbite-vue'
import { findModelChoice, modelLabel } from '../agent/models'
import { useAgentSettings } from '../agent/agentSettings'
import { getSiblings } from '../agent/threads'
import {
	activeConversation,
	blankConversation,
	conversationSize,
	conversationTitle,
	deleteConversation,
	touchConversation,
} from '../agent/conversations'
import { selectSibling } from '../agent/panes'
import { useAgentChat } from '../agent/useAgentChat'
import AutoScrollWrapper from './AutoScrollWrapper.vue'
import StreamMarkdown from './StreamMarkdown.vue'
import { writeField } from '../data/resume'
import type { ContentItem, Job, MasterResume } from '../data/types'

const props = defineProps<{
	job: Job
	master: MasterResume
}>()
const emit = defineEmits<{
	(e: 'open-settings'): void
}>()

const tab = ref<'chat' | 'letter'>('chat')
const input = ref('')
const scroller = ref<InstanceType<typeof AutoScrollWrapper> | null>(null)

const { settings } = useAgentSettings()
const isConfigured = computed(() => !!settings.provider && !!settings.modelId)
const activeModel = computed(() => {
	if (!isConfigured.value) return { provider: '', id: '', label: 'Not configured' }
	const choice = findModelChoice(settings.provider, settings.modelId)
	return (
		choice ?? {
			provider: settings.provider,
			id: settings.modelId,
			label: modelLabel(settings.provider, settings.modelId),
		}
	)
})
const activeModelLabel = computed(() =>
	isConfigured.value ? modelLabel(settings.provider, settings.modelId) : 'Not configured',
)

function findMasterItem(id: string): ContentItem | undefined {
	for (const key of ['experience', 'projects', 'education', 'skills'] as const) {
		const found = props.master[key].find((item) => item.id === id)
		if (found) return found
	}
	for (const section of props.master.customSections || []) {
		const found = (section.items || []).find((item) => item.id === id)
		if (found) return found
	}
	return undefined
}

const chat = useAgentChat(
	props.job,
	props.master,
	{
		applyOverride: (itemId, patch) => {
			if (props.job.kind === 'master') {
				const item = findMasterItem(itemId)
				if (!item) return
				for (const [field, value] of Object.entries(patch)) writeField(item, field, value)
				return
			}
			props.job.overrides[itemId] = { ...(props.job.overrides[itemId] || {}), ...patch }
		},
		setCoverLetter: (text) => {
			props.job.coverLetter = text
		},
		setVisibility: (section, ids) => {
			const view = props.job.view as unknown as Record<string, unknown>
			if (section === 'custom') return
			if (Array.isArray(view[section])) view[section] = ids
		},
		setTitle: (title) => {
			props.job.title = title
		},
		setSummary: (summary) => {
			props.job.summary = summary
		},
	},
	activeModel.value,
	{ systemPrompt: settings.systemPrompt, contextChars: settings.contextChars },
)

const convo = computed(() => activeConversation(props.job.conversations, props.job.activeConversationId))

interface SessionOption {
	id: string
	title: string
	count: number
	updatedAt: number
	active: boolean
}

const sessions = computed<SessionOption[]>(() =>
	[...props.job.conversations]
		.sort((a, b) => b.updatedAt - a.updatedAt)
		.map((c) => ({
			id: c.id,
			title: conversationTitle(c),
			count: conversationSize(c),
			updatedAt: c.updatedAt,
			active: c.id === convo.value.id,
		})),
)

const currentTitle = computed(() => conversationTitle(convo.value))

function selectSession(id: string): void {
	if (id === convo.value.id || chat.sending.value) return
	props.job.activeConversationId = id
	touchConversation(activeConversation(props.job.conversations, id))
	scroller.value?.scrollToBottom(true)
}

function newSession(): void {
	if (chat.sending.value) return
	const fresh = blankConversation()
	props.job.conversations.push(fresh)
	props.job.activeConversationId = fresh.id
	scroller.value?.scrollToBottom(true)
}

function deleteSession(id: string): void {
	if (chat.sending.value) return
	const target = props.job.conversations.find((c) => c.id === id)
	const label = target ? conversationTitle(target) : 'this conversation'
	if (!confirm(`Delete “${label}”? Its messages go too. The JD and cover letter are kept.`)) return
	props.job.activeConversationId = deleteConversation(props.job.conversations, id)
	scroller.value?.scrollToBottom(true)
}

const renamingId = ref<string | null>(null)
const renameDraft = ref('')

function startRename(id: string): void {
	renamingId.value = id
	renameDraft.value = props.job.conversations.find((c) => c.id === id)?.title ?? ''
}

function commitRename(id: string): void {
	// Escape clears renamingId first — a follow-up blur must not save.
	if (renamingId.value !== id) return
	const target = props.job.conversations.find((c) => c.id === id)
	if (target) {
		target.title = renameDraft.value.trim().slice(0, 120)
		touchConversation(target)
	}
	renamingId.value = null
}

function relativeTime(ts: number): string {
	if (!ts) return ''
	const delta = Date.now() - ts
	if (delta < 60_000) return 'just now'
	if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m ago`
	if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h ago`
	return new Date(ts).toLocaleDateString()
}

function send(): void {
	const text = input.value
	if (!text.trim() || chat.sending.value) return
	// Empty immediately so the draft can't be edited/resent mid-generation;
	// the box stays disabled via chat.sending until the run ends.
	input.value = ''
	scroller.value?.scrollToBottom(true)
	void chat.send(text)
}

function cycleAt(id: string, dir: 1 | -1): void {
	if (chat.sending.value) return
	selectSibling(convo.value.thread, id, dir)
	scroller.value?.scrollToBottom(true)
}

function siblingOf(id: string): { ids: string[]; index: number } | null {
	return getSiblings(convo.value.thread, id)
}

const editingId = ref<string | null>(null)
const editDraft = ref('')

function startEdit(id: string): void {
	const msg = convo.value.thread.messages[id]
	if (!msg || msg.role !== 'user' || chat.sending.value) return
	editingId.value = id
	editDraft.value = msg.text
}

function cancelEdit(): void {
	editingId.value = null
	editDraft.value = ''
}

function saveEdit(id: string): void {
	if (!editDraft.value.trim() || chat.sending.value) return
	const text = editDraft.value.trim()
	editingId.value = null
	editDraft.value = ''
	scroller.value?.scrollToBottom(true)
	void chat.resendEdited(id, text)
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<div
			class="no-print rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900"
		>
			<span class="font-semibold">JD:</span>
			<span v-if="job.jdSource">{{ job.jdSource.filename }} · {{ job.jdSource.pageCount }} pages</span>
			<span v-else>No JD attached — open the JD PDF pane to attach one.</span>
			<span class="ml-2 rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{{ activeModelLabel }}</span>
		</div>

		<div class="no-print flex gap-1">
			<button
				class="btn px-3 py-1.5 text-[13px]"
				:class="tab === 'chat' ? 'btn-primary' : 'btn-ghost'"
				@click="tab = 'chat'"
			>
				Chat
			</button>
			<button
				class="btn px-3 py-1.5 text-[13px]"
				:class="tab === 'letter' ? 'btn-primary' : 'btn-ghost'"
				@click="tab = 'letter'"
			>
				Cover letter
			</button>
		</div>

		<div v-if="tab === 'letter'" class="flex min-h-0 flex-1 flex-col gap-2">
			<textarea
				v-model="job.coverLetter"
				class="textarea min-h-[40vh] flex-1 font-mono"
				placeholder="The agent drafts here — or write it yourself (markdown)."
			/>
		</div>

		<div v-else class="flex min-h-0 flex-1 flex-col gap-2">
			<AutoScrollWrapper ref="scroller" class="min-h-0 flex-1">
				<div class="flex flex-col gap-2">
					<div
						v-for="msg in chat.messages.value"
						:key="msg.id"
						class="group flex items-end gap-1"
						:class="msg.role === 'user' ? 'self-end' : 'w-full'"
					>
						<button
							v-if="msg.role === 'user' && editingId !== msg.id"
							class="no-print mb-1 shrink-0 rounded px-1.5 py-0.5 text-[13px] text-slate-400 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-700"
							title="Edit and resend"
							:disabled="chat.sending.value"
							@click="startEdit(msg.id)"
						>
							✎
						</button>
						<div
							class="min-w-0 py-1.5 text-sm"
							:class="
								msg.role === 'user'
									? 'rounded-lg bg-indigo-600 px-3 py-2 text-white'
									: 'w-full px-1 text-slate-800 dark:text-slate-100'
							"
						>
							<template v-if="editingId === msg.id">
								<textarea
									v-model="editDraft"
									class="textarea mb-1"
									:class="msg.role === 'user' ? 'text-slate-900' : ''"
									rows="3"
									:disabled="chat.sending.value"
									@keyup.escape="cancelEdit"
								/>
								<div class="no-print flex justify-end gap-1">
									<button class="btn btn-ghost px-2 py-0.5 text-xs" @click="cancelEdit">Cancel</button>
									<button
										class="btn btn-primary px-2 py-0.5 text-xs"
										:disabled="!editDraft.trim() || chat.sending.value"
										@click="saveEdit(msg.id)"
									>
										Save & resend
									</button>
								</div>
							</template>
							<template v-else>
								<pre v-if="msg.role === 'user'" class="whitespace-pre-wrap">{{ msg.text || '…' }}</pre>
								<StreamMarkdown v-else :text="msg.text" :streaming="chat.sending.value" />
								<div
									v-if="msg.role === 'assistant' || (siblingOf(msg.id) && siblingOf(msg.id)!.ids.length > 1)"
									class="no-print mt-1 flex items-center gap-1 text-[13px] opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
									:class="msg.role === 'user' ? 'justify-end text-indigo-100' : 'text-slate-400'"
								>
									<template v-if="siblingOf(msg.id) && siblingOf(msg.id)!.ids.length > 1">
										<button
											class="rounded px-1.5 py-0.5 hover:bg-black/10 dark:hover:bg-white/10"
											title="Previous version"
											:disabled="chat.sending.value"
											@click="cycleAt(msg.id, -1)"
										>
											‹
										</button>
										<span class="tabular-nums"
											>{{ siblingOf(msg.id)!.index + 1 }}/{{ siblingOf(msg.id)!.ids.length }}</span
										>
										<button
											class="rounded px-1.5 py-0.5 hover:bg-black/10 dark:hover:bg-white/10"
											title="Next version"
											:disabled="chat.sending.value"
											@click="cycleAt(msg.id, 1)"
										>
											›
										</button>
										<span class="mx-0.5">·</span>
									</template>
									<button
										v-if="msg.role === 'assistant' && msg.text.trim()"
										class="rounded px-1.5 py-0.5 hover:bg-slate-200 dark:hover:bg-slate-700"
										title="Regenerate this reply"
										:disabled="chat.sending.value"
										@click="void chat.regenerate(msg.id)"
									>
										⟳
									</button>
								</div>
							</template>
						</div>
					</div>
					<p v-if="!chat.messages.value.length" class="text-sm text-slate-400">
						Ask to tailor a bullet, draft the cover letter, or critique the resume against the JD.
					</p>
				</div>
			</AutoScrollWrapper>

			<div v-if="chat.error.value" class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
				{{ chat.error.value }}
				<button class="btn btn-ghost px-2 py-0.5 text-xs" @click="emit('open-settings')">Open settings</button>
			</div>

			<div class="no-print flex items-center gap-1 text-xs text-slate-400">
				<FwbDropdown close-inside placement="top">
					<template #trigger>
						<button class="btn btn-ghost max-w-52 truncate px-2 py-1" :title="`Session: ${currentTitle}`">
							<span class="truncate">💬 {{ currentTitle }}</span>
							<span class="shrink-0">▾</span>
						</button>
					</template>
					<div class="flex max-h-64 min-w-64 flex-col gap-1 overflow-y-auto p-1">
						<button
							type="button"
							class="btn btn-ghost w-full justify-start px-2 py-1.5 text-left text-[13px] dark:text-slate-200"
							:disabled="chat.sending.value"
							@click="newSession"
						>
							<span class="min-w-0 flex-1 truncate">＋ New session</span>
						</button>
						<div
							v-for="s in sessions"
							:key="s.id"
							class="btn btn-ghost w-full items-center px-2 py-1.5 text-left text-[13px] dark:text-slate-200"
							:class="{ 'bg-slate-100 dark:bg-slate-600': s.active }"
							:title="s.title"
						>
							<span
								v-if="renamingId === s.id"
								class="flex min-w-0 flex-1 items-center gap-1"
								@click.stop
								@mousedown.stop
							>
								<input
									v-model="renameDraft"
									class="input min-w-0 flex-1 py-0.5 text-[13px]"
									maxlength="120"
									:placeholder="s.title"
									autofocus
									@keyup.enter="commitRename(s.id)"
									@keyup.escape="renamingId = null"
									@blur="commitRename(s.id)"
								/>
							</span>
							<template v-else>
								<button type="button" class="min-w-0 flex-1 truncate text-left" @click="selectSession(s.id)">
									<span v-if="s.active" class="shrink-0">✓ </span>{{ s.title }}
									<span class="block truncate text-[11px] text-slate-400">
										{{ s.count }} msgs<span v-if="relativeTime(s.updatedAt)"> · {{ relativeTime(s.updatedAt) }}</span>
									</span>
								</button>
								<span class="flex shrink-0 gap-0.5">
									<button
										type="button"
										class="rounded px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
										title="Rename session"
										@click.stop="startRename(s.id)"
									>
										✎
									</button>
									<button
										type="button"
										class="rounded px-1 text-slate-400 hover:text-red-600"
										title="Delete session"
										:disabled="chat.sending.value"
										@click.stop="deleteSession(s.id)"
									>
										×
									</button>
								</span>
							</template>
						</div>
					</div>
				</FwbDropdown>
				<span v-if="isConfigured" class="ml-auto">Sends this job's context to {{ activeModelLabel }}.</span>
				<span v-else class="ml-auto">No model configured — open settings to choose one.</span>
			</div>

			<div class="no-print flex gap-2">
				<textarea
					v-model="input"
					class="textarea"
					rows="2"
					placeholder="Ask the agent… (Enter to send)"
					:disabled="chat.sending.value"
					@keyup.enter.exact.prevent="send"
				/>
				<button v-if="chat.sending.value" class="btn btn-secondary shrink-0 self-end" @click="chat.stop()">Stop</button>
				<button v-else class="btn btn-primary shrink-0 self-end" :disabled="!input.trim()" @click="send">Send</button>
			</div>
		</div>
	</div>
</template>
