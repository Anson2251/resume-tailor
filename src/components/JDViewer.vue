<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
import { FwbFileInput } from 'flowbite-vue'
import { attachJdPdf, loadJdPdf, jdBlobUrl } from '../agent/jd'
import type { Job } from '../data/types'

const props = defineProps<{
	job: Job
}>()

const blobUrl = ref<string | null>(null)
const loading = ref(false)
const busy = ref(false)
const notice = ref('')
const missing = ref(false)
const picked = ref<File | File[] | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)

function revoke(): void {
	if (blobUrl.value) URL.revokeObjectURL(blobUrl.value)
	blobUrl.value = null
}

async function load(): Promise<void> {
	revoke()
	notice.value = ''
	missing.value = false
	const refId = props.job.jdSource?.pdfRefId
	if (!refId) return
	loading.value = true
	try {
		const data = await loadJdPdf(refId)
		if (!data) {
			missing.value = true
			return
		}
		blobUrl.value = jdBlobUrl(data)
	} finally {
		loading.value = false
	}
}

watch(() => [props.job.id, props.job.jdSource?.pdfRefId, props.job.jdSource?.extractedAt], load, { immediate: true })
onBeforeUnmount(revoke)

async function onPick(file: File | File[] | null): Promise<void> {
	const f = Array.isArray(file) ? file[0] : file
	if (!f || busy.value) return
	notice.value = ''
	busy.value = true
	try {
		const res = await attachJdPdf(props.job, f)
		// load() clears the notice first, so report the result after it.
		await load()
		if (res.error) notice.value = res.error
		else if (res.warning) notice.value = res.warning
	} catch (error) {
		console.error('[jd] replace failed:', error)
		notice.value = 'Could not read that PDF.'
	} finally {
		busy.value = false
		picked.value = null
	}
}

watch(picked, (file) => {
	if (file) void onPick(file)
})

function onNativePick(event: Event): void {
	const input = event.target as HTMLInputElement | null
	const f = input?.files?.[0]
	if (input) input.value = ''
	if (f) void onPick(f)
}
</script>

<template>
	<div class="flex min-h-0 flex-col gap-3">
		<div
			v-if="job.kind === 'master'"
			class="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
		>
			Master holds the shared content — it has no JD. Select a job to attach its posting.
		</div>
		<div class="no-print flex flex-nowrap items-center gap-2">
			<span v-if="job.jdSource" class="text-xs text-slate-500 flex flex-nowrap flex-1 text-nowrap">
				<span class="truncate">{{ job.jdSource.filename }}</span> · {{ job.jdSource.pageCount }} pages
			</span>
			<button
				v-if="job.jdSource"
				class="btn btn-ghost px-2 py-1 text-xs text-nowrap"
				:disabled="busy"
				@click="fileInput?.click()"
			>
				{{ busy ? 'Reading…' : 'Replace JD' }}
			</button>
			<input ref="fileInput" type="file" accept="application/pdf,.pdf" class="hidden" @change="onNativePick" />
		</div>
		<fwb-file-input
			v-if="!job.jdSource && job.kind !== 'master'"
			v-model="picked"
			dropzone
			accept="application/pdf,.pdf"
			:disabled="busy || loading"
		>
			<template #dropzonePlaceholder>
				<span class="font-semibold">{{ busy ? 'Reading…' : 'Click to upload' }}</span>
				{{ busy ? '' : 'the JD PDF or drag and drop' }}
			</template>
		</fwb-file-input>
		<p v-if="notice" class="text-xs text-amber-600">{{ notice }}</p>
		<div v-if="loading" class="text-sm text-slate-400">Loading PDF…</div>
		<div v-else-if="missing" class="rounded-lg border border-dashed p-4 text-sm text-slate-500">
			JD PDF missing — it isn't part of workspace exports. Re-attach it with the dropzone above.
		</div>
		<iframe
			v-else-if="blobUrl"
			:src="blobUrl"
			title="Job description PDF"
			class="min-h-[50vh] w-full flex-1 rounded-lg border border-slate-200 bg-white"
		/>
		<div v-if="job.jobDescription" class="min-h-0 overflow-y-auto">
			<p class="label">Extracted text (read-only)</p>
			<pre
				class="rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700 dark:bg-slate-900 dark:text-slate-300"
				>{{ job.jobDescription }}</pre>
		</div>
	</div>
</template>
