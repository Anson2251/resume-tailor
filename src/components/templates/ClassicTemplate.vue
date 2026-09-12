<script setup>
import { computed } from 'vue'
import MarkdownText from '../MarkdownText.vue'
import { splitComma, visibleItems } from '../../data/resume.js'
import { fontStack } from '../../data/options.js'

const props = defineProps({
	resume: { type: Object, required: true },
	accent: { type: String, default: '#1e3a5f' },
	font: { type: String, default: 'serif' },
	columns: { type: Number, default: 1 }
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
			<section v-if="resume.contact.summary" class="avoid-break">
				<h2
					class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
					:style="{ color: accent, borderColor: `${accent}55` }"
				>
					Summary
				</h2>
				<MarkdownText :source="resume.contact.summary" class="mt-2 text-[13.5px] leading-relaxed" />
			</section>

			<section v-if="shown.education.length" class="pt-5">
				<h2
					class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
					:style="{ color: accent, borderColor: `${accent}55` }"
				>
					Education
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

			<section v-if="shown.experience.length" class="pt-5">
				<h2
					class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
					:style="{ color: accent, borderColor: `${accent}55` }"
				>
					Professional Experience
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

			<section v-if="shown.projects.length" class="pt-5">
				<h2
					class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
					:style="{ color: accent, borderColor: `${accent}55` }"
				>
					Projects
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

			<section v-if="shown.skills.length" class="avoid-break pt-5">
				<h2
					class="border-b pb-1 text-sm font-bold tracking-[0.25em] uppercase"
					:style="{ color: accent, borderColor: `${accent}55` }"
				>
					Skills
				</h2>
				<div class="mt-2 entry-stack-xs">
					<p v-for="group in shown.skills" :key="group.id" class="text-[13.5px]">
						<strong>{{ group.category || 'Category' }}:</strong> {{ splitComma(group.items).join(', ') }}
					</p>
				</div>
			</section>
		</div>
	</div>
</template>
