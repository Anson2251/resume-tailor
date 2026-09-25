<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Icon } from '@vicons/utils'
import {
	FwbAutocomplete,
	FwbBadge,
	FwbButton,
	FwbCard,
	FwbInput,
	FwbTextarea,
	FwbToggle,
	FwbTooltip,
} from 'flowbite-vue'
import { deleteApiKey, getApiKey, setApiKey } from '../agent/keyring'
import {
	addCustomModel,
	addCustomProvider,
	contextCharsFor,
	isCustomModel,
	isModelEnabled,
	listProviders,
	modelLabel,
	modelsForProvider,
	removeCustomModel,
	removeCustomProvider,
	resolveModel,
	resolveThinkingLevel,
	setModelEnabled,
	thinkingLevelsFor,
} from '../agent/models'
import type { ThinkingLevel } from '@earendil-works/pi-agent-core'
import { normalizeBaseUrl, validateModelId, validateProviderId } from '../agent/providerSettings'
import { DEFAULT_AGENT_SETTINGS, DEFAULT_SYSTEM_PROMPT, useAgentSettingsMutable } from '../agent/agentSettings'
import { confirmDialog } from '../data/dialogs'
import { isElectron } from '../data/persistence'
import { Bot24Regular, ChatMultiple16Regular, Dismiss16Regular, Settings16Regular } from '../data/icons'

const open = defineModel<boolean>({ default: false })

type SettingsSection = 'providers' | 'model' | 'conversation'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface ModelOption {
	provider: string
	providerName: string
	id: string
	label: string
	[key: string]: unknown
}

const sections = [
	{ id: 'providers' as const, title: 'Providers', description: 'Keys and models', icon: Bot24Regular },
	{
		id: 'model' as const,
		title: 'Model',
		description: 'Default agent model',
		icon: ChatMultiple16Regular,
	},
	{
		id: 'conversation' as const,
		title: 'Conversation',
		description: 'Extra instructions and context',
		icon: Settings16Regular,
	},
]

const activeSection = ref<SettingsSection>('providers')
const modelSaveState = ref<SaveState>('idle')
const convSaveState = ref<SaveState>('idle')

const { settings, save } = useAgentSettingsMutable()

const sectionStatus = computed<SaveState>(() => {
	if (activeSection.value === 'providers') return modelSaveState.value
	if (activeSection.value === 'model') return modelSaveState.value
	return convSaveState.value
})

const statusLabel = computed(() => {
	switch (sectionStatus.value) {
		case 'saving':
			return 'Saving…'
		case 'saved':
			return 'Saved automatically'
		case 'error':
			return 'Could not save'
		default:
			return 'Autosave enabled'
	}
})

const statusBadge = computed(() => {
	switch (sectionStatus.value) {
		case 'saving':
			return 'yellow'
		case 'saved':
			return 'green'
		case 'error':
			return 'red'
		default:
			return 'default'
	}
})

function setActiveSection(section: SettingsSection): void {
	activeSection.value = section
}

const isModelConfigured = computed(() => !!settings.modelId)

const configuredLabel = computed(() =>
	isModelConfigured.value ? modelLabel(settings.provider, settings.modelId) : 'Not configured',
)

let lastModelSavedJson = ''
let modelTimer: ReturnType<typeof setTimeout> | null = null

function scheduleModelSave(): void {
	modelSaveState.value = 'saving'
	if (modelTimer !== null) clearTimeout(modelTimer)
	modelTimer = setTimeout(() => {
		modelTimer = null
		try {
			const json = JSON.stringify({
				provider: settings.provider,
				modelId: settings.modelId,
				thinkingLevel: settings.thinkingLevel,
			})
			if (json !== lastModelSavedJson) {
				lastModelSavedJson = json
				save()
			}
			modelSaveState.value = 'saved'
		} catch {
			modelSaveState.value = 'error'
		}
	}, 500)
}

