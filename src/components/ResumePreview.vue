<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@vicons/utils'
import ModernTemplate from './templates/ModernTemplate.vue'
import ClassicTemplate from './templates/ClassicTemplate.vue'
import MinimalTemplate from './templates/MinimalTemplate.vue'
import Popover from './Popover.vue'
import { ACCENTS, COLUMNS, FONTS, TEMPLATES, fontStack } from '../data/options.js'
import { SECTION_IDS, blankSections, sectionLabel } from '../data/resume.js'
import {
	Add16Regular,
	ArrowDown16Regular,
	ArrowReset20Regular,
	ArrowUp16Regular,
	Checkmark16Regular,
	Color16Regular,
	Dismiss16Regular,
	AlignSpaceEvenlyHorizontal20Regular,
	List16Regular,
	PaintBrush16Regular,
	ReOrderDotsVertical16Regular,
	TextColumnTwo20Regular,
	TextFont16Regular,
	Shapes16Regular,
} from '../data/icons.js'

const props = defineProps({
	resume: { type: Object, required: true },
})

const template = defineModel('template', { default: 'modern' })
const accent = defineModel('accent', { default: '#4f46e5' })
const font = defineModel('font', { default: 'sans' })
const columns = defineModel('columns', { default: 1 })
const sections = defineModel('sections', { default: () => blankSections() })

const emit = defineEmits(['add-section', 'delete-section'])

/** Built-in sections can only be hidden; user-created ones can be deleted. */
const isCustomSection = (id) => !SECTION_IDS.includes(id)

const activeComponent = computed(() => {
	switch (template.value) {
		case 'classic':
			return ClassicTemplate
		case 'minimal':
			return MinimalTemplate
		default:
			return ModernTemplate
	}
})

// --- Sections (order / names / visibility), saved per profile ---

const visibleSectionCount = computed(() => (sections.value || []).filter((s) => s.visible !== false).length)
const sectionCount = computed(() => (sections.value || []).length)

function moveSection(id, delta) {
	const next = [...(sections.value || [])]
	const i = next.findIndex((s) => s.id === id)
	const target = i + delta
	if (i === -1 || target < 0 || target >= next.length) return
	const [item] = next.splice(i, 1)
	next.splice(target, 0, item)
	sections.value = next
}

function toggleSection(id, visible) {
	sections.value = (sections.value || []).map((s) => (s.id === id ? { ...s, visible } : s))
}

function renameSection(id, title) {
	sections.value = (sections.value || []).map((s) => (s.id === id ? { ...s, title } : s))
}

function resetSections() {
	// Built-ins go back to defaults; user-created sections are kept (shown,
	// default names, column flow) so reset never destroys content.
	const customs = (sections.value || [])
		.filter((s) => isCustomSection(s.id))
		.map((s) => ({ ...s, title: '', visible: true, direction: 'col' }))
	sections.value = [...blankSections(), ...customs]
}

function toggleDirection(id) {
	sections.value = (sections.value || []).map((s) =>
		s.id === id ? { ...s, direction: s.direction === 'row' ? 'col' : 'row' } : s,
	)
}

const sectionDirection = (id) => ((sections.value || []).find((s) => s.id === id)?.direction === 'row' ? 'row' : 'col')

// Drag to reorder sections.
const dragSectionId = ref(null)
const dropSectionTarget = ref(null)

function onSectionDragStart(event, section) {
	dragSectionId.value = section.id
	dropSectionTarget.value = null
	event.dataTransfer.effectAllowed = 'move'
	event.dataTransfer.setData('text/plain', section.id) // required by Firefox
}

function onSectionDragOver(event, section) {
	if (!dragSectionId.value || section.id === dragSectionId.value) return
	event.preventDefault()
	event.dataTransfer.dropEffect = 'move'
	const rect = event.currentTarget.getBoundingClientRect()
	dropSectionTarget.value = {
		id: section.id,
		position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
	}
}

function onSectionDrop(event, section) {
	if (!dragSectionId.value) return
	event.preventDefault()
	const target = dropSectionTarget.value
	if (target && target.id === section.id) {
		const next = [...(sections.value || [])]
		const from = next.findIndex((s) => s.id === dragSectionId.value)
		if (from !== -1) {
			const [item] = next.splice(from, 1)
			let to = next.findIndex((s) => s.id === section.id)
			if (to !== -1) {
				if (target.position === 'after') to += 1
				next.splice(to, 0, item)
				sections.value = next
			}
		}
	}
	onSectionDragEnd()
}

function onSectionDragEnd() {
	dragSectionId.value = null
	dropSectionTarget.value = null
}

// Zoom only affects on-screen display; printing is always full-size A4.
// The CSS `zoom` property leaks into print, so we force it back to 1 while
// printing (belt-and-suspenders next to the `zoom: 1 !important` print rule
// in style.css, which covers the print-preview render itself).
const ZOOMS = [0.6, 0.8, 1]
const zoom = ref(1)
const isPrinting = ref(false)
const printZoom = computed(() => (isPrinting.value ? 1 : zoom.value))

