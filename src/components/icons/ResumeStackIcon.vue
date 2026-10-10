<template>
  <!-- One doc template × 3: white sheet + LEFT spine only. -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 400 360"
    :width="size"
    :height="size"
    role="img"
    aria-label="Stacked resumes icon"
  >
    <defs>
      <filter :id="`${uid}-shadow`" x="-40%" y="-40%" width="180%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="11" flood-color="#2b2440" flood-opacity="0.22" />
      </filter>
      <clipPath :id="`${uid}-clip`">
        <rect x="-82" y="-126" width="164" height="252" rx="16" />
      </clipPath>
    </defs>
    <g transform="translate(150 170) rotate(-24)" :filter="`url(#${uid}-shadow)`">
      <rect x="-82" y="-126" width="164" height="252" rx="16" fill="#FFFEF7" />
      <g :clip-path="`url(#${uid}-clip)`">
        <rect x="-82" y="-126" width="20" height="252" fill="#E97862" />
      </g>
      <rect x="-48" y="-92" width="106" height="20" rx="6" fill="#E97862" />
      <g fill="#F0C4B2">
        <rect x="-48" y="-60" width="72" height="10" rx="5" />
        <rect x="-48" y="-40" width="106" height="10" rx="5" />
        <rect x="-48" y="-20" width="88" height="10" rx="5" />
        <rect x="-48" y="8" width="68" height="10" rx="5" />
        <rect x="-48" y="28" width="106" height="10" rx="5" />
        <rect x="-48" y="48" width="80" height="10" rx="5" />
        <rect x="-48" y="76" width="106" height="10" rx="5" />
        <rect x="-48" y="96" width="84" height="10" rx="5" />
      </g>
    </g>
    <g transform="translate(250 170) rotate(24)" :filter="`url(#${uid}-shadow)`">
      <rect x="-82" y="-126" width="164" height="252" rx="16" fill="#FFFEF7" />
      <g :clip-path="`url(#${uid}-clip)`">
        <rect x="-82" y="-126" width="20" height="252" fill="#6266B3" />
      </g>
      <rect x="-48" y="-92" width="106" height="20" rx="6" fill="#6266B3" />
      <g fill="#C9CAE4">
        <rect x="-48" y="-60" width="72" height="10" rx="5" />
        <rect x="-48" y="-40" width="106" height="10" rx="5" />
        <rect x="-48" y="-20" width="88" height="10" rx="5" />
        <rect x="-48" y="8" width="68" height="10" rx="5" />
        <rect x="-48" y="28" width="106" height="10" rx="5" />
        <rect x="-48" y="48" width="80" height="10" rx="5" />
        <rect x="-48" y="76" width="106" height="10" rx="5" />
        <rect x="-48" y="96" width="84" height="10" rx="5" />
      </g>
    </g>
    <g transform="translate(200 190)" :filter="`url(#${uid}-shadow)`">
      <rect x="-82" y="-126" width="164" height="252" rx="16" fill="#fff" />
      <g :clip-path="`url(#${uid}-clip)`">
        <rect x="-82" y="-126" width="20" height="252" fill="#4FB3AD" />
      </g>
      <rect x="-48" y="-92" width="106" height="20" rx="6" fill="#5B5F66" />
      <g fill="#D3D4D9">
        <rect x="-48" y="-60" width="72" height="10" rx="5" />
        <rect x="-48" y="-40" width="106" height="10" rx="5" />
        <rect x="-48" y="-20" width="88" height="10" rx="5" />
        <rect x="-48" y="8" width="68" height="10" rx="5" />
        <rect x="-48" y="28" width="106" height="10" rx="5" />
        <rect x="-48" y="48" width="80" height="10" rx="5" />
        <rect x="-48" y="76" width="106" height="10" rx="5" />
        <rect x="-48" y="96" width="84" height="10" rx="5" />
      </g>
    </g>
  </svg>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ size?: number | string }>(), { size: 64 });
const uid = `rs${Math.random().toString(36).slice(2, 8)}`;
</script>
