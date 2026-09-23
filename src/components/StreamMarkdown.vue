<script setup lang="ts">
import { computed, h } from 'vue'
import { renderMarkdown } from '../libs/mdast-to-vnode'

const props = withDefaults(
	defineProps<{
		/** Raw markdown source; re-rendered on every change (per streamed token). */
		text?: string
		/** While true, newly arrived blocks fade in (wisp-pro pattern). */
		streaming?: boolean
	}>(),
	{ text: '', streaming: false },
)

const content = computed(() => {
	const source = props.text ?? ''
	if (!source.trim()) return null
	try {
		return renderMarkdown(source)
	} catch {
		// Never blank the bubble mid-stream on a parse miss — show raw text.
		return h('span', source)
	}
})
</script>

<template>
	<div class="md stream-md" :class="{ 'is-streaming': streaming }">
		<component :is="content" v-if="content" />
		<span v-else class="text-slate-400">…</span>
	</div>
</template>

<style scoped>
@keyframes stream-fade-in {
	from {
		opacity: 0;
	}
	to {
		opacity: 1;
	}
}

/* New blocks fade in as tokens arrive; updating text inside an existing
   block mutates the node in place, so it does not flicker. */
.stream-md.is-streaming :deep(*:not(strong, em, code)) {
	animation: stream-fade-in 0.5s ease-in-out;
}

.stream-md :deep(pre) {
	position: relative;
	overflow-x: auto;
	border-radius: 0.5rem;
	background: #0f172a;
	color: #e2e8f0;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 0.8em;
	line-height: 1.5;
	padding: 0.75em 0.9em;
	margin: 0.4em 0;
}

.stream-md :deep(pre[data-lang]::before) {
	content: attr(data-lang);
	display: block;
	margin-bottom: 0.5em;
	color: #94a3b8;
	font-size: 0.75em;
	letter-spacing: 0.08em;
	text-transform: uppercase;
}

.stream-md :deep(pre code) {
	background: transparent;
	padding: 0;
}

.stream-md :deep(p code),
.stream-md :deep(li code),
.stream-md :deep(td code),
.stream-md :deep(th code) {
	border-radius: 0.375rem;
	background: rgb(241 245 249);
	padding: 0.1em 0.35em;
	font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
	font-size: 0.85em;
}

.dark .stream-md :deep(p code),
.dark .stream-md :deep(li code),
.dark .stream-md :deep(td code),
.dark .stream-md :deep(th code) {
	background: rgb(30 41 59);
}

.stream-md :deep(table) {
	width: 100%;
	margin: 0.5em 0;
	border-collapse: collapse;
	font-size: 0.9em;
}

.stream-md :deep(th),
.stream-md :deep(td) {
	border: 1px solid rgb(226 232 240);
	padding: 0.35em 0.6em;
	text-align: left;
}

.dark .stream-md :deep(th),
.dark .stream-md :deep(td) {
	border-color: rgb(51 65 85);
}

.stream-md :deep(th) {
	background: rgb(248 250 252);
	font-weight: 600;
}

.dark .stream-md :deep(th) {
	background: rgb(30 41 59);
}

.stream-md :deep(a) {
	text-decoration: underline;
}

.stream-md :deep(img) {
	max-width: 100%;
	border-radius: 0.5rem;
}
</style>
