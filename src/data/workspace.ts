import { ACCENTS, FONT_IDS, TEMPLATES, normalizeDensity } from './options'
import {
	blankConversation,
	blankConversations,
	conversationsFromThread,
	type Conversation,
} from '../agent/conversations'
import { normalizeThread } from '../agent/threads'
import {
	SECTION_KEYS,
	blankContact,
	blankResume,
	customSectionTitle,
	isSectionKey,
	isVisible,
	normalizeSections,
	readField,
	sampleResume,
	setMasterSection,
	uid,
	writeField,
} from './resume'
import type {
	Contact,
	ContentItem,
	CustomSection,
	Job,
	MasterResume,
	OverridePatch,
	PreviewContact,
	PreviewResume,
	Profile,
	ProfileView,
	SectionEntry,
	Workspace,
	WorkspaceV3,
} from './types'

export const WORKSPACE_VERSION = 3
export const STORAGE_KEY = 'resume-tailor-data-v2'
export const LEGACY_STORAGE_KEY = 'resume-tailor-data-v1'

const TEMPLATE_IDS: string[] = TEMPLATES.map((t) => t.id)

const idsOf = (list: ContentItem[] | undefined): string[] => (list || []).map((item) => item.id)

/** Ordered ids for every section — i.e. "show everything, in master order". */
export function allIds(master: MasterResume): ProfileView {
	const view: ProfileView = { experience: [], projects: [], education: [], skills: [], custom: {} }
	for (const key of SECTION_KEYS) {
		if (isSectionKey(key)) view[key] = idsOf(master[key])
	}
	view.custom = {}
	for (const section of master.customSections || []) view.custom[section.id] = idsOf(section.items)
	return view
}

export interface BlankProfileOptions {
	template?: string
	accent?: string
	columns?: number
	density?: number | string
	font?: string | null
	title?: string
	summary?: string
	sections?: SectionEntry[]
	isMaster?: boolean
}

export function blankProfile(name: string, master: MasterResume, opts: BlankProfileOptions = {}): Profile {
	const {
		template = 'modern',
		accent = ACCENTS[0],
		columns = 1,
		density = 1,
		font = null,
		title = '',
		summary = '',
		sections = null,
		isMaster = false,
	} = opts
	return {
		id: uid(),
		name: name || 'Untitled profile',
		// The master profile edits the shared content directly (no overrides).
		master: isMaster,
		template,
		accent,
		columns: columns === 2 ? 2 : 1,
		density: normalizeDensity(density),
		// null means "use the template's font".
		font: typeof font === 'string' && FONT_IDS.includes(font) ? font : null,
		title,
		summary,
		// Per-profile section layout: order, custom headings, visibility.
		// A new profile starts from the master: fixed defaults plus entries
		// for every user-created section (falling back to the master name).
		sections: normalizeSections(sections, master),
		view: allIds(master),
		overrides: {},
	}
}

export interface BlankJobOptions extends BlankProfileOptions {
	company?: string
	jobTitleTarget?: string
}

export function blankJob(name: string, master: MasterResume, opts: BlankJobOptions = {}): Job {
	const { company = '', jobTitleTarget = '', ...rest } = opts
	const profile = blankProfile(name, master, rest)
	const first = blankConversation()
	return {
		...profile,
		kind: rest.isMaster ? 'master' : 'job',
		company,
		jobTitleTarget,
		jobDescription: '',
		jobUrl: '',
		coverLetter: '',
		jdSource: null,
		conversations: [first],
		activeConversationId: first.id,
	}
}

export function blankWorkspace(): Workspace & WorkspaceV3 {
	const master = blankResume()
	const profile = blankProfile('Master', master, { isMaster: true })
	const jobs = [toJob(profile, { kind: 'master' })]
	return {
		version: WORKSPACE_VERSION,
		master,
		profiles: [profile],
		activeProfileId: profile.id,
		jobs,
		activeJobId: profile.id,
	}
}

