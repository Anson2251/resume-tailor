<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@vicons/utils'
import { FwbDropdown } from 'flowbite-vue'
import ModernLetterTemplate from './templates/letters/ModernLetterTemplate.vue'
import ClassicLetterTemplate from './templates/letters/ClassicLetterTemplate.vue'
import MinimalLetterTemplate from './templates/letters/MinimalLetterTemplate.vue'
import {
	ACCENTS,
	FONTS,
	TEMPLATES,
	fontStack,
	MAX_DENSITY,
	MIN_DENSITY,
	normalizeDensity,
	templateFont,
} from '../data/options'
import type { Contact, Job } from '../data/types'
import {
	Checkmark16Regular,
	Color16Regular,
	PaintBrush16Regular,
	Shapes16Regular,
	TextFont16Regular,
	AlignSpaceAroundHorizontal20Regular,
	ZoomIn16Regular,
	ZoomOut16Regular,
} from '../data/icons'

const props = defineProps<{
	job: Job
	contact: Contact
}>()

const template = computed({
	get: (): string => props.job.letterTemplate ?? 'modern',
	set: (v: string) => {
		props.job.letterTemplate = v
	},
})
const accent = computed({
	get: (): string => props.job.letterAccent ?? ACCENTS[0],
	set: (v: string) => {
		props.job.letterAccent = v
	},
})
const font = computed({
	get: (): string => props.job.letterFont ?? templateFont(props.job.letterTemplate ?? 'modern'),
	set: (v: string) => {
		props.job.letterFont = v
	},
})
const density = computed({
	get: (): number => props.job.letterDensity ?? 1,
	set: (v: number) => {
		props.job.letterDensity = normalizeDensity(v)
	},
})

const activeComponent = computed(() => {
	switch (template.value) {
		case 'classic':
			return ClassicLetterTemplate
		case 'minimal':
			return MinimalLetterTemplate
		default:
			return ModernLetterTemplate
	}
})

const densityPercent = computed(() => `${Math.round((density.value ?? 1) * 100)}%`)

function setDensity(value: number): void {
	density.value = normalizeDensity(value)
}

const MIN_ZOOM = 0.3
const MAX_ZOOM = 2
const ZOOM_STEP = 0.1
const zoom = ref(1)
const isPrinting = ref(false)
const printZoom = computed(() => (isPrinting.value ? 1 : zoom.value))
const zoomPercent = computed(() => `${Math.round(zoom.value * 100)}%`)

function clampZoom(value: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(value * 100) / 100))
}

function zoomIn(): void {
	zoom.value = clampZoom(zoom.value + ZOOM_STEP)
}

function zoomOut(): void {
	zoom.value = clampZoom(zoom.value - ZOOM_STEP)
}

function resetZoom(): void {
	zoom.value = 1
}

function handleBeforePrint(): void {
	isPrinting.value = true
}

function handleAfterPrint(): void {
	isPrinting.value = false
}

const printArea = ref<HTMLElement | null>(null)
const dragging = ref(false)
let dragX = 0
let dragY = 0
let dragLeft = 0
let dragTop = 0

function onViewportMouseDown(event: MouseEvent): void {
	if (event.button !== 0) return
	const el = printArea.value
	if (!el) return
	dragging.value = true
	dragX = event.clientX
	dragY = event.clientY
	dragLeft = el.scrollLeft
	dragTop = el.scrollTop
	event.preventDefault()
}

function onViewportMouseMove(event: MouseEvent): void {
	if (!dragging.value) return
	const el = printArea.value
	if (!el) return
	el.scrollLeft = dragLeft - (event.clientX - dragX)
	el.scrollTop = dragTop - (event.clientY - dragY)
}

function onViewportMouseUp(): void {
	dragging.value = false
}

function onViewportWheel(event: WheelEvent): void {
	event.preventDefault()
	const el = printArea.value
	if (!el) return
	const oldZoom = zoom.value
	const speed = event.ctrlKey ? 0.01 : 0.0015
	const next = clampZoom(oldZoom * Math.exp(-event.deltaY * speed))
	if (next === oldZoom) return
	const rect = el.getBoundingClientRect()
	const cx = event.clientX - rect.left
	const cy = event.clientY - rect.top
	const ratio = next / oldZoom
	zoom.value = next
	el.scrollLeft = (el.scrollLeft + cx) * ratio - cx
	el.scrollTop = (el.scrollTop + cy) * ratio - cy
}

onMounted(() => {
	window.addEventListener('beforeprint', handleBeforePrint)
	window.addEventListener('afterprint', handleAfterPrint)
	window.addEventListener('mousemove', onViewportMouseMove)
	window.addEventListener('mouseup', onViewportMouseUp)
	printArea.value?.addEventListener('wheel', onViewportWheel, { passive: false })
})

onBeforeUnmount(() => {
	window.removeEventListener('beforeprint', handleBeforePrint)
	window.removeEventListener('afterprint', handleAfterPrint)
	window.removeEventListener('mousemove', onViewportMouseMove)
	window.removeEventListener('mouseup', onViewportMouseUp)
	printArea.value?.removeEventListener('wheel', onViewportWheel)
})
</script>

