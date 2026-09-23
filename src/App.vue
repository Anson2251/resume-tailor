<script setup lang="ts">
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
} from './data/icons'
import ResumeForm from './components/ResumeForm.vue'
import FormNav from './components/FormNav.vue'
import ResumePreview from './components/ResumePreview.vue'
import JobList from './components/JobList.vue'
import AgentPanel from './components/AgentPanel.vue'
import JDViewer from './components/JDViewer.vue'
import { FwbDropdown } from 'flowbite-vue'
import AppSplash from './components/AppSplash.vue'
import SettingsPage from './components/SettingsPage.vue'
import { hydrateAgentSettings, useAgentSettings, useAgentSettingsMutable } from './agent/agentSettings'
import { hydrateProviderSettings, loadProviderSettings } from './agent/providerSettings'
import { ACCENTS, templateFont } from './data/options'
import { SECTION_FACTORY, appendMasterItem, blankCustomItem, isSectionKey, uid } from './data/resume'
import { blankJob, blankWorkspace, buildPreview, cloneJob, migrate, sampleWorkspace } from './data/workspace'
import { resolvePaneViews, type PaneView } from './agent/panes'
import { attachJdPdf, copyJdPdf, loadJdPdf, pruneJdPdfs, referencedJdPdfs } from './agent/jd'
import { isElectron, exportPdfFile, notifyRendererReady, revealInFolder } from './data/persistence'
import { getStore } from './data/store'
import {
	collectSettingsDoc,
	normalizeSettingsDoc,
	persistSettingsNow,
	scheduleSettingsPersist,
	setCurrentTheme,
} from './data/store/settings'
import { migrateWebLegacy } from './data/store/migrate'
import { buildExportZip, parseImportBytes } from './data/transfer'
import type { ContentItem, Job, Profile, ThemeName } from './data/types'

const workspace = reactive(blankWorkspace())
const loaded = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)
const settingsOpen = ref(false)

// Agent identity for the chat panels: remounts them when the configured
// model or behavior changes in the settings page.
const { settings: agentSettings } = useAgentSettings()
const agentKey = computed(() =>
	[agentSettings.provider, agentSettings.modelId, agentSettings.systemPrompt, agentSettings.contextChars].join('|'),
)

// --- Theme (light/dark): app chrome only, the resume page stays light ---
// Persisted inside the merged settings doc (see `data/store/settings.ts`).
const theme = ref<ThemeName>('light')
const isDark = computed(() => theme.value === 'dark')

function applyTheme(value: ThemeName, persist = true): void {
	theme.value = value
	document.documentElement.classList.toggle('dark', value === 'dark')
	document.documentElement.style.colorScheme = value
	setCurrentTheme(value)
	if (persist) scheduleSettingsPersist()
}

function toggleTheme(): void {
	applyTheme(isDark.value ? 'light' : 'dark')
}

function initTheme(stored: unknown): void {
	// index.html already applied the prefers-color-scheme fallback before
	// first paint; mirror whatever it chose instead of flashing.
	const next: ThemeName =
		stored === 'light' || stored === 'dark'
			? stored
			: document.documentElement.classList.contains('dark')
				? 'dark'
				: 'light'
	applyTheme(next, false)
}

const activeJob = computed(() => workspace.jobs.find((j) => j.id === workspace.activeJobId) || workspace.jobs[0])

// Alias: form/preview components consume the Job as a Profile (Job extends Profile).
const activeProfile = computed(() => activeJob.value)

// Dual panes: each hosts Form | Preview | Agent | JD PDF (Form in one pane only).
const paneA = ref<PaneView>('form')
const paneB = ref<PaneView>('preview')

const PANE_LABELS: Record<PaneView, string> = { form: 'Form', preview: 'Preview', agent: 'Agent', jdpdf: 'JD PDF' }

function setPane(which: 'a' | 'b', view: PaneView): void {
	const [a, b] = resolvePaneViews(which === 'a' ? view : paneA.value, which === 'b' ? view : paneB.value)
	paneA.value = a
	paneB.value = b
}

// The preview is derived: master content sliced and ordered by the active profile.
const previewResume = computed(() => buildPreview(workspace.master, activeProfile.value))

// The master job edits the shared content directly (no overrides).
const isMaster = computed(() => activeJob.value?.kind === 'master')