export function sampleWorkspace(): Workspace & WorkspaceV3 {
	const master = sampleResume()
	const profile = blankProfile('Frontend Engineer', master, {
		template: 'modern',
		accent: ACCENTS[0],
		title: 'Frontend Engineer',
		summary:
			'**Frontend engineer** with **5 years** of experience building responsive web apps with **Vue** and **React**.\nPassionate about design systems, performance, and turning ambiguous product ideas into polished user experiences.',
		isMaster: true,
	})
	const jobs = [toJob(profile, { kind: 'master' })]
	return {
		version: WORKSPACE_VERSION,
		master,
		profiles: [profile],
		activeProfileId: profile.id,
		jobs,
		activeJobId: profile.id,
	}
}

/** Deep-copy a job (view, tailoring, letter and JD text) with fresh conversations. */
export function cloneJob(job: Job, name?: string): Job {
	const copy = JSON.parse(JSON.stringify(job)) as Job
	copy.id = uid()
	copy.name = name || `${job.name} copy`
	copy.master = false
	copy.kind = 'job'
	const first = blankConversation()
	copy.conversations = [first]
	copy.activeConversationId = first.id
	return copy
}

/** Resolve a profile view (ordered ids) into the ordered, shown items. */
export function resolveSection<T extends ContentItem>(items: T[] | undefined, order: string[] | undefined): T[] {
	const byId = new Map((items || []).map((item) => [item.id, item]))
	return (order || []).map((id) => byId.get(id)).filter((item): item is T => Boolean(item))
}

/** Overlay a profile's per-item field overrides onto resolved items. */
export function applyOverrides<T extends ContentItem>(
	items: T[],
	overrides: Record<string, OverridePatch> | undefined,
): T[] {
	if (!overrides) return items
	return items.map((item) => {
		const patch = overrides[item.id]
		return patch ? ({ ...item, ...patch } as T) : item
	})
}

/** Resolve + overlay one repeatable section for the preview. */
function resolvePreview<T extends ContentItem>(
	items: T[],
	profile: Profile,
	key: 'experience' | 'projects' | 'education' | 'skills',
): T[] {
	return applyOverrides(resolveSection(items, profile.view[key]), profile.overrides)
}

/**
 * Build the resume the preview templates expect for a given profile:
 * master content sliced/ordered by the profile view, per-item overrides applied,
 * with the profile's tailored title & summary folded into `contact`.
 */
export function buildPreview(master: MasterResume, profile: Profile): PreviewResume {
	const contact: PreviewContact = {
		...(master.contact || blankContact()),
		title: profile?.title || '',
		summary: profile?.summary || '',
	}
	const preview: PreviewResume = {
		contact,
		experience: resolvePreview(master.experience, profile, 'experience'),
		projects: resolvePreview(master.projects, profile, 'projects'),
		education: resolvePreview(master.education, profile, 'education'),
		skills: resolvePreview(master.skills, profile, 'skills'),
		customSections: [],
	}
	const entries = new Map((profile?.sections || []).map((s) => [s.id, s]))
	for (const section of master.customSections || []) {
		const resolved = resolveSection(section.items, profile?.view?.custom?.[section.id])
		preview.customSections.push({
			id: section.id,
			title: customSectionTitle(section, entries.get(section.id)),
			items: applyOverrides(resolved, profile?.overrides),
		})
	}
	return preview
}

/** Drop `visible` (an old per-item flag) now that visibility lives on profiles. */
function stripVisible(item: any): ContentItem {
	const { visible: _visible, ...rest } = item || {}
	return rest as ContentItem
}

// Raw persisted JSON is unvalidated by definition; these normalizers take `any`
// deliberately and return fully typed structures.

function normalizeContact(contact: any): Contact {
	const clean = blankContact()
	for (const key of Object.keys(clean))
		clean[key as keyof Contact] = typeof contact?.[key] === 'string' ? contact[key] : ''
	return clean
}

