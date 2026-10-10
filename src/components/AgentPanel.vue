<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { FwbButton, FwbDropdown, FwbInput, FwbTextarea } from 'flowbite-vue'
import { Icon } from '@vicons/utils'
import { JsonTreeView } from 'json-tree-view-vue3'
import 'json-tree-view-vue3/style.css'
import {
	Add16Regular,
	ArrowClockwise16Regular,
	BrainCircuit20Regular,
	ChatMultiple16Regular,
	Checkmark16Regular,
	ChevronDown16Regular,
	ChevronLeft16Regular,
	ChevronRight16Regular,
	Dismiss16Regular,
	Edit16Regular,
	Key16Regular,
	Send16Regular,
	Toolbox16Regular,
} from '../data/icons'
import { findModelChoice, listProviders, modelLabel, resolveThinkingLevel } from '../agent/models'
import { getApiKey } from '../agent/keyring'
import { useAgentSettings } from '../agent/agentSettings'
import { getSiblings, toolArgsJson, toolResultJson, type ChatMsg } from '../agent/threads'
import {
	activeConversation,
	blankConversation,
	conversationSize,
	conversationTitle,
	deleteConversation,
	touchConversation,
} from '../agent/conversations'
import { selectSibling } from '../agent/panes'
import { patchNoteInList } from '../agent/tools'
import { useAgentChat } from '../agent/useAgentChat'
import { confirmDialog } from '../data/dialogs'
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
	(e: 'open-jd'): void
	(e: 'open-letter'): void
}>()

const input = ref('')
const scroller = ref<InstanceType<typeof AutoScrollWrapper> | null>(null)

/**
 * Forced scroll deferred past Vue's async render. Callers mutate the thread
 * (or switch conversations) but the DOM only grows on a later microtask, so
 * scrolling synchronously targets the old content height — and the premature
 * programmatic scroll's own late `scroll` event can then flip the wrapper's
 * `wasAtBottom` to false, cancelling its ResizeObserver follow-up and leaving
 * the view stuck above the new bubbles. rAF runs after the render flush,
 * before paint, when scrollHeight is final.
 */
function scrollToBottomAfterRender(): void {
	const go = (): void => {
		scroller.value?.scrollToBottom(true)
	}
	if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(go)
	else go()
}

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
const activeThinkingLevel = computed(() =>
	resolveThinkingLevel(settings.provider, settings.modelId, settings.thinkingLevel),
)
/** Pill label for the footer; hidden when reasoning is off. */
const thinkingPillLabel = computed(() => {
	if (!isConfigured.value || activeThinkingLevel.value === 'off') return null
	const level = activeThinkingLevel.value
	return `Thinking: ${level.charAt(0).toUpperCase() + level.slice(1)}`
})

// BYOK gate: Mira needs the active provider's API key. Checked on mount and
// whenever the configured provider changes; 'unknown' while loading so the
// panel never flashes the tip. After returning from Settings (provider
// unchanged) the user re-checks explicitly via the tip's button.
const keyState = ref<'unknown' | 'missing' | 'ok'>('unknown')

async function refreshKeyState(): Promise<void> {
	const provider = settings.provider
	if (!provider) {
		keyState.value = 'missing'
		return
	}
	keyState.value = 'unknown'
	try {
		keyState.value = (await getApiKey(provider)) ? 'ok' : 'missing'
	} catch {
		keyState.value = 'missing'
	}
}

const showKeyTip = computed(() => keyState.value === 'missing')
const activeProviderName = computed(
	() => listProviders().find((p) => p.value === settings.provider)?.name ?? settings.provider,
)