// Template, accent & font are saved per profile.
const template = computed({
	get: (): string => activeProfile.value?.template ?? 'modern',
	set: (value: string) => {
		if (activeProfile.value) activeProfile.value.template = value
	},
})
const accent = computed({
	get: (): string => activeProfile.value?.accent ?? ACCENTS[0],
	set: (value: string) => {
		if (activeProfile.value) activeProfile.value.accent = value
	},
})
// Font falls back to the template's default font until the user picks one.
const font = computed({
	get: (): string => activeProfile.value?.font ?? templateFont(activeProfile.value?.template ?? 'modern'),
	set: (value: string) => {
		if (activeProfile.value) activeProfile.value.font = value
	},
})
const columns = computed({
	get: (): number => activeProfile.value?.columns ?? 1,
	set: (value: number) => {
		if (activeProfile.value) activeProfile.value.columns = value === 2 ? 2 : 1
	},
})
const density = computed({
	get: (): number => activeProfile.value?.density ?? 1,
	set: (value: number) => {
		if (activeProfile.value) activeProfile.value.density = value
	},
})
// Section order / custom names / visibility are saved per profile.
const sections = computed({
	get: () => activeProfile.value?.sections ?? [],
	set: (value) => {
		if (activeProfile.value) activeProfile.value.sections = value
	},
})

async function persistWorkspaceNow(): Promise<void> {
	if (!loaded.value) return
	// jobs is the source of truth; mirror into legacy profiles so old
	// readers stay compatible.
	workspace.profiles.splice(0, workspace.profiles.length, ...workspace.jobs)
	workspace.activeProfileId = workspace.activeJobId
	try {
		await getStore().setDoc('workspace', JSON.parse(JSON.stringify(workspace)))
	} catch {
		/* store write failed — ignore, next save will retry */
	}
}

// One debounced funnel for workspace writes on both platforms, so token
// streaming into a chat draft coalesces instead of hammering the store.
let persistTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist(): void {
	if (!loaded.value) return
	if (persistTimer !== null) clearTimeout(persistTimer)
	persistTimer = setTimeout(() => {
		persistTimer = null
		void persistWorkspaceNow()
	}, 300)
}

async function restore(): Promise<void> {
	const store = getStore()
	let workspaceRaw: unknown | null = null
	let settingsRaw: unknown | null = null
	try {
		workspaceRaw = await store.getDoc('workspace')
		settingsRaw = await store.getDoc('settings')
	} catch {
		workspaceRaw = null
		settingsRaw = null
	}
	if (workspaceRaw === null && settingsRaw === null) {
		// One-time production v2 migration into the unified store.
		try {
			if (isElectron() && window.electronAPI?.db) {
				const legacy = await window.electronAPI.db.migrateLegacy()
				workspaceRaw = legacy.workspace
				// Blob bytes were moved into the store by the main process;
				// refs (`<jobId>.pdf`) stay valid as-is.
				settingsRaw = normalizeSettingsDoc({ theme: legacy.theme, agent: null, providers: null })
			} else {
				const legacy = migrateWebLegacy()
				workspaceRaw = legacy.workspaceRaw
				settingsRaw = legacy.settings
			}
		} catch {
			/* migration best-effort — fall through to defaults */
		}
		if (workspaceRaw !== null) {
			try {
				await store.setDoc('workspace', workspaceRaw)
			} catch {
				/* ignore */
			}
		}
		if (settingsRaw !== null) {
			try {
				await store.setDoc('settings', settingsRaw)
			} catch {
				/* ignore */
			}
		}
	}
	const settings = normalizeSettingsDoc(settingsRaw)
	hydrateAgentSettings(settings.agent)
	hydrateProviderSettings(settings.providers)
	initTheme(settings.theme)
	try {
		const restored = workspaceRaw ? migrate(workspaceRaw) : null
		Object.assign(workspace, restored ?? sampleWorkspace())
	} catch {
		Object.assign(workspace, sampleWorkspace())
	}
}

function loadSample(): void {
	Object.assign(workspace, sampleWorkspace())
}

function clearAll(): void {
	if (!confirm('Clear all resume content and jobs?')) return
	Object.assign(workspace, blankWorkspace())
	void pruneJdPdfs(new Set())
}

// --- Jobs ---