function handleBeforePrint() {
	isPrinting.value = true
}

function handleAfterPrint() {
	isPrinting.value = false
}

onMounted(() => {
	window.addEventListener('beforeprint', handleBeforePrint)
	window.addEventListener('afterprint', handleAfterPrint)
})

onBeforeUnmount(() => {
	window.removeEventListener('beforeprint', handleBeforePrint)
	window.removeEventListener('afterprint', handleAfterPrint)
})
</script>

<template>
	<div class="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
		<div class="no-print mb-2 flex shrink-0 items-center gap-4 overflow-x-auto">
			<!-- Style -->
			<Popover align="start" width="17rem">
				<template #trigger="{ open, toggle }">
					<button
						type="button"
						class="btn gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] shadow-sm ring-1 ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700"
						:class="
							open
								? 'text-slate-900 dark:text-slate-50'
								: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
						"
						:aria-expanded="open"
						title="Accent color and font"
						@click="toggle"
					>
						<div class="flex gap-2 items-center">
							<div class="flex gap-1 items-center">
								<Icon size="16"><PaintBrush16Regular /></Icon>
								Style
							</div>
							<span class="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true"></span>
							<span class="h-3.5 w-3.5 rounded-full ring-1 ring-slate-900/15" :style="{ backgroundColor: accent }" />
							<span v-if="template && font && columns">
								· {{ template[0].toUpperCase() + template.slice(1) }} · {{ font[0].toUpperCase() + font.slice(1) }} ·
								{{ columns }} Col(s)
							</span>
						</div>
					</button>
				</template>

				<div class="space-y-4">
					<div>
						<p
							class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
						>
							<Icon size="18"><Shapes16Regular /></Icon> Templates
						</p>
						<!-- Template switcher -->
						<div
							class="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700"
							role="tablist"
							aria-label="Resume template"
						>
							<button
								v-for="t in TEMPLATES"
								:key="t.id"
								:title="t.hint"
								class="btn px-3 py-1.5 text-[13px]"
								:class="
									template === t.id
										? 'font-semibold text-white shadow-sm'
										: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
								"
								:style="template === t.id ? { backgroundColor: accent } : null"
								@click="template = t.id"
							>
								{{ t.name }}
							</button>
						</div>
					</div>

					<div>
						<p
							class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
						>
							<Icon size="18"><TextColumnTwo20Regular /></Icon> Columns
						</p>
						<!-- Columns -->
						<div
							class="grid grid-cols-2 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm ring-1 ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700"
							role="group"
							aria-label="Columns"
						>
							<button
								v-for="c in COLUMNS"
								:key="c"
								:title="c === 1 ? 'Single column' : 'Two columns'"
								class="btn px-3 py-1.5 text-[13px]"
								:class="
									columns === c
										? 'font-semibold text-white shadow-sm'
										: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
								"
								:style="columns === c ? { backgroundColor: accent } : null"
								@click="columns = c"
							>
								{{ c }} col{{ c > 1 ? 's' : '' }}
							</button>
						</div>
					</div>

					<div>
						<p
							class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
						>
							<Icon size="18"><Color16Regular /></Icon> Accent color
						</p>
						<div class="flex flex-wrap items-center gap-2">
							<button
								v-for="c in ACCENTS"
								:key="c"
								type="button"
								:title="c"
								class="h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900"
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
						<p
							class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400"
						>
							<Icon size="18"><TextFont16Regular /></Icon> Font
						</p>
						<div class="grid gap-1.5">
							<button
								v-for="f in FONTS"
								:key="f.id"
								type="button"
								class="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition"
								:class="
									font === f.id
										? 'border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800'
										: 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'
								"
								:style="{ fontFamily: fontStack(f.id) }"
								@click="font = f.id"
							>
								<span class="min-w-0">
									<span class="block text-[13px] font-medium text-slate-800 dark:text-slate-100">{{ f.name }}</span>
									<span class="block text-[11px] text-slate-400 dark:text-slate-500">{{ f.hint }}</span>
								</span>
								<Icon
									v-if="font === f.id"
									size="14"
									class="shrink-0 text-slate-900 dark:text-slate-100"
									aria-hidden="true"
								>
									<Checkmark16Regular />
								</Icon>
							</button>
						</div>
					</div>
				</div>
			</Popover>
			<!-- Sections: order, names, visibility (saved per profile) -->
			<Popover align="start" width="19rem">
				<template #trigger="{ open, toggle }">
					<button
						type="button"
						class="btn gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] shadow-sm ring-1 ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700"
						:class="
							open
								? 'text-slate-900 dark:text-slate-50'
								: 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
						"
						:aria-expanded="open"
						title="Reorder, rename, show/hide, lay out resume sections"
						@click="toggle"
					>
						<div class="flex items-center gap-2">
							<div class="flex items-center gap-1">
								<Icon size="16"><List16Regular /></Icon>
								Sections
							</div>
							<span class="mx-1 h-4 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true"></span>
							<span>{{ visibleSectionCount }}/{{ sectionCount }}</span>
						</div>
					</button>
				</template>

				<div class="space-y-3">
					<p class="text-xs text-slate-500 dark:text-slate-400">
						Reorder, rename, show/hide — saved on this profile. Empty name uses the template default. The grid button
						lays a section's entries out in a row instead of a column.
					</p>
					<div class="grid gap-1.5">
						<div
							v-for="s in sections"
							:key="s.id"
							class="relative rounded-lg border border-slate-200 bg-white p-2 transition dark:border-slate-700 dark:bg-slate-900"
							:class="{ 'opacity-60 saturate-0': s.visible === false, 'opacity-40': dragSectionId === s.id }"
							@dragover="onSectionDragOver($event, s)"
							@drop="onSectionDrop($event, s)"
						>
							<div
								v-if="dropSectionTarget?.id === s.id && dropSectionTarget.position === 'before'"
								class="pointer-events-none absolute inset-x-2 top-0 h-0.5 rounded-full bg-indigo-500"
							/>
							<div
								v-if="dropSectionTarget?.id === s.id && dropSectionTarget.position === 'after'"
								class="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-indigo-500"
							/>
							<div class="flex items-center gap-1.5">
								<span
									class="cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-300"
									draggable="true"
									title="Drag to reorder"
									aria-hidden="true"
									@dragstart="onSectionDragStart($event, s)"
									@dragend="onSectionDragEnd"
								>
									<Icon size="16"><ReOrderDotsVertical16Regular /></Icon>
								</span>
								<label
									class="flex shrink-0 cursor-pointer items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
									:title="s.visible !== false ? 'Hide section' : 'Show section'"
								>
									<input
										type="checkbox"
										class="h-4 w-4 rounded accent-indigo-600"
										:checked="s.visible !== false"
										@change="toggleSection(s.id, $event.target.checked)"
									/>
									Show
								</label>
								<input
									:value="s.title"
									class="input min-w-0 flex-1 py-1 text-[13px]"
									:placeholder="isCustomSection(s.id) ? 'Section name' : sectionLabel(s.id)"
									:title="isCustomSection(s.id) ? 'Rename section' : `Rename “${sectionLabel(s.id)}” section`"
									maxlength="60"
									@input="renameSection(s.id, $event.target.value)"
								/>
								<button
									class="icon-btn"
									title="Move up"
									:disabled="sections.findIndex((x) => x.id === s.id) === 0"
									@click="moveSection(s.id, -1)"
								>
									<Icon size="16"><ArrowUp16Regular /></Icon>
								</button>
								<button
									class="icon-btn"
									title="Move down"
									:disabled="sections.findIndex((x) => x.id === s.id) === sections.length - 1"
									@click="moveSection(s.id, 1)"
								>
									<Icon size="16"><ArrowDown16Regular /></Icon>
								</button>
								<button
									v-if="s.id !== 'summary'"
									class="icon-btn"
									:title="sectionDirection(s.id) === 'row' ? 'Use column layout' : 'Use row layout'"
									:style="sectionDirection(s.id) === 'row' ? { backgroundColor: accent, color: '#fff' } : null"
									@click="toggleDirection(s.id)"
								>
									<Icon size="16"><AlignSpaceEvenlyHorizontal20Regular /></Icon>
								</button>
								<button
									v-if="isCustomSection(s.id)"
									class="icon-btn hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
									title="Delete section everywhere (master + all profiles)"
									@click="emit('delete-section', s.id)"
								>
									<Icon size="16"><Dismiss16Regular /></Icon>
								</button>
							</div>
						</div>
					</div>
					<div class="flex gap-2">
						<button class="btn btn-ghost flex-1 text-[13px]" @click="resetSections">
							<Icon size="16"><ArrowReset20Regular /></Icon> Reset sections
						</button>
						<button class="btn btn-ghost flex-1 text-[13px]" @click="emit('add-section')">
							<Icon size="16"><Add16Regular /></Icon> Add section
						</button>
					</div>
				</div>
			</Popover>
			<!-- Zoom -->
			<div class="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
				<button
					v-for="z in ZOOMS"
					:key="z"
					class="rounded-md px-2 py-1 transition"
					:class="
						zoom === z
							? 'bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-700'
							: 'hover:bg-slate-200/70 dark:hover:bg-slate-800'
					"
					@click="zoom = z"
				>
					{{ Math.round(z * 100) }}%
				</button>
			</div>
		</div>
		<div
			id="print-area"
			class="block overflow-auto bg-slate-200/70 p-6 lg:min-h-0 lg:flex-1 rounded-lg border border-slate-300 dark:border-slate-800 dark:bg-slate-950"
		>
			<div
				class="resume-page overflow-hidden rounded-sm shadow-xl ring-1 ring-slate-900/10"
				:style="{ zoom: printZoom }"
			>
				<component
					:is="activeComponent"
					:resume="resume"
					:accent="accent"
					:font="font"
					:columns="columns"
					:sections="sections"
				/>
			</div>
		</div>
	</div>
</template>
