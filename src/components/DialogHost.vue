<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { FwbButton, FwbInput, FwbModal } from 'flowbite-vue'
import { acceptDialog, ackNotify, dialogQueue, dismissDialog, submitPrompt } from '../data/dialogs'

const queue = dialogQueue()
const current = computed(() => queue.queue[0] ?? null)
const draft = ref('')

// Each prompt opens with its initial value (never a previous draft).
watch(
	current,
	(next) => {
		draft.value = next && next.kind === 'prompt' ? (next.initial ?? '') : ''
	},
	{ immediate: true },
)

function onEnter(): void {
	const next = current.value
	if (!next) return
	if (next.kind === 'prompt') submitPrompt(draft.value)
	else if (next.kind === 'confirm') acceptDialog()
	else ackNotify()
}
</script>

<template>
	<FwbModal v-if="current" size="md" @close="dismissDialog">
		<template #header>
			<h3 class="text-base font-semibold">{{ current.title }}</h3>
		</template>
		<template #body>
			<template v-if="current.kind === 'prompt'">
				<p v-if="current.label" class="text-sm text-slate-500 dark:text-slate-400">{{ current.label }}</p>
				<FwbInput
					v-model="draft"
					:placeholder="current.placeholder"
					:maxlength="current.maxLength"
					class="mt-3"
					@keyup.enter="onEnter"
					@keyup.escape="dismissDialog"
				/>
			</template>
			<p v-else class="text-sm text-slate-500 dark:text-slate-400">{{ current.body }}</p>
		</template>
		<template #footer>
			<div class="flex justify-end gap-2">
				<FwbButton v-if="current.kind === 'notify'" @click="ackNotify">OK</FwbButton>
				<template v-else>
					<FwbButton color="alternative" @click="dismissDialog">Cancel</FwbButton>
					<FwbButton
						v-if="current.kind === 'confirm'"
						:color="current.danger ? 'red' : 'default'"
						@click="acceptDialog"
					>
						{{ current.confirmLabel }}
					</FwbButton>
					<FwbButton v-else :disabled="!draft.trim()" @click="submitPrompt(draft)">
						{{ current.confirmLabel }}
					</FwbButton>
				</template>
			</div>
		</template>
	</FwbModal>
</template>