watch(() => [settings.provider, settings.modelId, settings.thinkingLevel], scheduleModelSave)

// --- Providers section (wisp-pro ProvidersView pattern, pi-ai data) ---
// Configures keys and model inventories. Picking the default model lives on
// the dedicated Model page instead.

const providerList = computed(() => listProviders())

const selectedProviderId = ref<string>('')

const detailProvider = computed(
	() => providerList.value.find((p) => p.value === selectedProviderId.value) ?? providerList.value[0],
)

const detailModels = computed(() =>
	modelsForProvider(detailProvider.value.value, true).map((m) => ({
		...m,
		custom: isCustomModel(detailProvider.value.value, m.id),
		enabled: isModelEnabled(detailProvider.value.value, m.id),
	})),
)

const providerCountLabel = computed(() => {
	const count = providerList.value.length
	return `${count} provider${count === 1 ? '' : 's'}`
})

const detailModelCountLabel = computed(() => {
	const count = detailModels.value.length
	return `${count} model${count === 1 ? '' : 's'}`
})

function selectProvider(id: string): void {
	selectedProviderId.value = id
	newModelId.value = ''
	newModelName.value = ''
	newModelError.value = ''
}

// --- API keys (explicit save — secrets never autosave) ---

const keyInputs = ref<Record<string, string>>({})
const hasKeys = ref<Record<string, boolean>>({})
const keyBusy = ref<Record<string, boolean>>({})
const keyMsgs = ref<Record<string, string>>({})

async function refreshKeys(): Promise<void> {
	await Promise.all(
		providerList.value.map(async (p) => {
			try {
				hasKeys.value[p.value] = !!(await getApiKey(p.value))
			} catch {
				hasKeys.value[p.value] = false
			}
		}),
	)
}

/** IME composition Enter confirms the candidate — it must not submit the key. */
function saveKeyOnEnter(e: KeyboardEvent, provider: string): void {
	if (e.isComposing) return
	void saveKey(provider)
}

async function saveKey(provider: string): Promise<void> {
	const value = (keyInputs.value[provider] ?? '').trim()
	if (!value) return
	keyBusy.value[provider] = true
	keyMsgs.value[provider] = ''
	try {
		await setApiKey(provider, value)
		keyInputs.value[provider] = ''
		hasKeys.value[provider] = true
		keyMsgs.value[provider] = 'Saved.'
	} catch {
		keyMsgs.value[provider] = 'Save failed.'
	} finally {
		keyBusy.value[provider] = false
	}
}

async function removeKey(provider: string): Promise<void> {
	keyBusy.value[provider] = true
	try {
		await deleteApiKey(provider)
		hasKeys.value[provider] = false
		keyMsgs.value[provider] = 'Deleted.'
	} finally {
		keyBusy.value[provider] = false
	}
}

// --- Custom models on the detail provider ---

const newModelId = ref('')
const newModelName = ref('')
const newModelError = ref('')

function handleAddModel(): void {
	const provider = detailProvider.value.value
	const taken = detailModels.value.map((m) => m.id)
	const error = validateModelId(newModelId.value, taken)
	if (error) {
		newModelError.value = error
		return
	}
	addCustomModel(provider, { id: newModelId.value.trim(), name: newModelName.value.trim() })
	newModelId.value = ''
	newModelName.value = ''
	newModelError.value = ''
}

function handleRemoveModel(provider: string, id: string): void {
	void confirmDialog({
		title: `Delete custom model “${id}”?`,
		body: 'Sessions using it will fall back to another model.',
		confirmLabel: 'Delete',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		removeCustomModel(provider, id)
	})
}

function handleToggleModel(provider: string, id: string, enabled: boolean): void {
	setModelEnabled(provider, id, enabled)
}

// --- Custom providers ---

const showAddProvider = ref(false)
const addId = ref('')
const addName = ref('')
const addBaseUrl = ref('')
const addModelId = ref('')
const addModelName = ref('')
const addError = ref('')

