<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Icon } from '@vicons/utils'
import {
	ArrowDownload16Regular,
	ArrowUpload16Regular,
	Broom16Regular,
	DocumentAdd16Regular,
	DocumentArrowDown16Regular,
	WeatherMoon16Regular,
	WeatherSunny16Regular,
} from './data/icons.js'
import ResumeForm from './components/ResumeForm.vue'
import FormNav from './components/FormNav.vue'
import ResumePreview from './components/ResumePreview.vue'
import ProfileBar from './components/ProfileBar.vue'
import { ACCENTS, templateFont } from './data/options.js'
import { SECTION_FACTORY, SECTION_KEYS, blankCustomItem, uid } from './data/resume.js'
import {
	LEGACY_STORAGE_KEY,
	STORAGE_KEY,
	blankProfile,
	blankWorkspace,
	buildPreview,
	cloneProfile,
	migrate,
	sampleWorkspace,
} from './data/workspace.js'

const workspace = reactive(blankWorkspace())
const loaded = ref(false)
const fileInput = ref(null)

// --- Theme (light/dark): app chrome only, the resume page stays light ---
const THEME_KEY = 'resume-tailor-theme'
const theme = ref('light')
const isDark = computed(() => theme.value === 'dark')

function applyTheme(value) {
	theme.value = value
	document.documentElement.classList.toggle('dark', value === 'dark')
	document.documentElement.style.colorScheme = value
	try {
		localStorage.setItem(THEME_KEY, value)
	} catch {
		/* storage unavailable — ignore */
	}
}

function toggleTheme() {
	applyTheme(isDark.value ? 'light' : 'dark')
}

function initTheme() {
	let stored = null
	try {
		stored = localStorage.getItem(THEME_KEY)
	} catch {
		/* storage unavailable — fall back to the pre-paint class */
	}
	if (stored !== 'light' && stored !== 'dark') {
		// index.html already applied the prefers-color-scheme fallback before
		// first paint; mirror whatever it chose instead of flashing.
		stored = document.documentElement.classList.contains('dark') ? 'dark' : 'light'
	}
	applyTheme(stored)
}

const activeProfile = computed(
	() => workspace.profiles.find((p) => p.id === workspace.activeProfileId) || workspace.profiles[0],
)

// The preview is derived: master content sliced and ordered by the active profile.
const previewResume = computed(() => buildPreview(workspace.master, activeProfile.value))

// The master profile edits the shared content directly (no overrides).
const isMaster = computed(() => activeProfile.value?.master === true)

