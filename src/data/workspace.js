import { ACCENTS, FONT_IDS, TEMPLATES } from './options.js'
import { SECTION_KEYS, blankContact, blankResume, isVisible, sampleResume, uid } from './resume.js'

export const WORKSPACE_VERSION = 2
export const STORAGE_KEY = 'resume-tailor-data-v2'
export const LEGACY_STORAGE_KEY = 'resume-tailor-data-v1'

const TEMPLATE_IDS = TEMPLATES.map((t) => t.id)

const idsOf = (list) => (list || []).map((item) => item.id)

/** Ordered ids for every section — i.e. "show everything, in master order". */
export function allIds(master) {
	const view = {}
	for (const key of SECTION_KEYS) view[key] = idsOf(master[key])
	return view
}

export function blankProfile(
	name,
	master,
	{ template = 'modern', accent = ACCENTS[0], font = null, columns = 1, title = '', summary = '' } = {}
) {
	return {
		id: uid(),
		name: name || 'Untitled profile',
		template,
		accent,
		// null = follow the template's default font.
		font: FONT_IDS.includes(font) ? font : null,
		columns: columns === 2 ? 2 : 1,
		title,
		summary,
		view: allIds(master),
		overrides: {}
	}
}

export function blankWorkspace() {
	const master = blankResume()
	const profile = blankProfile('Master', master)
	return { version: WORKSPACE_VERSION, master, profiles: [profile], activeProfileId: profile.id }
}

export function sampleWorkspace() {
	const master = sampleResume()
	const profile = blankProfile('Frontend Engineer', master, {
		template: 'modern',
		accent: ACCENTS[0],
		title: 'Frontend Engineer',
		summary:
			'**Frontend engineer** with **5 years** building responsive web apps in **Vue** and **React**. Focused on design systems, performance and shipping polished UX.'
	})
	return { version: WORKSPACE_VERSION, master, profiles: [profile], activeProfileId: profile.id }
}

/** Deep-copy a profile (view, tailoring and presentation) under a new name. */
export function cloneProfile(profile, name) {
	const copy = JSON.parse(JSON.stringify(profile))
	copy.id = uid()
	copy.name = name || `${profile.name} copy`
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
	const preview = { contact }
	for (const key of SECTION_KEYS) {
		const resolved = resolveSection(master[key], profile?.view?.[key])
		preview[key] = applyOverrides(resolved, profile?.overrides)
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
	return clean
}

function normalizeProfile(master, profile, index) {
	return {
		id: profile?.id || uid(),
		name: typeof profile?.name === 'string' && profile.name.trim() ? profile.name : `Profile ${index + 1}`,
		template: TEMPLATE_IDS.includes(profile?.template) ? profile.template : 'modern',
		accent: typeof profile?.accent === 'string' && profile.accent ? profile.accent : ACCENTS[0],
		font: FONT_IDS.includes(profile?.font) ? profile.font : null,
		columns: profile?.columns === 2 ? 2 : 1,
		title: typeof profile?.title === 'string' ? profile.title : '',
		summary: typeof profile?.summary === 'string' ? profile.summary : '',
		view: normalizeView(master, profile?.view),
		overrides: normalizeOverrides(master, profile?.overrides)
	}
}

/** Keep only overrides for existing items, dropping no-op fields. */
function normalizeOverrides(master, overrides) {
	const clean = {}
	if (!overrides || typeof overrides !== 'object') return clean
	const byId = new Map()
	for (const key of SECTION_KEYS) for (const item of master[key]) byId.set(item.id, item)
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

export function normalizeWorkspace(ws) {
	const masterIn = ws.master || {}
	const master = { contact: normalizeContact(masterIn.contact) }
	for (const key of SECTION_KEYS) {
		const list = Array.isArray(masterIn[key]) ? masterIn[key] : []
		master[key] = list.map((item) => ({ ...stripVisible(item), id: item?.id || uid() }))
	}

	let profiles = Array.isArray(ws.profiles) ? ws.profiles.map((p, i) => normalizeProfile(master, p, i)) : []
	if (!profiles.length) profiles = [blankProfile('Master', master)]

	const activeProfileId = profiles.some((p) => p.id === ws.activeProfileId) ? ws.activeProfileId : profiles[0].id

	return { version: WORKSPACE_VERSION, master, profiles, activeProfileId }
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
