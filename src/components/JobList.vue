<script setup lang="ts">
import { computed } from 'vue'
import { ref } from 'vue'
import { Icon } from '@vicons/utils'
import { FwbButton, FwbInput, FwbModal } from 'flowbite-vue'
import { Copy16Regular, Dismiss16Regular, Edit16Regular } from '../data/icons'
import type { Job, MasterResume } from '../data/types'

const activeId = defineModel<string>({ required: true })
const props = defineProps<{
	jobs: Job[]
	master: MasterResume
}>()
const emit = defineEmits<{
	(e: 'create', payload: { company: string; role: string; file: File | null }): void
	(e: 'duplicate', id: string): void
	(e: 'rename', id: string): void
	(e: 'remove', id: string): void
	(e: 'clear-overrides'): void
}>()

const masterJob = computed(() => props.jobs.find((j) => j.kind === 'master'))
const jobProfiles = computed(() => props.jobs.filter((j) => j.kind !== 'master'))
const activeIsMaster = computed(() => masterJob.value?.id === activeId.value)

/** Shared content items living on the master (for the subtitle count). */
const sharedCount = computed(() => {
	const m = props.master
	const customs = (m.customSections || []).reduce((n, s) => n + (s.items || []).length, 0)
	return m.experience.length + m.projects.length + m.education.length + m.skills.length + customs
})

function statusOf(job: Job): { dot: string; label: string } {
	const tailored = Object.keys(job.overrides || {}).length > 0
	const letter = !!(job.letter?.body || '').trim()
	if (tailored && letter) return { dot: 'bg-emerald-500', label: 'Tailored + cover letter' }
	if (tailored || letter) return { dot: 'bg-amber-500', label: 'Draft in progress' }
	return { dot: 'bg-slate-300 dark:bg-slate-600', label: 'Not tailored yet' }
}

const showNew = ref(false)
const company = ref('')
const role = ref('')
const file = ref<File | null>(null)
const fileError = ref('')

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

function rowClass(active: boolean): string {
	return active
		? 'border-indigo-300 bg-indigo-50 font-semibold dark:border-indigo-700 dark:bg-indigo-950'
		: 'border-transparent hover:bg-slate-100 dark:hover:bg-slate-800'
}
</script>

<template>
	<div class="no-print flex min-h-0 flex-col gap-4">
		<!-- Level 1: the shared source of truth (no JD, no tailoring of its own). -->
		<section>
			<span class="px-1 text-xs font-semibold tracking-wide text-slate-400 uppercase">Master</span>
			<div
				v-if="masterJob"
				:key="masterJob.id"
				role="tab"
				:aria-selected="activeId === masterJob.id"
				tabindex="0"
				class="group mt-1 flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px]"
				:class="rowClass(activeId === masterJob.id)"
				@click="activeId = masterJob.id"
				@keyup.enter="activeId = masterJob.id"
			>
				<span
					class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-500 text-[10px] font-bold text-white"
					title="Shared canonical content"
					>M</span
				>
				<span class="min-w-0 flex-1">
					<span class="block truncate">{{ masterJob.name || 'Master' }}</span>
					<span class="block truncate text-[11px] font-normal text-slate-400">
						{{ sharedCount }} shared items · edits affect all jobs
					</span>
				</span>
				<span class="hidden shrink-0 group-hover:flex">
					<FwbButton
						color="alternative"
						outline
						size="xs"
						square
						title="Rename"
						@click.stop="emit('rename', masterJob.id)"
					>
						<Icon size="16"><Edit16Regular /></Icon>
					</FwbButton>
				</span>
			</div>
		</section>

		<!-- Level 2: tailored applications, each a view over the master. -->
		<section class="flex min-h-0 flex-col">
			<div class="flex items-center justify-between px-1">
				<span class="text-xs font-semibold tracking-wide text-slate-400 uppercase">
					Jobs<span v-if="jobProfiles.length"> · {{ jobProfiles.length }}</span>
				</span>
				<button class="btn btn-ghost px-2 py-1 text-[13px]" @click="showNew = true">+ New job</button>
			</div>
			<div class="flex min-h-0 flex-col gap-1 overflow-y-auto">
				<div
					v-for="job in jobProfiles"
					:key="job.id"
					role="tab"
					:aria-selected="activeId === job.id"
					tabindex="0"
					class="group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-[13px] h-10"
					:class="rowClass(activeId === job.id)"
					@click="activeId = job.id"
					@keyup.enter="activeId = job.id"
				>
					<span class="h-2 w-2 shrink-0 rounded-full" :class="statusOf(job).dot" :title="statusOf(job).label" />
					<span class="min-w-0 flex-1 truncate">
						{{ job.company || 'Untitled' }} — {{ job.jobTitleTarget || job.name }}
					</span>
					<span class="hidden shrink-0 gap-1 group-hover:flex">
						<FwbButton
							color="alternative"
							outline
							size="xs"
							square
							title="Duplicate job"
							@click.stop="emit('duplicate', job.id)"
						>
							<Icon size="16"><Copy16Regular /></Icon>
						</FwbButton>
						<FwbButton color="alternative" outline size="xs" square title="Rename" @click.stop="emit('rename', job.id)">
							<Icon size="16"><Edit16Regular /></Icon>
						</FwbButton>
						<FwbButton color="red" outline size="xs" square title="Delete job" @click.stop="emit('remove', job.id)">
							<Icon size="16"><Dismiss16Regular /></Icon>
						</FwbButton>
					</span>
				</div>
				<p v-if="!jobProfiles.length" class="rounded-lg border border-dashed px-2.5 py-3 text-xs text-slate-400">
					No applications yet — create a job to tailor the master for a role.
				</p>
			</div>
			<button
				v-if="!activeIsMaster"
				class="btn btn-ghost mt-1 px-2 py-1 text-xs text-slate-400"
				@click="emit('clear-overrides')"
			>
				Reset active job customizations
			</button>
		</section>

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
						<input id="new-job-pdf" type="file" accept="application/pdf,.pdf" class="input" @change="onFileChange" />
						<p v-if="fileError" class="mt-1 text-xs text-red-600">{{ fileError }}</p>
						<p v-else class="mt-1 text-xs text-slate-400">
							The JD text is read-only — replaced by uploading a new file.
						</p>
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