// Template, accent & font are saved per profile.
const template = computed({
	get: () => activeProfile.value?.template ?? 'modern',
	set: (value) => activeProfile.value && (activeProfile.value.template = value),
})
const accent = computed({
	get: () => activeProfile.value?.accent ?? ACCENTS[0],
	set: (value) => activeProfile.value && (activeProfile.value.accent = value),
})
// Font falls back to the template's default font until the user picks one.
const font = computed({
	get: () => activeProfile.value?.font ?? templateFont(activeProfile.value?.template ?? 'modern'),
	set: (value) => activeProfile.value && (activeProfile.value.font = value),
})
const columns = computed({
	get: () => activeProfile.value?.columns ?? 1,
	set: (value) => activeProfile.value && (activeProfile.value.columns = value),
})
// Section order / custom names / visibility are saved per profile.
const sections = computed({
	get: () => activeProfile.value?.sections ?? [],
	set: (value) => activeProfile.value && (activeProfile.value.sections = value),
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
	// title/summary/template/accent/sections as its starting point.
	const profile = blankProfile(name, workspace.master, {
		template: template.value,
		accent: accent.value,
		font: activeProfile.value.font,
		columns: columns.value,
		title: activeProfile.value.title,
		summary: activeProfile.value.summary,
		sections: JSON.parse(JSON.stringify(activeProfile.value.sections ?? [])),
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

function findItemList(key) {
	if (SECTION_KEYS.includes(key)) return workspace.master[key]
	return workspace.master.customSections.find((s) => s.id === key)?.items
}

function viewOrderFor(profile, key) {
	if (SECTION_KEYS.includes(key)) return profile.view[key]
	return profile.view.custom?.[key]
}

function addItem({ key }) {
	if (SECTION_KEYS.includes(key)) {
		const item = SECTION_FACTORY[key]()
		workspace.master[key].push(item)
		// Show the new item on the active profile, at the end of the section.
		activeProfile.value.view[key].push(item.id)
		return
	}
	const section = workspace.master.customSections.find((s) => s.id === key)
	if (!section) return
	const item = blankCustomItem()
	section.items.push(item)
	// Show the new item on the active profile, at the end of the section.
	const custom = (activeProfile.value.view.custom ??= {})
	;(custom[key] ??= []).push(item.id)
}

function removeItem({ key, id }) {
	const list = findItemList(key)
	const index = list?.findIndex((item) => item.id === id) ?? -1
	if (index !== -1) list.splice(index, 1)
	// Remove references from every profile so no dangling ids are saved.
	for (const profile of workspace.profiles) {
		const order = viewOrderFor(profile, key)
		const i = order?.indexOf(id) ?? -1
		if (i !== -1) order.splice(i, 1)
		if (profile.overrides) delete profile.overrides[id]
	}
}

// --- User-created sections ---

function createSection() {
	const name = prompt('Name the new section (e.g. “Certifications”)', 'Certifications')
	const title = name?.trim()
	if (!title) return
	const section = { id: uid(), title, items: [blankCustomItem()] }
	workspace.master.customSections.push(section)
	// Every profile gets the new section (shown, at the end) under its name.
	for (const profile of workspace.profiles) {
		profile.sections.push({ id: section.id, title, visible: true })
		const custom = (profile.view.custom ??= {})
		custom[section.id] = section.items.map((item) => item.id)
	}
}

function removeSection(id) {
	const index = workspace.master.customSections.findIndex((s) => s.id === id)
	if (index === -1) return
	const section = workspace.master.customSections[index]
	const itemIds = new Set((section.items || []).map((item) => item.id))
	if (
		!confirm(
			`Delete section “${section.title || 'Untitled section'}”? This removes it from the master and every profile.`,
		)
	)
		return
	workspace.master.customSections.splice(index, 1)
	// Remove references from every profile so no dangling ids are saved.
	for (const profile of workspace.profiles) {
		profile.sections = (profile.sections || []).filter((s) => s.id !== id)
		if (profile.view.custom) delete profile.view.custom[id]
		if (profile.overrides) for (const itemId of itemIds) delete profile.overrides[itemId]
	}
}

const overrideCount = computed(() => (isMaster.value ? 0 : Object.keys(activeProfile.value?.overrides || {}).length))

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
	initTheme()
	restore()
	loaded.value = true
	persist() // write back after migration from an older save
})
</script>

<template>
	<div class="flex min-h-screen flex-col bg-slate-100 text-slate-900 lg:h-dvh dark:bg-slate-950 dark:text-slate-100">
		<!-- Top bar -->
		<header
			id="topbar"
			class="no-print sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
		>
			<div class="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
				<div class="mr-auto">
					<h1 class="text-lg font-extrabold tracking-tight">Resume Tailor</h1>
					<p class="text-xs text-slate-500 dark:text-slate-400">One master resume — a tailored view per profile.</p>
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
					<span class="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
					<button
						class="btn btn-ghost px-2.5"
						:title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
						:aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
						@click="toggleTheme"
					>
						<Icon size="16"><component :is="isDark ? WeatherSunny16Regular : WeatherMoon16Regular" /></Icon>
					</button>
					<a
						class="btn btn-ghost px-2.5"
						href="https://github.com/Anson2251/resume-tailor"
						target="_blank"
						rel="noopener noreferrer"
						title="View on GitHub"
						aria-label="View on GitHub"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
							/>
						</svg>
					</a>
					<input
						ref="fileInput"
						type="file"
						accept=".json,application/json"
						class="hidden"
						@change="handleImportFile"
					/>
				</div>
			</div>

			<!-- Profile switcher -->
			<div class="mx-auto w-full max-w-[1400px] border-t border-slate-100 px-4 py-2 dark:border-slate-800">
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

		<!-- Anchor rail for the form (fixed to the window) -->
		<FormNav :profile="activeProfile" :master="workspace.master" :accent="accent" />

		<!-- Main: form mirrors resume layout, preview on the right -->
		<main
			class="mx-auto grid w-full max-w-[1400px] flex-1 grid-cols-1 gap-6 px-4 py-6 lg:min-h-0 lg:grid-cols-[460px_minmax(0,1fr)]"
		>
			<div class="no-print min-w-0 lg:min-h-0 lg:overflow-y-auto">
				<ResumeForm
					v-model="workspace.master"
					:profile="activeProfile"
					:edit-master="isMaster"
					@add="addItem"
					@remove="removeItem"
				/>
				<p
					class="mt-3 text-center text-xs text-slate-400 sticky bottom-0 backdrop-blur-md pt-2 pb-1 dark:text-slate-500"
				>
					Show toggles and ↑/↓ order are saved per profile, as is the section order/names in the Sections panel — the
					form follows the same order. Editing item content on the
					<strong class="font-semibold">master</strong> profile changes the shared content; on other profiles it is a
					per-profile customization. Everything auto-saves in this browser — use Import / Export to move it between
					browsers. Export PDF opens the print dialog — choose “Save as PDF” with margins set to None for an
					edge-to-edge A4 file. None for an edge-to-edge A4 file.
				</p>
			</div>

			<div class="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
				<ResumePreview
					:resume="previewResume"
					v-model:template="template"
					v-model:accent="accent"
					v-model:font="font"
					v-model:columns="columns"
					v-model:sections="sections"
					@add-section="createSection"
					@delete-section="removeSection"
				/>
			</div>
		</main>
	</div>
</template>
