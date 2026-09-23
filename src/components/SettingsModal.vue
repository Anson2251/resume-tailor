<script setup lang="ts">
import { ref, watch } from 'vue'
import { FwbButton, FwbInput, FwbModal, FwbSelect } from 'flowbite-vue'
import { deleteApiKey, getApiKey, setApiKey } from '../agent/keyring'
import { isElectron } from '../data/persistence'

const open = defineModel<boolean>({ default: false })

const PROVIDERS = [
	{ value: 'anthropic', name: 'Anthropic' },
	{ value: 'openai', name: 'OpenAI' },
	{ value: 'google', name: 'Google' },
	{ value: 'openrouter', name: 'OpenRouter' },
]

const provider = ref('anthropic')
const keyInput = ref('')
const hasKey = ref(false)
const status = ref('')
const busy = ref(false)

async function refresh(): Promise<void> {
	const existing = await getApiKey(provider.value)
	hasKey.value = !!existing
	if (existing) keyInput.value = ''
}

watch([open, provider], async ([isOpen]) => {
	if (isOpen) {
		status.value = ''
		await refresh()
	}
})

async function save(): Promise<void> {
	if (!keyInput.value.trim()) return
	busy.value = true
	status.value = ''
	try {
		await setApiKey(provider.value, keyInput.value.trim())
		keyInput.value = ''
		await refresh()
		status.value = 'Saved.'
	} catch {
		status.value = 'Save failed.'
	} finally {
		busy.value = false
	}
}

async function remove(): Promise<void> {
	busy.value = true
	try {
		await deleteApiKey(provider.value)
		await refresh()
		status.value = 'Deleted.'
	} finally {
		busy.value = false
	}
}
</script>

<template>
	<FwbModal v-if="open" size="md" @close="open = false">
		<template #header>
			<h3 class="text-base font-semibold">Agent settings</h3>
		</template>
		<template #body>
			<div class="flex flex-col gap-4">
				<p class="text-xs text-slate-500 dark:text-slate-400">
					Bring your own key. Desktop stores it in your OS keychain{{
						isElectron() ? '.' : '; the web app keeps it for this session only.'
					}}
				</p>
				<FwbSelect v-model="provider" label="Provider" :options="PROVIDERS" />
				<FwbInput
					v-model="keyInput"
					label="API key"
					type="password"
					placeholder="sk-…"
					:disabled="busy"
					@keyup.enter="save"
				/>
				<p class="text-xs" :class="hasKey ? 'text-emerald-600' : 'text-slate-400'">
					{{ hasKey ? 'A key is stored for this provider.' : 'No key stored for this provider.' }}
				</p>
				<p v-if="status" class="text-xs text-slate-500">{{ status }}</p>
			</div>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2">
				<FwbButton color="alternative" :disabled="busy || !hasKey" @click="remove">Delete</FwbButton>
				<FwbButton :disabled="busy || !keyInput.trim()" @click="save">Save key</FwbButton>
			</div>
		</template>
	</FwbModal>
</template>
