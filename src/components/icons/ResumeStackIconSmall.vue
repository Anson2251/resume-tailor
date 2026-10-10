<template>
  <!-- Small icon v3: wider sheets (15×21), same left-spine stack as large. -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    :width="size"
    :height="size"
    role="img"
    aria-label="Stacked resumes small icon"
  >
    <defs>
      <clipPath :id="`${uid}-c`">
        <rect x="-7.5" y="-10.5" width="15" height="21" rx="3" />
      </clipPath>
    </defs>
    <g transform="translate(12 14) rotate(-24)">
      <rect x="-7.5" y="-10.5" width="15" height="21" rx="3" fill="#FFFEF7" stroke="#00000014" stroke-width="0.75" />
      <g :clip-path="`url(#${uid}-c)`">
        <rect x="-7.5" y="-10.5" width="3.2" height="21" fill="#E97862" />
      </g>
      <rect x="-2.8" y="-7.3" width="7.2" height="2.6" rx="1.2" fill="#E97862" />
      <g fill="#F0C4B2">
        <rect x="-2.8" y="-3.4" width="7.2" height="2" rx="1" />
        <rect x="-2.8" y="-0.1" width="7.2" height="2" rx="1" />
        <rect x="-2.8" y="3.2" width="5" height="2" rx="1" />
      </g>
    </g>
    <g transform="translate(20 14) rotate(24)">
      <rect x="-7.5" y="-10.5" width="15" height="21" rx="3" fill="#FFFEF7" stroke="#00000014" stroke-width="0.75" />
      <g :clip-path="`url(#${uid}-c)`">
        <rect x="-7.5" y="-10.5" width="3.2" height="21" fill="#6266B3" />
      </g>
      <rect x="-2.8" y="-7.3" width="7.2" height="2.6" rx="1.2" fill="#6266B3" />
      <g fill="#C9CAE4">
        <rect x="-2.8" y="-3.4" width="7.2" height="2" rx="1" />
        <rect x="-2.8" y="-0.1" width="7.2" height="2" rx="1" />
        <rect x="-2.8" y="3.2" width="5" height="2" rx="1" />
      </g>
    </g>
    <g transform="translate(16 16)">
      <rect x="-7.5" y="-10.5" width="15" height="21" rx="3" fill="#fff" stroke="#CBD5E1" stroke-width="1" />
      <g :clip-path="`url(#${uid}-c)`">
        <rect x="-7.5" y="-10.5" width="3.2" height="21" fill="#3AA9A3" />
      </g>
      <rect x="-2.8" y="-7.3" width="7.2" height="2.6" rx="1" fill="#3F444B" />
      <g fill="#C9CCD3">
        <rect x="-2.8" y="-3.4" width="7.2" height="2" rx="1" />
        <rect x="-2.8" y="-0.1" width="7.2" height="2" rx="1" />
        <rect x="-2.8" y="3.2" width="5" height="2" rx="1" />
      </g>
      <rect x="-7.5" y="-10.5" width="15" height="21" rx="3" fill="none" stroke="#0F172A" stroke-opacity="0.12" stroke-width="1" />
    </g>
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 16 });
const uid = `rss${Math.random().toString(36).slice(2, 8)}`;
</script>
