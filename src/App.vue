<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { Icon } from '@vicons/utils'
import {
	ArrowDownload16Regular,
	ArrowUpload16Regular,
	Broom16Regular,
	ChevronLeft16Regular,
	ChevronRight16Regular,
	DocumentAdd16Regular,
	DocumentArrowDown16Regular,
	Settings16Regular,
	WeatherMoon16Regular,
	WeatherSunny16Regular,
} from './data/icons'
import ResumeForm from './components/ResumeForm.vue'
import CoverLetterForm from './components/CoverLetterForm.vue'
import LetterPreview from './components/LetterPreview.vue'
import FormNav from './components/FormNav.vue'
import ResumePreview from './components/ResumePreview.vue'
import JobList from './components/JobList.vue'
import AgentPanel from './components/AgentPanel.vue'
import JDViewer from './components/JDViewer.vue'
import NotebookPanel from './components/NotebookPanel.vue'
import { FwbButton, FwbButtonGroup, FwbDropdown, FwbModal } from 'flowbite-vue'
import AppSplash from './components/AppSplash.vue'
import DialogHost from './components/DialogHost.vue'
import ResumeStackIconSmall from './components/icons/ResumeStackIconSmall.vue'
import SettingsPage from './components/SettingsPage.vue'
import { confirmDialog, notifyDialog, promptDialog } from './data/dialogs'
import { hydrateAgentSettings, useAgentSettings, useAgentSettingsMutable } from './agent/agentSettings'
import { hydrateProviderSettings, loadProviderSettings } from './agent/providerSettings'
import { ACCENTS, templateFont } from './data/options'
import { SECTION_FACTORY, appendMasterItem, blankCustomItem, isSectionKey, uid } from './data/resume'
import { blankJob, blankWorkspace, buildPreview, cloneJob, migrate, sampleWorkspace } from './data/workspace'
import { resolvePaneViews, syncPreviewTabs, type PaneView, type PreviewTab } from './agent/panes'
import { attachJdPdf, copyJdPdf, loadJdPdf, pruneJdPdfs, referencedJdPdfs } from './agent/jd'
import { isElectron, exportPdfFile, notifyRendererReady, openExternalUrl, revealInFolder } from './data/persistence'
import { getStore } from './data/store'
import {
	collectSettingsDoc,
	isFairUseAcknowledged,
	normalizeSettingsDoc,
	persistSettingsNow,
	scheduleSettingsPersist,
	setCurrentTheme,
	setFairUseAcknowledged,
} from './data/store/settings'
import { FAIR_USE_BODY, FAIR_USE_TITLE } from './data/fairUse'
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
const agentKey = computed(() => [agentSettings.provider, agentSettings.modelId, agentSettings.systemPrompt].join('|'))

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

const GITHUB_URL = 'https://github.com/Anson2251/resume-tailor'

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

// Dual panes: each hosts Resume | Preview | Cover letter | Agent | JD PDF (Resume form in one pane only).
const paneA = ref<PaneView>('form')
const paneB = ref<PaneView>('preview')

// --- Collapsible profile rail + resizable split ---
// railCollapsed hides the left JobList column; splitPct is pane A's share (%)
// of the remaining two-pane area on large screens (stacked vertically on mobile).
const railCollapsed = ref(false)
const splitPct = ref(50)
const panesRef = ref<HTMLElement | null>(null)
const draggingSplit = ref(false)

function toggleRail(force?: boolean): void {
	railCollapsed.value = force ?? !railCollapsed.value
	try {
		localStorage.setItem('rt:railCollapsed', railCollapsed.value ? '1' : '0')
	} catch {
		/* private mode: layout pref just won't persist */
	}
}

function clampSplit(pct: number): number {
	return Math.min(80, Math.max(20, pct))
}

function setSplitFromClientX(clientX: number): void {
	const el = panesRef.value
	if (!el) return
	const rect = el.getBoundingClientRect()
	if (rect.width <= 0) return
	splitPct.value = clampSplit(((clientX - rect.left) / rect.width) * 100)
}

