import { ACCENTS, FONT_IDS, TEMPLATES } from './options.js'
import {
	SECTION_KEYS,
	blankContact,
	blankResume,
	customSectionTitle,
	isVisible,
	normalizeSections,
	sampleResume,
	uid
} from './resume.js'

export const WORKSPACE_VERSION = 2
export const STORAGE_KEY = 'resume-tailor-data-v2'
export const LEGACY_STORAGE_KEY = 'resume-tailor-data-v1'

const TEMPLATE_IDS = TEMPLATES.map((t) => t.id)

const idsOf = (list) => (list || []).map((item) => item.id)

/** Ordered ids for every section — i.e. "show everything, in master order". */
export function allIds(master) {
	const view = {}
	for (const key of SECTION_KEYS) view[key] = idsOf(master[key])
	view.custom = {}
	for (const section of master.customSections || []) view.custom[section.id] = idsOf(section.items)
	return view
}

export function blankProfile(
	name,
	master,
	{
		template = 'modern',
		accent = ACCENTS[0],
		columns = 1,
		font = null,
		title = '',
		summary = '',
		sections = null,
		isMaster = false
	} = {}
) {
	return {
		id: uid(),
		name: name || 'Untitled profile',
		// The master profile edits the shared content directly (no overrides).
		master: isMaster,
		template,
		accent,
		columns: columns === 2 ? 2 : 1,
		// null means "use the template's font".
		font: FONT_IDS.includes(font) ? font : null,
		title,
		summary,
		// Per-profile section layout: order, custom headings, visibility.
		// A new profile starts from the master: fixed defaults plus entries
		// for every user-created section (falling back to the master name).
		sections: normalizeSections(sections, master),
		view: allIds(master),
		overrides: {}
	}
}

export function blankWorkspace() {
	const master = blankResume()
	const profile = blankProfile('Master', master, { isMaster: true })
	return { version: WORKSPACE_VERSION, master, profiles: [profile], activeProfileId: profile.id }
}

export function sampleWorkspace() {
	const master = sampleResume()
	const profile = blankProfile('Frontend Engineer', master, {
		template: 'modern',
		accent: ACCENTS[0],
		title: 'Frontend Engineer',
		summary:
			'**Frontend engineer** with **5 years** of experience building responsive web apps with **Vue** and **React**.\nPassionate about design systems, performance, and turning ambiguous product ideas into polished user experiences.',
		isMaster: true
	})
	return { version: WORKSPACE_VERSION, master, profiles: [profile], activeProfileId: profile.id }
}

/** Deep-copy a profile (view, tailoring and presentation) under a new name. */
export function cloneProfile(profile, name) {
	const copy = JSON.parse(JSON.stringify(profile))
	copy.id = uid()
	copy.name = name || `${profile.name} copy`
	copy.master = false
	return copy
}

/** Resolve a profile view (ordered ids) into the ordered, shown items. */
export function resolveSection(items, order) {
	const byId = new Map((items || []).map((item) => [item.id, item]))
	return (order || []).map((id) => byId.get(id)).filter(Boolean)
}

/** Overlay a profile's per-item field overrides onto resolved items. */
export function applyOverrides(items, overrides) {
	if (!overrides) return items
	return items.map((item) => {
		const patch = overrides[item.id]
		return patch ? { ...item, ...patch } : item
	})
}

/**
 * Build the resume the preview templates expect for a given profile:
 * master content sliced/ordered by the profile view, per-item overrides applied,
 * with the profile's tailored title & summary folded into `contact`.
 */
export function buildPreview(master, profile) {
	const contact = {
		...(master.contact || blankContact()),
		title: profile?.title || '',
		summary: profile?.summary || ''
	}
	const preview = { contact, customSections: [] }
	for (const key of SECTION_KEYS) {
		const resolved = resolveSection(master[key], profile?.view?.[key])
		preview[key] = applyOverrides(resolved, profile?.overrides)
	}
	const entries = new Map((profile?.sections || []).map((s) => [s.id, s]))
	for (const section of master.customSections || []) {
		const resolved = resolveSection(section.items, profile?.view?.custom?.[section.id])
		preview.customSections.push({
			id: section.id,
			title: customSectionTitle(section, entries.get(section.id)),
			items: applyOverrides(resolved, profile?.overrides)
		})
	}
	return preview
}