/** Ensure every profile references only ids that still exist in the master. */
function normalizeView(master: MasterResume, view: any): ProfileView {
	const clean: ProfileView = { experience: [], projects: [], education: [], skills: [], custom: {} }
	for (const key of SECTION_KEYS) {
		if (!isSectionKey(key)) continue
		const existing = new Set(idsOf(master[key]))
		const seen = new Set<string>()
		const raw = Array.isArray(view?.[key]) ? view[key] : []
		clean[key] = []
		for (const entry of raw) {
			const id = typeof entry === 'string' ? entry : entry?.id
			if (typeof id !== 'string' || !id || !existing.has(id) || seen.has(id)) continue
			seen.add(id)
			clean[key].push(id)
		}
	}
	clean.custom = {}
	for (const section of master.customSections || []) {
		const existing = new Set(idsOf(section.items))
		const seen = new Set<string>()
		const raw = Array.isArray(view?.custom?.[section.id]) ? view.custom[section.id] : []
		clean.custom[section.id] = []
		for (const entry of raw) {
			const id = typeof entry === 'string' ? entry : entry?.id
			if (typeof id !== 'string' || !id || !existing.has(id) || seen.has(id)) continue
			seen.add(id)
			clean.custom[section.id].push(id)
		}
	}
	return clean
}

function normalizeProfile(master: MasterResume, profile: any, index: number): Profile {
	return {
		id: typeof profile?.id === 'string' && profile.id ? profile.id : uid(),
		name: typeof profile?.name === 'string' && profile.name.trim() ? profile.name : `Profile ${index + 1}`,
		master: profile?.master === true,
		template: TEMPLATE_IDS.includes(profile?.template) ? profile.template : 'modern',
		accent: typeof profile?.accent === 'string' && profile.accent ? profile.accent : ACCENTS[0],
		columns: profile?.columns === 2 ? 2 : 1,
		density: normalizeDensity(profile?.density),
		font: typeof profile?.font === 'string' && FONT_IDS.includes(profile.font) ? profile.font : null,
		title: typeof profile?.title === 'string' ? profile.title : '',
		summary: typeof profile?.summary === 'string' ? profile.summary : '',
		sections: normalizeSections(profile?.sections, master),
		view: normalizeView(master, profile?.view),
		overrides: normalizeOverrides(master, profile?.overrides),
	}
}

/** All content items by id, including user-created sections (for overrides). */
function contentById(master: MasterResume): Map<string, ContentItem> {
	const byId = new Map<string, ContentItem>()
	for (const key of SECTION_KEYS) {
		if (isSectionKey(key)) for (const item of master[key]) byId.set(item.id, item)
	}
	for (const section of master.customSections || []) for (const item of section.items || []) byId.set(item.id, item)
	return byId
}

/** Keep only overrides for existing items, dropping no-op fields. */
function normalizeOverrides(master: MasterResume, overrides: any): Record<string, OverridePatch> {
	const clean: Record<string, OverridePatch> = {}
	if (!overrides || typeof overrides !== 'object') return clean
	const byId = contentById(master)
	for (const [id, patch] of Object.entries(overrides)) {
		const item = byId.get(id)
		if (!item || !patch || typeof patch !== 'object') continue
		const fields: OverridePatch = {}
		for (const [field, value] of Object.entries(patch)) {
			if (value === undefined || value === null) continue
			if (value === readField(item, field)) continue // identical to master — not a real override
			fields[field] = value as string | boolean
		}
		if (Object.keys(fields).length) clean[id] = fields
	}
	return clean
}

/** User-created sections: keep id, shared name, and normalized generic items. */
function normalizeCustomSections(raw: any): CustomSection[] {
	if (!Array.isArray(raw)) return []
	return raw
		.filter((s) => s && typeof s === 'object')
		.map((s) => ({
			id: typeof s.id === 'string' && s.id ? s.id : uid(),
			title: typeof s.title === 'string' ? s.title.slice(0, 60) : '',
			items: Array.isArray(s.items)
				? s.items.map((item: any) => ({
						id: typeof item?.id === 'string' && item.id ? item.id : uid(),
						heading: typeof item?.heading === 'string' ? item.heading : '',
						sub: typeof item?.sub === 'string' ? item.sub : '',
						dates: typeof item?.dates === 'string' ? item.dates : '',
						body: typeof item?.body === 'string' ? item.body : '',
					}))
				: [],
		}))
}