function startSplitDrag(event: PointerEvent): void {
	// Only the primary button starts a drag; keyboard users get arrows instead.
	if (event.button !== 0) return
	event.preventDefault()
	draggingSplit.value = true
	setSplitFromClientX(event.clientX)
	const target = event.currentTarget as HTMLElement | null
	target?.setPointerCapture?.(event.pointerId)
	const onMove = (e: PointerEvent): void => setSplitFromClientX(e.clientX)
	const onUp = (): void => {
		draggingSplit.value = false
		window.removeEventListener('pointermove', onMove)
		window.removeEventListener('pointerup', onUp)
		window.removeEventListener('pointercancel', onUp)
		try {
			localStorage.setItem('rt:splitPct', String(Math.round(splitPct.value)))
		} catch {
			/* ignore */
		}
	}
	window.addEventListener('pointermove', onMove)
	window.addEventListener('pointerup', onUp)
	window.addEventListener('pointercancel', onUp)
}

function resetSplit(): void {
	splitPct.value = 50
	try {
		localStorage.setItem('rt:splitPct', '50')
	} catch {
		/* ignore */
	}
}

function nudgeSplit(delta: number): void {
	splitPct.value = clampSplit(splitPct.value + delta)
	try {
		localStorage.setItem('rt:splitPct', String(Math.round(splitPct.value)))
	} catch {
		/* ignore */
	}
}

function restoreLayoutPrefs(): void {
	try {
		railCollapsed.value = localStorage.getItem('rt:railCollapsed') === '1'
		const raw = Number(localStorage.getItem('rt:splitPct'))
		if (Number.isFinite(raw)) splitPct.value = clampSplit(raw)
	} catch {
		/* ignore */
	}
}

// The preview pane hosts a Resume | Cover letter tab; each pane remembers its own tab.
// When both panes preview, they stay on alternative views (see syncPreviewTabs).
const previewTabA = ref<PreviewTab>('resume')
const previewTabB = ref<PreviewTab>('resume')

function setPreviewTab(which: 'a' | 'b', tab: PreviewTab): void {
	const [nextA, nextB] = syncPreviewTabs(
		paneA.value,
		paneB.value,
		which === 'a' ? tab : previewTabA.value,
		which === 'b' ? tab : previewTabB.value,
		which,
	)
	previewTabA.value = nextA
	previewTabB.value = nextB
}

/** Jump to the letter for review: prefer the preview tab, else open the letter form. */
function revealLetter(which: 'a' | 'b'): void {
	if (paneA.value === 'preview') {
		setPreviewTab('a', 'letter')
		return
	}
	if (paneB.value === 'preview') {
		setPreviewTab('b', 'letter')
		return
	}
	setPane(which, 'letter')
}

const PANE_LABELS: Record<PaneView, string> = {
	form: 'Resume',
	preview: 'Preview',
	letter: 'Cover letter',
	agent: 'Agent',
	jdpdf: 'JD PDF',
	notes: 'Notebook',
}

function setPane(which: 'a' | 'b', view: PaneView): void {
	const [a, b] = resolvePaneViews(which === 'a' ? view : paneA.value, which === 'b' ? view : paneB.value)
	paneA.value = a
	paneB.value = b
	// Keep the untouched pane's tab so the existing preview doesn't jump.
	const [tabA, tabB] = syncPreviewTabs(a, b, previewTabA.value, previewTabB.value, which === 'a' ? 'b' : 'a')
	previewTabA.value = tabA
	previewTabB.value = tabB
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
	setFairUseAcknowledged(settings.fairUseAcknowledged)
	initTheme(settings.theme)
	try {
		const restored = workspaceRaw ? migrate(workspaceRaw) : null
		Object.assign(workspace, restored ?? sampleWorkspace())
	} catch {
		Object.assign(workspace, sampleWorkspace())
	}
}

function loadSample(): void {
	void confirmDialog({
		title: 'Load sample workspace?',
		body: 'Your current content and jobs will be replaced by the sample data.',
		confirmLabel: 'Load sample',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		Object.assign(workspace, sampleWorkspace())
	})
}

