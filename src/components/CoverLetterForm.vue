<script setup lang="ts">
import { computed } from 'vue'
import { FwbCard, FwbInput, FwbSelect, FwbTextarea, FwbToggle } from 'flowbite-vue'
import { defaultCredentialLine } from '../data/letter'
import type { Job, MasterResume } from '../data/types'

const props = defineProps<{
	job: Job
	master: MasterResume
}>()

const letter = computed(() => props.job.letter)
const credentialPlaceholder = computed(
	() => defaultCredentialLine(props.master) || 'e.g. B.S. Candidate | State University',
)
</script>

<template>
	<div class="flex flex-col gap-5">
		<FwbCard class="p-4">
			<h2 class="mb-3 text-sm font-bold tracking-widest text-body-subtle uppercase">Recipient</h2>
			<div class="flex flex-col gap-3">
				<FwbInput v-model="letter.recipientTitle" label="Hiring division" placeholder="Hiring Team" />
				<FwbTextarea v-model="letter.recipientAddress" label="Address" :rows="2" placeholder="Company street, city…" />
			</div>
		</FwbCard>

		<FwbCard class="p-4">
			<h2 class="mb-3 text-sm font-bold tracking-widest text-body-subtle uppercase">Subject</h2>
			<div class="flex flex-col gap-3">
				<FwbInput v-model="letter.jobTitle" label="Job title" :placeholder="job.jobTitleTarget || 'Role'" />
				<FwbInput v-model="letter.postingNumber" label="Posting number (optional)" placeholder="REQ-1234" />
				<FwbToggle v-model="letter.showReLine" label="Show “Re:” subject line" />
			</div>
		</FwbCard>

		<FwbCard class="p-4">
			<h2 class="mb-3 text-sm font-bold tracking-widest text-body-subtle uppercase">Letter</h2>
			<FwbTextarea
				v-model="letter.body"
				:rows="12"
				textarea-class="font-mono"
				placeholder="The agent drafts here — or write it yourself (markdown)."
			/>
		</FwbCard>

		<FwbCard class="p-4">
			<h2 class="mb-3 text-sm font-bold tracking-widest text-body-subtle uppercase">Signature &amp; date</h2>
			<div class="flex flex-col gap-3">
				<FwbInput v-model="letter.signoff" label="Sign-off" placeholder="Sincerely," />
				<FwbInput v-model="letter.credentialLine" label="Credential line" :placeholder="credentialPlaceholder" />
				<div class="flex items-end gap-3">
					<FwbSelect
						v-model="letter.dateMode"
						label="Date"
						wrapper-class="shrink-0"
						:options="[
							{ value: 'auto', name: 'Today (auto)' },
							{ value: 'custom', name: 'Custom' },
						]"
					/>
					<FwbInput
						v-if="letter.dateMode === 'custom'"
						v-model="letter.dateCustom"
						wrapper-class="min-w-0 flex-1"
						placeholder="September 24, 2026"
					/>
				</div>
				<p class="text-xs text-body-subtle">
					Signed as {{ master.contact.fullName || 'your master name' }} — update the name in the Resume form.
				</p>
			</div>
		</FwbCard>
	</div>
</template>
