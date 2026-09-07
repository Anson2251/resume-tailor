<script setup>
import { computed, ref } from 'vue'
import ModernTemplate from './templates/ModernTemplate.vue'
import ClassicTemplate from './templates/ClassicTemplate.vue'
import MinimalTemplate from './templates/MinimalTemplate.vue'

const props = defineProps({
	resume: { type: Object, required: true },
	template: { type: String, default: 'modern' },
	accent: { type: String, default: '#4f46e5' }
})

const activeComponent = computed(() => {
	switch (props.template) {
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
		<div class="no-print mb-2 flex shrink-0 items-center justify-center gap-1 text-xs text-slate-500">
			<span class="mr-1 font-medium tracking-wide uppercase">A4 preview</span>
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
		<div id="print-area" class="block overflow-auto bg-slate-200/70 p-6 lg:min-h-0 lg:flex-1">
			<div
				class="resume-page overflow-hidden rounded-sm shadow-xl ring-1 ring-slate-900/10"
				:style="{ zoom }"
			>
				<component :is="activeComponent" :resume="resume" :accent="accent" />
			</div>
		</div>
	</div>
</template>