function clearAll(): void {
	void confirmDialog({
		title: 'Clear everything?',
		body: 'This removes all resume content and jobs.',
		confirmLabel: 'Clear',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		Object.assign(workspace, blankWorkspace())
		void pruneJdPdfs(new Set())
	})
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
			if (res.error) void notifyDialog({ title: 'Could not attach JD', body: res.error })
			else if (res.warning) void notifyDialog({ title: 'JD attached with a warning', body: res.warning })
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

function renameJob(id: string): void {
	const job = workspace.jobs.find((j) => j.id === id)
	if (!job) return
	void promptDialog({
		title: job.kind === 'master' ? 'Rename' : 'Rename job',
		label: '',
		initial: job.name,
		maxLength: 120,
		confirmLabel: 'Rename',
	}).then((name) => {
		if (name) job.name = name
	})
}

interface UndoSnapshot {
	jobs: Job[]
	activeJobId: string
}
const undoSnapshot = ref<UndoSnapshot | null>(null)
let undoTimer: ReturnType<typeof setTimeout> | null = null

function removeJob(id: string): void {
	const index = workspace.jobs.findIndex((j) => j.id === id)
	const job = workspace.jobs[index]
	if (!job || job.kind === 'master') return
	void confirmDialog({
		title: `Delete job “${job.name}”?`,
		body: 'Its tailored view, cover letter and sessions go too. You can undo for 5 seconds.',
		confirmLabel: 'Delete',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		removeJobNow(index, id)
	})
}

function removeJobNow(index: number, id: string): void {
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
	void promptDialog({
		title: 'New section',
		label: 'Name the new section (e.g. “Certifications”)',
		initial: 'Certifications',
		maxLength: 60,
		confirmLabel: 'Create',
	}).then((title) => {
		if (!title) return
		const section = { id: uid(), title, items: [blankCustomItem()] }
		workspace.master.customSections.push(section)
		// Every job gets the new section (shown, at the end) under its name.
		for (const profile of workspace.jobs) {
			profile.sections.push({ id: section.id, title, visible: true, direction: 'col' as const })
			const custom = (profile.view.custom ??= {})
			custom[section.id] = section.items.map((item) => item.id)
		}
	})
}

function removeSection(id: string): void {
	const index = workspace.master.customSections.findIndex((s) => s.id === id)
	if (index === -1) return
	const section = workspace.master.customSections[index]
	const itemIds = new Set((section.items || []).map((item) => item.id))
	void confirmDialog({
		title: `Delete section “${section.title || 'Untitled section'}”?`,
		body: 'This removes it from the master and every job.',
		confirmLabel: 'Delete',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		removeSectionNow(index, id, itemIds)
	})
}

function removeSectionNow(index: number, id: string, itemIds: Set<string>): void {
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
	void confirmDialog({
		title: `Reset customizations on “${activeProfile.value.name}”?`,
		body: 'All customized fields go back to master wording.',
		confirmLabel: 'Reset',
		danger: true,
	}).then((ok) => {
		if (!ok) return
		activeProfile.value.overrides = {}
	})
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
		void notifyDialog({ title: 'Export failed', body: 'Could not build the export file. Please try again.' })
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
		void notifyDialog({ title: 'Import failed', body: 'Could not read that file.' })
		return
	}
	if (parsed.kind === 'unrecognized') {
		void notifyDialog({ title: 'Import failed', body: 'That file does not look like a Resume Tailor export.' })
		return
	}
	// Accepts v2 workspaces, legacy { resume, template, accent } exports, and bare resumes.
	const incoming = migrate(parsed.kind === 'zip' ? parsed.bundle.workspaceRaw : parsed.workspaceRaw)
	if (!incoming) {
		void notifyDialog({ title: 'Import failed', body: 'That file does not look like a Resume Tailor export.' })
		return
	}
	const jobCount = parsed.kind === 'zip' ? '' : ' (JD PDFs are not part of JSON exports)'
	const ok = await confirmDialog({
		title: `Import workspace from “${file.name}”?`,
		body: `Your current content and jobs will be replaced.${jobCount}`,
		confirmLabel: 'Import',
		danger: true,
	})
	if (!ok) return
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
	const docs = visibleDocs()
	if (docs.length === 0) {
		void notifyDialog({
			title: 'Nothing to export',
			body: 'Switch a pane to Preview — Resume or Cover letter tab — and review the document before exporting.',
		})
		return
	}
	if (docs.length === 2) {
		exportChoiceOpen.value = true
		return
	}
	doExport(docs[0])
}

type ExportDoc = 'resume' | 'letter'

/** Which documents have a preview on screen right now. */
function visibleDocs(): ExportDoc[] {
	const shows = (pane: PaneView, tab: PreviewTab): ExportDoc | null => (pane === 'preview' ? tab : null)
	const tabs = [shows(paneA.value, previewTabA.value), shows(paneB.value, previewTabB.value)]
	const docs: ExportDoc[] = []
	if (tabs.includes('resume')) docs.push('resume')
	if (tabs.includes('letter')) docs.push('letter')
	return docs
}

