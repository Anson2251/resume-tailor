<script setup>
import { computed, ref } from 'vue'
import ModernTemplate from './templates/ModernTemplate.vue'
import ClassicTemplate from './templates/ClassicTemplate.vue'
import MinimalTemplate from './templates/MinimalTemplate.vue'
import { ACCENTS, TEMPLATES } from '../data/options.js'

const props = defineProps({
	resume: { type: Object, required: true }
})

const template = defineModel('template', { default: 'modern' })
const accent = defineModel('accent', { default: '#4f46e5' })

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
const ZOOMS = [0.6, 0.8, 1]
const zoom = ref(1)
</script>

<template>
	<div class="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
		<div class="no-print mb-2 flex shrink-0 items-center gap-4 overflow-x-auto">
			<!-- Template switcher -->
			<div class="flex items-center gap-1 rounded-lg bg-white p-1 shadow-sm ring-1 ring-slate-200 border border-slate-200" role="tablist" aria-label="Resume template">
				<button
					v-for="t in TEMPLATES"
					:key="t.id"
					:title="t.hint"
					class="btn px-3 py-1.5 text-[13px]"
					:class="template === t.id ? 'bg-slate-900 font-semibold text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'"
					@click="template = t.id"
				>
					{{ t.name }}
				</button>
			</div>
			<!-- Accent picker -->
			<div class="flex items-center gap-1.5" aria-label="Accent color">
				<button
					v-for="c in ACCENTS"
					:key="c"
					:title="c"
					class="h-6 w-6 rounded-full ring-2 ring-offset-2 transition"
					:class="accent === c ? 'ring-slate-400' : 'ring-transparent hover:ring-slate-300'"
					:style="{ backgroundColor: c }"
					@click="accent = c"
				/>
			</div>
			<!-- Zoom -->
			<div class="ml-auto flex shrink-0 items-center gap-1 text-xs text-slate-500">
				<button
					v-for="z in ZOOMS"
					:key="z"
					class="rounded-md px-2 py-1 transition"
					:class="zoom === z ? 'bg-white font-semibold text-slate-900 shadow-sm ring-1 ring-slate-200' : 'hover:bg-slate-200/70'"
					@click="zoom = z"
				>
					{{ Math.round(z * 100) }}%
				</button>
			</div>
		</div>
		<div id="print-area" class="block overflow-auto bg-slate-200/70 p-6 lg:min-h-0 lg:flex-1 rounded-lg border border-slate-300">
			<div
				class="resume-page overflow-hidden rounded-sm shadow-xl ring-1 ring-slate-900/10"
				:style="{ zoom }"
			>
				<component :is="activeComponent" :resume="resume" :accent="accent" />
			</div>
		</div>
	</div>
</template>