/** Drop `visible` (an old per-item flag) now that visibility lives on profiles. */
function stripVisible(item) {
	const { visible: _visible, ...rest } = item || {}
	return rest
}

function normalizeContact(contact) {
	const clean = blankContact()
	for (const key of Object.keys(clean)) clean[key] = typeof contact?.[key] === 'string' ? contact[key] : ''
	return clean
}

/** Ensure every profile references only ids that still exist in the master. */
function normalizeView(master, view) {
	const clean = {}
	for (const key of SECTION_KEYS) {
		const existing = new Set(idsOf(master[key]))
		const seen = new Set()
		const raw = Array.isArray(view?.[key]) ? view[key] : []
		clean[key] = []
		for (const entry of raw) {
			const id = typeof entry === 'string' ? entry : entry?.id
			if (!id || !existing.has(id) || seen.has(id)) continue
			seen.add(id)
			clean[key].push(id)
		}
	}
	clean.custom = {}
	for (const section of master.customSections || []) {
		const existing = new Set(idsOf(section.items))
		const seen = new Set()
		const raw = Array.isArray(view?.custom?.[section.id]) ? view.custom[section.id] : []
		clean.custom[section.id] = []
		for (const entry of raw) {
			const id = typeof entry === 'string' ? entry : entry?.id
			if (!id || !existing.has(id) || seen.has(id)) continue
			seen.add(id)
			clean.custom[section.id].push(id)
		}
	}
	return clean
}

function normalizeProfile(master, profile, index) {
	return {
		id: profile?.id || uid(),
		name: typeof profile?.name === 'string' && profile.name.trim() ? profile.name : `Profile ${index + 1}`,
		master: profile?.master === true,
		template: TEMPLATE_IDS.includes(profile?.template) ? profile.template : 'modern',
		accent: typeof profile?.accent === 'string' && profile.accent ? profile.accent : ACCENTS[0],
		columns: profile?.columns === 2 ? 2 : 1,
		font: FONT_IDS.includes(profile?.font) ? profile.font : null,
		title: typeof profile?.title === 'string' ? profile.title : '',
		summary: typeof profile?.summary === 'string' ? profile.summary : '',
		sections: normalizeSections(profile?.sections, master),
		view: normalizeView(master, profile?.view),
		overrides: normalizeOverrides(master, profile?.overrides)
	}
}

/** All content items by id, including user-created sections (for overrides). */
function contentById(master) {
	const byId = new Map()
	for (const key of SECTION_KEYS) for (const item of master[key]) byId.set(item.id, item)
	for (const section of master.customSections || []) for (const item of section.items || []) byId.set(item.id, item)
	return byId
}

/** Keep only overrides for existing items, dropping no-op fields. */
function normalizeOverrides(master, overrides) {
	const clean = {}
	if (!overrides || typeof overrides !== 'object') return clean
	const byId = contentById(master)
	for (const [id, patch] of Object.entries(overrides)) {
		const item = byId.get(id)
		if (!item || !patch || typeof patch !== 'object') continue
		const fields = {}
		for (const [field, value] of Object.entries(patch)) {
			if (value === undefined || value === null) continue
			if (value === item[field]) continue // identical to master — not a real override
			fields[field] = value
		}
		if (Object.keys(fields).length) clean[id] = fields
	}
	return clean
}

/** User-created sections: keep id, shared name, and normalized generic items. */
function normalizeCustomSections(raw) {
	if (!Array.isArray(raw)) return []
	return raw
		.filter((s) => s && typeof s === 'object')
		.map((s) => ({
			id: s.id || uid(),
			title: typeof s.title === 'string' ? s.title.slice(0, 60) : '',
			items: Array.isArray(s.items)
				? s.items.map((item) => ({
						id: item?.id || uid(),
						heading: typeof item?.heading === 'string' ? item.heading : '',
						sub: typeof item?.sub === 'string' ? item.sub : '',
						dates: typeof item?.dates === 'string' ? item.dates : '',
						body: typeof item?.body === 'string' ? item.body : ''
					}))
				: []
		}))
}

