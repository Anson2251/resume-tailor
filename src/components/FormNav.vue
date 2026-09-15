<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DEFAULT_SECTION_ORDER, SECTION_KEYS, customSectionTitle, sectionLabel } from '../data/resume.js'

/**
 * Anchor rail for the editing form, fixed to the window (left edge, vertically
 * centered). One longer line per section plus a shorter line per item inside it
 * (experience roles, projects, schools, skill groups) — all left-aligned. The
 * current anchor shows by color only, no width change. Hovering (or focusing)
 * the rail opens a popup with every anchor name; clicking jumps to that card.
 * Follows the profile's section order so it always matches the form.
 * Hidden on small screens and in print.
 */
const props = defineProps({
	profile: { type: Object, required: true },
	master: { type: Object, required: true },
	accent: { type: String, default: '#4f46e5' }
})

// The active anchor is derived purely from the scrolled position — the nav
// keeps no state of its own. The "current" line sits just below the sticky
// top bar; clicking scrolls the target to that exact same line.
const FALLBACK_LINE_PX = 132

function thresholdY() {
	const header = document.getElementById('topbar')
	return (header ? header.getBoundingClientRect().bottom : FALLBACK_LINE_PX - 12) + 12
}

/** Last anchor whose top sits at or above the current line (DOM order). */
function currentKey() {
	const line = thresholdY() + 2
	let current = order.value[0]
	for (const key of order.value) {
		const el = elFor(key)
		if (!el) continue
		if (el.getBoundingClientRect().top <= line) current = key
	}
	return current
}

function itemLabel(key, item, index) {
	switch (key) {
		case 'experience':
			if (item?.role || item?.company) return `${item.role || 'New role'}${item.company ? ` · ${item.company}` : ''}`
			return `Position ${index + 1}`
		case 'projects':
			return item?.name || `Project ${index + 1}`
		case 'education':
			return item?.school || `School ${index + 1}`
		case 'skills':
			return item?.category || `Skill group ${index + 1}`
		default:
			return item?.heading || `Item ${index + 1}`
		}
}

/** Content list for a section: fixed key on master, or a user-created section's items. */
function listFor(key) {
	if (SECTION_KEYS.includes(key)) return props.master?.[key] || []
	return props.master?.customSections?.find((s) => s.id === key)?.items || []
}

/** Shown ids for a section: profile view order, fixed or `view.custom`. */
function viewIdsFor(key) {
	if (SECTION_KEYS.includes(key)) return props.profile?.view?.[key] || []
	return props.profile?.view?.custom?.[key] || []
}

/** Item anchors in DOM order: shown (profile view order) first, then hidden. */
function sectionChildren(key) {
	const list = listFor(key)
	const byId = new Map(list.map((item) => [item.id, item]))
	const ordered = viewIdsFor(key).filter((id) => byId.has(id))
	const seen = new Set(ordered)
	for (const item of list) if (!seen.has(item.id)) ordered.push(item.id)
	return ordered.map((id) => ({
		id,
		label: itemLabel(key, byId.get(id), list.findIndex((item) => item.id === id))
	}))
}

function groupLabel(id) {
	if (id === 'summary') return 'Tailoring'
	if (SECTION_KEYS.includes(id)) return sectionLabel(id)
	const entry = props.profile?.sections?.find((s) => s.id === id)
	const masterSection = props.master?.customSections?.find((s) => s.id === id)
	return customSectionTitle(masterSection, entry)
}

const groups = computed(() => {
	const known = new Set(['summary', ...SECTION_KEYS])
	for (const s of props.master?.customSections || []) known.add(s.id)
	const ids = (props.profile?.sections || []).map((s) => s?.id).filter((id) => known.has(id))
	for (const id of DEFAULT_SECTION_ORDER) if (!ids.includes(id)) ids.push(id)
	for (const s of props.master?.customSections || []) if (!ids.includes(s.id)) ids.push(s.id)
	return [
		{ id: 'contact', label: 'Contact', children: [] },
		...ids.map((id) => ({
			id,
			label: groupLabel(id),
			children: id === 'summary' ? [] : sectionChildren(id)
		}))
	]
})

// Flat anchor order matching DOM order (section header, then its items).
const order = computed(() => groups.value.flatMap((group) => [group.id, ...group.children.map((child) => child.id)]))

const isSection = (key) => groups.value.some((group) => group.id === key)
const elIdFor = (key) => (isSection(key) ? `form-section-${key}` : `form-item-${key}`)
const elFor = (key) => document.getElementById(elIdFor(key))

const activeKey = ref('contact')
const open = ref(false)