function findMasterItem(id: string): ContentItem | undefined {	for (const key of ['experience', 'projects', 'education', 'skills'] as const) {
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
			props.job.letter.body = text
		},
		setLetterField: (field, value) => {
			const letter = props.job.letter as unknown as Record<string, unknown>
			if (field in letter) letter[field] = value
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
		saveNote: ({ id, title, body }) => {
			const notes = (props.master.notes ??= [])
			const cleanId = typeof id === 'string' ? id.trim() : ''
			const cleanTitle = title.trim().slice(0, 120)
			const cleanBody = body.slice(0, 8000)
			let note = cleanId ? notes.find((n) => n.id === cleanId) : undefined
			note ??= notes.find((n) => (n.title || '').trim() === cleanTitle && cleanTitle !== '')
			if (note) {
				note.title = cleanTitle
				note.body = cleanBody
				note.updatedAt = Date.now()
				return note
			}
			const fresh = {
				id: cleanId || `note-${Date.now()}-${Math.floor(Math.random() * 1e9)}`,
				title: cleanTitle,
				body: cleanBody,
				updatedAt: Date.now(),
			}
			notes.push(fresh)
			return fresh
		},
		deleteNote: (id) => {
			const notes = props.master.notes || []
			const index = notes.findIndex((n) => n.id === id)
			if (index === -1) return false
			notes.splice(index, 1)
			return true
		},
		patchNote: (id, search, replace) => patchNoteInList((props.master.notes ??= []), id, search, replace),
	},
	activeModel.value,
	{
		systemPrompt: settings.systemPrompt,
		thinkingLevel: activeThinkingLevel.value,
	},
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
	scrollToBottomAfterRender()
}

function newSession(): void {
	if (chat.sending.value) return
	const fresh = blankConversation()
	props.job.conversations.push(fresh)
	props.job.activeConversationId = fresh.id
	scrollToBottomAfterRender()
}

function deleteSession(id: string): void {
	if (chat.sending.value) return
	const target = props.job.conversations.find((c) => c.id === id)
	const label = target ? conversationTitle(target) : 'this conversation'
	void confirmDialog({
		title: `Delete “${label}”?`,
		body: 'Its messages go too. The JD and cover letter are kept.',
		confirmLabel: 'Delete',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		props.job.activeConversationId = deleteConversation(props.job.conversations, id)
		scrollToBottomAfterRender()
	})
}

const renamingId = ref<string | null>(null)
const renameDraft = ref('')

function startRename(id: string): void {
	renamingId.value = id
	renameDraft.value = props.job.conversations.find((c) => c.id === id)?.title ?? ''
}

