export function uid() {
	if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
	return `id-${Date.now()}-${Math.floor(Math.random() * 1e9)}`
}

export const blankExperience = () => ({
	id: uid(),
	visible: true,
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
	visible: true,
	name: '',
	link: '',
	tech: '',
	startDate: '',
	endDate: '',
	bullets: ''
})

export const blankEducation = () => ({
	id: uid(),
	visible: true,
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
	visible: true,
	category: '',
	items: ''
})

export const blankResume = () => ({
	contact: {
		fullName: '',
		title: '',
		email: '',
		phone: '',
		location: '',
		website: '',
		linkedin: '',
		summary: ''
	},
	experience: [blankExperience()],
	projects: [blankProject()],
	education: [blankEducation()],
	skills: [blankSkillGroup()]
})

export const sampleResume = () => ({
	contact: {
		fullName: 'Alex Morgan',
		title: 'Frontend Engineer',
		email: 'alex.morgan@example.com',
		phone: '+1 (555) 123-4567',
		location: 'San Francisco, CA',
		website: 'alexmorgan.dev',
		linkedin: 'linkedin.com/in/alexmorgan',
		summary:
			'Frontend engineer with 5 years of experience building responsive web apps with Vue and React. Passionate about design systems, performance, and turning ambiguous product ideas into polished user experiences.'
	},
	experience: [
		{
			id: uid(),
			visible: true,
			role: 'Senior Frontend Engineer',
			company: 'Acme Corp',
			location: 'San Francisco, CA',
			startDate: 'Jan 2022',
			endDate: '',
			current: true,
			bullets:
				'Led migration of a legacy jQuery dashboard to Vue 3, cutting page load time by 45%\nBuilt a reusable component library adopted by 4 product teams\nMentored 3 junior engineers through onboarding and code reviews'
		},
		{
			id: uid(),
			visible: true,
			role: 'Frontend Developer',
			company: 'Bright Studio',
			location: 'Remote',
			startDate: 'Jun 2020',
			endDate: 'Dec 2021',
			current: false,
			bullets:
				'Shipped marketing site and checkout flow serving 200k monthly visitors\nImproved Lighthouse performance score from 62 to 94\nCollaborated with designers to implement a Tailwind-based design system'
		}
	],
	projects: [
		{
			id: uid(),
			visible: true,
			name: 'Portfolio Site',
			link: 'alexmorgan.dev',
			tech: 'Vue 3, Tailwind CSS, Vite',
			startDate: '2023',
			endDate: '',
			bullets:
				'Designed and built a personal portfolio with blog and dark mode\nTop post on frontend performance reached 15k readers'
		}
	],
	education: [
		{
			id: uid(),
			visible: true,
			school: 'State University',
			degree: 'B.S.',
			field: 'Computer Science',
			startDate: '2016',
			endDate: '2020',
			gpa: '3.8',
			details: 'Relevant coursework: Data Structures, Web Development, HCI'
		}
	],
	skills: [
		{ id: uid(), visible: true, category: 'Languages', items: 'JavaScript, TypeScript, HTML, CSS' },
		{ id: uid(), visible: true, category: 'Frameworks', items: 'Vue 3, React, Tailwind CSS, Vite' },
		{ id: uid(), visible: true, category: 'Tools', items: 'Git, Figma, Playwright, Docker' }
	]
})

/** Items without an explicit flag (e.g. saved before this feature) count as visible. */
export function isVisible(item) {
	return item.visible !== false
}

export function visibleItems(list) {
	return (list || []).filter(isVisible)
}

/** Split a textarea (one item per line) into a clean string array. */
export function splitLines(text) {
	return (text || '')
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean)
}

/** Split comma-separated skills into a clean array. */
export function splitComma(text) {
	return (text || '')
		.split(',')
		.map((s) => s.trim())
		.filter(Boolean)
}

export const STORAGE_KEY = 'resume-tailor-data-v1'
