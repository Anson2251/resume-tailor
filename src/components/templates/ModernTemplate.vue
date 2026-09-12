<script setup>
import { computed } from 'vue'
import MarkdownText from '../MarkdownText.vue'
import { splitComma, visibleItems } from '../../data/resume.js'
import { fontStack } from '../../data/options.js'

const props = defineProps({
	resume: { type: Object, required: true },
	accent: { type: String, default: '#4f46e5' },
	font: { type: String, default: 'sans' },
	columns: { type: Number, default: 1 }
})

const fontFamily = computed(() => fontStack(props.font))

const contactLine = computed(() =>
	[props.resume.contact.email, props.resume.contact.phone, props.resume.contact.location]
		.filter(Boolean)
		.join('  ·  ')
)

const linksLine = computed(() =>
	[props.resume.contact.website, props.resume.contact.linkedin].filter(Boolean).join('  ·  ')
)

// Only items ticked "Show" in the form appear on the resume.
const shown = computed(() => ({
	experience: visibleItems(props.resume.experience),
	projects: visibleItems(props.resume.projects),
	education: visibleItems(props.resume.education),
	skills: visibleItems(props.resume.skills)
}))

function dateRange(start, end, current) {
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
			<h1 class="text-[32px] leading-tight font-extrabold tracking-tight">{{ resume.contact.fullName || 'Your Name' }}</h1>
			<p v-if="resume.contact.title" class="mt-0.5 text-[16px] font-medium opacity-90">{{ resume.contact.title }}</p>
			<div v-if="contactLine" class="mt-2 text-xs opacity-90">{{ contactLine }}</div>
			<div v-if="linksLine" class="mt-0.5 text-xs opacity-90">{{ linksLine }}</div>
		</header>

		<div class="px-9 pt-4 pb-5" :class="columns === 2 ? 'resume-columns' : ''">
			<section v-if="resume.contact.summary" class="avoid-break">
				<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Summary</h2>
				<MarkdownText :source="resume.contact.summary" class="text-[13px] leading-relaxed text-slate-600" />
			</section>

			<section v-if="shown.education.length" class="pt-4">
				<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Education</h2>
				<div class="entry-stack-sm">
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

			<section v-if="shown.experience.length" class="pt-4">
				<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Experience</h2>
				<div class="entry-stack-sm">
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

			<section v-if="shown.projects.length" class="pt-4">
				<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Projects</h2>
				<div class="entry-stack-sm">
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

			<section v-if="shown.skills.length" class="pt-4">
				<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Skills</h2>
				<div class="entry-stack-sm">
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
		</div>
	</div>
</template>