function createJob(payload: { company: string; role: string; file: File | null }) {
	const name = payload.role || payload.company || `Job ${workspace.jobs.length}`
	// A new job starts with all master content shown, and the current
	// title/summary/template/accent/sections as its starting point.
	const job = blankJob(name, workspace.master, {
		template: template.value,
		accent: accent.value,
		font: activeProfile.value.font,
		columns: columns.value,
		density: density.value,
		title: activeProfile.value.title,
		summary: activeProfile.value.summary,
		sections: JSON.parse(JSON.stringify(activeProfile.value.sections ?? [])),
		company: payload.company,
		jobTitleTarget: payload.role,
	})
	workspace.jobs.push(job)
	workspace.profiles.push(job)
	workspace.activeJobId = job.id
	workspace.activeProfileId = job.id
	if (payload.file) {
		void attachJdPdf(job, payload.file).then((res) => {
			if (res.error) alert(res.error)
			else if (res.warning) alert(res.warning)
		})
	}
}

function duplicateJob(id: string) {
	const source = workspace.jobs.find((j) => j.id === id) || activeJob.value
	const copy = cloneJob(source)
	workspace.jobs.push(copy)
	workspace.profiles.push(copy)
	workspace.activeJobId = copy.id
	workspace.activeProfileId = copy.id
	// The clone shares the source's pdfRefId — give it its own blob copy so
	// the two jobs own their bytes independently.
	const refId = source.jdSource?.pdfRefId
	if (refId) {
		void copyJdPdf(copy.id, refId).then((next) => {
			if (copy.jdSource) {
				if (next) copy.jdSource.pdfRefId = next
				else {
					console.warn('[jd] duplicate lost its PDF bytes; re-attach to restore the viewer.')
					copy.jdSource = null
				}
			}
		})
	}
}

function renameJob(id: string) {
	const job = workspace.jobs.find((j) => j.id === id)
	if (!job) return
	const name = prompt(job.kind === 'master' ? 'Rename' : 'Rename job', job.name)
	if (name) job.name = name
}

interface UndoSnapshot {
	jobs: Job[]
	activeJobId: string
}
const undoSnapshot = ref<UndoSnapshot | null>(null)
let undoTimer: ReturnType<typeof setTimeout> | null = null

function removeJob(id: string) {
	const index = workspace.jobs.findIndex((j) => j.id === id)
	const job = workspace.jobs[index]
	if (!job || job.kind === 'master') return
	if (!confirm(`Delete job “${job.name}”? Its tailored view, cover letter and sessions go too.`)) return
	undoSnapshot.value = {
		jobs: JSON.parse(JSON.stringify(workspace.jobs)),
		activeJobId: workspace.activeJobId,
	}
	if (undoTimer !== null) clearTimeout(undoTimer)
	undoTimer = setTimeout(() => {
		undoSnapshot.value = null
		// Undo expired: the removed job can't come back, so its JD bytes are
		// safe to prune when no live job references them.
		void pruneJdPdfs(referencedJdPdfs(workspace.jobs))
	}, 5000)
	workspace.jobs.splice(index, 1)
	workspace.profiles.splice(
		workspace.profiles.findIndex((p) => p.id === id),
		1,
	)
	if (workspace.activeJobId === id) {
		workspace.activeJobId = workspace.jobs[0].id
		workspace.activeProfileId = workspace.jobs[0].id
	}
}

function undoRemove(): void {
	if (!undoSnapshot.value) return
	const snap = undoSnapshot.value
	undoSnapshot.value = null
	if (undoTimer !== null) {
		clearTimeout(undoTimer)
		undoTimer = null
	}
	workspace.jobs.splice(0, workspace.jobs.length, ...snap.jobs)
	workspace.profiles.splice(0, workspace.profiles.length, ...snap.jobs)
	workspace.activeJobId = snap.activeJobId
	workspace.activeProfileId = snap.activeJobId
}

// --- Master items ---

function findItemList(key: string): ContentItem[] | undefined {
	if (isSectionKey(key)) return workspace.master[key]
	return workspace.master.customSections.find((s) => s.id === key)?.items
}

function viewOrderFor(profile: Profile, key: string): string[] | undefined {
	if (isSectionKey(key)) return profile.view[key]
	return profile.view.custom?.[key]
}

