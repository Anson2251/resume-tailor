<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import ResumeForm from './components/ResumeForm.vue'
import ResumePreview from './components/ResumePreview.vue'
import { STORAGE_KEY, blankResume, sampleResume } from './data/resume.js'
import { ACCENTS } from './data/options.js'

const resume = reactive(blankResume())
const template = ref('modern')
const accent = ref(ACCENTS[0])
const loaded = ref(false)
const fileInput = ref(null)

function persist() {
	if (!loaded.value) return
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ resume, template: template.value, accent: accent.value }))
	} catch {
		/* storage unavailable — ignore */
	}
}

function normalizeVisibility() {
	// Items saved before the visibility toggle existed default to shown.
	for (const key of ['experience', 'education', 'skills']) {
		for (const item of resume[key] || []) {
			if (item.visible === undefined) item.visible = true
		}
	}
}

function restore() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY)
		if (!raw) {
			Object.assign(resume, sampleResume())
			return
		}
		const parsed = JSON.parse(raw)
		if (parsed.resume) {
			Object.assign(resume, parsed.resume)
			normalizeVisibility()
		}
		if (parsed.template) template.value = parsed.template
		if (parsed.accent) accent.value = parsed.accent
	} catch {
		Object.assign(resume, sampleResume())
	}
}

function loadSample() {
	Object.assign(resume, sampleResume())
}

function clearAll() {
	if (!confirm('Clear all resume content?')) return
	Object.assign(resume, blankResume())
}

function exportJson() {
	// Minified JSON: no indentation, smallest file.
	const data = JSON.stringify({ resume, template: template.value, accent: accent.value })
	const name = (resume.contact.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase()
	const blob = new Blob([data], { type: 'application/json' })
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = `${name || 'resume'}.json`
	document.body.appendChild(a)
	a.click()
	a.remove()
	URL.revokeObjectURL(url)
}

function triggerImport() {
	fileInput.value?.click()
}

async function handleImportFile(event) {
	const file = event.target.files?.[0]
	event.target.value = ''
	if (!file) return
	let parsed
	try {
		parsed = JSON.parse(await file.text())
	} catch {
		alert('Could not read that file — it is not valid JSON.')
		return
	}
	// Accept both full exports ({ resume, template, accent }) and bare resume objects.
	const incoming = parsed.resume ?? parsed
	if (
		!incoming ||
		typeof incoming !== 'object' ||
		!incoming.contact ||
		!Array.isArray(incoming.experience) ||
		!Array.isArray(incoming.education) ||
		!Array.isArray(incoming.skills)
	) {
		alert('That file does not look like a Resume Tailor export.')
		return
	}
	if (!confirm(`Import resume from "${file.name}"? Your current content will be replaced.`)) return
	Object.assign(resume, incoming)
	if (parsed.template) template.value = parsed.template
	if (parsed.accent) accent.value = parsed.accent
	normalizeVisibility()
}

function exportPdf() {
	const name = (resume.contact.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase()
	const prevTitle = document.title
	document.title = name || 'resume'
	window.print()
	document.title = prevTitle
}

watch([resume, template, accent], persist, { deep: true })

onMounted(() => {
	restore()
	loaded.value = true
})
</script>

<template>
	<div class="flex min-h-screen flex-col bg-slate-100 text-slate-900 lg:h-dvh">
		<!-- Top bar -->
		<header class="no-print sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
			<div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
				<div class="mr-auto">
					<h1 class="text-lg font-extrabold tracking-tight">Resume Tailor</h1>
					<p class="text-xs text-slate-500">Fill the form on the left — the resume updates live.</p>
				</div>

				<div class="flex items-center gap-2">
					<button class="btn btn-ghost text-[13px]" @click="loadSample">Load sample</button>
					<button class="btn btn-ghost text-[13px]" @click="clearAll">Clear</button>
					<button class="btn btn-ghost text-[13px]" @click="triggerImport">Import</button>
					<button class="btn btn-ghost text-[13px]" @click="exportJson">Export</button>
					<button class="btn btn-primary text-[13px]" @click="exportPdf">⬇ Export PDF</button>
					<input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="handleImportFile" />
				</div>


			</div>
		</header>

		<!-- Main: form mirrors resume layout, preview on the right -->
		<main class="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-6 px-4 py-6 lg:min-h-0 lg:grid-cols-[460px_minmax(0,1fr)]">
			<div class="no-print min-w-0 lg:min-h-0 lg:overflow-y-auto">
				<ResumeForm v-model="resume" />
				<p class="mt-3 text-center text-xs text-slate-400 sticky bottom-0 backdrop-blur-md pt-2 pb-1">
					Draft auto-saves in this browser. Use Import / Export to move your resume between
					browsers as a minified JSON file. Export PDF opens the print dialog — choose “Save as
					PDF” with margins set to None for an edge-to-edge A4 file.
				</p>
			</div>

			<div class="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
				<ResumePreview :resume="resume" v-model:template="template" v-model:accent="accent" />
			</div>
		</main>
	</div>
</template>
