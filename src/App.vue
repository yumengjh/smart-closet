<script setup lang="ts">
import { onMounted, onBeforeUnmount } from 'vue'
import { useClosetStore } from './stores/closet'
import { pumpUploads } from './services/quickIntake'
import ClosetShell from './components/ClosetShell.vue'
const closet = useClosetStore()
let uploadTimer = 0
onMounted(() => { uploadTimer = window.setInterval(() => void pumpUploads(() => closet.user?.username), 1200) })
onBeforeUnmount(() => clearInterval(uploadTimer))
</script>

<template><ClosetShell /></template>