<template>
	<div class="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
		<div class="no-print mb-2 flex shrink-0 flex-wrap items-center gap-4">
			<FwbDropdown placement="bottom" content-wrapper-class="w-[17rem] p-4">
				<template #trigger>
					<button
						type="button"
						class="inline-flex items-center justify-center gap-2 rounded-lg border border-default bg-neutral-primary px-3 py-1.5 text-[13px] font-medium text-body-subtle shadow-sm transition select-none hover:text-heading"
						title="Letter accent color and font"
					>
						<div class="flex gap-2 items-center">
							<div class="flex gap-1 items-center">
								<Icon size="16"><PaintBrush16Regular /></Icon>
								Style
							</div>
							<span class="mx-1 h-4 w-px bg-neutral-quaternary" aria-hidden="true"></span>
							<span class="h-3.5 w-3.5 rounded-full ring-1 ring-slate-900/15" :style="{ backgroundColor: accent }" />
							<span v-if="template && font">
								· {{ template[0].toUpperCase() + template.slice(1) }} · {{ font[0].toUpperCase() + font.slice(1) }} ·
								{{ densityPercent }}
							</span>
						</div>
					</button>
				</template>

				<div class="space-y-4">
					<div>
						<p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-body-subtle uppercase">
							<Icon size="18"><Shapes16Regular /></Icon> Templates
						</p>
						<div
							class="flex items-center gap-1 rounded-lg border border-default bg-neutral-primary p-1 shadow-sm"
							role="tablist"
							aria-label="Cover letter template"
						>
							<button
								v-for="t in TEMPLATES"
								:key="t.id"
								:title="t.hint"
								class="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[13px] font-medium whitespace-nowrap transition select-none"
								:class="
									template === t.id ? 'font-semibold text-white shadow-sm' : 'text-body-subtle hover:text-heading'
								"
								:style="template === t.id ? { backgroundColor: accent } : null"
								@click="template = t.id"
							>
								{{ t.name }}
							</button>
						</div>
					</div>

					<div>
						<p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-body-subtle uppercase">
							<Icon size="18"><AlignSpaceAroundHorizontal20Regular /></Icon> Spacing
							<span class="ml-auto font-medium normal-case tabular-nums">{{ densityPercent }}</span>
						</p>
						<div class="flex items-center gap-2">
							<span class="shrink-0 text-[11px] text-body-subtle">Compact</span>
							<input
								type="range"
								:min="MIN_DENSITY"
								:max="MAX_DENSITY"
								step="0.05"
								:value="density"
								class="w-full accent-brand"
								aria-label="Letter spacing"
								@input="setDensity(parseFloat(($event.target as HTMLInputElement).value))"
								@dblclick="density = 1"
							/>
							<span class="shrink-0 text-[11px] text-body-subtle">Roomy</span>
						</div>
					</div>

					<div>
						<p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-body-subtle uppercase">
							<Icon size="18"><Color16Regular /></Icon> Accent color
						</p>
						<div class="flex flex-wrap items-center gap-2">
							<button
								v-for="c in ACCENTS"
								:key="c"
								type="button"
								:title="c"
								class="h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-neutral-primary transition"
								:class="
									accent === c
										? 'ring-slate-400 dark:ring-slate-500'
										: 'ring-transparent hover:ring-slate-300 dark:hover:ring-slate-600'
								"
								:style="{ backgroundColor: c }"
								@click="accent = c"
							/>
						</div>
					</div>

					<div>
						<p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-body-subtle uppercase">
							<Icon size="18"><TextFont16Regular /></Icon> Font
						</p>
						<div class="grid gap-1.5">
							<button
								v-for="f in FONTS"
								:key="f.id"
								type="button"
								class="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition"
								:class="
									font === f.id ? 'border-heading bg-neutral-secondary' : 'border-default hover:bg-neutral-secondary'
								"
								:style="{ fontFamily: fontStack(f.id) }"
								@click="font = f.id"
							>
								<span class="min-w-0">
									<span class="block text-[13px] font-medium text-heading">{{ f.name }}</span>
									<span class="block text-[11px] text-body-subtle">{{ f.hint }}</span>
								</span>
								<Icon v-if="font === f.id" size="14" class="shrink-0 text-heading" aria-hidden="true">
									<Checkmark16Regular />
								</Icon>
							</button>
						</div>
					</div>
				</div>
			</FwbDropdown>
			<div class="ml-auto flex shrink-0 items-center gap-1 text-xs text-body-subtle">
				<button
					type="button"
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-body-subtle transition hover:bg-neutral-tertiary hover:text-heading disabled:opacity-30"
					title="Zoom out"
					aria-label="Zoom out"
					:disabled="zoom <= MIN_ZOOM"
					@click="zoomOut"
				>
					<Icon size="16"><ZoomOut16Regular /></Icon>
				</button>
				<button
					type="button"
					class="min-w-14 rounded-md px-1 py-1 text-center font-medium tabular-nums transition hover:bg-neutral-tertiary"
					title="Reset zoom to 100%"
					@click="resetZoom"
				>
					{{ zoomPercent }}
				</button>
				<button
					type="button"
					class="inline-flex h-7 w-7 items-center justify-center rounded-md text-body-subtle transition hover:bg-neutral-tertiary hover:text-heading disabled:opacity-30"
					title="Zoom in"
					aria-label="Zoom in"
					:disabled="zoom >= MAX_ZOOM"
					@click="zoomIn"
				>
					<Icon size="16"><ZoomIn16Regular /></Icon>
				</button>
			</div>
		</div>
		<div
			ref="printArea"
			class="print-area block overflow-auto rounded-lg border border-default bg-neutral-tertiary/70 p-6 select-none lg:min-h-0 lg:flex-1"
			:class="dragging ? 'cursor-grabbing' : 'cursor-grab'"
			@mousedown="onViewportMouseDown"
			@dragstart.prevent
		>
			<div
				class="resume-page letter-page overflow-hidden rounded-sm shadow-xl ring-1 ring-slate-900/10"
				:style="{ zoom: printZoom, '--sp': density }"
			>
				<component :is="activeComponent" :letter="job.letter" :contact="contact" :accent="accent" :font="font" />
			</div>
		</div>
	</div>
</template>
