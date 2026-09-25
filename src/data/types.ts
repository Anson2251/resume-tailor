/**
 * Shared domain model: the master resume (content), profiles (views over it),
 * and the persisted workspace. Raw JSON from disk/imports is `unknown` at the
 * boundary and normalized into these shapes by `workspace.ts`.
 */

export type ThemeName = 'light' | 'dark'

export type SectionKey = 'experience' | 'projects' | 'education' | 'skills'

export interface Contact {
	fullName: string
	email: string
	phone: string
	location: string
	website: string
	linkedin: string
}

/** Contact as rendered on a profile: tailored title + summary folded in. */
export interface PreviewContact extends Contact {
	title: string
	summary: string
}

export interface ExperienceItem {
	id: string
	role: string
	company: string
	location: string
	startDate: string
	endDate: string
	current: boolean
	bullets: string
}

export interface ProjectItem {
	id: string
	name: string
	link: string
	tech: string
	startDate: string
	endDate: string
	bullets: string
}

export interface EducationItem {
	id: string
	school: string
	degree: string
	field: string
	startDate: string
	endDate: string
	gpa: string
	details: string
}

export interface SkillGroup {
	id: string
	category: string
	items: string
}

export interface CustomItem {
	id: string
	heading: string
	sub: string
	dates: string
	body: string
}

/** Any repeatable content item, including user-created sections. */
export type ContentItem = ExperienceItem | ProjectItem | EducationItem | SkillGroup | CustomItem

export interface CustomSection {
	id: string
	title: string
	items: CustomItem[]
}

/** The shared content. Visibility and order live on the profile, not here. */
export interface MasterResume {
	contact: Contact
	experience: ExperienceItem[]
	projects: ProjectItem[]
	education: EducationItem[]
	skills: SkillGroup[]
	customSections: CustomSection[]
}

/** The resume shape templates consume: master content resolved for a profile. */
export interface PreviewResume {
	contact: PreviewContact
	experience: ExperienceItem[]
	projects: ProjectItem[]
	education: EducationItem[]
	skills: SkillGroup[]
	customSections: CustomSection[]
}

export type SectionDirection = 'col' | 'row'

/** Per-profile layout entry: order, heading override, visibility, flow. */
export interface SectionEntry {
	id: string
	title: string
	visible: boolean
	direction: SectionDirection
}

/** Ordered ids of the items shown on a profile (absent ids are hidden). */
export interface ProfileView {
	experience: string[]
	projects: string[]
	education: string[]
	skills: string[]
	custom: Record<string, string[]>
}

/** Copy-on-write field overrides for one item (e.g. rewritten bullets). */
export type OverridePatch = Record<string, string | boolean>

export interface Profile {
	id: string
	name: string
	/** The one profile that edits the shared content directly. */
	master: boolean
	template: string
	accent: string
	columns: 1 | 2
	density: number
	/** Null means "use the template's font". */
	font: string | null
	title: string
	summary: string
	sections: SectionEntry[]
	view: ProfileView
	overrides: Record<string, OverridePatch>
}

export interface Workspace {
	version: number
	master: MasterResume
	profiles: Profile[]
	activeProfileId: string
}

import type { Conversation } from '../agent/conversations'

/** Structured cover letter: sender identity stays live from master.contact. */
export interface CoverLetter {
	recipientTitle: string
	recipientAddress: string
	jobTitle: string
	postingNumber: string
	showReLine: boolean
	body: string
	signoff: string
	dateMode: 'auto' | 'custom'
	dateCustom: string
	credentialLine: string
}

export interface Job extends Profile {
	kind: 'master' | 'job'
	company: string
	jobTitleTarget: string
	jobDescription: string
	jobUrl: string
	letter: CoverLetter
	/** Independent letter styling (option B): null font = template default. */
	letterTemplate: string
	letterAccent: string
	letterFont: string | null
	letterDensity: number
	jdSource: { filename: string; pageCount: number; extractedAt: string; pdfRefId: string } | null
	conversations: Conversation[]
	activeConversationId: string | null
}

export interface WorkspaceV3 {
	version: 3
	master: MasterResume
	jobs: Job[]
	activeJobId: string
}
