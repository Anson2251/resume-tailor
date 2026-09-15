<script setup>
import { computed } from 'vue'
import MarkdownText from '../MarkdownText.vue'
import { splitComma, visibleItems, DEFAULT_SECTION_ORDER } from '../../data/resume.js'
import { fontStack } from '../../data/options.js'

const props = defineProps({
	resume: { type: Object, required: true },
	accent: { type: String, default: '#1e3a5f' },
	font: { type: String, default: 'serif' },
	columns: { type: Number, default: 1 },
	sections: { type: Array, default: () => [] }
})

const fontFamily = computed(() => fontStack(props.font))

const contactLine = computed(() =>
	[
		props.resume.contact.email,
		props.resume.contact.phone,
		props.resume.contact.location,
		props.resume.contact.website,
		props.resume.contact.linkedin
	].filter(Boolean)
)

// Per-profile section layout: order, custom headings, visibility.
// Falls back to the historical render order so old saves look unchanged.
const orderedSections = computed(() => {
	const fixed = new Set(['summary', 'experience', 'projects', 'education', 'skills'])
	const customs = new Set((props.resume.customSections || []).map((c) => c.id))
	const ids = (props.sections || []).map((s) => s?.id).filter((id) => fixed.has(id) || customs.has(id))
	for (const id of DEFAULT_SECTION_ORDER) if (!ids.includes(id)) ids.push(id)
	for (const c of props.resume.customSections || []) if (!ids.includes(c.id)) ids.push(c.id)
	return ids
})

function customSection(id) {
	return (props.resume.customSections || []).find((c) => c.id === id)
}

function sectionConfig(id) {
	return (props.sections || []).find((s) => s?.id === id)
}

function sectionVisible(id) {
	const s = sectionConfig(id)
	return !s || s.visible !== false
}

function sectionTitle(id, fallback) {
	const t = sectionConfig(id)?.title
	return t && t.trim() ? t.trim() : fallback
}

function dateRange(start, end, current) {
	const s = (start || '').trim()
	const e = current ? 'Present' : (end || '').trim()
	if (s && e) return `${s} – ${e}`
	return s || e || ''
}

// Only items ticked "Show" in the form appear on the resume.
const shown = computed(() => ({
	experience: visibleItems(props.resume.experience),
	projects: visibleItems(props.resume.projects),
	education: visibleItems(props.resume.education),
	skills: visibleItems(props.resume.skills)
}))
</script>

