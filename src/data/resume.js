export function uid() {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

// --- Content items (master resume). Visibility & order live on the profile. ---

export const blankExperience = () => ({
	id: uid(),
	role: '',
	company: '',
	location: '',
	startDate: '',
	endDate: '',
	current: false,
	bullets: ''
})

export const blankProject = () => ({
	id: uid(),
	name: '',
	link: '',
	tech: '',
	startDate: '',
	endDate: '',
	bullets: ''
})

export const blankEducation = () => ({
	id: uid(),
	school: '',
	degree: '',
	field: '',
	startDate: '',
	endDate: '',
	gpa: '',
	details: ''
})

export const blankSkillGroup = () => ({
	id: uid(),
	category: '',
	items: ''
})

/** Repeatable sections, in the order they render on the form. */
export const SECTION_KEYS = ['experience', 'projects', 'education', 'skills']

/** Factory for a new item in a given section. */
export const SECTION_FACTORY = {
	experience: blankExperience,
	projects: blankProject,
	education: blankEducation,
	skills: blankSkillGroup
}

/** Editable fields per section — used for per-profile content overrides. */
export const SECTION_FIELDS = {
	experience: ['role', 'company', 'location', 'startDate', 'endDate', 'current', 'bullets'],
	projects: ['name', 'link', 'tech', 'startDate', 'endDate', 'bullets'],
	education: ['school', 'degree', 'field', 'startDate', 'endDate', 'gpa', 'details'],
	skills: ['category', 'items']
}

/** Human labels for overridden fields, shown in the "customized" badge. */
export const SECTION_FIELD_LABELS = {
	experience: {
		role: 'role',
		company: 'company',
		location: 'location',
		startDate: 'start',
		endDate: 'end',
		current: 'current',
		bullets: 'achievements'
	},
	projects: {
		name: 'name',
		link: 'link',
		tech: 'technologies',
		startDate: 'start',
		endDate: 'end',
		bullets: 'highlights'
	},
	education: {
		school: 'school',
		degree: 'degree',
		field: 'field',
		startDate: 'start',
		endDate: 'end',
		gpa: 'GPA',
		details: 'details'
	},
	skills: { category: 'category', items: 'skills' }
}

export const blankContact = () => ({
	fullName: '',
	email: '',
	phone: '',
	location: '',
	website: '',
	linkedin: ''
})

export const blankResume = () => ({
	contact: blankContact(),
	experience: [blankExperience()],
	projects: [blankProject()],
	education: [blankEducation()],
	skills: [blankSkillGroup()]
})

export const sampleResume = () => ({
	contact: {
		fullName: 'Bob Smith',
		email: 'bob.smith@example.com',
		phone: '+33 6 12 34 56 78',
		location: 'Paris, France',
		website: 'bobsmith.example.com',
		linkedin: 'linkedin.com/in/bob-smith-example'
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
				'- Led migration of a legacy jQuery dashboard to Vue 3, cutting page load time by **45%**\n- Built a reusable component library adopted by 4 product teams\n- Mentored 3 junior engineers through onboarding and code reviews'
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
				'- Shipped marketing site and checkout flow serving **200k** monthly visitors\n- Improved Lighthouse performance score from 62 to **94**\n- Collaborated with designers to implement a Tailwind-based design system'
		}
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
				'- Designed and built a personal portfolio with blog and dark mode\n- Top post on frontend performance reached **15k** readers'
		}
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
			details: 'Relevant coursework: **Data Structures**, Web Development, HCI'
		}
	],
	skills: [
		{ id: uid(), category: 'Languages', items: 'JavaScript, TypeScript, HTML, CSS' },
		{ id: uid(), category: 'Frameworks', items: 'Vue 3, React, Tailwind CSS, Vite' },
		{ id: uid(), category: 'Tools', items: 'Git, Figma, Playwright, Docker' }
	]
})

/** Items without an explicit flag (e.g. saved before this feature) count as visible. */
export function isVisible(item) {
	return item.visible !== false
}

export function visibleItems(list) {
	return (list || []).filter(isVisible)
}

/** Split comma-separated skills into a clean array. */
export function splitComma(text) {
	return (text || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
}
