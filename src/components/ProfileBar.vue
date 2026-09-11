<script setup>
import { computed } from 'vue'
import { Icon } from '@vicons/utils'
import {
	Add16Regular,
	ArrowReset20Regular,
	Copy16Regular,
	Delete16Regular,
	Edit16Regular
} from '../data/icons.js'

const activeId = defineModel({ required: true })
const props = defineProps({
	profiles: { type: Array, required: true },
	overrideCount: { type: Number, default: 0 },
	accent: { type: String, default: '#4f46e5' }
})
const emit = defineEmits(['create', 'duplicate', 'rename', 'remove', 'clear-overrides'])

// Up to five profiles render as tabs; beyond that a select keeps the bar tidy.
const asTabs = computed(() => props.profiles.length <= 5)
</script>

<template>
	<div class="flex flex-wrap items-center gap-2">
    	<div class="flex flex-nowrap items-center gap-2">
    		<span class="text-xs font-semibold tracking-wide text-slate-400 uppercase">Profile</span>

    		<!-- Tabs -->
    		<div
    			v-if="asTabs"
    			class="overflow-auto flex flex-nowrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm ring-1 ring-slate-200"
    			role="tablist"
    			aria-label="Profiles"
    		>
    			<button
    				v-for="p in profiles"
    				:key="p.id"
    				role="tab"
    				:aria-selected="activeId === p.id"
    				class="btn px-3 py-1.5 text-[13px] shrink-0"
    				:class="activeId === p.id ? 'font-semibold text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'"
    				:style="activeId === p.id ? { backgroundColor: accent } : null"
    				@click="activeId = p.id"
    			>
    				{{ p.master ? '' : p.name }}<span
    					v-if="p.master"
    					class="font-semibold tracking-wide uppercase"
    					title="Edits here change the shared master content"
    				>master</span>
    			</button>
    		</div>

    		<!-- Select fallback for many profiles -->
    		<select
    			v-else
    			v-model="activeId"
    			aria-label="Active profile"
    			class="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] font-medium text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
    		>
    			<option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}{{ p.master ? ' (master)' : '' }}</option>
    		</select>

    		<button
    			class="btn btn-secondary px-2.5"
    			title="New profile showing all master content"
    			aria-label="New profile"
    			@click="emit('create')"
    		>
    			<Icon size="16"><Add16Regular /></Icon>
    		</button>

    	</div>

		<!-- Profile actions, pushed to the right -->
		<div class="ml-auto flex flex-wrap items-center gap-2">
			<button class="btn btn-ghost text-[13px]" title="Duplicate this profile (view, order, template)" @click="emit('duplicate')">
				<Icon size="16"><Copy16Regular /></Icon> Duplicate
			</button>
			<button class="btn btn-ghost text-[13px]" title="Rename this profile" @click="emit('rename')">
				<Icon size="16"><Edit16Regular /></Icon> Rename
			</button>
			<button class="btn btn-ghost text-[13px]" title="Delete this profile" @click="emit('remove')">
				<Icon size="16"><Delete16Regular /></Icon> Delete
			</button>
			<button
				class="btn btn-ghost text-[13px] text-amber-600 hover:bg-amber-50 hover:text-amber-700 disabled:opacity-40"
				:disabled="!overrideCount"
				:title="overrideCount ? 'Reset every customized field on this profile to master' : 'No customized fields on this profile'"
				@click="emit('clear-overrides')"
			>
				<Icon size="16"><ArrowReset20Regular /></Icon> Reset<span v-if="overrideCount"> ({{ overrideCount }})</span>
			</button>
		</div>
	</div>
</template>
