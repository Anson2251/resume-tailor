<script setup>
import { computed } from 'vue'
import { splitComma, splitLines, visibleItems } from '../../data/resume.js'

const props = defineProps({
	resume: { type: Object, required: true },
	accent: { type: String, default: '#4f46e5' }
})

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
	<!-- Two-column modern layout with accent header and skills sidebar. -->
	<div class="min-h-full font-sans text-slate-800">
		<header class="px-10 pt-10 pb-8 text-white" :style="{ backgroundColor: accent }">
			<h1 class="text-4xl font-extrabold tracking-tight">{{ resume.contact.fullName || 'Your Name' }}</h1>
			<p v-if="resume.contact.title" class="mt-1 text-lg font-medium opacity-90">{{ resume.contact.title }}</p>
			<div v-if="contactLine" class="mt-3 text-[13px] opacity-90">{{ contactLine }}</div>
			<div v-if="linksLine" class="mt-1 text-[13px] opacity-90">{{ linksLine }}</div>
		</header>

		<div class="flex">
			<div class="min-w-0 flex-1 px-10 py-8">
				<section v-if="resume.contact.summary" class="avoid-break mb-7">
					<h2 class="mb-2 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Summary</h2>
					<p class="text-[13.5px] leading-relaxed text-slate-600">{{ resume.contact.summary }}</p>
				</section>

				<section class="mb-7">
					<h2 class="mb-3 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Experience</h2>
					<div class="space-y-5">
						<article v-for="job in shown.experience" :key="job.id" class="avoid-break">
							<div class="flex items-baseline justify-between">
								<h3 class="text-[15px] font-bold text-slate-900">{{ job.role || 'Role' }}</h3>
								<span class="shrink-0 pl-3 text-xs font-medium text-slate-500">{{
									dateRange(job.startDate, job.endDate, job.current)
								}}</span>
							</div>
							<p class="text-[13px] font-medium text-slate-500">
								{{ [job.company, job.location].filter(Boolean).join(' · ') }}
							</p>
							<ul class="mt-1.5 list-disc space-y-1 pl-5 text-[13.5px] leading-relaxed text-slate-600">
								<li v-for="(b, bi) in splitLines(job.bullets)" :key="bi">{{ b }}</li>
							</ul>
						</article>
					</div>
				</section>

				<section>
					<h2 class="mb-3 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Education</h2>
					<div class="space-y-4">
						<article v-for="edu in shown.education" :key="edu.id" class="avoid-break">
							<div class="flex items-baseline justify-between">
								<h3 class="text-[15px] font-bold text-slate-900">{{ edu.school || 'School' }}</h3>
								<span class="shrink-0 pl-3 text-xs font-medium text-slate-500">{{
									dateRange(edu.startDate, edu.endDate, false)
								}}</span>
							</div>
							<p class="text-[13px] font-medium text-slate-500">
								{{ [edu.degree, edu.field].filter(Boolean).join(' in ') }}{{ edu.gpa ? ` · GPA ${edu.gpa}` : '' }}
							</p>
							<p v-if="edu.details" class="mt-1 text-[13px] text-slate-600">{{ edu.details }}</p>
						</article>
					</div>
				</section>
			</div>

			<aside class="w-[220px] shrink-0 bg-slate-50 px-6 py-8">
				<section class="avoid-break">
					<h2 class="mb-3 text-xs font-bold tracking-[0.18em] uppercase" :style="{ color: accent }">Skills</h2>
					<div class="space-y-4">
						<div v-for="group in shown.skills" :key="group.id">
							<h3 class="text-[13px] font-bold text-slate-900">{{ group.category || 'Category' }}</h3>
							<div class="mt-1.5">
								<span
									v-for="(skill, si) in splitComma(group.items)"
									:key="si"
									class="mr-1.5 mb-1.5 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
									:style="{ backgroundColor: accent }"
								>
									{{ skill }}
								</span>
							</div>
						</div>
					</div>
				</section>
			</aside>
		</div>
	</div>
</template>
