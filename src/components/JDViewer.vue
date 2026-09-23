<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'
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

async function onPick(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement | null
	const f = input?.files?.[0]
	if (input) input.value = ''
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
	}
}
</script>

<template>
	<div class="flex min-h-0 flex-col gap-3">
		<div class="no-print flex flex-wrap items-center gap-2">
			<span class="text-xs font-semibold tracking-wide text-slate-400 uppercase">Job description</span>
			<span v-if="job.jdSource" class="text-xs text-slate-500">
				{{ job.jdSource.filename }} · {{ job.jdSource.pageCount }} pages
			</span>
			<button class="btn btn-ghost px-2 py-1 text-xs" :disabled="busy" @click="fileInput?.click()">
				{{ busy ? 'Reading…' : 'Replace JD' }}
			</button>
			<input ref="fileInput" type="file" accept="application/pdf,.pdf" class="hidden" @change="onPick" />
		</div>
		<p v-if="notice" class="text-xs text-amber-600">{{ notice }}</p>
		<div v-if="loading" class="text-sm text-slate-400">Loading PDF…</div>
		<div v-else-if="missing" class="rounded-lg border border-dashed p-4 text-sm text-slate-500">
			JD PDF missing — it isn't part of workspace exports.
			<button class="btn btn-ghost px-2 py-1 text-xs" @click="fileInput?.click()">Re-attach</button>
		</div>
		<iframe
			v-else-if="blobUrl"
			:src="blobUrl"
			title="Job description PDF"
			class="min-h-[50vh] w-full flex-1 rounded-lg border border-slate-200 bg-white"
		/>
		<div v-else class="rounded-lg border border-dashed p-4 text-sm text-slate-500">
			No JD attached yet. Use Replace JD to attach the posting PDF.
		</div>
		<div v-if="job.jobDescription" class="min-h-0 overflow-y-auto">
			<p class="label">Extracted text (read-only)</p>
			<pre
				class="rounded-lg bg-slate-50 p-3 text-xs whitespace-pre-wrap text-slate-700 dark:bg-slate-900 dark:text-slate-300"
				>{{ job.jobDescription }}</pre>
		</div>
	</div>
</template>
