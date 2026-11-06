<script setup lang="ts">
import { computed } from 'vue';
import { rosterStore } from '../rosterStore';
import { getMonthlySummary, getStatusClass } from '../utils/roster';

const roster = computed(() => rosterStore.active);
const summary = computed(() => (roster.value ? getMonthlySummary(roster.value) : null));

const visible = computed(() => {
  const query = rosterStore.searchTerm.trim().toLowerCase();
  return (roster.value?.personnel ?? []).filter((p) => !query || p.name.toLowerCase().includes(query));
});
</script>

<template>
  <section class="toolbar">
    <label class="field-wrap">
      <span>Cari personel</span>
      <input v-model="rosterStore.searchTerm" type="search" placeholder="Nama personel..." />
    </label>
  </section>

  <section class="view-panel">
    <div v-if="!roster || !summary" class="empty-state">
      {{ rosterStore.loading ? 'Memuat roster...' : 'Belum ada roster aktif. Admin dapat membuatnya di halaman Admin.' }}
    </div>
    <div v-else-if="!visible.length" class="empty-state">Tidak ada personel yang cocok dengan pencarian.</div>
    <template v-else>
      <div class="report-header">
        <div>
          <p class="panel-kicker">Roster Bulanan</p>
          <h2>{{ roster.monthLabel }}</h2>
        </div>
        <div class="legend-inline">
          <span class="legend-badge pagi">PAGI</span>
          <span class="legend-badge siang">SIANG</span>
          <span class="legend-badge office">Office Hour</span>
          <span class="legend-badge empty">Libur</span>
        </div>
      </div>

      <div class="report-summary-grid">
        <div class="report-stat-box"><span>Periode</span><strong>{{ roster.periodLabel }}</strong></div>
        <div class="report-stat-box"><span>Total Personel</span><strong>{{ summary.total }}</strong></div>
        <div class="report-stat-box"><span>PAGI</span><strong>{{ summary.pagi }}</strong></div>
        <div class="report-stat-box"><span>SIANG</span><strong>{{ summary.siang }}</strong></div>
        <div class="report-stat-box"><span>Office Hour</span><strong>{{ summary.office }}</strong></div>
        <div class="report-stat-box"><span>Libur</span><strong>{{ summary.empty }}</strong></div>
      </div>

      <div class="table-scroll">
        <table class="monthly-table">
          <thead>
            <tr>
              <th class="sticky-col person-column">Personel</th>
              <th class="department-column">Departemen</th>
              <th class="role-column">Jabatan</th>
              <th v-for="date in roster.dates" :key="date.key">
                <span>{{ date.dayName }}</span><small>{{ date.label }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="person in visible" :key="person.name">
              <td class="sticky-col person-cell"><strong>{{ person.name }}</strong></td>
              <td>{{ person.department }}</td>
              <td>{{ person.position }}</td>
              <td v-for="date in roster.dates" :key="date.key">
                <span v-if="person.schedule[date.key]" class="table-status" :class="getStatusClass(person.schedule[date.key])">
                  {{ person.schedule[date.key] }}
                </span>
                <span v-else class="empty-pill">Libur</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </section>
</template>

