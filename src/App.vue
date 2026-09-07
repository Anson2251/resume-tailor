<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import ResumeForm from './components/ResumeForm.vue'
import ResumePreview from './components/ResumePreview.vue'
import { STORAGE_KEY, blankResume, sampleResume } from './data/resume.js'

const TEMPLATES = [
	{ id: 'modern', name: 'Modern', hint: 'Accent header + sidebar' },
	{ id: 'classic', name: 'Classic', hint: 'Centered serif' },
	{ id: 'minimal', name: 'Minimal', hint: 'Airy + hairlines' }
]

const ACCENTS = ['#4f46e5', '#0f766e', '#1e3a5f', '#b45309', '#be123c', '#334155']

const resume = reactive(blankResume())
const template = ref('modern')
const accent = ref(ACCENTS[0])
const loaded = ref(false)

function persist() {
	if (!loaded.value) return
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify({ resume, template: template.value, accent: accent.value }))
	} catch {
		/* storage unavailable — ignore */
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
		if (parsed.resume) Object.assign(resume, parsed.resume)
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
	<div class="flex min-h-screen flex-col bg-slate-100 text-slate-900 lg:h-dvh lg:overflow-hidden">
		<!-- Top bar -->
		<header class="no-print sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
			<div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
				<div class="mr-auto">
					<h1 class="text-lg font-extrabold tracking-tight">Resume Tailor</h1>
					<p class="text-xs text-slate-500">Fill the form on the left — the resume updates live.</p>
				</div>

				<!-- Template switcher -->
				<div class="flex items-center gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Resume template">
					<button
						v-for="t in TEMPLATES"
						:key="t.id"
						:title="t.hint"
						class="btn px-3 py-1.5 text-[13px]"
						:class="template === t.id ? 'bg-white font-semibold text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'"
						@click="template = t.id"
					>
						{{ t.name }}
					</button>
				</div>

				<!-- Accent picker -->
				<div class="flex items-center gap-1.5" aria-label="Accent color">
					<button
						v-for="c in ACCENTS"
						:key="c"
						:title="c"
						class="h-6 w-6 rounded-full ring-2 ring-offset-2 transition"
						:class="accent === c ? 'ring-slate-400' : 'ring-transparent hover:ring-slate-300'"
						:style="{ backgroundColor: c }"
						@click="accent = c"
					/>
				</div>

				<div class="flex items-center gap-2">
					<button class="btn btn-ghost text-[13px]" @click="loadSample">Load sample</button>
					<button class="btn btn-ghost text-[13px]" @click="clearAll">Clear</button>
					<button class="btn btn-primary text-[13px]" @click="exportPdf">⬇ Export PDF</button>
				</div>
			</div>
		</header>

		<!-- Main: form mirrors resume layout, preview on the right -->
		<main class="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-6 px-4 py-6 lg:min-h-0 lg:grid-cols-[460px_minmax(0,1fr)]">
			<div class="no-print min-w-0 lg:min-h-0 lg:overflow-y-auto">
				<ResumeForm v-model="resume" />
				<p class="mt-3 text-center text-xs text-slate-400 sticky bottom-0 backdrop-blur-md pt-2 pb-1">
					Draft auto-saves in this browser. Export PDF opens the print dialog — choose “Save as
					PDF” with margins set to None for an edge-to-edge A4 file.
				</p>
			</div>

			<div class="min-w-0 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
				<ResumePreview :resume="resume" :template="template" :accent="accent" />
			</div>
		</main>
	</div>
</template>
