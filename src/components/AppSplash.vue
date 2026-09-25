<script setup lang="ts">
// Boot splash: covers the window while the workspace file is being read so
// the user never sees a blank screen during initialization.
</script>

<template>
	<div
		class="flex min-h-screen flex-col items-center justify-center bg-neutral-secondary"
		role="status"
		aria-label="Loading Resume Tailor"
	>
		<div
			class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 via-indigo-400 to-purple-400 text-2xl font-extrabold text-slate-900"
		>
			R
		</div>
		<h1 class="mt-4 text-lg font-extrabold tracking-tight text-heading">Resume Tailor</h1>
		<p class="mt-1 text-xs text-body-subtle">Loading your workspace&hellip;</p>
		<div
			class="mt-5 h-7 w-7 animate-spin rounded-full border-[3px] border-neutral-quaternary border-t-sky-500 dark:border-t-sky-400"
			aria-hidden="true"
		></div>
	</div>
</template>
