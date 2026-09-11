<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Icon } from '@vicons/utils'
import {
	ArrowDownload16Regular,
	ArrowUpload16Regular,
	Broom16Regular,
	DocumentAdd16Regular,
	DocumentArrowDown16Regular
} from './data/icons.js'
import ResumeForm from './components/ResumeForm.vue'
import ResumePreview from './components/ResumePreview.vue'
import ProfileBar from './components/ProfileBar.vue'
import { ACCENTS, templateFont } from './data/options.js'
import { SECTION_FACTORY } from './data/resume.js'
import {
	LEGACY_STORAGE_KEY,
	STORAGE_KEY,
	blankProfile,
	blankWorkspace,
	buildPreview,
	cloneProfile,
	migrate,
	sampleWorkspace
} from './data/workspace.js'

const workspace = reactive(blankWorkspace())
const loaded = ref(false)
const fileInput = ref(null)

const activeProfile = computed(
	() => workspace.profiles.find((p) => p.id === workspace.activeProfileId) || workspace.profiles[0]
)

// The preview is derived: master content sliced and ordered by the active profile.
const previewResume = computed(() => buildPreview(workspace.master, activeProfile.value))

// The master profile edits the shared content directly (no overrides).
const isMaster = computed(() => activeProfile.value?.master === true)

// Template, accent & font are saved per profile.
const template = computed({
	get: () => activeProfile.value?.template ?? 'modern',
	set: (value) => activeProfile.value && (activeProfile.value.template = value)
})
const accent = computed({
	get: () => activeProfile.value?.accent ?? ACCENTS[0],
	set: (value) => activeProfile.value && (activeProfile.value.accent = value)
})
// Font falls back to the template's default font until the user picks one.
const font = computed({
	get: () => activeProfile.value?.font ?? templateFont(activeProfile.value?.template ?? 'modern'),
	set: (value) => activeProfile.value && (activeProfile.value.font = value)
})
const columns = computed({
	get: () => activeProfile.value?.columns ?? 1,
	set: (value) => activeProfile.value && (activeProfile.value.columns = value)
})

function persist() {
	if (!loaded.value) return
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
	} catch {
		/* storage unavailable — ignore */
	}
}

function restore() {
	try {
		const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(LEGACY_STORAGE_KEY)
		const restored = raw ? migrate(JSON.parse(raw)) : null
		Object.assign(workspace, restored ?? sampleWorkspace())
	} catch {
		Object.assign(workspace, sampleWorkspace())
	}
}

function loadSample() {
	Object.assign(workspace, sampleWorkspace())
}

function clearAll() {
	if (!confirm('Clear all resume content and profiles?')) return
	Object.assign(workspace, blankWorkspace())
}

// --- Profiles ---

function createProfile() {
	const name = prompt('Name this profile (e.g. “Backend roles”)', `Profile ${workspace.profiles.length + 1}`)
	if (!name) return
	// A new profile starts with all master content shown, and the current
	// title/summary/template/accent as its starting point.
	const profile = blankProfile(name, workspace.master, {
		template: template.value,
		accent: accent.value,
		font: activeProfile.value.font,
		columns: columns.value,
		title: activeProfile.value.title,
		summary: activeProfile.value.summary
	})
	workspace.profiles.push(profile)
	workspace.activeProfileId = profile.id
}

function duplicateProfile() {
	const copy = cloneProfile(activeProfile.value)
	workspace.profiles.push(copy)
	workspace.activeProfileId = copy.id
}

function renameProfile() {
	const name = prompt('Rename profile', activeProfile.value.name)
	if (name) activeProfile.value.name = name
}

function removeProfile() {
	if (workspace.profiles.length <= 1) {
		alert('Keep at least one profile.')
		return
	}
	if (!confirm(`Delete profile “${activeProfile.value.name}”?`)) return
	const index = workspace.profiles.findIndex((p) => p.id === workspace.activeProfileId)
	const wasMaster = workspace.profiles[index]?.master
	workspace.profiles.splice(index, 1)
	// The master profile may be deleted; the first remaining profile takes over.
	if (wasMaster) workspace.profiles[0].master = true
	workspace.activeProfileId = workspace.profiles[0].id
}

// --- Master items ---

function addItem({ key }) {
	const item = SECTION_FACTORY[key]()
	workspace.master[key].push(item)
	// Show the new item on the active profile, at the end of the section.
	activeProfile.value.view[key].push(item.id)
}

