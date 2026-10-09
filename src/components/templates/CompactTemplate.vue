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
	{ accent: '#111111', font: 'serif', columns: 1, sections: () => [] },
)

const fontFamily = computed(() => fontStack(props.font))

/** Contact order mirrors Jake's LaTeX: phone | email | linkedin | github(website) | location. */
const contactParts = computed(() => {
	const c = props.resume.contact
	const link = (v: string) => v.trim()
	const parts: { text: string; href: string | null }[] = []
	if (c.phone.trim()) parts.push({ text: c.phone.trim(), href: null })
	if (c.email.trim()) parts.push({ text: c.email.trim(), href: `mailto:${c.email.trim()}` })
	if (c.linkedin.trim())
		parts.push({
			text: c.linkedin.trim().replace(/^https?:\/\//, ''),
			href: c.linkedin.trim().startsWith('http') ? c.linkedin.trim() : `https://${c.linkedin.trim()}`,
		})
	if (c.website.trim())
		parts.push({
			text: c.website.trim().replace(/^https?:\/\//, ''),
			href: c.website.trim().startsWith('http') ? c.website.trim() : `https://${c.website.trim()}`,
		})
	if (c.location.trim()) parts.push({ text: c.location.trim(), href: null })
	return parts.filter((p) => link(p.text))
})

// Per-profile section layout: order, custom headings, visibility.
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

// Only items ticked "Show" in the form appear on the resume.
const shown = computed(() => ({
	experience: visibleItems(props.resume.experience),
	projects: visibleItems(props.resume.projects),
	education: visibleItems(props.resume.education),
	skills: visibleItems(props.resume.skills),
}))
</script>

<template>
	<!-- Compact layout: Jake's-resume density. Centered serif header, ruled
	     small-caps sections, two-line entries, tight bullets, inline skills. -->
	<div class="min-h-full text-[#111]" :style="{ fontFamily }">
		<div style="padding: 9mm 12mm 10mm">
			<header class="avoid-break text-center">
				<h1 class="text-[26px] leading-none font-bold tracking-tight">
					{{ resume.contact.fullName || 'Your Name' }}
				</h1>
				<p v-if="contactParts.length" class="mt-1 text-[10px] leading-tight">
					<template v-for="(p, i) in contactParts" :key="i">
						<span v-if="i > 0" class="mx-1">|</span
						><a v-if="p.href" :href="p.href" class="underline underline-offset-2">{{ p.text }}</a
						><span v-else>{{ p.text }}</span>
					</template>
				</p>
			</header>

			<div :class="columns === 2 ? 'resume-columns' : ''">
				<template v-for="sid in orderedSections" :key="sid">
					<section
						v-if="sid === 'summary' && resume.contact.summary && sectionVisible('summary')"
						class="avoid-break"
						style="padding-top: calc(0.4rem * var(--sp, 1))"
					>
						<h2
							class="border-b border-black pb-px text-[11px] font-bold tracking-[0.06em] uppercase"
							style="font-variant: small-caps"
						>
							{{ sectionTitle('summary', 'Summary') }}
						</h2>
						<MarkdownText :source="resume.contact.summary" class="mt-0.5 text-[10.5px] leading-[1.35]" />
					</section>

					<section
						v-else-if="sid === 'education' && shown.education.length && sectionVisible('education')"
						style="padding-top: calc(0.4rem * var(--sp, 1))"
					>
						<h2
							class="border-b border-black pb-px text-[11px] font-bold tracking-[0.06em] uppercase"
							style="font-variant: small-caps"
						>
							{{ sectionTitle('education', 'Education') }}
						</h2>
						<div :class="sectionDirection(sid) === 'row' ? 'entry-row-xs' : ''" style="margin-top: 0.2rem">
							<div
								v-if="sectionDirection(sid) !== 'row'"
								style="display: flex; flex-direction: column; gap: calc(0.3rem * var(--sp, 1))"
							>
								<article v-for="edu in shown.education" :key="edu.id">
									<div class="flex items-baseline justify-between gap-3">
										<h3 class="text-[11px] font-bold">{{ edu.school || 'School' }}</h3>
										<span class="shrink-0 text-[10.5px]">{{ dateRange(edu.startDate, edu.endDate, false) }}</span>
									</div>
									<p class="text-[10.5px] italic">
										{{ [edu.degree, edu.field].filter(Boolean).join(' in ') }}{{ edu.gpa ? `, GPA: ${edu.gpa}` : '' }}
									</p>
									<MarkdownText
										v-if="edu.details"
										:source="edu.details"
										class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
									/>
								</article>
							</div>
							<article v-else v-for="edu in shown.education" :key="edu.id">
								<div class="flex items-baseline justify-between gap-3">
									<h3 class="text-[11px] font-bold">{{ edu.school || 'School' }}</h3>
									<span class="shrink-0 text-[10.5px] italic">{{ dateRange(edu.startDate, edu.endDate, false) }}</span>
								</div>
								<p class="text-[10.5px] italic">
									{{ [edu.degree, edu.field].filter(Boolean).join(' in ') }}{{ edu.gpa ? `, GPA: ${edu.gpa}` : '' }}
								</p>
								<MarkdownText
									v-if="edu.details"
									:source="edu.details"
									class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
								/>
							</article>
						</div>
					</section>

					<section
						v-else-if="sid === 'experience' && shown.experience.length && sectionVisible('experience')"
						style="padding-top: calc(0.4rem * var(--sp, 1))"
					>
						<h2
							class="border-b border-black pb-px text-[11px] font-bold tracking-[0.06em] uppercase"
							style="font-variant: small-caps"
						>
							{{ sectionTitle('experience', 'Experience') }}
						</h2>
						<div :class="sectionDirection(sid) === 'row' ? 'entry-row-xs' : ''" style="margin-top: 0.2rem">
							<div
								v-if="sectionDirection(sid) !== 'row'"
								style="display: flex; flex-direction: column; gap: calc(0.35rem * var(--sp, 1))"
							>
								<article v-for="job in shown.experience" :key="job.id">
									<div class="flex items-baseline justify-between gap-3">
										<h3 class="text-[11px] font-bold">{{ job.role || 'Role' }}</h3>
										<span class="shrink-0 text-[10.5px]">{{ dateRange(job.startDate, job.endDate, job.current) }}</span>
									</div>
									<div class="flex items-baseline justify-between gap-3">
										<p class="text-[10.5px] italic">{{ job.company }}</p>
										<span v-if="job.location" class="shrink-0 text-[10.5px] italic">{{ job.location }}</span>
									</div>
									<MarkdownText
										v-if="job.bullets"
										:source="job.bullets"
										class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
									/>
								</article>
							</div>
							<article v-else v-for="job in shown.experience" :key="job.id">
								<div class="flex items-baseline justify-between gap-3">
									<h3 class="text-[11px] font-bold">{{ job.role || 'Role' }}</h3>
									<span class="shrink-0 text-[10.5px]">{{ dateRange(job.startDate, job.endDate, job.current) }}</span>
								</div>
								<p class="text-[10.5px] italic">{{ [job.company, job.location].filter(Boolean).join(' · ') }}</p>
								<MarkdownText
									v-if="job.bullets"
									:source="job.bullets"
									class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
								/>
							</article>
						</div>
					</section>

					<section
						v-else-if="sid === 'projects' && shown.projects.length && sectionVisible('projects')"
						style="padding-top: calc(0.4rem * var(--sp, 1))"
					>
						<h2
							class="border-b border-black pb-px text-[11px] font-bold tracking-[0.06em] uppercase"
							style="font-variant: small-caps"
						>
							{{ sectionTitle('projects', 'Projects') }}
						</h2>
						<div :class="sectionDirection(sid) === 'row' ? 'entry-row-xs' : ''" style="margin-top: 0.2rem">
							<div
								v-if="sectionDirection(sid) !== 'row'"
								style="display: flex; flex-direction: column; gap: calc(0.35rem * var(--sp, 1))"
							>
								<article v-for="project in shown.projects" :key="project.id">
									<div class="flex items-baseline justify-between gap-3">
										<h3 class="text-[11px] font-bold">
											{{ project.name || 'Project'
											}}<span v-if="project.tech" class="font-normal italic"> | {{ project.tech }}</span>
										</h3>
										<span class="shrink-0 text-[10.5px]">{{
											dateRange(project.startDate, project.endDate, false)
										}}</span>
									</div>
									<MarkdownText
										v-if="project.bullets"
										:source="project.bullets"
										class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
									/>
								</article>
							</div>
							<article v-else v-for="project in shown.projects" :key="project.id">
								<div class="flex items-baseline justify-between gap-3">
									<h3 class="text-[11px] font-bold">{{ project.name || 'Project' }}</h3>
									<span class="shrink-0 text-[10.5px]">{{ dateRange(project.startDate, project.endDate, false) }}</span>
								</div>
								<p v-if="project.tech" class="text-[10.5px] italic">{{ project.tech }}</p>
								<MarkdownText
									v-if="project.bullets"
									:source="project.bullets"
									class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
								/>
							</article>
						</div>
					</section>

					<section
						v-else-if="sid === 'skills' && shown.skills.length && sectionVisible('skills')"
						class="avoid-break"
						style="padding-top: calc(0.4rem * var(--sp, 1))"
					>
						<h2
							class="border-b border-black pb-px text-[11px] font-bold tracking-[0.06em] uppercase"
							style="font-variant: small-caps"
						>
							{{ sectionTitle('skills', 'Technical Skills') }}
						</h2>
						<div style="margin-top: 0.2rem; display: flex; flex-direction: column; gap: 0.1rem">
							<p v-for="group in shown.skills" :key="group.id" class="text-[10.5px] leading-[1.35]">
								<strong>{{ group.category || 'Category' }}:</strong> {{ splitComma(group.items).join(', ') }}
							</p>
						</div>
					</section>

					<section
						v-else-if="customItems(sid).length && sectionVisible(sid)"
						style="padding-top: calc(0.4rem * var(--sp, 1))"
					>
						<h2
							class="border-b border-black pb-px text-[11px] font-bold tracking-[0.06em] uppercase"
							style="font-variant: small-caps"
						>
							{{ customTitleText(sid) }}
						</h2>
						<div :class="sectionDirection(sid) === 'row' ? 'entry-row-xs' : ''" style="margin-top: 0.2rem">
							<div
								v-if="sectionDirection(sid) !== 'row'"
								style="display: flex; flex-direction: column; gap: calc(0.35rem * var(--sp, 1))"
							>
								<article v-for="item in customItems(sid)" :key="item.id">
									<div class="flex items-baseline justify-between gap-3">
										<h3 class="text-[11px] font-bold">{{ item.heading || 'Item' }}</h3>
										<span v-if="item.dates" class="shrink-0 text-[10.5px]">{{ item.dates }}</span>
									</div>
									<p v-if="item.sub" class="text-[10.5px] italic">{{ item.sub }}</p>
									<MarkdownText
										v-if="item.body"
										:source="item.body"
										class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
									/>
								</article>
							</div>
							<article v-else v-for="item in customItems(sid)" :key="item.id">
								<div class="flex items-baseline justify-between gap-3">
									<h3 class="text-[11px] font-bold">{{ item.heading || 'Item' }}</h3>
									<span v-if="item.dates" class="shrink-0 text-[10.5px]">{{ item.dates }}</span>
								</div>
								<p v-if="item.sub" class="text-[10.5px] italic">{{ item.sub }}</p>
								<MarkdownText
									v-if="item.body"
									:source="item.body"
									class="compact-bullets mt-0.5 text-[10.5px] leading-[1.35]"
								/>
							</article>
						</div>
					</section>
				</template>
			</div>
		</div>
	</div>
</template>

<style>
/* Tighter-than-default bullets for the dense one-page look. Scoped to this
   template so the other templates keep their rhythm. */
.compact-bullets ul,
.compact-bullets ol {
	padding-left: 1.1em;
}
.compact-bullets li + li {
	margin-top: calc(0.1em * var(--sp, 1));
}
.compact-bullets > div > * + * {
	margin-top: calc(0.3em * var(--sp, 1));
}
</style>