const exportChoiceOpen = ref(false)

function slugName(): string {
	return (workspace.master.contact.fullName || 'resume').trim().replace(/\s+/g, '-').toLowerCase() || 'resume'
}

/** Print only the chosen document (print CSS filters on body[data-print-doc]). */
function doExport(doc: ExportDoc): void {
	exportChoiceOpen.value = false
	const name = slugName()
	document.body.dataset.printDoc = doc
	if (isElectron()) {
		void exportPdfNative(doc === 'letter' ? `${name}-cover-letter.pdf` : `${name}.pdf`).finally(() => {
			delete document.body.dataset.printDoc
		})
		return
	}
	const prevTitle = document.title
	document.title = doc === 'letter' ? `${name}-cover-letter` : name
	window.print()
	document.title = prevTitle
	// afterprint (registered on mount) clears the dataset for the web flow.
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
			const show = await confirmDialog({
				title: `Saved to ${result.path}`,
				body: 'Show the file in its folder?',
				confirmLabel: 'Show in folder',
			})
			if (show) revealInFolder(result.path)
		} else {
			void notifyDialog({ title: 'Export failed', body: 'Could not export the PDF. Please try again.' })
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
	restoreLayoutPrefs()
	window.addEventListener('afterprint', () => {
		delete document.body.dataset.printDoc
	})
	try {
		await restore()
	} finally {
		loaded.value = true
	}
	// Write back after migration from an older save.
	void persistWorkspaceNow()
	void persistSettingsNow()
	if (!isFairUseAcknowledged()) {
		// First run: the dialog host only exists after first paint, so wait
		// a frame before queueing the notice.
		await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		await notifyDialog({ title: FAIR_USE_TITLE, body: FAIR_USE_BODY, markdown: true })
		setFairUseAcknowledged(true)
		scheduleSettingsPersist()
	}
	// Let the Electron main process swap the splash screen for the app window.
	// requestAnimationFrame waits for first paint so the splash never lifts
	// onto a blank window.
	requestAnimationFrame(() => requestAnimationFrame(notifyRendererReady))
})
</script>