/** Lift a normalized profile into a Job, preserving v3 fields when present. */
function toJob(profile: Profile, raw: any): Job {
	const conversations = normalizeConversations(raw)
	return {
		...profile,
		kind: raw?.kind === 'job' || raw?.kind === 'master' ? raw.kind : profile.master ? 'master' : 'job',
		company: typeof raw?.company === 'string' ? raw.company : '',
		jobTitleTarget: typeof raw?.jobTitleTarget === 'string' ? raw.jobTitleTarget : '',
		jobDescription: typeof raw?.jobDescription === 'string' ? raw.jobDescription : '',
		jobUrl: typeof raw?.jobUrl === 'string' ? raw.jobUrl : '',
		coverLetter: typeof raw?.coverLetter === 'string' ? raw.coverLetter : '',
		jdSource:
			raw?.jdSource && typeof raw.jdSource === 'object' && typeof raw.jdSource.pdfRefId === 'string'
				? {
						filename: typeof raw.jdSource.filename === 'string' ? raw.jdSource.filename : '',
						pageCount: typeof raw.jdSource.pageCount === 'number' ? raw.jdSource.pageCount : 0,
						extractedAt: typeof raw.jdSource.extractedAt === 'string' ? raw.jdSource.extractedAt : '',
						pdfRefId: raw.jdSource.pdfRefId,
					}
				: null,
		conversations,
		activeConversationId:
			typeof raw?.activeConversationId === 'string' && conversations.some((c) => c.id === raw.activeConversationId)
				? (raw.activeConversationId as string)
				: null,
	}
}

/** Normalize the conversation list; legacy single `chat` threads become one conversation. */
function normalizeConversations(raw: any): Conversation[] {
	if (Array.isArray(raw?.conversations) && raw.conversations.length) {
		const clean: Conversation[] = []
		const seen = new Set<string>()
		for (const item of raw.conversations) {
			if (!item || typeof item !== 'object') continue
			const id = typeof item.id === 'string' && item.id && !seen.has(item.id) ? item.id : uid()
			seen.add(id)
			clean.push({
				id,
				title: typeof item.title === 'string' ? item.title.slice(0, 120) : '',
				updatedAt: typeof item.updatedAt === 'number' && Number.isFinite(item.updatedAt) ? item.updatedAt : 0,
				thread: normalizeThread(item.thread),
			})
		}
		if (clean.length) return clean
	}
	if (raw?.chat && typeof raw.chat === 'object') {
		return conversationsFromThread(normalizeThread(raw.chat))
	}
	return blankConversations()
}