/** Same IME guard as sending: composition Enter only confirms the candidate. */
function commitRenameOnEnter(e: KeyboardEvent, id: string): void {
	if (e.isComposing) return
	commitRename(id)
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

/** Enter sends, except while an IME is composing (CJK et al.): that Enter
 * only confirms the composition candidate and must not submit. */
function sendOnEnter(e: KeyboardEvent): void {
	if (e.isComposing) return
	send()
}

function send(): void {
	const text = input.value
	if (!text.trim() || chat.sending.value) return
	// Empty immediately so the draft can't be edited/resent mid-generation;
	// the box stays disabled via chat.sending until the run ends.
	input.value = ''
	scrollToBottomAfterRender()
	void chat.send(text)
}

function cycleAt(id: string, dir: 1 | -1): void {
	if (chat.sending.value) return
	selectSibling(convo.value.thread, id, dir)
	scrollToBottomAfterRender()
}

function siblingOf(id: string): { ids: string[]; index: number } | null {
	return getSiblings(convo.value.thread, id)
}

/** Human labels for the agent tool loadout (wisp-pro displayName parity). */
const TOOL_LABELS: Record<string, string> = {
	read_resume: "Checking out your resume",
	read_jd: "Sizing up the job post",
	read_manual: "Peeking at the rulebook",
	propose_bullet_rewrite: "Jazzing up a bullet",
	update_title: "Slapping on a fancier title",
	update_summary: "Sprucing up your summary",
	update_cover_letter: "Whipping up a cover letter",
	update_letter_field: "Tweaking the letter",
	set_visibility: "Flipping some switches",
	list_notes: "Digging through my notes",
	read_note: "Oh right, finding that thing",
	patch_note: "Scribbling in the margins",
	search_notes: "Ctrl+F-ing my brain",
	save_note: "Jotting this down for later",
	delete_note: "Yeeting this from memory",
}

function toolLabel(name: string): string {
	return TOOL_LABELS[name] ?? name
}

/**
 * Visual bubbles (wisp-pro parity): one user message is its own bubble, and
 * consecutive assistant turns (a run's pre-tool text, its tool cards, and the
 * post-tool follow-ups) group into one bubble that reads in order.
 */
interface BubbleGroup {
	key: string
	kind: 'user' | 'assistant'
	msgs: ChatMsg[]
}

const groups = computed<BubbleGroup[]>(() => {
	const out: BubbleGroup[] = []
	for (const msg of chat.messages.value) {
		const last = out[out.length - 1]
		if (msg.role === 'assistant' && last && last.kind === 'assistant') last.msgs.push(msg)
		else out.push({ key: msg.id, kind: msg.role === 'user' ? 'user' : 'assistant', msgs: [msg] })
	}
	return out
})

function hasVisibleAssistantContent(msg: ChatMsg): boolean {
	return msg.text.trim().length > 0 || (msg.reasoning?.trim() ?? '').length > 0 || (msg.toolCalls?.length ?? 0) > 0
}

function groupHasContent(group: BubbleGroup): boolean {
	return group.msgs.some((m) => hasVisibleAssistantContent(m))
}

// The tree component takes an explicit light/dark theme: follow the app's
// `dark` class on <html> (toggled by App.vue) so trees match the chrome.
const isDarkTree = ref(typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
let darkObserver: MutationObserver | null = null

onMounted(() => {
	if (typeof document === 'undefined') return
	darkObserver = new MutationObserver(() => {
		isDarkTree.value = document.documentElement.classList.contains('dark')
	})
	darkObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onMounted(() => {
	void refreshKeyState()
})

watch(
	() => settings.provider,
	() => {
		void refreshKeyState()
	},
)

onUnmounted(() => {
	darkObserver?.disconnect()
	darkObserver = null
	for (const timer of brainFuseTimers.values()) clearTimeout(timer)
	brainFuseTimers.clear()
	for (const id of brainSpinState.keys()) stopBrainSpin(id)
})

// Easter egg: hover the Thinking brain for 3s and it spins up — accelerating
// from standstill to full speed (period 0.2s) — until the mouse leaves.
// CSS can't ease animation speed, so the angle is driven per-frame with
// requestAnimationFrame. Everything is keyed per turn so panels don't clash.
const brainFuseTimers = new Map<string, ReturnType<typeof setTimeout>>()
const brainEls = new Map<string, HTMLElement>()
const brainSpinState = new Map<string, { angle: number; last: number; start: number; raf: number }>()

/** Full speed: one revolution per 0.1s. Reached ~2s after spin-up starts. */
const BRAIN_FULL_SPEED = (Math.PI * 2) / 0.1
const BRAIN_RAMP_MS = 2000

function setBrainEl(id: string, el: unknown): void {
	if (el instanceof HTMLElement) brainEls.set(id, el)
	else brainEls.delete(id)
}

function brainHoverStart(id: string): void {
	if (brainFuseTimers.has(id) || brainSpinState.has(id)) return
	brainFuseTimers.set(
		id,
		setTimeout(() => {
			brainFuseTimers.delete(id)
			startBrainSpin(id)
		}, 3000),
	)
}

function brainHoverEnd(id: string): void {
	const timer = brainFuseTimers.get(id)
	if (timer !== undefined) {
		clearTimeout(timer)
		brainFuseTimers.delete(id)
	}
	stopBrainSpin(id)
}

function startBrainSpin(id: string): void {
	const el = brainEls.get(id)
	if (!el || brainSpinState.has(id)) return
	const now = performance.now()
	const state = { angle: 0, last: now, start: now, raf: 0 }
	brainSpinState.set(id, state)
	const tick = (at: number): void => {
		const current = brainSpinState.get(id)
		if (!current) return
		const dt = Math.min((at - current.last) / 1000, 0.1)
		current.last = at
		// Cubic ease-in: velocity accelerates from 0 to full speed.
		const t = Math.min((at - current.start) / BRAIN_RAMP_MS, 1)
		current.angle = (current.angle + BRAIN_FULL_SPEED * t * t * t * dt) % (Math.PI * 2)
		el.style.transform = `rotate(${current.angle}rad)`
		current.raf = requestAnimationFrame(tick)
	}
	state.raf = requestAnimationFrame(tick)
}

function stopBrainSpin(id: string): void {
	const state = brainSpinState.get(id)
	if (state) {
		cancelAnimationFrame(state.raf)
		brainSpinState.delete(id)
	}
	brainEls.get(id)?.style.removeProperty('transform')
}

function toolStatus(
	tool: NonNullable<ChatMsg['toolCalls']>[number],
): 'running' | 'drafting' | 'ok' | 'error' | 'interrupted' {
	if (tool.status === 'drafting') return chat.sending.value ? 'drafting' : 'interrupted'
	if (tool.status === 'running') return chat.sending.value ? 'running' : 'interrupted'
	return tool.isError ? 'error' : 'ok'
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
	scrollToBottomAfterRender()
	void chat.resendEdited(id, text)
}
</script>

<template>
	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<div
			v-if="job.jdSource"
			class="no-print rounded-lg border border-default bg-neutral-primary-medium px-3 py-2 text-xs text-body-subtle"
		>
			<span class="font-semibold">JD:</span>
			<span>{{ job.jdSource.filename }}</span>
		</div>
		<button
			v-else
			type="button"
			class="no-print rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200 dark:hover:bg-amber-900"
			@click="emit('open-jd')"
		>
			<span class="font-semibold">No JD attached</span> — click to open the JD pane and add one.
		</button>
		<div
			v-if="job.kind === 'master'"
			class="no-print rounded-lg border border-default bg-neutral-primary-medium px-3 py-2 text-xs text-body-subtle"
		>
			<span class="font-semibold">Master:</span> rewrites here refine the shared content for every job. Title, summary,
			letter and visibility live on jobs.
		</div>

		<div
			v-if="showKeyTip"
			class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-default px-6 py-10 text-center"
		>
			<span class="inline-flex rounded-full bg-brand-soft p-3 text-fg-brand">
				<Icon size="24"><Key16Regular /></Icon>
			</span>
			<h3 class="text-sm font-semibold text-heading">
				{{ isConfigured ? `Add your ${activeProviderName} key to use Mira` : 'Set up Mira to start tailoring' }}
			</h3>
			<p v-if="isConfigured" class="max-w-72 text-xs leading-relaxed text-body-subtle">
				Mira brings the models — you bring the key (BYOK). Keys stay in your OS keychain on desktop,
				and in this session only on web. Nothing is saved in your workspace.
			</p>
			<p v-else class="max-w-72 text-xs leading-relaxed text-body-subtle">
				Pick a provider and model in Settings, then add its API key. Mira brings the models — you bring
				the key (BYOK).
			</p>
			<div class="no-print flex items-center gap-2">
				<FwbButton size="sm" @click="emit('open-settings')">Open settings</FwbButton>
				<FwbButton v-if="isConfigured" size="sm" color="alternative" @click="void refreshKeyState()">
					I&rsquo;ve added it — check again
				</FwbButton>
			</div>
		</div>
		<template v-else>
		<div class="flex min-h-0 flex-1 flex-col gap-2">
			<AutoScrollWrapper ref="scroller" class="min-h-0 flex-1">
				<div class="flex flex-col gap-2">
					<div
						v-for="(group, gi) in groups"
						:key="group.key"
						class="group flex items-end gap-1"
						:class="group.kind === 'user' ? 'self-end' : 'w-full'"
					>
						<button
							v-if="group.kind === 'user' && editingId !== group.msgs[0].id"
							class="no-print mb-1 shrink-0 rounded px-1.5 py-0.5 text-[13px] text-body-subtle opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-neutral-tertiary"
							title="Edit and resend"
							:disabled="chat.sending.value"
							@click="startEdit(group.msgs[0].id)"
							square
						>
							<Icon size="16"><Edit16Regular /></Icon>
						</button>
						<div v-if="group.kind === 'user'" class="min-w-0 rounded-lg bg-brand px-3 py-2 text-sm text-white">
							<template v-if="editingId === group.msgs[0].id">
								<FwbTextarea
									v-model="editDraft"
									class="mb-1"
									:rows="3"
									:disabled="chat.sending.value"
									@keyup.escape="cancelEdit"
								/>
								<div class="no-print flex justify-end gap-1">
									<button
										class="inline-flex items-center justify-center rounded-lg px-2 py-0.5 text-xs font-medium text-white transition hover:bg-white/10"
										@click="cancelEdit"
									>
										Cancel
									</button>
									<button
										class="inline-flex items-center justify-center rounded-lg bg-white px-2 py-0.5 text-xs font-medium text-fg-brand transition hover:bg-brand-softer disabled:opacity-60"
										:disabled="!editDraft.trim() || chat.sending.value"
										@click="saveEdit(group.msgs[0].id)"
									>
										Save & resend
									</button>
								</div>
							</template>
							<pre v-else class="whitespace-pre-wrap">{{ group.msgs[0].text || '…' }}</pre>
						</div>
						<div v-else class="w-full min-w-0 px-1 py-1.5 text-sm text-heading">
							<div class="flex flex-col gap-1">
								<div v-for="(msg, mi) in group.msgs" :key="msg.id" class="flex min-w-0 flex-col gap-1.5">
									<details
										v-if="msg.reasoning?.trim()"
										class="rounded-md border border-default bg-neutral-secondary px-2 py-1.5 text-[13px]"
										:open="chat.sending.value && gi === groups.length - 1 && mi === group.msgs.length - 1"
									>
										<summary class="flex cursor-pointer list-none items-center gap-1.5">
											<span
												class="inline-flex"
												:ref="(el) => setBrainEl(msg.id, el)"
												@mouseenter="brainHoverStart(msg.id)"
												@mouseleave="brainHoverEnd(msg.id)"
											>
												<Icon size="16" aria-hidden="true"><BrainCircuit20Regular /></Icon>
											</span>
											<span class="min-w-0 flex-1 truncate font-medium">Thinking</span>
											<span
												v-if="chat.sending.value && gi === groups.length - 1 && mi === group.msgs.length - 1"
												class="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[11px] text-fg-brand"
												>Thinking…</span
											>
										</summary>
										<StreamMarkdown :text="msg.reasoning!" :streaming="chat.sending.value" class="mt-1.5" />
									</details>
									<StreamMarkdown v-if="msg.text.trim()" :text="msg.text" :streaming="chat.sending.value" />
									<div v-if="msg.toolCalls?.length" class="flex flex-col gap-1.5">
										<details
											v-for="tool in msg.toolCalls"
											:key="tool.id"
											class="rounded-md border px-2 py-1.5 text-[13px]"
											:class="
												tool.isError
													? 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40'
													: 'border-emerald-300/60 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40'
											"
										>
											<summary class="flex cursor-pointer list-none items-center gap-1.5">
												<Icon size="16" aria-hidden="true"><Toolbox16Regular /></Icon>
												<span class="min-w-0 flex-1 truncate font-medium">{{ toolLabel(tool.name) }}</span>
												<span
													class="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px]"
													:class="
														toolStatus(tool) === 'running' || toolStatus(tool) === 'drafting'
															? 'bg-brand-soft text-fg-brand'
															: toolStatus(tool) === 'ok'
																? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200'
																: toolStatus(tool) === 'interrupted'
																	? 'bg-neutral-quaternary text-body'
																	: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200'
													"
													><span
														v-if="toolStatus(tool) === 'running' || toolStatus(tool) === 'drafting'"
														class="inline-block h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent"
														aria-hidden="true"
													></span
													>{{
														toolStatus(tool) === 'running'
															? 'Running…'
															: toolStatus(tool) === 'drafting'
																? 'Preparing…'
																: toolStatus(tool) === 'ok'
																	? 'OK'
																	: toolStatus(tool) === 'interrupted'
																		? 'Interrupted'
																		: 'Error'
													}}</span
												>
											</summary>
											<div v-if="tool.args" class="mt-1.5">
												<span class="text-xs font-medium text-body-subtle">Args:</span>
												<JsonTreeView
													v-if="toolArgsJson(tool.args)"
													:json="toolArgsJson(tool.args)!"
													rootKey="args"
													:maxDepth="2"
													:colorScheme="isDarkTree ? 'dark' : 'light'"
													class="mt-1 max-h-48 overflow-y-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5"
												/>
												<code v-else class="break-all text-xs text-body-subtle">{{ tool.args }}</code>
											</div>
											<JsonTreeView
												v-if="toolResultJson(tool.result)"
												:json="toolResultJson(tool.result)!"
												:rootKey="tool.name"
												:maxDepth="2"
												:colorScheme="isDarkTree ? 'dark' : 'light'"
												class="mt-1.5 max-h-48 overflow-y-auto rounded bg-black/5 p-2 text-xs dark:bg-white/5"
											/>
											<pre
												v-else-if="tool.result"
												class="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/5 p-2 text-xs dark:bg-white/5"
												>{{ tool.result }}</pre>
											<p v-else-if="tool.status === 'running'" class="mt-1.5 text-xs text-body-subtle">
												{{ chat.sending.value ? 'Running…' : 'Interrupted before a result arrived.' }}
											</p>
											<p v-else-if="tool.status === 'drafting'" class="mt-1.5 text-xs text-body-subtle">
												{{
													chat.sending.value ? 'Composing the call arguments…' : 'Interrupted before the call was sent.'
												}}
											</p>
											<button
												v-if="tool.name === 'update_cover_letter' || tool.name === 'update_letter_field'"
												type="button"
												class="no-print mt-1.5 rounded px-1.5 py-0.5 text-xs font-medium text-fg-brand hover:bg-brand-softer"
												@click="emit('open-letter')"
											>
												Review in Cover letter pane →
											</button>
										</details>
									</div>
								</div>
							</div>
							<span v-if="!groupHasContent(group) && gi === groups.length - 1">
								<span
									v-if="chat.sending.value"
									class="typing-indicator text-body-subtle"
									role="status"
									aria-label="Waiting for reply"
								>
									<span class="typing-dot"></span>
									<span class="typing-dot"></span>
									<span class="typing-dot"></span>
								</span>
								<span v-else class="text-body-subtle">…</span>
							</span>
							<span
								v-else-if="gi === groups.length - 1 && chat.sending.value && !chat.assistantStreaming.value"
								class="typing-indicator text-body-subtle"
								role="status"
								aria-label="Waiting for reply"
							>
								<span class="typing-dot"></span>
								<span class="typing-dot"></span>
								<span class="typing-dot"></span>
							</span>
							<div
								class="no-print mt-1 flex items-center gap-1 text-[13px] text-body-subtle opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100"
							>
								<template v-if="siblingOf(group.msgs[0].id) && siblingOf(group.msgs[0].id)!.ids.length > 1">
									<button
										class="rounded px-1.5 py-0.5 hover:bg-black/10 dark:hover:bg-white/10"
										title="Previous version"
										:disabled="chat.sending.value"
										@click="cycleAt(group.msgs[0].id, -1)"
										square
									>
										<Icon size="16"><ChevronLeft16Regular /></Icon>
									</button>
									<span class="tabular-nums"
										>{{ siblingOf(group.msgs[0].id)!.index + 1 }}/{{ siblingOf(group.msgs[0].id)!.ids.length }}</span
									>
									<button
										class="rounded px-1.5 py-0.5 hover:bg-black/10 dark:hover:bg-white/10"
										title="Next version"
										:disabled="chat.sending.value"
										@click="cycleAt(group.msgs[0].id, 1)"
										square
									>
										<Icon size="16"><ChevronRight16Regular /></Icon>
									</button>
									<span class="mx-0.5">·</span>
								</template>
								<button
									v-if="groupHasContent(group)"
									class="rounded px-1.5 py-0.5 hover:bg-neutral-tertiary"
									title="Regenerate this reply"
									:disabled="chat.sending.value"
									@click="void chat.regenerate(group.msgs[0].id)"
									square
								>
									<Icon size="16"><ArrowClockwise16Regular /></Icon>
								</button>
							</div>
						</div>
					</div>
					<p v-if="!chat.messages.value.length" class="text-sm text-body-subtle">
						Ask to tailor a bullet, draft the cover letter, or critique the resume against the JD.
					</p>
				</div>
			</AutoScrollWrapper>

			<div v-if="chat.error.value" class="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs">
				{{ chat.error.value }}
				<button
					class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium text-body-subtle transition hover:bg-neutral-tertiary hover:text-heading"
					@click="emit('open-settings')"
				>
					Open settings
				</button>
			</div>

			<div class="no-print flex items-center justify-between gap-1 text-xs text-body-subtle">
				<FwbDropdown close-inside placement="top">
					<template #trigger>
						<button
							class="inline-flex max-w-52 items-center gap-1 truncate rounded-lg px-2 py-1 text-xs font-medium text-body-subtle transition hover:bg-neutral-tertiary hover:text-heading"
							:title="`Session: ${currentTitle}`"
						>
							<span class="inline-flex min-w-0 items-center gap-1 truncate"
								><Icon size="16"><ChatMultiple16Regular /></Icon><span class="truncate">{{ currentTitle }}</span></span
							>
							<Icon size="16" class="shrink-0"><ChevronDown16Regular /></Icon>
						</button>
					</template>
					<div class="flex max-h-64 min-w-64 flex-col gap-1 overflow-y-auto p-1">
						<button
							type="button"
							class="inline-flex w-full items-center justify-start gap-1 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-body-subtle transition hover:bg-neutral-tertiary hover:text-heading"
							:disabled="chat.sending.value"
							@click="newSession"
						>
							<span class="inline-flex min-w-0 flex-1 items-center gap-1 truncate"
								><Icon size="16"><Add16Regular /></Icon>New session</span
							>
						</button>
						<div
							v-for="s in sessions"
							:key="s.id"
							class="flex w-full items-center gap-1 rounded-lg px-2 py-1.5 text-left text-[13px] text-body transition hover:bg-neutral-tertiary"
							:class="{ 'bg-neutral-tertiary': s.active }"
							:title="s.title"
						>
							<span
								v-if="renamingId === s.id"
								class="flex min-w-0 flex-1 items-center gap-1"
								@click.stop
								@mousedown.stop
							>
								<FwbInput
									v-model="renameDraft"
									size="sm"
									wrapper-class="min-w-0 flex-1"
									:placeholder="s.title"
									maxlength="120"
									autofocus
									@keyup.enter="commitRenameOnEnter($event, s.id)"
									@keyup.escape="renamingId = null"
									@blur="commitRename(s.id)"
								/>
							</span>
							<template v-else>
								<button
									type="button"
									class="min-w-0 flex-1 flex-col items-start! truncate text-left!"
									@click="selectSession(s.id)"
								>
									<span class="inline-flex items-center gap-1"
										><Icon v-if="s.active" size="16" class="shrink-0"><Checkmark16Regular /></Icon>{{ s.title }}</span
									>
									<span class="block truncate text-[11px] text-body-subtle">
										{{ s.count }} msgs<span v-if="relativeTime(s.updatedAt)"> · {{ relativeTime(s.updatedAt) }}</span>
									</span>
								</button>
								<span class="flex shrink-0 gap-0.5">
									<button
										type="button"
										class="rounded px-1 text-body-subtle hover:text-heading"
										title="Rename session"
										@click.stop="startRename(s.id)"
										square
									>
										<Icon size="16"><Edit16Regular /></Icon>
									</button>
									<button
										type="button"
										class="rounded px-1 text-body-subtle hover:text-danger"
										title="Delete session"
										:disabled="chat.sending.value"
										@click.stop="deleteSession(s.id)"
										square
									>
										<Icon size="16"><Dismiss16Regular /></Icon>
									</button>
								</span>
							</template>
						</div>
					</div>
				</FwbDropdown>
				<span v-if="thinkingPillLabel || isConfigured">
					<span v-if="thinkingPillLabel" :title="`${thinkingPillLabel}`"
						>{{ thinkingPillLabel.split(' ').pop()?.toLocaleUpperCase() }} ·
					</span>
					<span v-if="isConfigured" :class="thinkingPillLabel ? '' : 'ml-auto'">{{ activeModelLabel }}</span>
				</span>
				<span v-else class="ml-auto">No model configured — open settings to choose one.</span>
				<div>
					<FwbButton v-if="chat.sending.value" color="alternative" class="shrink-0 self-end" @click="chat.stop()">
						Stop
					</FwbButton>
					<FwbButton
						v-else
						color="default"
						square
						size="md"
						class="shrink-0 self-end"
						title="Send"
						aria-label="Send message"
						:disabled="!input.trim()"
						@click="send"
					>
						<Icon size="16"><Send16Regular /></Icon>
					</FwbButton>
				</div>
			</div>

			<div class="no-print flex gap-2">
				<FwbTextarea
					v-model="input"
					:rows="2"
					wrapper-class="min-w-0 flex-1"
					placeholder="Ask the agent… (Enter to send)"
					:disabled="chat.sending.value"
					@keyup.enter.exact.prevent="sendOnEnter"
				/>
			</div>
		</div>
		</template>
	</div>
</template>

<style scoped>
.typing-indicator {
	display: inline-flex;
	align-items: center;
	gap: 5px;
	padding: 2px 0;
}

.typing-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background-color: currentColor;
	animation: typing-bounce 1.4s infinite ease-in-out both;
}

.typing-dot:nth-child(1) {
	animation-delay: -0.32s;
}

.typing-dot:nth-child(2) {
	animation-delay: -0.16s;
}

.typing-dot:nth-child(3) {
	animation-delay: 0s;
}

@keyframes typing-bounce {
	0%,
	80%,
	100% {
		transform: scale(0.6);
		opacity: 0.4;
	}
	40% {
		transform: scale(1);
		opacity: 1;
	}
}
</style>
