<script setup lang="ts">
import { printStore } from './printStore';
import PrintSheet from './components/PrintSheet.vue';
</script>

<template>
  <div class="screen-root"><RouterView /></div>
  <div v-if="printStore.reports.length" class="print-host">
    <PrintSheet v-for="report in printStore.reports" :key="report.id" :report="report" />
  </div>
</template>

