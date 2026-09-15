<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * Generic popover shell. Content is fully slot-driven:
 *   - `trigger` slot (scoped: { open, toggle }) renders the element that opens it.
 *   - default slot (scoped: { close }) renders the floating panel.
 * The panel is teleported to <body> so it is never clipped by scroll/overflow
 * containers. Closes on outside click, Escape, or by calling `close()`.
 */
const props = defineProps({
	align: { type: String, default: 'start' }, // 'start' | 'end'
	width: { type: String, default: '17rem' },
})

const open = ref(false)
const root = ref(null)
const panel = ref(null)
const position = ref({ top: 0, left: 0 })
const maxHeight = ref(320)
const MARGIN = 8

function toPx(value) {
	const n = parseFloat(value)
	if (Number.isNaN(n)) return 272
	return /rem$/.test(value) ? n * 16 : n
}

/** Pin the panel next to the trigger, clamped to the viewport.
 * Flips above the trigger when there is more room there, and caps the
 * height so oversized content scrolls instead of exceeding the window. */
function updatePosition() {
	const trigger = root.value
	if (!trigger) return
	const rect = trigger.getBoundingClientRect()
	const width = toPx(props.width)
	const left = props.align === 'end' ? rect.right - width : rect.left

	const belowTop = rect.bottom + MARGIN
	const spaceBelow = window.innerHeight - belowTop - MARGIN
	const spaceAbove = rect.top - MARGIN * 2
	// Flip above when below is cramped but above has meaningfully more room.
	const flip = spaceBelow < 200 && spaceAbove > spaceBelow

	if (!flip) {
		position.value = {
			top: Math.max(MARGIN, Math.min(belowTop, window.innerHeight - MARGIN - 120)),
			left: Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN)),
		}
		maxHeight.value = Math.max(120, Math.min(spaceBelow, window.innerHeight - MARGIN * 2))
	} else {
		maxHeight.value = Math.max(120, Math.min(spaceAbove, window.innerHeight - MARGIN * 2))
		// Stick the panel's bottom edge to just above the trigger. If the
		// panel is already mounted, measure it so short content sits flush
		// against the trigger instead of stretching to the viewport top.
		const measured = panel.value?.offsetHeight ?? maxHeight.value
		const height = Math.min(measured, maxHeight.value)
		position.value = {
			top: Math.max(MARGIN, rect.top - MARGIN - height),
			left: Math.max(MARGIN, Math.min(left, window.innerWidth - width - MARGIN)),
		}
	}
}

function toggle() {
	open.value = !open.value
}

function close() {
	open.value = false
}

function onPointerDown(event) {
	if (root.value?.contains(event.target) || panel.value?.contains(event.target)) return
	close()
}

function onKeydown(event) {
	if (event.key === 'Escape') close()
}

function addListeners() {
	document.addEventListener('pointerdown', onPointerDown)
	document.addEventListener('keydown', onKeydown)
	window.addEventListener('resize', updatePosition)
	window.addEventListener('scroll', updatePosition, true)
}

function removeListeners() {
	document.removeEventListener('pointerdown', onPointerDown)
	document.removeEventListener('keydown', onKeydown)
	window.removeEventListener('resize', updatePosition)
	window.removeEventListener('scroll', updatePosition, true)
}

watch(open, (isOpen) => {
	if (isOpen) {
		updatePosition()
		// Re-measure after mount so flipped panels hug the trigger and
		// below-panels account for the real viewport space.
		nextTick(() => updatePosition())
		addListeners()
	} else {
		removeListeners()
	}
})

onBeforeUnmount(removeListeners)
</script>

<template>
	<div ref="root" class="no-print relative">
		<slot name="trigger" :open="open" :toggle="toggle" />
		<Teleport to="body">
			<Transition
				enter-active-class="transition duration-150 ease-out"
				enter-from-class="-translate-y-1 opacity-0"
				enter-to-class="translate-y-0 opacity-100"
				leave-active-class="transition duration-100 ease-in"
				leave-from-class="translate-y-0 opacity-100"
				leave-to-class="-translate-y-1 opacity-0"
			>
				<div
					v-if="open"
					ref="panel"
					role="dialog"
					class="no-print fixed z-50 overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl ring-1 ring-slate-900/5 dark:border-slate-700 dark:bg-slate-900 dark:ring-white/10"
					:style="{ top: `${position.top}px`, left: `${position.left}px`, width, maxHeight: `${maxHeight}px` }"
				>
					<slot :close="close" />
				</div>
			</Transition>
		</Teleport>
	</div>
</template>
