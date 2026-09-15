<script setup>
import { computed, ref } from 'vue'
import { Icon } from '@vicons/utils'
import {
	Add16Regular,
	ArrowDown16Regular,
	ArrowUndo16Regular,
	ArrowUp16Regular,
	Dismiss16Regular,
	ReOrderDotsVertical16Regular,
} from '../data/icons.js'

const props = defineProps({
	title: { type: String, required: true },
	sectionId: { type: String, default: '' },
	items: { type: Array, required: true },
	canRemove: { type: Boolean, default: false },
	addLabel: { type: String, default: 'Add item' },
	// Per-item field overrides for the active profile, and their display labels.
	overrides: { type: Object, default: () => ({}) },
	fieldLabels: { type: Object, default: () => ({}) },
})

/** Ordered ids of the items shown on the active profile (`profile.view[key]`). */
const order = defineModel('order', { required: true })
const emit = defineEmits(['add', 'remove', 'reset'])

// Shown items first, in profile order; then the ones hidden from this profile.
const rows = computed(() => {
	const byId = new Map(props.items.map((item) => [item.id, item]))
	const seen = new Set()
	const shown = []
	const hidden = []
	for (const id of order.value) {
		const item = byId.get(id)
		if (!item || seen.has(id)) continue
		seen.add(id)
		shown.push({ item, visible: true, orderIndex: order.value.indexOf(id) })
	}
	for (const item of props.items) {
		if (!seen.has(item.id)) hidden.push({ item, visible: false, orderIndex: -1 })
	}
	return [...shown, ...hidden]
})

const shownCount = computed(() => rows.value.filter((row) => row.visible).length)

const hasOverride = (id) => Boolean(props.overrides?.[id])
const overrideLabels = (id) =>
	Object.keys(props.overrides?.[id] || {}).map((field) => props.fieldLabels?.[field] || field)

function toggle(id, visible) {
	const next = [...order.value]
	const i = next.indexOf(id)
	if (visible && i === -1) next.push(id)
	else if (!visible && i !== -1) next.splice(i, 1)
	order.value = next
}

function move(id, delta) {
	const next = [...order.value]
	const i = next.indexOf(id)
	const target = i + delta
	if (i === -1 || target < 0 || target >= next.length) return
	const [item] = next.splice(i, 1)
	next.splice(target, 0, item)
	order.value = next
}

// --- Drag to reorder (shown items only) ---

const dragId = ref(null)
const dropTarget = ref(null)

function onDragStart(event, row) {
	if (!row.visible) {
		event.preventDefault()
		return
	}
	dragId.value = row.item.id
	dropTarget.value = null
	event.dataTransfer.effectAllowed = 'move'
	event.dataTransfer.setData('text/plain', row.item.id) // required by Firefox
	try {
		const card = event.currentTarget.closest('article')
		if (card) event.dataTransfer.setDragImage(card, 16, 16)
	} catch {
		/* setDragImage can throw before the image is ready — fall back to default */
	}
}

function onDragOver(event, row) {
	if (!dragId.value || !row.visible || row.item.id === dragId.value) return
	event.preventDefault()
	event.dataTransfer.dropEffect = 'move'
	const rect = event.currentTarget.getBoundingClientRect()
	dropTarget.value = {
		id: row.item.id,
		position: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
	}
}

function onDrop(event, row) {
	if (!dragId.value) return
	event.preventDefault()
	const target = dropTarget.value
	if (target && target.id === row.item.id) {
		const next = [...order.value]
		const from = next.indexOf(dragId.value)
		if (from !== -1) {
			next.splice(from, 1)
			let to = next.indexOf(row.item.id)
			if (to !== -1) {
				if (target.position === 'after') to += 1
				next.splice(to, 0, dragId.value)
				order.value = next
			}
		}
	}
	onDragEnd()
}

function onDragEnd() {
	dragId.value = null
	dropTarget.value = null
}
</script>

