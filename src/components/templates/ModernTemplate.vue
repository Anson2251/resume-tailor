<script setup lang="ts">
import { computed } from 'vue'
import MarkdownText from '../MarkdownText.vue'
import { splitComma, visibleItems, DEFAULT_SECTION_ORDER } from '../../data/resume'
import { fontStack } from '../../data/options'
import type { CustomItem, CustomSection, PreviewResume, SectionEntry } from '../../data/types'

const props = withDefaults(
	defineProps<{
		resume: PreviewResume
		accent?: string
		font?: string
		columns?: number
		sections?: SectionEntry[]
	}>(),
	{ accent: '#4f46e5', font: 'sans', columns: 1, sections: () => [] },
)

const fontFamily = computed(() => fontStack(props.font))

const contactLine = computed(() =>
	[props.resume.contact.email, props.resume.contact.phone, props.resume.contact.location].filter(Boolean).join('  ·  '),
)

const linksLine = computed(() =>
	[props.resume.contact.website, props.resume.contact.linkedin].filter(Boolean).join('  ·  '),
)

// Only items ticked "Show" in the form appear on the resume.
const shown = computed(() => ({
	experience: visibleItems(props.resume.experience),
	projects: visibleItems(props.resume.projects),
	education: visibleItems(props.resume.education),
	skills: visibleItems(props.resume.skills),
}))

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

function customSection(id: string): CustomSection | undefined {
	return (props.resume.customSections || []).find((c) => c.id === id)
}

function customItems(id: string): CustomItem[] {
	return customSection(id)?.items ?? []
}

function customTitleText(id: string): string {
	return customSection(id)?.title ?? ''
}

function sectionConfig(id: string): SectionEntry | undefined {
	return (props.sections || []).find((s) => s.id === id)
}

function sectionVisible(id: string): boolean {
	const s = sectionConfig(id)
	return !s || s.visible !== false
}

function sectionTitle(id: string, fallback: string): string {
	const t = sectionConfig(id)?.title
	return t && t.trim() ? t.trim() : fallback
}

function sectionDirection(id: string): 'row' | 'col' {
	return sectionConfig(id)?.direction === 'row' ? 'row' : 'col'
}

function dateRange(start: string, end: string, current: boolean): string {
	const s = (start || '').trim()
	const e = current ? 'Present' : (end || '').trim()
	if (s && e) return `${s} – ${e}`
	return s || e || ''
}
</script>

