import type {
	ContentItem,
	CustomItem,
	CustomSection,
	EducationItem,
	ExperienceItem,
	MasterResume,
	ProjectItem,
	SectionDirection,
	SectionEntry,
	SectionKey,
	SkillGroup,
} from './types'

export function uid(): string {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

// --- Content items (master resume). Visibility & order live on the profile. ---

export const blankExperience = (): ExperienceItem => ({
	id: uid(),
	role: '',
	company: '',
	location: '',
	startDate: '',
	endDate: '',
	current: false,
	bullets: '',
})

export const blankProject = (): ProjectItem => ({
	id: uid(),
	name: '',
	link: '',
	tech: '',
	startDate: '',
	endDate: '',
	bullets: '',
})

export const blankEducation = (): EducationItem => ({
	id: uid(),
	school: '',
	degree: '',
	field: '',
	startDate: '',
	endDate: '',
	gpa: '',
	details: '',
})

export const blankSkillGroup = (): SkillGroup => ({
	id: uid(),
	category: '',
	items: '',
})

/** A generic item for user-created sections: heading + subtitle + dates + markdown body. */
export const blankCustomItem = (): CustomItem => ({
	id: uid(),
	heading: '',
	sub: '',
	dates: '',
	body: '',
})

/** Editable fields of a custom-section item — used for per-profile content overrides. */
export const CUSTOM_ITEM_FIELDS: string[] = ['heading', 'sub', 'dates', 'body']

/** Human labels for custom item fields, shown in the "customized" badge. */
export const CUSTOM_FIELD_LABELS: Record<string, string> = {
	heading: 'heading',
	sub: 'subtitle',
	dates: 'dates',
	body: 'details',
}

/** Effective custom-section title: per-profile override, else the master name. */
export function customSectionTitle(
	masterSection: CustomSection | undefined,
	profileEntry: SectionEntry | undefined,
): string {
	const override = profileEntry?.title
	if (override && override.trim()) return override.trim()
	const base = masterSection?.title
	if (base && base.trim()) return base.trim()
	return 'Untitled section'
}

/** Repeatable sections, in the order they render on the form. */
export const SECTION_KEYS: string[] = ['experience', 'projects', 'education', 'skills']

/** Type guard for the repeatable-section keys. */
export function isSectionKey(key: string): key is SectionKey {
	return SECTION_KEYS.includes(key)
}

/** All resume body sections (summary + repeatable sections) with generic labels. */
export const RESUME_SECTIONS: { id: string; label: string }[] = [
	{ id: 'summary', label: 'Summary' },
	{ id: 'experience', label: 'Experience' },
	{ id: 'projects', label: 'Projects' },
	{ id: 'education', label: 'Education' },
	{ id: 'skills', label: 'Skills' },
]

export const SECTION_IDS: string[] = RESUME_SECTIONS.map((s) => s.id)

/**
 * Render order used before per-profile section settings existed.
 * Kept as the default so existing saves look exactly the same.
 */
export const DEFAULT_SECTION_ORDER: string[] = ['summary', 'education', 'experience', 'projects', 'skills']

/** A fresh per-profile section layout: default order, default names, all visible, column flow. */
export const blankSections = (): SectionEntry[] =>
	DEFAULT_SECTION_ORDER.map((id) => ({ id, title: '', visible: true, direction: 'col' as SectionDirection }))

/** Normalize stored section settings: keep known ids, fill in missing ones, drop unknown. */
export function normalizeSections(
	raw: unknown,
	master: { customSections?: CustomSection[] } | null | undefined,
): SectionEntry[] {
	const clean: SectionEntry[] = []
	const seen = new Set<string>()
	const customIds = new Set((master?.customSections || []).map((s) => s?.id))
	const valid = (id: string): boolean => SECTION_IDS.includes(id) || customIds.has(id)
	if (Array.isArray(raw)) {
		for (const entry of raw) {
			const id: unknown = typeof entry === 'string' ? entry : entry?.id
			if (typeof id !== 'string' || !id || !valid(id) || seen.has(id)) continue
			seen.add(id)
			clean.push({
				id,
				title: typeof entry?.title === 'string' ? entry.title.slice(0, 60) : '',
				visible: entry?.visible !== false,
				direction: entry?.direction === 'row' ? 'row' : 'col',
			})
		}
	}
	for (const id of DEFAULT_SECTION_ORDER) {
		if (!seen.has(id)) {
			seen.add(id)
			clean.push({ id, title: '', visible: true, direction: 'col' })
		}
	}
	for (const s of master?.customSections || []) {
		if (!seen.has(s.id)) {
			seen.add(s.id)
			clean.push({ id: s.id, title: '', visible: true, direction: 'col' })
		}
	}
	return clean
}

/** Generic display label for a section id (used as the rename placeholder). */
export function sectionLabel(id: string): string {
	return RESUME_SECTIONS.find((s) => s.id === id)?.label ?? id
}

/** Factory for a new item in a given section. */
export const SECTION_FACTORY: Record<SectionKey, () => ContentItem> = {
	experience: blankExperience,
	projects: blankProject,
	education: blankEducation,
	skills: blankSkillGroup,
}

/** Append an item to the right master list (avoids union-of-arrays push issues). */
export function appendMasterItem(master: MasterResume, key: SectionKey, item: ContentItem): void {
	;(master as unknown as Record<SectionKey, ContentItem[]>)[key].push(item)
}

/** Assign a normalized list to a master section (avoids union-key write issues). */
export function setMasterSection(master: MasterResume, key: SectionKey, items: ContentItem[]): void {
	;(master as unknown as Record<SectionKey, ContentItem[]>)[key] = items
}

/** Editable fields per section — used for per-profile content overrides. */
export const SECTION_FIELDS: Record<SectionKey, string[]> = {
	experience: ['role', 'company', 'location', 'startDate', 'endDate', 'current', 'bullets'],
	projects: ['name', 'link', 'tech', 'startDate', 'endDate', 'bullets'],
	education: ['school', 'degree', 'field', 'startDate', 'endDate', 'gpa', 'details'],
	skills: ['category', 'items'],
}

/** Human labels for overridden fields, shown in the "customized" badge. */
export const SECTION_FIELD_LABELS: Record<SectionKey, Record<string, string>> = {
	experience: {
		role: 'role',
		company: 'company',
		location: 'location',
		startDate: 'start',
		endDate: 'end',
		current: 'current',
		bullets: 'achievements',
	},
	projects: {
		name: 'name',
		link: 'link',
		tech: 'technologies',
		startDate: 'start',
		endDate: 'end',
		bullets: 'highlights',
	},
	education: {
		school: 'school',
		degree: 'degree',
		field: 'field',
		startDate: 'start',
		endDate: 'end',
		gpa: 'GPA',
		details: 'details',
	},
	skills: { category: 'category', items: 'skills' },
}

export const blankContact = () => ({
	fullName: '',
	email: '',
	phone: '',
	location: '',
	website: '',
	linkedin: '',
})

export const blankResume = (): MasterResume => ({
	contact: blankContact(),
	experience: [blankExperience()],
	projects: [blankProject()],
	education: [blankEducation()],
	skills: [blankSkillGroup()],
	customSections: [],
})

export const sampleResume = (): MasterResume => ({
	contact: {
		fullName: 'Bob Smith',
		email: 'bob.smith@example.com',
		phone: '+33 6 12 34 56 78',
		location: 'Paris, France',
		website: 'bobsmith.example.com',
		linkedin: 'linkedin.com/in/bob-smith-example',
	},
	experience: [
		{
			id: uid(),
			role: 'Senior Frontend Engineer',
			company: 'Acme Corp',
			location: 'Paris, France',
			startDate: 'Jan 2022',
			endDate: '',
			current: true,
			bullets:
				'- Led migration of a legacy jQuery dashboard to Vue 3, cutting page load time by **45%**\n- Built a reusable component library adopted by 4 product teams\n- Mentored 3 junior engineers through onboarding and code reviews',
		},
		{
			id: uid(),
			role: 'Frontend Developer',
			company: 'Bright Studio',
			location: 'Remote',
			startDate: 'Jun 2020',
			endDate: 'Dec 2021',
			current: false,
			bullets:
				'- Shipped marketing site and checkout flow serving **200k** monthly visitors\n- Improved Lighthouse performance score from 62 to **94**\n- Collaborated with designers to implement a Tailwind-based design system',
		},
	],
	projects: [
		{
			id: uid(),
			name: 'Portfolio Site',
			link: 'bobsmith.example.com',
			tech: 'Vue 3, Tailwind CSS, Vite',
			startDate: '2023',
			endDate: '',
			bullets:
				'- Designed and built a personal portfolio with blog and dark mode\n- Top post on frontend performance reached **15k** readers',
		},
	],
	education: [
		{
			id: uid(),
			school: 'State University',
			degree: 'B.S.',
			field: 'Computer Science',
			startDate: '2016',
			endDate: '2020',
			gpa: '3.8',
			details: 'Relevant coursework: **Data Structures**, Web Development, HCI',
		},
	],
	skills: [
		{ id: uid(), category: 'Languages', items: 'JavaScript, TypeScript, HTML, CSS' },
		{ id: uid(), category: 'Frameworks', items: 'Vue 3, React, Tailwind CSS, Vite' },
		{ id: uid(), category: 'Tools', items: 'Git, Figma, Playwright, Docker' },
	],
	customSections: [],
})

/**
 * Dynamic field access on content items. The item interfaces stay exact (so
 * `job.current` is still `boolean`); these helpers are the single place that
 * treats items as field maps for overrides and normalization.
 */
type FieldMap = Record<string, string | boolean | undefined>

export function readField(item: ContentItem, field: string): string | boolean | undefined {
	return (item as unknown as FieldMap)[field]
}

export function writeField(item: ContentItem, field: string, value: string | boolean): void {
	;(item as unknown as FieldMap)[field] = value
}

/** Items without an explicit flag (e.g. saved before this feature) count as visible. */
export function isVisible(item: { visible?: boolean } | null | undefined): boolean {
	return item?.visible !== false
}

export function visibleItems<T>(list: T[] | null | undefined): T[] {
	return (list || []).filter((item) => isVisible(item as { visible?: boolean } | null | undefined))
}

/** Split comma-separated skills into a clean array. */
export function splitComma(text: string | null | undefined): string[] {
	return (text || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
}
