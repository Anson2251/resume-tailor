<script setup lang="ts">
import { computed } from 'vue'
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
		<div class="card p-4">
			<h2 class="section-title mb-3">Recipient</h2>
			<div class="flex flex-col gap-3">
				<div>
					<label class="label" :for="`cl-to-${job.id}`">Hiring division</label>
					<input
						:id="`cl-to-${job.id}`"
						v-model="letter.recipientTitle"
						class="input"
						placeholder="Hiring Team"
						maxlength="120"
					/>
				</div>
				<div>
					<label class="label" :for="`cl-addr-${job.id}`">Address</label>
					<textarea
						:id="`cl-addr-${job.id}`"
						v-model="letter.recipientAddress"
						class="textarea"
						rows="2"
						placeholder="Company street, city…"
					/>
				</div>
			</div>
		</div>

		<div class="card p-4">
			<h2 class="section-title mb-3">Subject</h2>
			<div class="flex flex-col gap-3">
				<div>
					<label class="label" :for="`cl-title-${job.id}`">Job title</label>
					<input
						:id="`cl-title-${job.id}`"
						v-model="letter.jobTitle"
						class="input"
						:placeholder="job.jobTitleTarget || 'Role'"
						maxlength="120"
					/>
				</div>
				<div>
					<label class="label" :for="`cl-post-${job.id}`">Posting number (optional)</label>
					<input
						:id="`cl-post-${job.id}`"
						v-model="letter.postingNumber"
						class="input"
						placeholder="REQ-1234"
						maxlength="60"
					/>
				</div>
				<label class="flex cursor-pointer items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300">
					<input v-model="letter.showReLine" type="checkbox" class="h-4 w-4 rounded accent-indigo-600" />
					Show “Re:” subject line
				</label>
			</div>
		</div>

		<div class="card p-4">
			<h2 class="section-title mb-3">Letter</h2>
			<textarea
				v-model="letter.body"
				class="textarea font-mono"
				rows="12"
				placeholder="The agent drafts here — or write it yourself (markdown)."
			/>
		</div>

		<div class="card p-4">
			<h2 class="section-title mb-3">Signature &amp; date</h2>
			<div class="flex flex-col gap-3">
				<div>
					<label class="label" :for="`cl-sign-${job.id}`">Sign-off</label>
					<input
						:id="`cl-sign-${job.id}`"
						v-model="letter.signoff"
						class="input"
						placeholder="Sincerely,"
						maxlength="60"
					/>
				</div>
				<div>
					<label class="label" :for="`cl-cred-${job.id}`">Credential line</label>
					<input
						:id="`cl-cred-${job.id}`"
						v-model="letter.credentialLine"
						class="input"
						:placeholder="credentialPlaceholder"
						maxlength="120"
					/>
				</div>
				<div class="flex items-end gap-3">
					<div class="shrink-0">
						<label class="label" :for="`cl-date-${job.id}`">Date</label>
						<select :id="`cl-date-${job.id}`" v-model="letter.dateMode" class="input">
							<option value="auto">Today (auto)</option>
							<option value="custom">Custom</option>
						</select>
					</div>
					<input
						v-if="letter.dateMode === 'custom'"
						v-model="letter.dateCustom"
						class="input min-w-0 flex-1"
						placeholder="September 24, 2026"
						maxlength="60"
					/>
				</div>
				<p class="text-xs text-slate-400 dark:text-slate-500">
					Signed as {{ master.contact.fullName || 'your master name' }} — update the name in the Resume form.
				</p>
			</div>
		</div>
	</div>
</template>
