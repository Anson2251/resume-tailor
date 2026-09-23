<script setup lang="ts">
import { computed, ref } from 'vue'
import { DEFAULT_MODEL } from '../agent/models'
import { getDefaultLeaf } from '../agent/threads'
import { blankThread } from '../agent/threads'
import { selectSibling } from '../agent/panes'
import { useAgentChat } from '../agent/useAgentChat'
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
	},
	DEFAULT_MODEL,
)

const leafId = computed(() => getDefaultLeaf(props.job.chat))

function send(): void {
	void chat.send(input.value).then(() => {
		input.value = ''
	})
}

function cycle(dir: 1 | -1): void {
	const leaf = leafId.value
	if (leaf) selectSibling(props.job.chat, leaf, dir)
}

function clearThread(): void {
	if (!confirm('Clear this job\u2019s chat thread? The JD and cover letter are kept.')) return
	props.job.chat = blankThread()
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<div class="no-print rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900">
			<span class="font-semibold">JD:</span>
			<span v-if="job.jdSource">{{ job.jdSource.filename }} · {{ job.jdSource.pageCount }} pages</span>
			<span v-else>No JD attached — open the JD PDF pane to attach one.</span>
			<span class="ml-2 rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-800">{{ DEFAULT_MODEL.label }}</span>
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
			<div class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
				<div
					v-for="msg in chat.messages.value"
					:key="msg.id"
					class="rounded-lg px-3 py-2 text-sm"
					:class="
						msg.role === 'user'
							? 'self-end bg-indigo-600 text-white'
							: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'
					"
				>
					<pre class="whitespace-pre-wrap">{{ msg.text || '…' }}</pre>
				</div>
				<p v-if="!chat.messages.value.length" class="text-sm text-slate-400">
					Ask to tailor a bullet, draft the cover letter, or critique the resume against the JD.
				</p>
			</div>

			<div v-if="chat.error.value" class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
				{{ chat.error.value }}
				<button class="btn btn-ghost px-2 py-0.5 text-xs" @click="emit('open-settings')">Open settings</button>
			</div>

			<div class="no-print flex items-center gap-1 text-xs text-slate-400">
				<template v-if="chat.siblingInfo.value && chat.siblingInfo.value.total > 1">
					<button class="btn btn-ghost px-2 py-1" @click="cycle(-1)">‹</button>
					<span>{{ chat.siblingInfo.value.index + 1 }} / {{ chat.siblingInfo.value.total }}</span>
					<button class="btn btn-ghost px-2 py-1" @click="cycle(1)">›</button>
				</template>
				<span class="mx-1">·</span>
				<button class="btn btn-ghost px-2 py-1" :disabled="chat.sending.value" @click="void chat.retry()">
					Retry
				</button>
				<button class="btn btn-ghost px-2 py-1" @click="clearThread">Clear</button>
				<span class="ml-auto">Sends this job's context to {{ DEFAULT_MODEL.label }}.</span>
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
				<button
					v-if="chat.sending.value"
					class="btn btn-secondary shrink-0 self-end"
					@click="chat.stop()"
				>
					Stop
				</button>
				<button v-else class="btn btn-primary shrink-0 self-end" :disabled="!input.trim()" @click="send">
					Send
				</button>
			</div>
		</div>
	</div>
</template>