<template>
	<!-- Classic layout: centered serif header; the body flows in one or two columns. -->
	<div class="min-h-full px-12 py-8 text-slate-800" :style="{ fontFamily }">
		<header class="avoid-break border-b-2 pb-5 text-center" :style="{ borderColor: accent }">
			<h1 class="text-4xl font-bold tracking-wide uppercase">{{ resume.contact.fullName || 'Your Name' }}</h1>
			<p v-if="resume.contact.title" class="mt-1 text-lg italic" :style="{ color: accent }">
				{{ resume.contact.title }}
			</p>
			<p v-if="contactLine.length" class="mt-2 text-[12.5px] text-slate-600">
				{{ contactLine.join('  |  ') }}
			</p>
		</header>

		<div :class="columns === 2 ? 'resume-columns' : ''" class="pt-5">
			<template v-for="sid in orderedSections" :key="sid">
				<section v-if="sid === 'summary' && resume.contact.summary && sectionVisible('summary')" class="avoid-break">
					<h2
						class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
						:style="{ color: accent, borderColor: `${accent}55` }"
					>
						{{ sectionTitle('summary', 'Summary') }}
					</h2>
					<MarkdownText :source="resume.contact.summary" class="mt-2 text-[13.5px] leading-relaxed" />
				</section>

				<section v-else-if="sid === 'education' && shown.education.length && sectionVisible('education')" class="pt-5">
					<h2
						class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
						:style="{ color: accent, borderColor: `${accent}55` }"
					>
						{{ sectionTitle('education', 'Education') }}
					</h2>
				<div class="mt-3 entry-stack-sm">
					<article v-for="edu in shown.education" :key="edu.id">
						<div class="flex items-baseline justify-between">
							<h3 class="text-[15px] font-bold">{{ edu.school || 'School' }}</h3>
							<span class="shrink-0 pl-3 text-[12.5px] italic text-slate-500">{{
								dateRange(edu.startDate, edu.endDate, false)
							}}</span>
						</div>
						<p class="text-[13px] italic text-slate-600">
							{{ [edu.degree, edu.field].filter(Boolean).join(' in ') }}{{ edu.gpa ? `, GPA: ${edu.gpa}` : '' }}
						</p>
						<MarkdownText v-if="edu.details" :source="edu.details" class="mt-0.5 text-[13px]" />
					</article>
				</div>
			</section>

				<section v-else-if="sid === 'experience' && shown.experience.length && sectionVisible('experience')" class="pt-5">
					<h2
						class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
						:style="{ color: accent, borderColor: `${accent}55` }"
					>
						{{ sectionTitle('experience', 'Professional Experience') }}
					</h2>
				<div class="mt-3 entry-stack">
					<article v-for="job in shown.experience" :key="job.id">
						<div class="flex items-baseline justify-between">
							<h3 class="text-[15px] font-bold">{{ job.role || 'Role' }}, {{ job.company || 'Company' }}</h3>
							<span class="shrink-0 pl-3 text-[12.5px] italic text-slate-500">{{
								dateRange(job.startDate, job.endDate, job.current)
							}}</span>
						</div>
						<p v-if="job.location" class="text-[12.5px] italic text-slate-500">{{ job.location }}</p>
						<MarkdownText v-if="job.bullets" :source="job.bullets" class="mt-1.5 text-[13.5px] leading-relaxed" />
					</article>
				</div>
			</section>

				<section v-else-if="sid === 'projects' && shown.projects.length && sectionVisible('projects')" class="pt-5">
					<h2
						class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
						:style="{ color: accent, borderColor: `${accent}55` }"
					>
						{{ sectionTitle('projects', 'Projects') }}
					</h2>
				<div class="mt-3 entry-stack">
					<article v-for="project in shown.projects" :key="project.id">
						<div class="flex items-baseline justify-between">
							<h3 class="text-[15px] font-bold">{{ project.name || 'Project' }}</h3>
							<span class="shrink-0 pl-3 text-[12.5px] italic text-slate-500">{{
								dateRange(project.startDate, project.endDate, false)
							}}</span>
						</div>
						<p v-if="project.tech || project.link" class="text-[12.5px] italic text-slate-500">
							{{ [project.tech, project.link].filter(Boolean).join('  ·  ') }}
						</p>
						<MarkdownText v-if="project.bullets" :source="project.bullets" class="mt-1.5 text-[13.5px] leading-relaxed" />
					</article>
				</div>
			</section>

				<section v-else-if="sid === 'skills' && shown.skills.length && sectionVisible('skills')" class="avoid-break pt-5">
					<h2
						class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
						:style="{ color: accent, borderColor: `${accent}55` }"
					>
						{{ sectionTitle('skills', 'Skills') }}
					</h2>
				<div class="mt-2 entry-stack-xs">
					<p v-for="group in shown.skills" :key="group.id" class="text-[13.5px]">
						<strong>{{ group.category || 'Category' }}:</strong> {{ splitComma(group.items).join(', ') }}
					</p>
				</div>
			</section>

			<section v-else-if="customSection(sid) && customSection(sid).items.length && sectionVisible(sid)" class="pt-5">
				<h2
					class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
					:style="{ color: accent, borderColor: `${accent}55` }"
				>
					{{ customSection(sid).title }}
				</h2>
				<div class="mt-3 entry-stack">
					<article v-for="item in customSection(sid).items" :key="item.id">
						<div class="flex items-baseline justify-between">
							<h3 class="text-[15px] font-bold">{{ item.heading || 'Item' }}</h3>
							<span v-if="item.dates" class="shrink-0 pl-3 text-[12.5px] italic text-slate-500">{{ item.dates }}</span>
						</div>
						<p v-if="item.sub" class="text-[13px] italic text-slate-600">{{ item.sub }}</p>
						<MarkdownText v-if="item.body" :source="item.body" class="mt-1.5 text-[13.5px] leading-relaxed" />
					</article>
				</div>
			</section>
			</template>
		</div>
	</div>
</template>