function resetAddForm(): void {
	addId.value = ''
	addName.value = ''
	addBaseUrl.value = ''
	addModelId.value = ''
	addModelName.value = ''
	addError.value = ''
}

function handleAddProvider(): void {
	const taken = providerList.value.map((p) => p.value)
	const idError = validateProviderId(addId.value, taken)
	if (idError) {
		addError.value = idError
		return
	}
	const baseUrl = normalizeBaseUrl(addBaseUrl.value)
	if (!baseUrl) {
		addError.value = 'Enter a valid http(s) base URL.'
		return
	}
	const modelError = validateModelId(addModelId.value, [])
	if (modelError) {
		addError.value = modelError
		return
	}
	const id = addId.value.trim().toLowerCase()
	addCustomProvider({
		id,
		name: addName.value.trim() || id,
		baseUrl,
		models: [{ id: addModelId.value.trim(), name: addModelName.value.trim() || addModelId.value.trim() }],
	})
	resetAddForm()
	showAddProvider.value = false
	selectProvider(id)
}

function handleRemoveProvider(): void {
	const provider = detailProvider.value
	if (!provider.custom) return
	void confirmDialog({
		title: `Delete custom provider “${provider.name}”?`,
		body: 'Its models go too. Sessions using them will fall back to another model.',
		confirmLabel: 'Delete',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		removeCustomProvider(provider.value)
		selectedProviderId.value = providerList.value[0]?.value ?? ''
	})
}

// --- Dedicated Model page: pick the default agent model ---

const allEnabledModels = computed<ModelOption[]>(() =>
	providerList.value.flatMap((p) =>
		modelsForProvider(p.value).map((m) => ({
			provider: p.value,
			providerName: p.name,
			id: m.id,
			label: m.label,
		})),
	),
)

const defaultOption = ref<ModelOption | null>(null)

/** Free-text filter narrowing the model picker (matches label, id, provider). */
const modelFilter = ref('')

const filteredEnabledModels = computed<ModelOption[]>(() => {
	const query = modelFilter.value.trim().toLowerCase()
	if (!query) return allEnabledModels.value
	return allEnabledModels.value.filter((m) =>
		[m.label, m.id, m.providerName].some((field) => field.toLowerCase().includes(query)),
	)
})

function syncDefaultOption(): void {
	if (!settings.modelId) {
		defaultOption.value = null
		return
	}
	const match = allEnabledModels.value.find((m) => m.provider === settings.provider && m.id === settings.modelId)
	defaultOption.value = match ?? {
		provider: settings.provider,
		providerName: settings.provider,
		id: settings.modelId,
		label: configuredLabel.value,
	}
}

watch(() => [settings.provider, settings.modelId], syncDefaultOption)

function onSelectDefault(option: Record<string, unknown>): void {
	const provider = typeof option.provider === 'string' ? option.provider : ''
	const id = typeof option.id === 'string' ? option.id : ''
	if (!provider || !id) return
	settings.provider = provider
	settings.modelId = id
}

function onDefaultCleared(value: Record<string, unknown> | null): void {
	if (value === null) syncDefaultOption()
}

function resetModel(): void {
	settings.provider = DEFAULT_AGENT_SETTINGS.provider
	settings.modelId = DEFAULT_AGENT_SETTINGS.modelId
}

function clearModel(): void {
	settings.provider = ''
	settings.modelId = ''
}

// --- Reasoning effort slider (pi-ai thinking levels, per-model support) ---

const supportedThinking = computed<ThinkingLevel[]>(() => thinkingLevelsFor(settings.provider, settings.modelId))

const thinkingLabel = computed(() => {
	const level = settings.thinkingLevel
	return level.charAt(0).toUpperCase() + level.slice(1)
})

