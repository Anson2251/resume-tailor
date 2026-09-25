<script setup lang="ts">
import { computed } from 'vue'
import MarkdownText from '../../MarkdownText.vue'
import { fontStack } from '../../../data/options'
import { composeReLine, letterContactLine, letterDate } from '../../../data/letter'
import type { Contact, CoverLetter } from '../../../data/types'

const props = withDefaults(
	defineProps<{
		letter: CoverLetter
		contact: Contact
		accent?: string
		font?: string
	}>(),
	{ accent: '#4f46e5', font: 'serif' },
)

const fontFamily = computed(() => fontStack(props.font))
const contactLine = computed(() => letterContactLine(props.contact))
const dateLine = computed(() => letterDate(props.letter))
const reLine = computed(() => composeReLine(props.letter))
const recipientLines = computed(() =>
	(props.letter.recipientAddress || '')
		.split('\n')
		.map((s) => s.trim())
		.filter(Boolean),
)
</script>

<template>
	<!-- Classic letter: centered sender block, traditional left-aligned body. -->
	<div class="min-h-full px-12 pt-10 pb-10 text-slate-800" :style="{ fontFamily }">
		<div class="avoid-break text-center">
			<h1 class="text-[26px] leading-tight font-bold tracking-tight text-slate-900">
				{{ contact.fullName || 'Your Name' }}
			</h1>
			<p v-if="contactLine" class="mt-1 text-xs text-slate-500">{{ contactLine }}</p>
		</div>
		<div class="mt-4 border-t" :style="{ borderColor: accent }" />

		<p v-if="dateLine" class="avoid-break mt-6 text-[13px] text-slate-600">{{ dateLine }}</p>

		<div v-if="letter.recipientTitle || recipientLines.length" class="avoid-break mt-6 text-[13px]">
			<p v-if="letter.recipientTitle" class="font-bold text-slate-900">{{ letter.recipientTitle }}</p>
			<p v-for="(line, i) in recipientLines" :key="i" class="text-slate-600">{{ line }}</p>
		</div>

		<p v-if="reLine" class="avoid-break mt-6 text-center text-[13px] font-bold tracking-wide text-slate-900">
			{{ reLine }}
		</p>

		<MarkdownText v-if="letter.body" :source="letter.body" class="mt-6 text-[13.5px] leading-relaxed text-slate-700" />
		<p v-else class="mt-6 text-[13px] text-slate-300 italic">Your letter body will appear here…</p>

		<div class="avoid-break mt-8 text-[13px] text-slate-700">
			<p>{{ letter.signoff || 'Sincerely,' }}</p>
			<p class="mt-6 font-bold text-slate-900">{{ contact.fullName || 'Your Name' }}</p>
			<p v-if="letter.credentialLine" class="text-slate-500">{{ letter.credentialLine }}</p>
		</div>
	</div>
</template>
