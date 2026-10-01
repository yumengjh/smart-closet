<script setup lang="ts">
withDefaults(defineProps<{ mood?: string }>(), { mood: 'idle' })
</script>
<template>
  <svg class="assistant-face" viewBox="0 0 64 64" aria-hidden="true" :data-mood="mood">
    <path class="face-sprout" d="M32 15C31 8 24 8 23 9C23 14 28 16 32 15ZM32 15C33 8 40 8 41 9C41 14 36 16 32 15Z" fill="#87ad99" />
    <path d="M13 33C13 20 21 15 32 15S51 20 51 33V40C51 50 42 55 32 55S13 50 13 40Z" fill="#fffdf8" stroke="#e6e6df" stroke-width="1.5" />
    <ellipse cx="19" cy="40" rx="4" ry="2.5" fill="#efbcb3" opacity=".7" /><ellipse cx="45" cy="40" rx="4" ry="2.5" fill="#efbcb3" opacity=".7" />
    <g class="face-eyes"><rect class="face-eye left" x="23" y="30" width="4" height="7" rx="2" fill="#39483f" /><rect class="face-eye right" x="37" y="30" width="4" height="7" rx="2" fill="#39483f" /></g>
    <path class="face-mouth" d="M28 41Q32 45 36 41" fill="none" stroke="#39483f" stroke-width="2" stroke-linecap="round" />
    <g class="face-happy" fill="none" stroke="#39483f" stroke-width="2" stroke-linecap="round"><path d="M23 34Q25 30 27 34M37 34Q39 30 41 34" /></g>
    <path class="face-concern" d="M28 44Q32 41 36 44" fill="none" stroke="#39483f" stroke-width="2" stroke-linecap="round" />
    <g class="face-sleep" fill="none" stroke="#39483f" stroke-width="2" stroke-linecap="round"><path d="M23 34H27M37 34H41" /></g>
    <circle class="face-thought" cx="51" cy="17" r="3" fill="#a3b7e9" />
  </svg>
</template>