<template>
	<AppSplash v-if="!loaded" />
	<div v-if="loaded" class="flex min-h-screen flex-col bg-neutral-secondary text-heading lg:h-dvh">
		<!-- Top bar -->
		<header
			id="topbar"
			class="no-print sticky top-0 z-10 shrink-0 border-b border-default bg-neutral-primary/90 backdrop-blur"
		>
			<div class="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
				<div class="mr-auto">
    				<div class="flex flex-row" id="title-row">
                        <ResumeStackIconSmall :size="28" aria-hidden="true" />
    					<h1 class="text-lg font-extrabold tracking-tight pl-2">Resume Tailor</h1>
                    </div>
					<p class="text-xs text-body-subtle">One master resume — a tailored view per job.</p>
				</div>

				<div class="flex items-center gap-2">
					<FwbButtonGroup>
						<FwbButton size="sm" outline @click="loadSample">
							<template #prefix
								><Icon size="16"><DocumentAdd16Regular /></Icon
							></template>
							Load sample
						</FwbButton>
						<FwbButton size="sm" outline @click="clearAll">
							<template #prefix
								><Icon size="16"><Broom16Regular /></Icon
							></template>
							Clear
						</FwbButton>
						<FwbButton size="sm" outline @click="triggerImport">
							<template #prefix
								><Icon size="16"><ArrowUpload16Regular /></Icon
							></template>
							Import
						</FwbButton>
						<FwbButton size="sm" outline :disabled="exportingZip" @click="exportZip">
							<template #prefix
								><Icon size="16"><DocumentArrowDown16Regular /></Icon> </template
							>{{ exportingZip ? 'Exporting…' : 'Export' }}
						</FwbButton>
					</FwbButtonGroup>
					<FwbButton size="sm" :disabled="exportingPdf" @click="exportPdf">
						<template #prefix
							><Icon size="16"><ArrowDownload16Regular /></Icon
						></template>
						{{ exportingPdf ? 'Exporting…' : 'Export PDF' }}
					</FwbButton>
					<span class="mx-1 h-5 w-px bg-neutral-quaternary" aria-hidden="true" />
					<FwbButton
						size="sm"
						square
						color="alternative"
						title="Agent settings"
						aria-label="Agent settings"
						@click="settingsOpen = true"
					>
						<Icon size="16"><Settings16Regular /></Icon>
					</FwbButton>
					<FwbButton
						size="sm"
						square
						color="alternative"
						:title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
						:aria-label="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
						@click="toggleTheme"
					>
						<Icon size="16"><component :is="isDark ? WeatherSunny16Regular : WeatherMoon16Regular" /></Icon>
					</FwbButton>
					<button
						v-if="isElectron()"
						type="button"
						class="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-body-subtle transition select-none hover:bg-neutral-tertiary hover:text-heading"
						title="View on GitHub"
						aria-label="View on GitHub"
						@click="openExternalUrl(GITHUB_URL)"
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
							<path
								d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
							/>
						</svg>
					</button>
					<a
						v-else
						:href="GITHUB_URL"
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-body-subtle transition select-none hover:bg-neutral-tertiary hover:text-heading"
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

		<DialogHost />

		<FwbModal v-if="exportChoiceOpen" size="md" @close="exportChoiceOpen = false">
			<template #header>
				<h3 class="text-base font-semibold">Export which document?</h3>
			</template>
			<template #body>
				<p class="text-sm text-body-subtle">
					Both the resume and the cover letter are on screen. Pick the one to export as PDF.
				</p>
			</template>
			<template #footer>
				<div class="flex justify-end gap-2">
					<FwbButton color="alternative" @click="doExport('resume')">Resume</FwbButton>
					<FwbButton @click="doExport('letter')">Cover letter</FwbButton>
				</div>
			</template>
		</FwbModal>

		<!-- Anchor rail for the form (fixed to the window) -->
		<FormNav :profile="activeProfile" :master="workspace.master" :accent="accent" />

		<!-- Main: job rail + two panes (Form / Preview / Agent / JD PDF) -->
		<main class="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 lg:min-h-0 lg:flex-row"
		:class="{ 'gap-6': !railCollapsed }"
		>
			<!-- Slim expand strip when the profile rail is hidden (desktop) -->
			<div v-if="railCollapsed" class="no-print hidden shrink-0 lg:flex lg:flex-col lg:items-center lg:pt-1">
				<button
					type="button"
					class="inline-flex items-center justify-center rounded-lg p-2 text-body-subtle transition select-none hover:bg-neutral-tertiary hover:text-heading"
					title="Show profile panel"
					aria-label="Show profile panel"
					@click="toggleRail(false)"
				>
					<Icon size="16"><ChevronRight16Regular /></Icon>
				</button>
			</div>
			<!-- Full-width restore button when hidden (mobile, panes stack) -->
			<div v-if="railCollapsed" class="no-print lg:hidden">
				<button
					type="button"
					class="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-default bg-neutral-primary px-3 py-2 text-[13px] font-medium text-body transition hover:bg-neutral-tertiary"
					@click="toggleRail(false)"
				>
					<Icon size="16"><ChevronRight16Regular /></Icon>
					Show profiles
				</button>
			</div>

			<div v-show="!railCollapsed" class="no-print min-w-0 lg:min-h-0 lg:w-[260px] lg:shrink-0 lg:overflow-y-auto">
				<div class="mb-2 flex items-center justify-between gap-2">
					<span class="px-1 text-[13px] font-semibold tracking-wide text-body-subtle uppercase">Profiles</span>
					<button
						type="button"
						class="inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[13px] font-medium text-body-subtle transition select-none hover:bg-neutral-tertiary hover:text-heading"
						title="Hide profile panel"
						aria-label="Hide profile panel"
						@click="toggleRail(true)"
					>
						<Icon size="16"><ChevronLeft16Regular /></Icon>
						<span class="hidden xl:inline">Hide</span>
					</button>
				</div>
				<JobList
					v-model="workspace.activeJobId"
					:jobs="workspace.jobs"
					:master="workspace.master"
					@create="createJob"
					@duplicate="duplicateJob"
					@rename="renameJob"
					@remove="removeJob"
					@clear-overrides="clearOverrides"
				/>
			</div>

			<!-- Resizable two-pane area. Stacks on mobile; side-by-side with a
				draggable divider on large screens. Pane A width = --split. -->
			<div
				ref="panesRef"
				id="panes"
				:style="{ '--split': `${splitPct}%` } as Record<string, string>"
				class="flex min-w-0 flex-1 flex-col gap-6 lg:min-h-0 lg:flex-row lg:gap-0"
			>
				<div
					class="pane-col min-w-0 lg:flex lg:min-h-0 lg:w-[var(--split,50%)] lg:shrink-0 lg:grow-0 lg:flex-col lg:overflow-hidden lg:pr-2"
				>
					<div class="no-print mb-2 flex items-center gap-2">
						<FwbDropdown close-inside placement="bottom">
							<template #trigger>
								<button
									type="button"
									class="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-body-subtle transition select-none hover:bg-neutral-tertiary hover:text-heading"
									title="Switch left pane view"
								>
									{{ PANE_LABELS[paneA] }} ▾
							</button>
						</template>
						<div class="flex min-w-32 flex-col gap-1 p-1">
							<button
								v-for="view in ['form', 'preview', 'letter', 'agent', 'jdpdf', 'notes'] as PaneView[]"
								:key="view"
								type="button"
								class="inline-flex w-full items-center justify-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-body transition hover:bg-neutral-tertiary"
								:class="{ 'bg-neutral-tertiary': paneA === view }"
								@click="setPane('a', view)"
							>
								{{ PANE_LABELS[view] }}
							</button>
						</div>
					</FwbDropdown>
				</div>
				<div v-if="paneA === 'form'" class="no-print lg:min-h-0 lg:overflow-y-auto">
					<ResumeForm
						v-model="workspace.master"
						:profile="activeProfile"
						:edit-master="isMaster"
						@add="addItem"
						@remove="removeItem"
					/>
					<p class="sticky bottom-0 mt-3 pt-2 pb-1 text-center text-xs text-body-subtle backdrop-blur-md">
						Show toggles, order, and section layout save per job. Edits on
						<strong class="font-semibold">master</strong> change shared content; elsewhere they're customizations.
						Auto-saves in this browser — Import / Export moves it. PDF: print → “Save as PDF”, margins None.
					</p>
				</div>
				<div v-else-if="paneA === 'preview'" class="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
					<div class="no-print mb-2 flex gap-1">
						<button
							class="rounded-lg px-3 py-1.5 text-[13px] font-medium transition"
							:class="
								previewTabA === 'resume'
									? 'bg-brand text-white shadow-sm'
									: 'text-body-subtle hover:bg-neutral-tertiary hover:text-heading'
							"
							@click="setPreviewTab('a', 'resume')"
						>
							Resume
						</button>
						<button
							class="rounded-lg px-3 py-1.5 text-[13px] font-medium transition"
							:class="
								previewTabA === 'letter'
									? 'bg-brand text-white shadow-sm'
									: 'text-body-subtle hover:bg-neutral-tertiary hover:text-heading'
							"
							@click="setPreviewTab('a', 'letter')"
						>
							Cover letter
						</button>
					</div>
					<ResumePreview
						v-if="previewTabA === 'resume'"
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
					<LetterPreview v-else :job="activeJob" :contact="workspace.master.contact" />
				</div>
				<AgentPanel
					v-else-if="paneA === 'agent'"
					class="no-print"
					:key="`${activeJob.id}-${agentKey}`"
					:job="activeJob"
					:master="workspace.master"
					@open-settings="settingsOpen = true"
					@open-jd="setPane('a', 'jdpdf')"
					@open-letter="revealLetter('a')"
				/>
				<div v-else-if="paneA === 'letter'" class="no-print lg:min-h-0 lg:overflow-y-auto">
					<CoverLetterForm :job="activeJob" :master="workspace.master" />
				</div>
				<div v-else-if="paneA === 'notes'" class="no-print lg:min-h-0 lg:overflow-y-auto">
					<NotebookPanel v-model="workspace.master" />
				</div>
				<JDViewer v-else class="no-print" :key="activeJob.id" :job="activeJob" />
			</div>

			<!-- Draggable divider (desktop only; panes stack on mobile) -->
			<div
				role="separator"
				aria-orientation="vertical"
				aria-label="Resize panes"
				:title="`Split ${Math.round(splitPct)} / ${Math.round(100 - splitPct)} — drag to resize, double-click to reset`"
				tabindex="0"
				class="no-print hidden shrink-0 cursor-col-resize touch-none items-stretch justify-center self-stretch px-1.5 outline-none lg:flex"
				:class="draggingSplit ? 'is-dragging' : ''"
				@pointerdown="startSplitDrag"
				@dblclick="resetSplit"
				@keydown.left.prevent="nudgeSplit(-2)"
				@keydown.right.prevent="nudgeSplit(2)"
				@keydown.home.prevent="splitPct = 50"
			>
				<div
					class="w-1 rounded-full transition-colors"
					:class="draggingSplit ? 'bg-brand' : 'bg-neutral-quaternary hover:bg-brand/60'"
				/>
			</div>

			<div
				class="pane-col min-w-0 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden lg:pl-2"
			>
				<div class="no-print mb-2 flex items-center gap-2">
					<FwbDropdown close-inside placement="bottom">
						<template #trigger>
							<button
								type="button"
								class="inline-flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] font-medium text-body-subtle transition select-none hover:bg-neutral-tertiary hover:text-heading"
								title="Switch right pane view"
							>
								{{ PANE_LABELS[paneB] }} ▾
							</button>
						</template>
						<div class="flex min-w-32 flex-col gap-1 p-1">
							<button
								v-for="view in ['form', 'preview', 'letter', 'agent', 'jdpdf', 'notes'] as PaneView[]"
								:key="view"
								type="button"
								class="inline-flex w-full items-center justify-start gap-1.5 rounded-lg px-2 py-1.5 text-left text-[13px] font-medium text-body transition hover:bg-neutral-tertiary"
								:class="{ 'bg-neutral-tertiary': paneB === view }"
								@click="setPane('b', view)"
							>
								{{ PANE_LABELS[view] }}
							</button>
						</div>
					</FwbDropdown>
				</div>
				<div v-if="paneB === 'form'" class="no-print lg:min-h-0 lg:overflow-y-auto">
					<ResumeForm
						v-model="workspace.master"
						:profile="activeProfile"
						:edit-master="isMaster"
						@add="addItem"
						@remove="removeItem"
					/>
				</div>
				<div v-else-if="paneB === 'preview'" class="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
					<div class="no-print mb-2 flex gap-1">
						<button
							class="rounded-lg px-3 py-1.5 text-[13px] font-medium transition"
							:class="
								previewTabB === 'resume'
									? 'bg-brand text-white shadow-sm'
									: 'text-body-subtle hover:bg-neutral-tertiary hover:text-heading'
							"
							@click="setPreviewTab('b', 'resume')"
						>
							Resume
						</button>
						<button
							class="rounded-lg px-3 py-1.5 text-[13px] font-medium transition"
							:class="
								previewTabB === 'letter'
									? 'bg-brand text-white shadow-sm'
									: 'text-body-subtle hover:bg-neutral-tertiary hover:text-heading'
							"
							@click="setPreviewTab('b', 'letter')"
						>
							Cover letter
						</button>
					</div>
					<ResumePreview
						v-if="previewTabB === 'resume'"
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
					<LetterPreview v-else :job="activeJob" :contact="workspace.master.contact" />
				</div>
				<AgentPanel
					v-else-if="paneB === 'agent'"
					class="no-print"
					:key="`${activeJob.id}-${agentKey}`"
					:job="activeJob"
					:master="workspace.master"
					@open-settings="settingsOpen = true"
					@open-jd="setPane('b', 'jdpdf')"
					@open-letter="revealLetter('b')"
				/>
				<div v-else-if="paneB === 'letter'" class="no-print lg:min-h-0 lg:overflow-y-auto">
					<CoverLetterForm :job="activeJob" :master="workspace.master" />
				</div>
				<div v-else-if="paneB === 'notes'" class="no-print lg:min-h-0 lg:overflow-y-auto">
					<NotebookPanel v-model="workspace.master" />
				</div>
				<JDViewer v-else class="no-print" :key="activeJob.id" :job="activeJob" />
			</div>
		</div>
	</main>

		<div
			v-if="undoSnapshot"
			class="no-print fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-xl border border-default bg-neutral-primary-medium px-4 py-2 shadow-xl"
		>
			<span class="text-sm">Job deleted.</span>
			<FwbButton size="sm" @click="undoRemove">Undo</FwbButton>
		</div>
	</div>
</template>