function nearestScroller(el) {
	let node = el?.parentElement
	while (node) {
		const overflowY = getComputedStyle(node).overflowY
		if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
		node = node.parentElement
	}
	return window
}

// No optimistic highlight here: the scrolled position is the only source of
// truth, and scroll events during the animation update the highlight.
function scrollTo(key) {
	const el = elFor(key)
	if (!el) return
	const delta = el.getBoundingClientRect().top - thresholdY()
	if (Math.abs(delta) < 2) {
		activeKey.value = currentKey()
		return
	}
	const scroller = nearestScroller(el)
	if (scroller === window) window.scrollBy({ top: delta, behavior: 'smooth' })
	else scroller.scrollBy({ top: delta, behavior: 'smooth' })
}

let ticking = false

function onScroll() {
	if (ticking) return
	ticking = true
	requestAnimationFrame(() => {
		ticking = false
		if (order.value.length) activeKey.value = currentKey()
	})
}

function refresh() {
	nextTick(() => {
		if (order.value.length) activeKey.value = currentKey()
	})
}

watch(order, refresh)

// One capture listener covers every scroller (inner form pane on desktop,
// the window on mobile) since scroll events don't bubble.
onMounted(() => {
	refresh()
	document.addEventListener('scroll', onScroll, { capture: true, passive: true })
	window.addEventListener('resize', onScroll, { passive: true })
})

onBeforeUnmount(() => {
	document.removeEventListener('scroll', onScroll, { capture: true })
	window.removeEventListener('resize', onScroll)
})
</script>

<template>
	<nav class="no-print fixed top-1/2 left-3 z-30 hidden -translate-y-1/2 lg:block" aria-label="Form sections">
		<div
			class="relative flex flex-col items-start gap-2 rounded-full bg-slate-950/85 px-2.5 py-4 shadow-xl ring-1 ring-white/10 backdrop-blur"
			@mouseenter="open = true"
			@mouseleave="open = false"
			@focusin="open = true"
			@focusout="open = false"
			@keydown.escape="open = false"
		>
			<template v-for="group in groups" :key="group.id">
				<button
					type="button"
					:title="group.label"
					:aria-label="`Go to ${group.label}`"
					:aria-current="activeKey === group.id ? 'true' : undefined"
					class="h-[3px] w-7 rounded-full transition-colors duration-200"
					:class="activeKey === group.id ? 'bg-white' : 'bg-white/25 hover:bg-white/60'"
					@click="scrollTo(group.id)"
				/>
				<button
					v-for="child in group.children"
					:key="child.id"
					type="button"
					:title="child.label"
					:aria-label="`Go to ${child.label}`"
					:aria-current="activeKey === child.id ? 'true' : undefined"
					class="h-[3px] w-4 rounded-full transition-colors duration-200"
					:class="activeKey === child.id ? 'bg-white' : 'bg-white/25 hover:bg-white/60'"
					@click="scrollTo(child.id)"
				/>
			</template>
			<!-- Hover popup with anchor names -->
			<div
				class="absolute top-1/2 left-full ml-3 max-h-[70vh] w-60 -translate-y-1/2 overflow-y-auto rounded-2xl bg-slate-950/95 p-2 shadow-2xl ring-1 ring-white/10 backdrop-blur transition-all duration-150"
				:class="open ? 'visible translate-x-0 opacity-100' : 'invisible -translate-x-1 opacity-0'"
			>
				<template v-for="group in groups" :key="group.id">
					<button
						type="button"
						:title="group.label"
						class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[15px] transition"
						:class="activeKey === group.id ? 'bg-white/10 font-medium text-white' : 'text-slate-300 hover:bg-white/5 hover:text-white'"
						@click="scrollTo(group.id)"
					>
						<span
							class="h-4 w-1 shrink-0 rounded-full transition-colors"
							:style="{ backgroundColor: activeKey === group.id ? accent : 'transparent' }"
						/>
						<span class="min-w-0 flex-1 truncate">{{ group.label }}</span>
					</button>
					<button
						v-for="child in group.children"
						:key="child.id"
						type="button"
						:title="child.label"
						class="flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-3 pl-8 text-left text-[13px] transition"
						:class="activeKey === child.id ? 'bg-white/10 font-medium text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'"
						@click="scrollTo(child.id)"
					>
						<span
							class="h-3 w-1 shrink-0 rounded-full transition-colors"
							:style="{ backgroundColor: activeKey === child.id ? accent : 'transparent' }"
						/>
						<span class="min-w-0 flex-1 truncate">{{ child.label }}</span>
					</button>
				</template>
			</div>
		</div>
	</nav>
</template>
