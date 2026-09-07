<script setup>
import { computed } from 'vue'
import { splitComma, splitLines, visibleItems } from '../../data/resume.js'

const props = defineProps({
	resume: { type: Object, required: true },
	accent: { type: String, default: '#0f766e' }
})

const contactBits = computed(() =>
	[props.resume.contact.email, props.resume.contact.phone, props.resume.contact.location]
		.filter(Boolean)
		.join('   ·   ')
)

const linkBits = computed(() =>
	[props.resume.contact.website, props.resume.contact.linkedin].filter(Boolean).join('   ·   ')
)

function dateRange(start, end, current) {
	const s = (start || '').trim()
	const e = current ? 'Present' : (end || '').trim()
	if (s && e) return `${s} — ${e}`
	return s || e || ''
}

// Only items ticked "Show" in the form appear on the resume.
const shown = computed(() => ({
	experience: visibleItems(props.resume.experience),
	education: visibleItems(props.resume.education),
	skills: visibleItems(props.resume.skills)
}))
</script>

<template>
	<!-- Airy minimal layout, left aligned, hairline dividers. -->
	<div class="min-h-full px-12 py-12 font-sans text-slate-800">
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

		<section v-if="resume.contact.summary" class="avoid-break mt-7">
			<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">About</h2>
			<p class="mt-2 max-w-[62ch] text-[14px] leading-relaxed text-slate-600">{{ resume.contact.summary }}</p>
		</section>

		<section class="mt-8">
			<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">Experience</h2>
			<div class="mt-4 space-y-6">
				<article v-for="job in shown.experience" :key="job.id" class="avoid-break">
					<div class="flex items-baseline justify-between">
						<h3 class="text-[16px] font-semibold text-slate-900">{{ job.role || 'Role' }}</h3>
						<span class="shrink-0 pl-4 text-[12px] font-medium tracking-wide text-slate-400 uppercase">{{
							dateRange(job.startDate, job.endDate, job.current)
						}}</span>
					</div>
					<p class="mt-0.5 text-[13px]" :style="{ color: accent }">
						{{ [job.company, job.location].filter(Boolean).join('  ·  ') }}
					</p>
					<ul class="mt-2 space-y-1.5">
						<li
							v-for="(b, bi) in splitLines(job.bullets)"
							:key="bi"
							class="flex text-[13.5px] leading-relaxed text-slate-600"
						>
							<span class="mt-[9px] mr-2.5 h-1 w-1 shrink-0 rounded-full" :style="{ backgroundColor: accent }" />
							<span>{{ b }}</span>
						</li>
					</ul>
				</article>
			</div>
		</section>

		<div class="mt-8 h-px bg-slate-200" />

		<div class="mt-8 flex">
			<section class="w-1/2 min-w-0 pr-5">
				<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">Education</h2>
				<div class="mt-4 space-y-4">
					<article v-for="edu in shown.education" :key="edu.id" class="avoid-break">
						<h3 class="text-[14px] font-semibold text-slate-900">{{ edu.school || 'School' }}</h3>
						<p class="text-[13px] text-slate-600">{{ [edu.degree, edu.field].filter(Boolean).join(' · ') }}</p>
						<p class="mt-0.5 text-[12px] text-slate-400">
							{{ dateRange(edu.startDate, edu.endDate, false) }}{{ edu.gpa ? `  ·  GPA ${edu.gpa}` : '' }}
						</p>
						<p v-if="edu.details" class="mt-1 text-[12.5px] text-slate-500">{{ edu.details }}</p>
					</article>
				</div>
			</section>

			<section class="avoid-break w-1/2 min-w-0 pl-5">
				<h2 class="text-xs font-semibold tracking-[0.2em] text-slate-400 uppercase">Skills</h2>
				<div class="mt-4 space-y-3">
					<div v-for="group in shown.skills" :key="group.id">
						<h3 class="text-[13px] font-semibold text-slate-900">{{ group.category || 'Category' }}</h3>
						<p class="mt-0.5 text-[13px] leading-relaxed text-slate-600">{{ splitComma(group.items).join('  ·  ') }}</p>
					</div>
				</div>
			</section>
		</div>
	</div>
</template>
