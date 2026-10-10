<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FwbButton, FwbInput, FwbTextarea } from 'flowbite-vue'
import type { MasterResume, MemoryNote } from '../data/types'

const master = defineModel<MasterResume>({ required: true })

const notes = computed<MemoryNote[]>(() => master.value.notes || [])
const selectedId = ref<string | null>(null)
const draftTitle = ref('')
const draftBody = ref('')

function ensureNotes(): MemoryNote[] {
	if (!master.value.notes) master.value.notes = []
	return master.value.notes
}

const selected = computed<MemoryNote | undefined>(() => notes.value.find((n) => n.id === selectedId.value))

// Keep the editor in sync when selection or remote (agent) edits change it.
watch(
	[selected, () => notes.value.length],
	() => {
		const note = selected.value
		draftTitle.value = note?.title || ''
		draftBody.value = note?.body || ''
	},
	{ immediate: true },
)

function select(id: string): void {
	selectedId.value = id
	const note = notes.value.find((n) => n.id === id)
	draftTitle.value = note?.title || ''
	draftBody.value = note?.body || ''
}

function createNote(): void {
	const list = ensureNotes()
	const fresh: MemoryNote = {
		id: `note-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
		title: 'Untitled note',
		body: '',
		updatedAt: Date.now(),
	}
	list.unshift(fresh)
	select(fresh.id)
}

function removeNote(id: string): void {
	const list = ensureNotes()
	const index = list.findIndex((n) => n.id === id)
	if (index === -1) return
	list.splice(index, 1)
	if (selectedId.value === id) {
		const next = list[Math.min(index, list.length - 1)]
		if (next) select(next.id)
		else {
			selectedId.value = null
			draftTitle.value = ''
			draftBody.value = ''
		}
	}
}

function saveDraft(): void {
	const note = selected.value
	if (!note) return
	note.title = draftTitle.value.trim().slice(0, 120) || 'Untitled note'
	note.body = draftBody.value.slice(0, 8000)
	note.updatedAt = Date.now()
}

function previewOf(body: string): string {
	const clean = (body || '').trim().replace(/\s+/g, ' ')
	if (!clean) return 'Empty note'
	return clean.length > 100 ? `${clean.slice(0, 100)}…` : clean
}

function dateOf(ts: number): string {
	if (!ts) return ''
	try {
		return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
	} catch {
		return ''
	}
}
</script>

<template>
	<div class="flex h-full flex-col gap-3">
		<div class="flex items-center justify-between">
			<div>
				<h2 class="text-sm font-semibold text-heading">Notebook</h2>
				<p class="text-xs text-body-subtle">Private notes for Mira — background, why, learnings. Never exported.</p>
			</div>
			<FwbButton size="sm" @click="createNote">New note</FwbButton>
		</div>
		<div v-if="!notes.length" class="rounded-lg border border-dashed border-neutral-300 p-4 text-center text-sm text-body-subtle">
			No notes yet. Jot down why you built a project, its background, or what you learnt — Mira will reuse it for
			cover letters and tailoring.
		</div>
		<div v-else class="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_1fr]">
			<ul class="max-h-48 space-y-1 overflow-y-auto lg:max-h-none">
				<li v-for="note in notes" :key="note.id">
					<button
						type="button"
						class="w-full rounded-lg border px-2.5 py-2 text-left transition"
						:class="
							note.id === selectedId
								? 'border-accent bg-accent/10'
								: 'border-neutral-200 hover:border-neutral-300 hover:bg-neutral-tertiary'
						"
						@click="select(note.id)"
					>
						<div class="flex items-center justify-between gap-2">
							<span class="truncate text-[13px] font-medium text-heading">{{ note.title || 'Untitled note' }}</span>
							<span v-if="note.updatedAt" class="shrink-0 text-[11px] text-body-subtle">{{ dateOf(note.updatedAt) }}</span>
						</div>
						<p class="mt-0.5 truncate text-xs text-body-subtle">{{ previewOf(note.body) }}</p>
					</button>
				</li>
			</ul>
			<div v-if="selected" class="flex min-h-0 flex-col gap-2">
				<FwbInput v-model="draftTitle" placeholder="Note title (e.g. Why I built X)" maxlength="120" @change="saveDraft" />
				<FwbTextarea
					v-model="draftBody"
					placeholder="Background, motivation, what you learnt… markdown welcome"
					:rows="14"
					@change="saveDraft"
					@blur="saveDraft"
				/>
				<div class="flex items-center justify-between">
					<p class="text-[11px] text-body-subtle">Autosaves on edit. Mira reads titles automatically, bodies on demand.</p>
					<FwbButton size="xs" color="red" outline @click="removeNote(selected.id)">Delete</FwbButton>
				</div>
			</div>
			<div v-else class="self-start rounded-lg bg-neutral-tertiary p-3 text-sm text-body-subtle">
				Select a note to read or edit it.
			</div>
		</div>
	</div>
</template>