export function normalizeWorkspace(ws: any): Workspace & WorkspaceV3 {
	const masterIn = ws.master || {}
	const master: MasterResume = { contact: normalizeContact(masterIn.contact) } as MasterResume
	for (const key of SECTION_KEYS) {
		if (!isSectionKey(key)) continue
		const list: any[] = Array.isArray(masterIn[key]) ? masterIn[key] : []
		setMasterSection(
			master,
			key,
			list.map((item: any) => ({ ...stripVisible(item), id: item?.id || uid() })),
		)
	}
	master.customSections = normalizeCustomSections(masterIn.customSections)

	let profiles: Profile[] = Array.isArray(ws.jobs)
		? ws.jobs.map((p: any, i: number) => normalizeProfile(master, p, i))
		: Array.isArray(ws.profiles)
			? ws.profiles.map((p: any, i: number) => normalizeProfile(master, p, i))
			: []
	if (!profiles.length)
		profiles = [blankProfile('Master', master, { isMaster: true })].map((p, i) => normalizeProfile(master, p, i))

	// Exactly one master profile: the flagged one, else the first.
	const masterProfile = profiles.find((p) => p.master) || profiles[0]
	for (const profile of profiles) profile.master = profile === masterProfile

	// The master profile edits the shared content, so fold any overrides it still
	// carries into the master (from before this behaviour existed) and clear them.
	foldOverridesIntoMaster(master, masterProfile)
	masterProfile.overrides = {}

	const activeProfileId =
		typeof ws.activeProfileId === 'string' && profiles.some((p) => p.id === ws.activeProfileId)
			? ws.activeProfileId
			: typeof ws.activeJobId === 'string' && profiles.some((p) => p.id === ws.activeJobId)
				? ws.activeJobId
				: profiles[0].id

	const raws: any[] = Array.isArray(ws.jobs) ? ws.jobs : Array.isArray(ws.profiles) ? ws.profiles : []
	const jobs: Job[] = profiles.map((p, i) => toJob(p, raws[i]))
	const activeJobId = activeProfileId

	return { version: WORKSPACE_VERSION, master, profiles, activeProfileId, jobs, activeJobId }
}

/** Move a profile's field overrides into the shared master content. */
function foldOverridesIntoMaster(master: MasterResume, profile: Profile): void {
	const overrides = profile?.overrides
	if (!overrides) return
	const byId = contentById(master)
	for (const [id, patch] of Object.entries(overrides)) {
		const item = byId.get(id)
		if (!item || !patch || typeof patch !== 'object') continue
		for (const [field, value] of Object.entries(patch)) {
			if (value !== undefined) writeField(item, field, value)
		}
	}
}

/** Turn a legacy `{ resume, template, accent }` save into a single-profile workspace. */
function workspaceFromLegacy(resume: any, template: unknown, accent: unknown): Workspace {
	const master = {
		contact: normalizeContact(resume.contact),
		experience: (resume.experience || []).map(stripVisible),
		projects: (resume.projects || []).map(stripVisible),
		education: (resume.education || []).map(stripVisible),
		skills: (resume.skills || []).map(stripVisible),
	}
	const profile = {
		id: uid(),
		name: 'Master',
		master: true,
		template: typeof template === 'string' && TEMPLATE_IDS.includes(template) ? template : 'modern',
		accent: typeof accent === 'string' && accent ? accent : ACCENTS[0],
		columns: 1,
		title: typeof resume.contact?.title === 'string' ? resume.contact.title : '',
		summary: typeof resume.contact?.summary === 'string' ? resume.contact.summary : '',
		view: {} as Record<string, string[]>,
	}
	// Preserve what was shown/hidden before profiles existed.
	for (const key of SECTION_KEYS) {
		if (!isSectionKey(key)) continue
		profile.view[key] = (resume[key] || []).filter(isVisible).map((item: any) => item.id)
	}
	return normalizeWorkspace({ version: WORKSPACE_VERSION, master, profiles: [profile], activeProfileId: profile.id })
}

/**
 * Accept a v2 workspace, a legacy `{ resume, template, accent }` export, or a
 * bare resume object. Returns a normalized workspace, or null if unrecognizable.
 */
export function migrate(raw: unknown): Workspace | null {
	if (!raw || typeof raw !== 'object') return null
	const data = raw as {
		master?: unknown
		resume?: unknown
		contact?: unknown
		experience?: unknown
		template?: unknown
		accent?: unknown
	}
	if (data.master && typeof data.master === 'object') {
		return normalizeWorkspace(raw)
	}
	// Legacy exports store the resume under `resume`; a bare resume object has `contact`.
	const resume = data.resume ?? raw
	if (
		resume &&
		typeof resume === 'object' &&
		(resume as { contact?: unknown }).contact &&
		Array.isArray((resume as { experience?: unknown }).experience)
	) {
		return workspaceFromLegacy(resume, data.template, data.accent)
	}
	return null
}