function removeItem({ key, id }) {
	const list = workspace.master[key]
	const index = list.findIndex((item) => item.id === id)
	if (index !== -1) list.splice(index, 1)
	// Remove references from every profile so no dangling ids are saved.
	for (const profile of workspace.profiles) {
		const order = profile.view[key]
		const i = order.indexOf(id)
		if (i !== -1) order.splice(i, 1)
		if (profile.overrides) delete profile.overrides[id]
	}
}

const overrideCount = computed(() =>
	isMaster.value ? 0 : Object.keys(activeProfile.value?.overrides || {}).length
)

function clearOverrides() {
	if (!overrideCount.value) return
	if (!confirm(`Reset all customized fields on “${activeProfile.value.name}” back to master?`)) return
	activeProfile.value.overrides = {}
}

// --- Import / export ---

function exportJson() {
	const data = JSON.stringify(workspace)
	const name = (workspace.master.contact.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase()
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
	// Accepts v2 workspaces, legacy { resume, template, accent } exports, and bare resumes.
	const incoming = migrate(parsed)
	if (!incoming) {
		alert('That file does not look like a Resume Tailor export.')
		return
	}
	if (!confirm(`Import workspace from "${file.name}"? Your current content and profiles will be replaced.`)) return
	Object.assign(workspace, incoming)
}

function exportPdf() {
	const name = (workspace.master.contact.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase()
	const prevTitle = document.title
	document.title = name || 'resume'
	window.print()
	document.title = prevTitle
}

watch(workspace, persist, { deep: true })

onMounted(() => {
	restore()
	loaded.value = true
	persist() // write back after migration from an older save
})
</script>

<template>
	<div class="flex min-h-screen flex-col bg-slate-100 text-slate-900 lg:h-dvh">
		<!-- Top bar -->
		<header class="no-print sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur">
			<div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
				<div class="mr-auto">
					<h1 class="text-lg font-extrabold tracking-tight">Resume Tailor</h1>
					<p class="text-xs text-slate-500">One master resume — a tailored view per profile.</p>
				</div>

				<div class="flex items-center gap-2">
					<button class="btn btn-ghost text-[13px]" @click="loadSample">
						<Icon size="16"><DocumentAdd16Regular /></Icon> Load sample
					</button>
					<button class="btn btn-ghost text-[13px]" @click="clearAll">
						<Icon size="16"><Broom16Regular /></Icon> Clear
					</button>
					<button class="btn btn-ghost text-[13px]" @click="triggerImport">
						<Icon size="16"><ArrowUpload16Regular /></Icon> Import
					</button>
					<button class="btn btn-ghost text-[13px]" @click="exportJson">
						<Icon size="16"><DocumentArrowDown16Regular /></Icon> Export
					</button>
					<button class="btn btn-primary text-[13px]" @click="exportPdf">
						<Icon size="16"><ArrowDownload16Regular /></Icon> Export PDF
					</button>
					<input ref="fileInput" type="file" accept=".json,application/json" class="hidden" @change="handleImportFile" />
				</div>
			</div>

			<!-- Profile switcher -->
			<div class="mx-auto w-full max-w-[1400px] border-t border-slate-100 px-4 py-2">
				<ProfileBar
					v-model="workspace.activeProfileId"
					:profiles="workspace.profiles"
					:accent="accent"
					:override-count="overrideCount"
					@create="createProfile"
					@duplicate="duplicateProfile"
					@rename="renameProfile"
					@remove="removeProfile"
					@clear-overrides="clearOverrides"
				/>
			</div>
		</header>

		<!-- Main: form mirrors resume layout, preview on the right -->
		<main class="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-6 px-4 py-6 lg:min-h-0 lg:grid-cols-[460px_minmax(0,1fr)]">
			<div class="no-print min-w-0 lg:min-h-0 lg:overflow-y-auto">
				<ResumeForm
					v-model="workspace.master"
					:profile="activeProfile"
					:edit-master="isMaster"
					@add="addItem"
					@remove="removeItem"
				/>
				<p class="mt-3 text-center text-xs text-slate-400 sticky bottom-0 backdrop-blur-md pt-2 pb-1">
					Show toggles and ↑/↓ order are saved per profile. Editing item content on the
					<strong class="font-semibold">master</strong> profile changes the shared content; on other profiles it is a
					per-profile customization. Everything auto-saves in this browser — use Import / Export to move it
					between browsers. Export PDF opens the print dialog — choose “Save as PDF” with margins set to
					None for an edge-to-edge A4 file.
				</p>
			</div>

			<div class="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
				<ResumePreview
					:resume="previewResume"
					v-model:template="template"
					v-model:accent="accent"
					v-model:font="font"
					v-model:columns="columns"
				/>
			</div>
		</main>
	</div>
</template>