/** Native effort value the provider receives (often mirrors the level name). */
const thinkingNativeHint = computed(() => {
	if (settings.thinkingLevel === 'off') return ''
	const mapped = resolveModel(settings.provider, settings.modelId)?.thinkingLevelMap?.[settings.thinkingLevel] as
		string | null | undefined
	return typeof mapped === 'string' && mapped.length > 0 ? mapped : ''
})

const thinkingIndex = computed(() => Math.max(0, supportedThinking.value.indexOf(settings.thinkingLevel)))

function setThinkingIndex(raw: number): void {
	const idx = Math.min(supportedThinking.value.length - 1, Math.max(0, Math.round(raw)))
	const level = supportedThinking.value[idx] ?? 'off'
	settings.thinkingLevel = resolveThinkingLevel(settings.provider, settings.modelId, level)
}

/** Keep a stored level valid when the model changes (clamp down, never up). */
function clampThinkingLevel(): void {
	const resolved = resolveThinkingLevel(settings.provider, settings.modelId, settings.thinkingLevel)
	if (resolved !== settings.thinkingLevel) settings.thinkingLevel = resolved
}

watch(() => [settings.provider, settings.modelId], clampThinkingLevel)

// --- Conversation section (autosaved, debounced) ---

// History budget, derived from the pi-ai SDK's per-model context window.
// Read-only: the manual character setting was retired.
const modelWindowLabel = computed(() => {
	const model = resolveModel(settings.provider, settings.modelId)
	if (!model || !Number.isFinite(model.contextWindow) || model.contextWindow <= 0) return 'Unknown model'
	const tokens = model.contextWindow.toLocaleString('en-US')
	const chars = contextCharsFor(settings.provider, settings.modelId).toLocaleString('en-US')
	return `${tokens} tokens (~${chars} chars of history)`
})

function resetConversation(): void {
	settings.systemPrompt = ''
}

let lastConvSavedJson = ''
let convTimer: ReturnType<typeof setTimeout> | null = null

watch(
	() => settings.systemPrompt,
	() => {
		convSaveState.value = 'saving'
		if (convTimer !== null) clearTimeout(convTimer)
		convTimer = setTimeout(() => {
			convTimer = null
			try {
				const json = JSON.stringify({ prompt: settings.systemPrompt })
				if (json !== lastConvSavedJson) {
					lastConvSavedJson = json
					save()
				}
				convSaveState.value = 'saved'
			} catch {
				convSaveState.value = 'error'
			}
		}, 500)
	},
)

// --- Page lifecycle ---

watch(open, async (isOpen) => {
	if (isOpen) {
		activeSection.value = 'providers'
		lastModelSavedJson = JSON.stringify({
			provider: settings.provider,
			modelId: settings.modelId,
			thinkingLevel: settings.thinkingLevel,
		})
		// Self-heal a level the current model no longer supports (e.g. after
		// a model switch outside this page); snapshotted above, so the clamp
		// below persists through the debounced model save.
		clampThinkingLevel()
		lastConvSavedJson = JSON.stringify({ prompt: settings.systemPrompt })
		modelSaveState.value = 'idle'
		convSaveState.value = 'idle'
		const ids = providerList.value.map((p) => p.value)
		selectedProviderId.value = settings.provider && ids.includes(settings.provider) ? settings.provider : (ids[0] ?? '')
		syncDefaultOption()
		modelFilter.value = ''
		resetAddForm()
		showAddProvider.value = false
		await refreshKeys()
	}
})

function close(): void {
	open.value = false
}

function onKeydown(event: KeyboardEvent): void {
	if (event.key === 'Escape') close()
}
</script>

