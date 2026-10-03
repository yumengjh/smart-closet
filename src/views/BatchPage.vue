<script setup lang="ts">
import { useRoute,useRouter } from 'vue-router'
import BatchIntake from '../components/BatchIntake.vue'
const route=useRoute(),router=useRouter()
</script>
<template><a-button type="text" class="back-link" @click="router.push('/add')">返回添加衣物</a-button><header class="page-heading"><h1>衣物整理</h1></header><BatchIntake :key="String(route.params.id)" :batch-id="String(route.params.id)" /></template>
