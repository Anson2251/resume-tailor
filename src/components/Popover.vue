<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'

/**
 * Generic popover shell. Content is fully slot-driven:
 *   - `trigger` slot (scoped: { open, toggle }) renders the element that opens it.
 *   - default slot (scoped: { close }) renders the floating panel.
 * The panel is teleported to <body> so it is never clipped by scroll/overflow
 * containers. Closes on outside click, Escape, or by calling `close()`.
 */
const props = defineProps({
	align: { type: String, default: 'start' }, // 'start' | 'end'
	width: { type: String, default: '17rem' }
})

const open = ref(false)
const root = ref(null)
const panel = ref(null)
const position = ref({ top: 0, left: 0 })

function toPx(value) {
	const n = parseFloat(value)
	if (Number.isNaN(n)) return 272
	return /rem$/.test(value) ? n * 16 : n
}

/** Pin the panel just below the trigger, clamped to the viewport. */
function updatePosition() {
	const trigger = root.value
	if (!trigger) return
	const rect = trigger.getBoundingClientRect()
	const width = toPx(props.width)
	const left = props.align === 'end' ? rect.right - width : rect.left
	position.value = {
		top: rect.bottom + 8,
		left: Math.max(8, Math.min(left, window.innerWidth - width - 8))
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
					class="no-print fixed z-50 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xl ring-1 ring-slate-900/5"
					:style="{ top: `${position.top}px`, left: `${position.left}px`, width }"
				>
					<slot :close="close" />
				</div>
			</Transition>
		</Teleport>
	</div>
</template>
