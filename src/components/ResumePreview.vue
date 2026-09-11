<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@vicons/utils'
import ModernTemplate from './templates/ModernTemplate.vue'
import ClassicTemplate from './templates/ClassicTemplate.vue'
import MinimalTemplate from './templates/MinimalTemplate.vue'
import Popover from './Popover.vue'
import { ACCENTS, COLUMNS, FONTS, TEMPLATES, fontStack } from '../data/options.js'
import { Checkmark16Regular, Color16Regular, PaintBrush16Regular, TextFont16Regular, TextColumnTwo20Regular, Shapes16Regular } from '../data/icons.js'

const props = defineProps({
	resume: { type: Object, required: true }
})

const template = defineModel('template', { default: 'modern' })
const accent = defineModel('accent', { default: '#4f46e5' })
const font = defineModel('font', { default: 'sans' })
const columns = defineModel('columns', { default: 1 })

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
						:class="open ? 'font-semibold text-slate-900 dark:text-slate-50' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'"
						:aria-expanded="open"
						title="Accent color and font"
						@click="toggle"
					>
						<Icon size="16"><PaintBrush16Regular /></Icon>
						Style
						<span
							class="h-3.5 w-3.5 rounded-full ring-1 ring-slate-900/15"
							:style="{ backgroundColor: accent }"
						/>
					</button>
				</template>

				<div class="space-y-4">
    				<div>
                        <p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
							<Icon size="18"><Shapes16Regular /></Icon> Templates
						</p>
                        <!-- Template switcher -->
        				<div class="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200 border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700" role="tablist" aria-label="Resume template">
           					<button
          						v-for="t in TEMPLATES"
          						:key="t.id"
          						:title="t.hint"
          						class="btn px-3 py-1.5 text-[13px]"
          						:class="template === t.id ? 'font-semibold text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'"
          						:style="template === t.id ? { backgroundColor: accent } : null"
          						@click="template = t.id"
           					>
          						{{ t.name }}
           					</button>
        				</div>
    				</div>

    				<div>
                        <p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
							<Icon size="18"><TextColumnTwo20Regular /></Icon> Columns
						</p>
                        <!-- Columns -->
        				<div class="grid grid-cols-2 items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm ring-1 ring-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:ring-slate-700" role="group" aria-label="Columns">
           					<button
          						v-for="c in COLUMNS"
          						:key="c"
          						:title="c === 1 ? 'Single column' : 'Two columns'"
          						class="btn px-3 py-1.5 text-[13px]"
          						:class="columns === c ? 'font-semibold text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'"
          						:style="columns === c ? { backgroundColor: accent } : null"
          						@click="columns = c"
           					>
          						{{ c }} col{{ c > 1 ? 's' : '' }}
           					</button>
        				</div>
    				</div>

					<div>
						<p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
							<Icon size="18"><Color16Regular /></Icon> Accent color
						</p>
						<div class="flex flex-wrap items-center gap-2">
							<button
								v-for="c in ACCENTS"
								:key="c"
								type="button"
								:title="c"
								class="h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-white transition dark:ring-offset-slate-900"
								:class="accent === c ? 'ring-slate-400 dark:ring-slate-500' : 'ring-transparent hover:ring-slate-300 dark:hover:ring-slate-600'"
								:style="{ backgroundColor: c }"
								@click="accent = c"
							/>
						</div>
					</div>

					<div>
						<p class="mb-2 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
							<Icon size="18"><TextFont16Regular /></Icon> Font
						</p>
						<div class="grid gap-1.5">
							<button
								v-for="f in FONTS"
								:key="f.id"
								type="button"
								class="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-left transition"
								:class="font === f.id ? 'border-slate-900 bg-slate-50 dark:border-slate-100 dark:bg-slate-800' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'"
								:style="{ fontFamily: fontStack(f.id) }"
								@click="font = f.id"
							>
								<span class="min-w-0">
									<span class="block text-[13px] font-medium text-slate-800 dark:text-slate-100">{{ f.name }}</span>
									<span class="block text-[11px] text-slate-400 dark:text-slate-500">{{ f.hint }}</span>
								</span>
								<Icon v-if="font === f.id" size="14" class="shrink-0 text-slate-900 dark:text-slate-100" aria-hidden="true">
									<Checkmark16Regular />
								</Icon>
							</button>
						</div>
					</div>
				</div>
			</Popover>
			<!-- Zoom -->
			<div class="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
				<button
					v-for="z in ZOOMS"
					:key="z"
					class="rounded-md px-2 py-1 transition"
					:class="zoom === z ? 'bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-50 dark:ring-slate-700' : 'hover:bg-slate-200/70 dark:hover:bg-slate-800'"
					@click="zoom = z"
				>
					{{ Math.round(z * 100) }}%
				</button>
			</div>
		</div>
		<div id="print-area" class="block overflow-auto bg-slate-200/70 p-6 lg:min-h-0 lg:flex-1 rounded-lg border border-slate-300 dark:border-slate-800 dark:bg-slate-950">
			<div
				class="resume-page overflow-hidden rounded-sm shadow-xl ring-1 ring-slate-900/10"
				:style="{ zoom: printZoom }"
			>
				<component :is="activeComponent" :resume="resume" :accent="accent" :font="font" :columns="columns" />
			</div>
		</div>
	</div>
</template>