<template>
	<div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center p-4" @keydown="onKeydown">
		<div class="absolute inset-0 bg-dark-backdrop/60" @click="close" aria-hidden="true" />
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Agent settings"
			class="relative flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-default bg-neutral-primary-medium shadow-2xl"
		>
			<!-- Page header -->
			<div class="flex shrink-0 items-center gap-3 border-b border-default px-5 py-4">
				<div class="mr-auto">
					<h2 class="text-base font-bold tracking-tight text-heading">Agent settings</h2>
					<p class="text-xs text-body-subtle">
						Providers, default model, API keys, and assistant behavior for every job.
					</p>
				</div>
				<FwbBadge :type="statusBadge">{{ statusLabel }}</FwbBadge>
				<FwbButton size="sm" color="alternative" square aria-label="Close settings" @click="close">
					<Icon size="16"><Dismiss16Regular /></Icon>
				</FwbButton>
			</div>

			<div class="flex min-h-0 flex-1 flex-col sm:flex-row">
				<!-- Section nav (wisp-pro SettingsView pattern) -->
				<nav
					aria-label="Settings sections"
					class="flex shrink-0 gap-1 overflow-x-auto border-b border-default p-3 sm:w-60 sm:flex-col sm:overflow-y-auto sm:border-r sm:border-b-0"
				>
					<button
						v-for="section in sections"
						:key="section.id"
						type="button"
						role="option"
						:aria-selected="activeSection === section.id"
						class="flex min-w-44 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition sm:min-w-0"
						:class="activeSection === section.id ? 'bg-neutral-tertiary' : 'hover:bg-neutral-tertiary'"
						@click="setActiveSection(section.id)"
					>
						<span
							class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
							:class="activeSection === section.id ? 'bg-brand text-white' : 'bg-neutral-tertiary text-body-subtle'"
						>
							<Icon size="18"><component :is="section.icon" /></Icon>
						</span>
						<span class="min-w-0">
							<span class="block truncate text-sm font-semibold text-heading">
								{{ section.title }}
							</span>
							<span class="block truncate text-xs text-body-subtle">
								{{ section.description }}
							</span>
						</span>
					</button>
				</nav>

				<!-- Detail -->
				<main class="min-h-0 flex-1 overflow-y-auto p-5">
					<!-- Providers (wisp-pro ProvidersView pattern) -->
					<div
						v-if="activeSection === 'providers'"
						class="flex min-h-0 flex-col gap-4 lg:grid lg:h-full lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-1"
					>
						<!-- Provider list: grid-stretched full height; only the listbox scrolls -->
						<section aria-label="Providers" class="flex min-w-0 flex-col gap-1 lg:min-h-0 lg:overflow-hidden">
							<div class="flex items-center justify-between gap-2 px-1 pb-1">
								<span class="text-sm font-semibold text-heading">Providers</span>
								<div class="flex items-center gap-2">
									<FwbBadge type="default">{{ providerCountLabel }}</FwbBadge>
									<FwbButton
										size="xs"
										color="alternative"
										aria-label="Add custom provider"
										@click="showAddProvider = !showAddProvider"
									>
										Add
									</FwbButton>
								</div>
							</div>
							<div v-if="showAddProvider" class="flex flex-col gap-2 rounded-xl border border-default p-3">
								<FwbInput v-model="addId" label="Provider id" placeholder="my-proxy" />
								<FwbInput v-model="addName" label="Display name" placeholder="My Proxy" />
								<FwbInput v-model="addBaseUrl" label="Base URL" placeholder="https://proxy.example/v1" />
								<FwbInput v-model="addModelId" label="First model id" placeholder="llama-3-3-70b" />
								<FwbInput v-model="addModelName" label="First model name (optional)" placeholder="Llama 3.3 70B" />
								<p v-if="addError" class="text-xs text-red-600 dark:text-red-400">{{ addError }}</p>
								<div class="flex justify-end gap-2">
									<FwbButton size="xs" color="alternative" @click="showAddProvider = false"> Cancel </FwbButton>
									<FwbButton size="xs" @click="handleAddProvider">Add provider</FwbButton>
								</div>
							</div>
							<div
								role="listbox"
								aria-label="Providers"
								class="flex gap-1 max-lg:overflow-x-auto lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-y-auto lg:overscroll-contain"
							>
								<button
									v-for="provider in providerList"
									:key="provider.value"
									type="button"
									role="option"
									:aria-selected="selectedProviderId === provider.value"
									class="flex min-w-48 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition lg:min-w-0"
									:class="selectedProviderId === provider.value ? 'bg-neutral-tertiary' : 'hover:bg-neutral-tertiary'"
									@click="selectProvider(provider.value)"
								>
									<span class="min-w-0 flex-1">
										<span class="block truncate text-sm font-semibold text-heading">
											{{ provider.name }}
										</span>
										<span class="block truncate text-xs text-body-subtle">
											{{ modelsForProvider(provider.value, true).length }} models{{
												hasKeys[provider.value] ? ' · key stored' : ''
											}}
										</span>
									</span>
									<FwbBadge v-if="settings.provider === provider.value && isModelConfigured" size="xs" type="green">
										Default
									</FwbBadge>
								</button>
							</div>
							<p class="px-1 pt-1 text-xs text-body-subtle">Pick a provider to manage its key and models.</p>
						</section>

						<!-- Provider detail: stretched full height; only the models list scrolls -->
						<div v-if="detailProvider" class="min-w-0 flex-1 lg:flex lg:min-h-0 lg:flex-col">
							<header class="mb-4 flex shrink-0 items-start justify-between gap-3">
								<div class="min-w-0">
									<h3 class="truncate text-lg font-bold text-heading">
										{{ detailProvider.name }}
									</h3>
									<p class="text-xs text-body-subtle">{{ detailModelCountLabel }}</p>
								</div>
								<div class="flex shrink-0 items-center gap-2 pt-1">
									<FwbBadge v-if="detailProvider.custom" size="xs" type="indigo">Custom</FwbBadge>
									<span class="font-mono text-xs text-body-subtle"> ID: {{ detailProvider.value }} </span>
									<FwbButton v-if="detailProvider.custom" size="xs" color="alternative" @click="handleRemoveProvider">
										Delete
									</FwbButton>
								</div>
							</header>

							<div class="flex flex-col gap-4 lg:min-h-0 lg:flex-1">
								<FwbCard class="shrink-0 p-5">
									<div class="flex items-center gap-2">
										<h4 class="text-sm font-semibold text-heading">API key</h4>
										<FwbBadge :type="hasKeys[detailProvider.value] ? 'green' : 'default'" size="xs">
											{{ hasKeys[detailProvider.value] ? 'Stored' : 'No key' }}
										</FwbBadge>
									</div>
									<p class="mt-2 text-xs leading-relaxed text-body-subtle">
										Bring your own key. Desktop stores it in your OS keychain{{
											isElectron() ? '.' : '; the web app keeps it for this session only.'
										}}
									</p>
									<div class="mt-3 flex flex-col gap-2 sm:flex-row">
										<div class="flex-1">
											<FwbInput
												v-model="keyInputs[detailProvider.value]"
												type="password"
												placeholder="sk-…"
												:disabled="!!keyBusy[detailProvider.value]"
												@keyup.enter="saveKeyOnEnter($event, detailProvider.value)"
											/>
										</div>
										<div class="flex gap-2">
											<FwbButton
												size="sm"
												color="alternative"
												:disabled="!!keyBusy[detailProvider.value] || !hasKeys[detailProvider.value]"
												@click="removeKey(detailProvider.value)"
											>
												Delete
											</FwbButton>
											<FwbButton
												size="sm"
												:disabled="!!keyBusy[detailProvider.value] || !(keyInputs[detailProvider.value] ?? '').trim()"
												@click="saveKey(detailProvider.value)"
											>
												Save key
											</FwbButton>
										</div>
									</div>
									<p v-if="keyMsgs[detailProvider.value]" class="mt-2 text-xs text-body-subtle">
										{{ keyMsgs[detailProvider.value] }}
									</p>
								</FwbCard>

								<div
									class="rounded-xl border border-gray-200 bg-neutral-primary-medium p-5 shadow-sm lg:flex lg:min-h-64 lg:flex-1 lg:flex-col lg:overflow-hidden dark:border-gray-700"
								>
									<div class="flex shrink-0 items-center gap-2">
										<h4 class="text-sm font-semibold text-heading">Models</h4>
										<FwbTooltip placement="right">
											<template #trigger>
												<span
													class="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-neutral-tertiary text-xs text-body-subtle"
												>
													?
												</span>
											</template>
											<template #content>
												Disabled models stay hidden from the Model page. Only custom models can be deleted.
											</template>
										</FwbTooltip>
									</div>
									<p v-if="!detailModels.length" class="mt-2 text-xs text-amber-600 dark:text-amber-400">
										This provider lists no models — add a custom one below.
									</p>
									<div class="flex shrink-0 flex-col gap-2 border-t border-default pt-3 sm:flex-row">
										<div class="flex-1">
											<FwbInput size="sm" v-model="newModelId" placeholder="New model id" />
										</div>
										<div class="flex-1">
											<FwbInput size="sm" v-model="newModelName" placeholder="Display name (optional)" />
										</div>
										<div class="flex gap-2">
											<FwbButton size="sm" @click="handleAddModel"> Add Model</FwbButton>
										</div>
									</div>
									<p v-if="newModelError" class="mt-2 text-xs text-red-600 dark:text-red-400">
										{{ newModelError }}
									</p>
									<ul class="mt-3 flex flex-col gap-1 overscroll-contain lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
										<li
											v-for="model in detailModels"
											:key="model.id"
											class="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-neutral-tertiary"
										>
											<span class="min-w-0 flex-1">
												<span class="block truncate text-sm text-heading">
													{{ model.label }}
												</span>
												<span class="block truncate font-mono text-xs text-body-subtle">
													{{ model.id }}
												</span>
											</span>
											<FwbBadge v-if="model.custom" size="xs" type="indigo">Custom</FwbBadge>
											<FwbToggle
												:model-value="model.enabled"
												:aria-label="`Enable ${model.label}`"
												@update:model-value="(v) => handleToggleModel(detailProvider.value, model.id, v as boolean)"
											/>
											<FwbButton
												v-if="model.custom"
												size="xs"
												color="alternative"
												:aria-label="`Delete ${model.label}`"
												@click="handleRemoveModel(detailProvider.value, model.id)"
											>
												Delete
											</FwbButton>
										</li>
									</ul>
								</div>
							</div>
						</div>
					</div>

					<!-- Dedicated Model page: pick the default agent model -->
					<div v-else-if="activeSection === 'model'" class="flex flex-col gap-4">
						<FwbCard class="p-5">
							<div class="flex items-center gap-2">
								<h3 class="text-sm font-semibold text-heading">Default agent model</h3>
								<FwbTooltip placement="right">
									<template #trigger>
										<span
											class="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-neutral-tertiary text-xs text-body-subtle"
										>
											?
										</span>
									</template>
									<template #content>
										Used for chat, tailoring, and cover letters in every job. Only enabled models are listed — manage
										them under Providers.
									</template>
								</FwbTooltip>
							</div>
							<div class="mt-4 flex flex-col gap-3">
								<FwbInput v-model="modelFilter" placeholder="Filter by name, id, or provider…" />
								<FwbAutocomplete
									v-model="defaultOption"
									label="Model"
									placeholder="Search models…"
									no-results-text="No models match."
									:options="filteredEnabledModels"
									:search-fields="['label', 'id', 'providerName']"
									display="label"
									:z-index="60"
									@select="onSelectDefault"
									@update:model-value="onDefaultCleared"
								>
									<template #option="{ option }">
										<span class="block truncate text-sm">{{ option.label }}</span>
										<span class="block truncate text-xs text-body-subtle">
											{{ option.providerName }} · {{ option.id }}
										</span>
									</template>
								</FwbAutocomplete>
							</div>
							<div class="mt-4 flex items-center justify-between gap-3 border-t border-default pt-4">
								<FwbBadge :type="isModelConfigured ? 'green' : 'yellow'">
									{{ configuredLabel }}
								</FwbBadge>
								<div class="flex gap-2">
									<FwbButton size="sm" color="alternative" :disabled="!isModelConfigured" @click="clearModel">
										Clear
									</FwbButton>
									<FwbButton size="sm" color="alternative" @click="resetModel">Reset to default</FwbButton>
								</div>
							</div>
						</FwbCard>
						<FwbCard class="p-5">
							<div class="flex items-center gap-2">
								<h3 class="text-sm font-semibold text-heading">Reasoning effort</h3>
								<FwbTooltip placement="right">
									<template #trigger>
										<span
											class="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-neutral-tertiary text-xs text-body-subtle"
										>
											?
										</span>
									</template>
									<template #content>
										How hard the model thinks before answering. Off disables reasoning; higher levels spend more
										thinking tokens for harder tasks. Only models with adjustable reasoning show the slider.
									</template>
								</FwbTooltip>
								<span
									class="ml-auto rounded-full bg-brand-soft px-2 py-0.5 text-xs font-medium text-fg-brand tabular-nums"
								>
									{{ thinkingLabel }}
								</span>
							</div>
							<div v-if="supportedThinking.length > 1" class="mt-4">
								<div class="flex items-center gap-2">
									<span class="shrink-0 text-[11px] text-body-subtle">Off</span>
									<input
										type="range"
										:min="0"
										:max="supportedThinking.length - 1"
										:step="1"
										:value="thinkingIndex"
										class="w-full accent-brand"
										aria-label="Reasoning effort"
										:title="`Reasoning effort: ${thinkingLabel}`"
										@input="setThinkingIndex(Number(($event.target as HTMLInputElement).value))"
									/>
									<span class="shrink-0 text-[11px] text-body-subtle capitalize">{{
										supportedThinking[supportedThinking.length - 1]
									}}</span>
								</div>
								<p class="mt-2 text-xs text-body-subtle">
									Effort {{ thinkingLabel.toLowerCase()
									}}<span v-if="thinkingNativeHint"> · sends “{{ thinkingNativeHint }}” to the provider</span>.
								</p>
							</div>
							<p v-else class="mt-4 text-xs text-body-subtle">This model doesn't support adjustable reasoning.</p>
						</FwbCard>
					</div>

					<!-- Conversation -->
					<div v-else class="flex flex-col gap-4">
						<FwbCard class="p-5">
							<h3 class="text-sm font-semibold text-heading">Assistant behavior</h3>
							<div class="mt-4">
								<p class="text-xs font-medium text-body">Core prompt (locked)</p>
								<pre
									class="mt-1 max-h-48 overflow-y-auto rounded-lg bg-neutral-secondary p-3 text-xs whitespace-pre-wrap text-body"
									>{{ DEFAULT_SYSTEM_PROMPT }}</pre>
							</div>
							<div class="mt-4">
								<FwbTextarea
									v-model="settings.systemPrompt"
									label="Additional instructions (appended to the core prompt)"
									:rows="4"
									placeholder="E.g. Prefer British English, keep bullets under 2 lines…"
								/>
							</div>
							<div class="mt-4 max-w-xs">
								<p class="text-xs font-medium text-body">Context window</p>
								<p class="mt-1 text-xs text-body-subtle">
									{{ modelWindowLabel }} — from the model's SDK data, history only.
								</p>
							</div>
							<div class="mt-4 flex items-center justify-end gap-3 border-t border-default pt-4">
								<FwbButton size="sm" color="alternative" @click="resetConversation">
									Clear extra instructions
								</FwbButton>
							</div>
						</FwbCard>
					</div>
				</main>
			</div>
		</div>
	</div>
</template>