<template>
	<section class="card scroll-mt-[150px] p-5" :id="sectionId || undefined">
		<div class="flex items-baseline justify-between gap-3">
			<h2 class="section-title">{{ title }}</h2>
			<span class="shrink-0 text-xs text-slate-400 dark:text-slate-500">{{ shownCount }}/{{ items.length }} shown</span>
		</div>

		<div class="mt-4 space-y-3">
			<article
				v-for="(row, i) in rows"
				:key="row.item.id"
				:id="`form-item-${row.item.id}`"
				class="relative scroll-mt-[150px] rounded-lg border bg-slate-50/60 p-4 transition dark:bg-slate-800/40"
				:class="{
					'border-amber-300 dark:border-amber-700': hasOverride(row.item.id),
					'border-slate-200 dark:border-slate-700': !hasOverride(row.item.id),
					'opacity-60 saturate-0': !row.visible,
					'opacity-40': dragId === row.item.id,
				}"
				@dragover="onDragOver($event, row)"
				@drop="onDrop($event, row)"
			>
				<!-- Drop indicators -->
				<div
					v-if="dropTarget?.id === row.item.id && dropTarget.position === 'before'"
					class="pointer-events-none absolute inset-x-2 -top-1 h-0.5 rounded-full bg-indigo-500"
				/>
				<div
					v-if="dropTarget?.id === row.item.id && dropTarget.position === 'after'"
					class="pointer-events-none absolute inset-x-2 -bottom-1 h-0.5 rounded-full bg-indigo-500"
				/>

				<div class="mb-3">
					<div class="flex items-start justify-between gap-2">
						<div class="flex min-w-0 items-center gap-1">
							<span
								class="icon-btn shrink-0"
								:class="
									row.visible
										? 'cursor-grab text-slate-300 hover:text-slate-500 active:cursor-grabbing dark:text-slate-600 dark:hover:text-slate-300'
										: 'cursor-not-allowed opacity-30'
								"
								:draggable="row.visible"
								:title="row.visible ? 'Drag to reorder' : 'Hidden on this profile — cannot reorder'"
								aria-hidden="true"
								@dragstart="onDragStart($event, row)"
								@dragend="onDragEnd"
							>
								<Icon size="16"><ReOrderDotsVertical16Regular /></Icon>
							</span>
							<p
								class="min-w-0 text-sm font-semibold"
								:class="
									row.visible
										? 'text-slate-700 dark:text-slate-200'
										: 'text-slate-400 line-through decoration-black decoration-2 dark:text-slate-500'
								"
							>
								<slot name="heading" :item="row.item" :index="i" :visible="row.visible" />
							</p>
						</div>

						<div class="flex shrink-0 items-center gap-1">
							<label
								class="mr-1 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
								:title="row.visible ? 'Hide on this profile' : 'Show on this profile'"
							>
								<input
									type="checkbox"
									class="h-4 w-4 rounded accent-indigo-600"
									:checked="row.visible"
									@change="toggle(row.item.id, $event.target.checked)"
								/>
								Show
							</label>
							<button
								class="icon-btn"
								title="Move up"
								:disabled="!row.visible || row.orderIndex === 0"
								@click="move(row.item.id, -1)"
							>
								<Icon size="16"><ArrowUp16Regular /></Icon>
							</button>
							<button
								class="icon-btn"
								title="Move down"
								:disabled="!row.visible || row.orderIndex === order.length - 1"
								@click="move(row.item.id, 1)"
							>
								<Icon size="16"><ArrowDown16Regular /></Icon>
							</button>
							<button
								class="icon-btn hover:bg-red-50 hover:text-red-600"
								title="Remove everywhere (master + all profiles)"
								:disabled="!canRemove"
								@click="emit('remove', row.item.id)"
							>
								<Icon size="16"><Dismiss16Regular /></Icon>
							</button>
						</div>
					</div>

					<p
						v-if="hasOverride(row.item.id)"
						class="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400"
					>
						<span class="min-w-0">Customized for this profile: {{ overrideLabels(row.item.id).join(', ') }}</span>
						<button
							class="inline-flex items-center gap-0.5 font-medium underline hover:text-amber-800 dark:hover:text-amber-200"
							@click="emit('reset', row.item.id)"
						>
							<Icon size="13"><ArrowUndo16Regular /></Icon> Use master
						</button>
					</p>
				</div>

				<slot name="fields" :item="row.item" />
			</article>
		</div>

		<button class="btn btn-secondary mt-4 w-full border-dashed" @click="emit('add')">
			<Icon size="16"><Add16Regular /></Icon> {{ addLabel }}
		</button>
	</section>
</template>
