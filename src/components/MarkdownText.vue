<script setup lang="ts">
import { computed } from 'vue'
import VueMarkdown from 'vue-markdown-render'

const props = withDefaults(
	defineProps<{
		source?: string
		options?: Record<string, unknown> | null
	}>(),
	{ source: '', options: null },
)

// html:false keeps raw HTML escaped (safe by default); breaks keeps single
// newlines visible so plain-text content written before markdown still reads well.
const DEFAULT_OPTIONS = { html: false, linkify: true, breaks: true }
const mergedOptions = computed(() => ({ ...DEFAULT_OPTIONS, ...props.options }))
</script>

<template>
	<VueMarkdown v-if="source && source.trim()" class="md" :source="source" :options="mergedOptions" />
</template>