export function normalizeWorkspace(ws) {
	const masterIn = ws.master || {}
	const master = { contact: normalizeContact(masterIn.contact) }
	for (const key of SECTION_KEYS) {
		const list = Array.isArray(masterIn[key]) ? masterIn[key] : []
		master[key] = list.map((item) => ({ ...stripVisible(item), id: item?.id || uid() }))
	}
	master.customSections = normalizeCustomSections(masterIn.customSections)

	let profiles = Array.isArray(ws.profiles) ? ws.profiles.map((p, i) => normalizeProfile(master, p, i)) : []
	if (!profiles.length) profiles = [blankProfile('Master', master, { isMaster: true })].map((p, i) => normalizeProfile(master, p, i))

	// Exactly one master profile: the flagged one, else the first.
	let masterProfile = profiles.find((p) => p.master) || profiles[0]
	for (const profile of profiles) profile.master = profile === masterProfile

	// The master profile edits the shared content, so fold any overrides it still
	// carries into the master (from before this behaviour existed) and clear them.
	foldOverridesIntoMaster(master, masterProfile)
	masterProfile.overrides = {}

	const activeProfileId = profiles.some((p) => p.id === ws.activeProfileId) ? ws.activeProfileId : profiles[0].id

	return { version: WORKSPACE_VERSION, master, profiles, activeProfileId }
}

/** Move a profile's field overrides into the shared master content. */
function foldOverridesIntoMaster(master, profile) {
	const overrides = profile?.overrides
	if (!overrides) return
	const byId = contentById(master)
	for (const [id, patch] of Object.entries(overrides)) {
		const item = byId.get(id)
		if (!item || !patch || typeof patch !== 'object') continue
		for (const [field, value] of Object.entries(patch)) {
			if (value !== undefined) item[field] = value
		}
	}
}

/** Turn a legacy `{ resume, template, accent }` save into a single-profile workspace. */
function workspaceFromLegacy(resume, template, accent) {
	const master = {
		contact: normalizeContact(resume.contact),
		experience: (resume.experience || []).map(stripVisible),
		projects: (resume.projects || []).map(stripVisible),
		education: (resume.education || []).map(stripVisible),
		skills: (resume.skills || []).map(stripVisible)
	}
	const profile = {
		id: uid(),
		name: 'Master',
		master: true,
		template: TEMPLATE_IDS.includes(template) ? template : 'modern',
		accent: typeof accent === 'string' && accent ? accent : ACCENTS[0],
		columns: 1,
		title: typeof resume.contact?.title === 'string' ? resume.contact.title : '',
		summary: typeof resume.contact?.summary === 'string' ? resume.contact.summary : '',
		view: {}
	}
	// Preserve what was shown/hidden before profiles existed.
	for (const key of SECTION_KEYS) {
		profile.view[key] = (resume[key] || []).filter(isVisible).map((item) => item.id)
	}
	return normalizeWorkspace({ version: WORKSPACE_VERSION, master, profiles: [profile], activeProfileId: profile.id })
}

/**
 * Accept a v2 workspace, a legacy `{ resume, template, accent }` export, or a
 * bare resume object. Returns a normalized workspace, or null if unrecognizable.
 */
export function migrate(raw) {
	if (!raw || typeof raw !== 'object') return null
	if (raw.master && typeof raw.master === 'object') {
		return normalizeWorkspace(raw)
	}
	// Legacy exports store the resume under `resume`; a bare resume object has `contact`.
	const resume = raw.resume ?? raw
	if (resume && typeof resume === 'object' && resume.contact && Array.isArray(resume.experience)) {
		return workspaceFromLegacy(resume, raw.template, raw.accent)
	}
	return null
}