<template>
	<!-- Modern layout: accent header; the body flows in one or two columns. -->
	<div class="min-h-full text-slate-800" :style="{ fontFamily }">
		<header class="avoid-break px-9 pt-5 pb-4 text-white" :style="{ backgroundColor: accent }">
			<h1 class="text-[32px] leading-tight font-extrabold tracking-tight">
				{{ resume.contact.fullName || 'Your Name' }}
			</h1>
			<p v-if="resume.contact.title" class="mt-0.5 text-[16px] font-medium opacity-90">{{ resume.contact.title }}</p>
			<div v-if="contactLine" class="mt-2 text-xs opacity-90">{{ contactLine }}</div>
			<div v-if="linksLine" class="mt-0.5 text-xs opacity-90">{{ linksLine }}</div>
		</header>

		<div class="px-9 pt-4 pb-5" :class="columns === 2 ? 'resume-columns' : ''">
			<template v-for="sid in orderedSections" :key="sid">
				<section v-if="sid === 'summary' && resume.contact.summary && sectionVisible('summary')" class="avoid-break">
					<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">
						{{ sectionTitle('summary', 'Summary') }}
					</h2>
					<MarkdownText :source="resume.contact.summary" class="text-[13px] leading-relaxed text-slate-600" />
				</section>

				<section v-else-if="sid === 'education' && shown.education.length && sectionVisible('education')" class="pt-4">
					<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">
						{{ sectionTitle('education', 'Education') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row-sm' : 'entry-stack-sm'">
						<article v-for="edu in shown.education" :key="edu.id">
							<div class="flex items-baseline justify-between">
								<h3 class="text-sm font-bold text-slate-900">{{ edu.school || 'School' }}</h3>
								<span class="shrink-0 pl-3 text-xs font-medium text-slate-500">{{
									dateRange(edu.startDate, edu.endDate, false)
								}}</span>
							</div>
							<p class="text-[13px] font-medium text-slate-500">
								{{ [edu.degree, edu.field].filter(Boolean).join(' in ') }}{{ edu.gpa ? ` · GPA ${edu.gpa}` : '' }}
							</p>
							<MarkdownText v-if="edu.details" :source="edu.details" class="mt-1 text-[12.5px] text-slate-600" />
						</article>
					</div>
				</section>

				<section
					v-else-if="sid === 'experience' && shown.experience.length && sectionVisible('experience')"
					class="pt-4"
				>
					<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">
						{{ sectionTitle('experience', 'Experience') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row-sm' : 'entry-stack-sm'">
						<article v-for="job in shown.experience" :key="job.id">
							<div class="flex items-baseline justify-between">
								<h3 class="text-sm font-bold text-slate-900">{{ job.role || 'Role' }}</h3>
								<span class="shrink-0 pl-3 text-xs font-medium text-slate-500">{{
									dateRange(job.startDate, job.endDate, job.current)
								}}</span>
							</div>
							<p class="text-[13px] font-medium text-slate-500">
								{{ [job.company, job.location].filter(Boolean).join(' · ') }}
							</p>
							<MarkdownText
								v-if="job.bullets"
								:source="job.bullets"
								class="mt-1 text-[13px] leading-relaxed text-slate-600"
							/>
						</article>
					</div>
				</section>

				<section v-else-if="sid === 'projects' && shown.projects.length && sectionVisible('projects')" class="pt-4">
					<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">
						{{ sectionTitle('projects', 'Projects') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row-sm' : 'entry-stack-sm'">
						<article v-for="project in shown.projects" :key="project.id">
							<div class="flex items-baseline justify-between">
								<h3 class="text-sm font-bold text-slate-900">{{ project.name || 'Project' }}</h3>
								<span class="shrink-0 pl-3 text-xs font-medium text-slate-500">{{
									dateRange(project.startDate, project.endDate, false)
								}}</span>
							</div>
							<p class="text-[13px] font-medium text-slate-500">
								{{ [project.tech, project.link].filter(Boolean).join(' · ') }}
							</p>
							<MarkdownText
								v-if="project.bullets"
								:source="project.bullets"
								class="mt-1 text-[13px] leading-relaxed text-slate-600"
							/>
						</article>
					</div>
				</section>

				<section v-else-if="sid === 'skills' && shown.skills.length && sectionVisible('skills')" class="pt-4">
					<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">
						{{ sectionTitle('skills', 'Skills') }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row-sm' : 'entry-stack-sm'">
						<div v-for="group in shown.skills" :key="group.id" class="avoid-break">
							<h3 class="text-xs font-bold text-slate-900">{{ group.category || 'Category' }}</h3>
							<div class="mt-1">
								<span
									v-for="(skill, si) in splitComma(group.items)"
									:key="si"
									class="mr-1 mb-1 inline-block rounded-full px-2 py-px text-[11px] font-medium text-white"
									:style="{ backgroundColor: accent }"
								>
									{{ skill }}
								</span>
							</div>
						</div>
					</div>
				</section>

				<section v-else-if="customItems(sid).length && sectionVisible(sid)" class="pt-4">
					<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">
						{{ customTitleText(sid) }}
					</h2>
					<div :class="sectionDirection(sid) === 'row' ? 'entry-row-sm' : 'entry-stack-sm'">
						<article v-for="item in customItems(sid)" :key="item.id">
							<div class="flex items-baseline justify-between">
								<h3 class="text-sm font-bold text-slate-900">{{ item.heading || 'Item' }}</h3>
								<span v-if="item.dates" class="shrink-0 pl-3 text-xs font-medium text-slate-500">{{ item.dates }}</span>
							</div>
							<p v-if="item.sub" class="text-[13px] font-medium text-slate-500">{{ item.sub }}</p>
							<MarkdownText
								v-if="item.body"
								:source="item.body"
								class="mt-1 text-[13px] leading-relaxed text-slate-600"
							/>
						</article>
					</div>
				</section>
			</template>
		</div>
	</div>
</template>