function addItem({ key }: { key: string }): void {
	if (isSectionKey(key)) {
		const item = SECTION_FACTORY[key]()
		appendMasterItem(workspace.master, key, item)
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

function removeItem({ key, id }: { key: string; id: string }): void {
	const list = findItemList(key)
	const index = list?.findIndex((item) => item.id === id) ?? -1
	if (index !== -1) list?.splice(index, 1)
	// Remove references from every job so no dangling ids are saved.
	for (const profile of workspace.jobs) {
		const order = viewOrderFor(profile, key)
		const i = order?.indexOf(id) ?? -1
		if (i !== -1) order?.splice(i, 1)
		if (profile.overrides) delete profile.overrides[id]
	}
}

// --- User-created sections ---

function createSection(): void {
	const name = prompt('Name the new section (e.g. “Certifications”)', 'Certifications')
	const title = name?.trim()
	if (!title) return
	const section = { id: uid(), title, items: [blankCustomItem()] }
	workspace.master.customSections.push(section)
	// Every job gets the new section (shown, at the end) under its name.
	for (const profile of workspace.jobs) {
		profile.sections.push({ id: section.id, title, visible: true, direction: 'col' as const })
		const custom = (profile.view.custom ??= {})
		custom[section.id] = section.items.map((item) => item.id)
	}
}

function removeSection(id: string): void {
	const index = workspace.master.customSections.findIndex((s) => s.id === id)
	if (index === -1) return
	const section = workspace.master.customSections[index]
	const itemIds = new Set((section.items || []).map((item) => item.id))
	if (
		!confirm(`Delete section “${section.title || 'Untitled section'}”? This removes it from the master and every job.`)
	)
		return
	workspace.master.customSections.splice(index, 1)
	// Remove references from every job so no dangling ids are saved.
	for (const profile of workspace.jobs) {
		profile.sections = (profile.sections || []).filter((s) => s.id !== id)
		if (profile.view.custom) delete profile.view.custom[id]
		if (profile.overrides) for (const itemId of itemIds) delete profile.overrides[itemId]
	}
}

const overrideCount = computed(() => (isMaster.value ? 0 : Object.keys(activeProfile.value?.overrides || {}).length))

function clearOverrides(): void {
	if (!overrideCount.value) return
	if (!confirm(`Reset all customized fields on “${activeProfile.value.name}” back to master?`)) return
	activeProfile.value.overrides = {}
}

// --- Import / export (self-contained .zip: workspace + settings + JD PDFs) ---

const exportingZip = ref(false)

async function exportZip(): Promise<void> {
	if (exportingZip.value) return
	exportingZip.value = true
	try {
		const refs = referencedJdPdfs(workspace.jobs)
		const blobs: { name: string; data: ArrayBuffer }[] = []
		for (const refId of refs) {
			try {
				const data = await loadJdPdf(refId)
				if (data) blobs.push({ name: refId, data })
			} catch {
				/* skip unreadable blobs — the JD text still exports */
			}
		}
		const bytes = await buildExportZip({ workspace, settings: collectSettingsDoc(), blobs })
		const name = (workspace.master.contact.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase()
		const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/zip' })
		const url = URL.createObjectURL(blob)
		const a = document.createElement('a')
		a.href = url
		a.download = `${name || 'resume'}.resume-tailor.zip`
		document.body.appendChild(a)
		a.click()
		a.remove()
		URL.revokeObjectURL(url)
	} catch (error) {
		console.error('[export] zip failed:', error)
		alert('Could not build the export file. Please try again.')
	} finally {
		exportingZip.value = false
	}
}

function triggerImport(): void {
	fileInput.value?.click()
}

async function handleImportFile(event: Event): Promise<void> {
	const input = event.target as HTMLInputElement | null
	const file = input?.files?.[0]
	if (input) input.value = ''
	if (!file) return
	let parsed
	try {
		parsed = await parseImportBytes(new Uint8Array(await file.arrayBuffer()))
	} catch {
		alert('Could not read that file.')
		return
	}
	if (parsed.kind === 'unrecognized') {
		alert('That file does not look like a Resume Tailor export.')
		return
	}
	// Accepts v2 workspaces, legacy { resume, template, accent } exports, and bare resumes.
	const incoming = migrate(parsed.kind === 'zip' ? parsed.bundle.workspaceRaw : parsed.workspaceRaw)
	if (!incoming) {
		alert('That file does not look like a Resume Tailor export.')
		return
	}
	const jobCount = parsed.kind === 'zip' ? '' : ' (JD PDFs are not part of JSON exports)'
	if (!confirm(`Import workspace from "${file.name}"? Your current content and jobs will be replaced.${jobCount}`))
		return
	if (parsed.kind === 'zip') {
		// Restore embedded PDFs under their referenced ids, then drop any
		// stored blobs the incoming workspace no longer references.
		const store = getStore()
		for (const [refId, bytes] of Object.entries(parsed.bundle.blobs)) {
			try {
				const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
				await store.putBlob(refId, buf)
			} catch {
				/* keep going — the JD text still imports */
			}
		}
		if (parsed.bundle.settingsRaw !== null) {
			const settings = normalizeSettingsDoc(parsed.bundle.settingsRaw)
			hydrateAgentSettings(settings.agent)
			hydrateProviderSettings(settings.providers)
			initTheme(settings.theme)
			void persistSettingsNow()
		}
	}
	Object.assign(workspace, incoming)
	void pruneJdPdfs(referencedJdPdfs(workspace.jobs))
}

function exportPdf(): void {
	const name = (workspace.master.contact.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase()
	if (isElectron()) {
		void exportPdfNative(`${name || 'resume'}.pdf`)
		return
	}
	const prevTitle = document.title
	document.title = name || 'resume'
	window.print()
	document.title = prevTitle
}

const exportingPdf = ref(false)

// Native export (Electron): save dialog + webContents.printToPDF, no print dialog.
async function exportPdfNative(filename: string): Promise<void> {
	if (exportingPdf.value) return
	exportingPdf.value = true
	try {
		const result = await exportPdfFile(filename)
		if (!result) return // fell back — should not happen when isElectron()
		if (result.canceled) return
		if (result.ok && result.path) {
			// Offer a quick way to the file; the save dialog already confirmed it.
			if (confirm(`Saved to ${result.path}\n\nShow in folder?`)) revealInFolder(result.path)
		} else {
			alert('Could not export the PDF. Please try again.')
		}
	} finally {
		exportingPdf.value = false
	}
}

watch(workspace, schedulePersist, { deep: true })

// Settings (theme + agent + provider singletons) share one debounced flush
// into the merged settings doc.
const { settings: mutableAgentSettings } = useAgentSettingsMutable()
const providerSettingsState = loadProviderSettings()
watch([theme, mutableAgentSettings, providerSettingsState], scheduleSettingsPersist, { deep: true })

// Keep the legacy profile pointer aligned when the rail switches jobs.
watch(
	() => workspace.activeJobId,
	(id) => {
		workspace.activeProfileId = id
	},
)

onMounted(async () => {
	try {
		await restore()
	} finally {
		loaded.value = true
	}
	// Write back after migration from an older save.
	void persistWorkspaceNow()
	void persistSettingsNow()
	// Let the Electron main process swap the splash screen for the app window.
	// requestAnimationFrame waits for first paint so the splash never lifts
	// onto a blank window.
	requestAnimationFrame(() => requestAnimationFrame(notifyRendererReady))
})
</script>

<template>
	<AppSplash v-if="!loaded" />
	<div
		v-if="loaded"
		class="flex min-h-screen flex-col bg-slate-100 text-slate-900 lg:h-dvh dark:bg-slate-950 dark:text-slate-100"
	>
		<!-- Top bar -->
		<header
			id="topbar"
			class="no-print sticky top-0 z-10 shrink-0 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90"
		>
			<div class="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
				<div class="mr-auto">
					<h1 class="text-lg font-extrabold tracking-tight">Resume Tailor</h1>
					<p class="text-xs text-slate-500 dark:text-slate-400">One master resume — a tailored view per job.</p>
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
					<button class="btn btn-ghost text-[13px]" :disabled="exportingZip" @click="exportZip">
						<Icon size="16"><DocumentArrowDown16Regular /></Icon> {{ exportingZip ? 'Exporting…' : 'Export' }}
					</button>
					<button class="btn btn-primary text-[13px]" :disabled="exportingPdf" @click="exportPdf">
						<Icon size="16"><ArrowDownload16Regular /></Icon> {{ exportingPdf ? 'Exporting…' : 'Export PDF' }}
					</button>
					<span class="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
					<button
						class="btn btn-ghost px-2.5 text-[13px]"
						title="Agent settings"
						aria-label="Agent settings"
						@click="settingsOpen = true"
					>
						Agent
					</button>
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
						accept=".zip,.json,application/zip,application/json"
						class="hidden"
						@change="handleImportFile"
					/>
				</div>
			</div>
		</header>

		<SettingsPage v-model="settingsOpen" />

		<!-- Anchor rail for the form (fixed to the window) -->
		<FormNav :profile="activeProfile" :master="workspace.master" :accent="accent" />

		<!-- Main: job rail + two panes (Form / Preview / Agent / JD PDF) -->
		<main
			class="mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 gap-6 px-4 py-6 lg:min-h-0 lg:grid-cols-[260px_minmax(0,1fr)_minmax(0,1fr)]"
		>
			<div class="no-print min-w-0 lg:min-h-0 lg:overflow-y-auto">
				<JobList
					v-model="workspace.activeJobId"
					:jobs="workspace.jobs"
					@create="createJob"
					@duplicate="duplicateJob"
					@rename="renameJob"
					@remove="removeJob"
					@clear-overrides="clearOverrides"
				/>
			</div>

			<div class="min-w-0 lg:min-h-0 lg:overflow-y-auto">
				<div class="no-print mb-2 flex items-center gap-2">
					<FwbDropdown close-inside placement="bottom">
						<template #trigger>
							<button type="button" class="btn btn-ghost text-[13px]" title="Switch left pane view">
								{{ PANE_LABELS[paneA] }} ▾
							</button>
						</template>
						<div class="flex min-w-32 flex-col gap-1 p-1">
							<button
								v-for="view in ['form', 'preview', 'agent', 'jdpdf'] as PaneView[]"
								:key="view"
								type="button"
								class="btn btn-ghost justify-start text-[13px] dark:text-slate-200"
								:class="{ 'bg-slate-100 dark:bg-slate-600': paneA === view }"
								@click="setPane('a', view)"
							>
								{{ PANE_LABELS[view] }}
							</button>
						</div>
					</FwbDropdown>
				</div>
				<div v-if="paneA === 'form'">
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
						Show toggles, order, and section layout save per job. Edits on
						<strong class="font-semibold">master</strong> change shared content; elsewhere they're customizations.
						Auto-saves in this browser — Import / Export moves it. PDF: print → “Save as PDF”, margins None.
					</p>
				</div>
				<ResumePreview
					v-else-if="paneA === 'preview'"
					:resume="previewResume"
					v-model:template="template"
					v-model:accent="accent"
					v-model:font="font"
					v-model:columns="columns"
					v-model:density="density"
					v-model:sections="sections"
					@add-section="createSection"
					@delete-section="removeSection"
				/>
				<AgentPanel
					v-else-if="paneA === 'agent'"
					:key="`${activeJob.id}-${agentKey}`"
					:job="activeJob"
					:master="workspace.master"
					@open-settings="settingsOpen = true"
				/>
				<JDViewer v-else :key="activeJob.id" :job="activeJob" />
			</div>

			<div class="min-w-0 lg:flex lg:min-h-0 lg:flex-col">
				<div class="no-print mb-2 flex items-center gap-2">
					<FwbDropdown close-inside placement="bottom" align-to-end>
						<template #trigger>
							<button type="button" class="btn btn-ghost text-[13px]" title="Switch right pane view">
								{{ PANE_LABELS[paneB] }} ▾
							</button>
						</template>
						<div class="flex min-w-32 flex-col gap-1 p-1">
							<button
								v-for="view in ['form', 'preview', 'agent', 'jdpdf'] as PaneView[]"
								:key="view"
								type="button"
								class="btn btn-ghost justify-start text-[13px] dark:text-slate-200"
								:class="{ 'bg-slate-100 dark:bg-slate-600': paneB === view }"
								@click="setPane('b', view)"
							>
								{{ PANE_LABELS[view] }}
							</button>
						</div>
					</FwbDropdown>
				</div>
				<div v-if="paneB === 'form'" class="lg:min-h-0 lg:overflow-y-auto">
					<ResumeForm
						v-model="workspace.master"
						:profile="activeProfile"
						:edit-master="isMaster"
						@add="addItem"
						@remove="removeItem"
					/>
				</div>
				<ResumePreview
					v-else-if="paneB === 'preview'"
					:resume="previewResume"
					v-model:template="template"
					v-model:accent="accent"
					v-model:font="font"
					v-model:columns="columns"
					v-model:density="density"
					v-model:sections="sections"
					@add-section="createSection"
					@delete-section="removeSection"
				/>
				<AgentPanel
					v-else-if="paneB === 'agent'"
					:key="`${activeJob.id}-${agentKey}`"
					:job="activeJob"
					:master="workspace.master"
					@open-settings="settingsOpen = true"
				/>
				<JDViewer v-else :key="activeJob.id" :job="activeJob" />
			</div>
		</main>

		<div
			v-if="undoSnapshot"
			class="no-print fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-xl dark:border-slate-700 dark:bg-slate-900"
		>
			<span class="text-sm">Job deleted.</span>
			<button class="btn btn-primary px-3 py-1 text-sm" @click="undoRemove">Undo</button>
		</div>
	</div>
</template>
