<script setup>
import { computed } from 'vue'
import VueMarkdown from 'vue-markdown-render'

const props = defineProps({
	source: { type: String, default: '' },
	options: { type: Object, default: null },
})

// html:false keeps raw HTML escaped (safe by default); breaks keeps single
// newlines visible so plain-text content written before markdown still reads well.
const DEFAULT_OPTIONS = { html: false, linkify: true, breaks: true }
const mergedOptions = computed(() => ({ ...DEFAULT_OPTIONS, ...props.options }))
</script>

<template>
	<VueMarkdown v-if="source && source.trim()" class="md" :source="source" :options="mergedOptions" />
</template>
