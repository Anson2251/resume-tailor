<script setup>
import { computed } from 'vue'
import MarkdownText from '../MarkdownText.vue'
import { splitComma, visibleItems, DEFAULT_SECTION_ORDER } from '../../data/resume.js'
import { fontStack } from '../../data/options.js'

const props = defineProps({
	resume: { type: Object, required: true },
	accent: { type: String, default: '#0f766e' },
	font: { type: String, default: 'sans' },
	columns: { type: Number, default: 1 },
	sections: { type: Array, default: () => [] },
})

const fontFamily = computed(() => fontStack(props.font))

const contactBits = computed(() =>
	[props.resume.contact.email, props.resume.contact.phone, props.resume.contact.location]
		.filter(Boolean)
		.join('   ·   '),
)

const linkBits = computed(() =>
	[props.resume.contact.website, props.resume.contact.linkedin].filter(Boolean).join('   ·   '),
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

function sectionDirection(id) {
	return sectionConfig(id)?.direction === 'row' ? 'row' : 'col'
}

function dateRange(start, end, current) {
	const s = (start || '').trim()
	const e = current ? 'Present' : (end || '').trim()
	if (s && e) return `${s} — ${e}`
	return s || e || ''
}

// Only items ticked "Show" in the form appear on the resume.
const shown = computed(() => ({
	experience: visibleItems(props.resume.experience),
	projects: visibleItems(props.resume.projects),
	education: visibleItems(props.resume.education),
	skills: visibleItems(props.resume.skills),
}))
</script>

<template>
	<!-- Airy minimal layout; the body flows in one or two columns. -->
	<div class="min-h-full px-12 py-8 text-slate-800" :style="{ fontFamily }">
		<header class="avoid-break">
			<h1 class="text-[42px] leading-none font-light tracking-tight text-slate-900">
				{{ resume.contact.fullName || 'Your Name' }}
			</h1>
			<p v-if="resume.contact.title" class="mt-2 text-[15px] font-semibold" :style="{ color: accent }">
				{{ resume.contact.title }}
			</p>
			<p v-if="contactBits" class="mt-2 text-[12.5px] text-slate-500">{{ contactBits }}</p>
			<p v-if="linkBits" class="mt-0.5 text-[12.5px] font-medium" :style="{ color: accent }">{{ linkBits }}</p>
		</header>

		<div class="mt-6 h-px bg-slate-200" />

		<div :class="columns === 2 ? 'resume-columns' : ''">
			<template v-for="sid in orderedSections" :key="sid">
				<section
					v-if="sid === 'summary' && resume.contact.summary && sectionVisible('summary')"
					class="avoid-break pt-5"
				>
					<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
						{{ sectionTitle('summary', 'About') }}
					</h2>
					<MarkdownText
						:source="resume.contact.summary"
						class="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-slate-600"
					/>
				</section>

				<section v-else-if="sid === 'education' && shown.education.length && sectionVisible('education')" class="pt-5">
					<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
						{{ sectionTitle('education', 'Education') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row-sm mt-4' : 'mt-4 entry-stack-sm'">
						<article v-for="edu in shown.education" :key="edu.id">
							<h3 class="text-[14px] font-semibold text-slate-900">{{ edu.school || 'School' }}</h3>
							<p class="text-[13px] text-slate-600">{{ [edu.degree, edu.field].filter(Boolean).join(' · ') }}</p>
							<p class="mt-0.5 text-[12px] text-slate-400">
								{{ dateRange(edu.startDate, edu.endDate, false) }}{{ edu.gpa ? `  ·  GPA ${edu.gpa}` : '' }}
							</p>
							<MarkdownText v-if="edu.details" :source="edu.details" class="mt-1 text-[12.5px] text-slate-500" />
						</article>
					</div>
				</section>

				<section
					v-else-if="sid === 'experience' && shown.experience.length && sectionVisible('experience')"
					class="pt-5"
				>
					<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
						{{ sectionTitle('experience', 'Experience') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row mt-4' : 'mt-4 entry-stack'">
						<article v-for="job in shown.experience" :key="job.id">
							<div class="flex items-baseline justify-between">
								<h3 class="text-[16px] font-semibold text-slate-900">{{ job.role || 'Role' }}</h3>
								<span class="shrink-0 pl-4 text-[12px] font-medium tracking-wide text-slate-400 uppercase">{{
									dateRange(job.startDate, job.endDate, job.current)
								}}</span>
							</div>
							<p class="mt-0.5 text-[13px]" :style="{ color: accent }">
								{{ [job.company, job.location].filter(Boolean).join('  ·  ') }}
							</p>
							<MarkdownText
								v-if="job.bullets"
								:source="job.bullets"
								class="md-dot mt-2 text-[13.5px] leading-relaxed text-slate-600"
								:style="{ '--md-dot-color': accent }"
							/>
						</article>
					</div>
				</section>

				<section v-else-if="sid === 'projects' && shown.projects.length && sectionVisible('projects')" class="pt-5">
					<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
						{{ sectionTitle('projects', 'Projects') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row mt-4' : 'mt-4 entry-stack'">
						<article v-for="project in shown.projects" :key="project.id">
							<div class="flex items-baseline justify-between">
								<h3 class="text-[16px] font-semibold text-slate-900">{{ project.name || 'Project' }}</h3>
								<span class="shrink-0 pl-4 text-[12px] font-medium tracking-wide text-slate-400 uppercase">{{
									dateRange(project.startDate, project.endDate, false)
								}}</span>
							</div>
							<p class="mt-0.5 text-[13px]" :style="{ color: accent }">
								{{ [project.tech, project.link].filter(Boolean).join('  ·  ') }}
							</p>
							<MarkdownText
								v-if="project.bullets"
								:source="project.bullets"
								class="md-dot mt-2 text-[13.5px] leading-relaxed text-slate-600"
								:style="{ '--md-dot-color': accent }"
							/>
						</article>
					</div>
				</section>

				<section v-else-if="sid === 'skills' && shown.skills.length && sectionVisible('skills')" class="pt-5">
					<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
						{{ sectionTitle('skills', 'Skills') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row-sm mt-4' : 'mt-4 entry-stack-sm'">
						<div v-for="group in shown.skills" :key="group.id" class="avoid-break">
							<h3 class="text-[13px] font-semibold text-slate-900">{{ group.category || 'Category' }}</h3>
							<p class="mt-0.5 text-[13px] leading-relaxed text-slate-600">
								{{ splitComma(group.items).join('  ·  ') }}
							</p>
						</div>
					</div>
				</section>

				<section v-else-if="customSection(sid) && customSection(sid).items.length && sectionVisible(sid)" class="pt-5">
					<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">
						{{ customSection(sid).title }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row mt-4' : 'mt-4 entry-stack'">
						<article v-for="item in customSection(sid).items" :key="item.id">
							<div class="flex items-baseline justify-between">
								<h3 class="text-[16px] font-semibold text-slate-900">{{ item.heading || 'Item' }}</h3>
								<span
									v-if="item.dates"
									class="shrink-0 pl-4 text-[12px] font-medium tracking-wide text-slate-400 uppercase"
									>{{ item.dates }}</span
								>
							</div>
							<p v-if="item.sub" class="mt-0.5 text-[13px]" :style="{ color: accent }">{{ item.sub }}</p>
							<MarkdownText
								v-if="item.body"
								:source="item.body"
								class="mt-2 text-[13.5px] leading-relaxed text-slate-600"
							/>
						</article>
					</div>
				</section>
			</template>
		</div>
	</div>
</template>
