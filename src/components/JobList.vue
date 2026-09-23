<script setup lang="ts">
import { ref } from 'vue'
import { FwbButton, FwbInput, FwbModal } from 'flowbite-vue'
import type { Job } from '../data/types'

const activeId = defineModel<string>({ required: true })
const props = defineProps<{
	jobs: Job[]
}>()
const emit = defineEmits<{
	(e: 'create', payload: { company: string; role: string; file: File | null }): void
	(e: 'duplicate', id: string): void
	(e: 'rename', id: string): void
	(e: 'remove', id: string): void
	(e: 'clear-overrides'): void
}>()

const showNew = ref(false)
const company = ref('')
const role = ref('')
const file = ref<File | null>(null)
const fileError = ref('')

function statusOf(job: Job): { dot: string; label: string } {
	if (job.kind === 'master') return { dot: 'bg-slate-400', label: 'Master content' }
	const tailored = Object.keys(job.overrides || {}).length > 0
	const letter = !!(job.coverLetter || '').trim()
	if (tailored && letter) return { dot: 'bg-emerald-500', label: 'Tailored + cover letter' }
	if (tailored || letter) return { dot: 'bg-amber-500', label: 'Draft in progress' }
	return { dot: 'bg-slate-300 dark:bg-slate-600', label: 'Not tailored yet' }
}

function onFileChange(event: Event): void {
	const input = event.target as HTMLInputElement | null
	const picked = input?.files?.[0] ?? null
	fileError.value = ''
	if (picked && picked.size > 10 * 1024 * 1024) {
		fileError.value = 'That PDF is larger than 10MB.'
		file.value = null
		if (input) input.value = ''
		return
	}
	file.value = picked
}

function submitNew(): void {
	emit('create', { company: company.value.trim(), role: role.value.trim(), file: file.value })
	company.value = ''
	role.value = ''
	file.value = null
	showNew.value = false
}
</script>

<template>
	<div class="no-print flex min-h-0 flex-col gap-1">
		<div class="flex items-center justify-between px-1">
			<span class="text-xs font-semibold tracking-wide text-slate-400 uppercase">Jobs</span>
			<button class="btn btn-ghost px-2 py-1 text-[13px]" @click="showNew = true">+ New job</button>
		</div>
		<div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
			<div
				v-for="job in props.jobs"
				:key="job.id"
				role="tab"
				:aria-selected="activeId === job.id"
				tabindex="0"
				class="group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px]"
				:class="
					activeId === job.id
						? 'border-indigo-300 bg-indigo-50 font-semibold dark:border-indigo-700 dark:bg-indigo-950'
						: 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
				"
				@click="activeId = job.id"
				@keyup.enter="activeId = job.id"
			>
				<span
					class="h-2 w-2 shrink-0 rounded-full"
					:class="statusOf(job).dot"
					:title="statusOf(job).label"
				/>
				<span class="min-w-0 flex-1 truncate">
					<span v-if="job.kind === 'master'" class="tracking-wide uppercase">Master</span>
					<span v-else>{{ job.company || 'Untitled' }} — {{ job.jobTitleTarget || job.name }}</span>
				</span>
				<span class="hidden shrink-0 gap-0.5 group-hover:flex">
					<button
						v-if="job.kind !== 'master'"
						class="rounded px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
						title="Duplicate job"
						@click.stop="emit('duplicate', job.id)"
					>
						⧉
					</button>
					<button
						class="rounded px-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
						title="Rename"
						@click.stop="emit('rename', job.id)"
					>
						✎
					</button>
					<button
						v-if="job.kind !== 'master'"
						class="rounded px-1 text-slate-400 hover:text-red-600"
						title="Delete job"
						@click.stop="emit('remove', job.id)"
					>
						×
					</button>
				</span>
			</div>
		</div>
		<button class="btn btn-ghost px-2 py-1 text-xs text-slate-400" @click="emit('clear-overrides')">
			Reset customizations
		</button>

		<FwbModal v-if="showNew" size="md" @close="showNew = false">
			<template #header>
				<h3 class="text-base font-semibold">New job</h3>
			</template>
			<template #body>
				<div class="flex flex-col gap-4">
					<FwbInput v-model="company" label="Company" placeholder="Acme Inc." />
					<FwbInput v-model="role" label="Role" placeholder="Frontend Engineer" />
					<div>
						<label class="label" for="new-job-pdf">Job description (PDF)</label>
						<input
							id="new-job-pdf"
							type="file"
							accept="application/pdf,.pdf"
							class="input"
							@change="onFileChange"
						/>
						<p v-if="fileError" class="mt-1 text-xs text-red-600">{{ fileError }}</p>
						<p v-else class="mt-1 text-xs text-slate-400">The JD text is read-only — replaced by uploading a new file.</p>
					</div>
				</div>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2">
					<FwbButton color="alternative" @click="showNew = false">Cancel</FwbButton>
					<FwbButton @click="submitNew">Create job</FwbButton>
				</div>
			</template>
		</FwbModal>
	</div>
</template>
