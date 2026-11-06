<script setup lang="ts">
import { computed, ref } from 'vue';
import { auth } from '../auth';
import { rosterStore } from '../rosterStore';
import { getMonthlySummary, getStatusClass, getSummaryCounts, normalizeStatusText } from '../utils/roster';

type ShiftFilter = 'ALL' | 'PAGI' | 'SIANG' | 'Office Hour' | 'LIBUR';

const roster = computed(() => rosterStore.active);
const selected = computed(() => roster.value?.dates.find((d) => d.key === rosterStore.selectedDate));
const monthlySummary = computed(() => (roster.value ? getMonthlySummary(roster.value) : null));
const shiftFilter = ref<ShiftFilter>('ALL');

const selectedIndex = computed(() => {
  if (!roster.value) return -1;
  return roster.value.dates.findIndex((d) => d.key === rosterStore.selectedDate);
});

const canPrevDate = computed(() => selectedIndex.value > 0);
const canNextDate = computed(() => !!roster.value && selectedIndex.value >= 0 && selectedIndex.value < roster.value.dates.length - 1);

const stepDate = (delta: number): void => {
  if (!roster.value) return;
  const target = roster.value.dates[selectedIndex.value + delta];
  if (target) rosterStore.selectedDate = target.key;
};

const currentUserPersonName = computed((): string => {
  const user = auth.state.user;
  if (!user) return '';
  if (user.personnelId) {
    const linked = rosterStore.personnel.find((p) => p.id === user.personnelId);
    if (linked?.name) return linked.name.trim().toLowerCase();
  }
  return (user.fullName || user.username || '').trim().toLowerCase();
});

const isCurrentUser = (name: string): boolean => {
  const target = currentUserPersonName.value;
  return !!target && name.trim().toLowerCase() === target;
};

const shiftHoursText = (rawStatus: string): string => {
  if (rawStatus === 'PAGI') return '06:00 – 15:00 WIB';
  if (rawStatus === 'SIANG') return '13:00 – 22:00 WIB';
  if (rawStatus === 'Office Hour') return '08:00 – 17:00 WIB';
  return 'OFF Duty';
};

const summaryCards = computed(() => {
  if (!roster.value || !selected.value) return [];
  const s = getSummaryCounts(selected.value.key, roster.value);
  return [
    { key: 'PAGI' as ShiftFilter, title: 'Shift Pagi', hours: '06:00–15:00', value: s.pagi, tone: 'pagi' },
    { key: 'SIANG' as ShiftFilter, title: 'Shift Siang', hours: '13:00–22:00', value: s.siang, tone: 'siang' },
    { key: 'Office Hour' as ShiftFilter, title: 'Office Hour', hours: '08:00–17:00', value: s.office, tone: 'office' },
    { key: 'LIBUR' as ShiftFilter, title: 'Libur / OFF', hours: 'OFF Duty', value: s.empty, tone: 'empty' },
  ];
});

const toggleShiftFilter = (target: ShiftFilter): void => {
  shiftFilter.value = shiftFilter.value === target ? 'ALL' : target;
};

// Filter personel berdasarkan pencarian nama (berlaku untuk Harian & Bulanan)
const searchedPersonnel = computed(() => {
  const query = rosterStore.searchTerm.trim().toLowerCase();
  return (roster.value?.personnel ?? []).filter((p) => !query || p.name.toLowerCase().includes(query));
});

// Filter personel untuk tampilan kartu Harian (ditambah filter shift jika dipilih)
const dailyVisible = computed(() => {
  if (!selected.value) return [];
  const dateKey = selected.value.key;
  return searchedPersonnel.value.filter((p) => {
    const raw = p.schedule[dateKey] ?? '';
    if (shiftFilter.value === 'ALL') return true;
    if (shiftFilter.value === 'LIBUR') return raw === '';
    return raw === shiftFilter.value;
  });
});
</script>

<template>
  <div class="roster-unified-stack">
    <!-- ================= TOOLBAR FILTER & NAVIGASI TERPADU ================= -->
    <section class="roster-control-bar">
      <div class="roster-control-group date-control-group">
        <span class="control-label">Tanggal Roster Harian</span>
        <div class="date-stepper">
          <button
            type="button"
            class="stepper-btn"
            :disabled="!canPrevDate"
            title="Hari Sebelumnya"
            @click="stepDate(-1)"
          >
            ‹
          </button>
          <select v-model="rosterStore.selectedDate" aria-label="Pilih tanggal roster">
            <option v-for="date in roster?.dates ?? []" :key="date.key" :value="date.key">
              {{ date.label }} • {{ date.dayName }}
            </option>
          </select>
          <button
            type="button"
            class="stepper-btn"
            :disabled="!canNextDate"
            title="Hari Berikutnya"
            @click="stepDate(1)"
          >
            ›
          </button>
        </div>
      </div>

      <div class="roster-control-group search-control-group">
        <span class="control-label">Cari Personel (Harian &amp; Bulanan)</span>
        <div class="search-input-wrap">
          <input
            v-model="rosterStore.searchTerm"
            type="search"
            placeholder="Ketik nama personel..."
          />
          <button
            v-if="rosterStore.searchTerm"
            type="button"
            class="clear-search-btn"
            @click="rosterStore.searchTerm = ''"
          >
            Reset
          </button>
        </div>
      </div>

      <div class="roster-control-group shift-control-group">
        <span class="control-label">Filter Shift Harian</span>
        <div class="shift-filter-pills">
          <button
            type="button"
            class="shift-pill-btn"
            :class="{ 'is-active': shiftFilter === 'ALL' }"
            @click="shiftFilter = 'ALL'"
          >
            Semua
          </button>
          <button
            type="button"
            class="shift-pill-btn pagi"
            :class="{ 'is-active': shiftFilter === 'PAGI' }"
            @click="toggleShiftFilter('PAGI')"
          >
            PAGI
          </button>
          <button
            type="button"
            class="shift-pill-btn siang"
            :class="{ 'is-active': shiftFilter === 'SIANG' }"
            @click="toggleShiftFilter('SIANG')"
          >
            SIANG
          </button>
          <button
            type="button"
            class="shift-pill-btn office"
            :class="{ 'is-active': shiftFilter === 'Office Hour' }"
            @click="toggleShiftFilter('Office Hour')"
          >
            Office Hour
          </button>
          <button
            type="button"
            class="shift-pill-btn empty"
            :class="{ 'is-active': shiftFilter === 'LIBUR' }"
            @click="toggleShiftFilter('LIBUR')"
          >
            Libur
          </button>
        </div>
      </div>
    </section>

    <!-- ================= BAGIAN 1: DASHBOARD ROSTER HARIAN ================= -->
    <section v-if="summaryCards.length" class="summary-grid modern-summary-grid">
      <button
        v-for="card in summaryCards"
        :key="card.title"
        type="button"
        class="summary-card interactive-summary-card"
        :class="[card.tone, { 'is-filtered': shiftFilter === card.key }]"
        @click="toggleShiftFilter(card.key)"
      >
        <div class="summary-card-top">
          <span class="summary-title">{{ card.title }}</span>
          <small class="summary-hours">{{ card.hours }}</small>
        </div>
        <div class="summary-card-bottom">
          <strong class="summary-value">{{ card.value }}</strong>
          <span class="summary-unit">Personel</span>
        </div>
      </button>
    </section>

    <section class="view-panel modern-roster-section">
      <div v-if="!roster" class="empty-state">
        {{ rosterStore.loading ? 'Memuat jadwal roster...' : 'Belum ada roster aktif. Admin dapat membuatnya di halaman Admin.' }}
      </div>
      <div v-else-if="!selected" class="empty-state">Data roster untuk tanggal ini belum tersedia.</div>
      <template v-else>
        <div class="section-header-bar">
          <div>
            <span class="section-step-pill">BAGIAN 1 • DASHBOARD HARIAN</span>
            <h2>Jadwal Harian — {{ selected.dayName }}, {{ selected.label }}</h2>
          </div>
          <div class="section-header-meta">
            <span class="meta-chip">Menampilkan {{ dailyVisible.length }} dari {{ roster.personnel.length }} personel</span>
            <button
              v-if="shiftFilter !== 'ALL'"
              type="button"
              class="ghost-button small"
              @click="shiftFilter = 'ALL'"
            >
              Tampilkan Semua Shift
            </button>
          </div>
        </div>

        <div v-if="!dailyVisible.length" class="empty-state">
          Tidak ada personel yang cocok dengan filter pada tanggal {{ selected.label }}.
        </div>
        <div v-else class="person-card-grid modern-person-grid">
          <article
            v-for="person in dailyVisible"
            :key="person.name"
            class="person-card modern-person-card"
            :class="[
              getStatusClass(person.schedule[selected.key] ?? ''),
              { 'is-me': isCurrentUser(person.name) },
            ]"
          >
            <div class="person-header">
              <div>
                <div class="person-name-line">
                  <h3>{{ person.name }}</h3>
                  <span v-if="isCurrentUser(person.name)" class="me-pill">Anda</span>
                </div>
                <p>{{ person.department }} • {{ person.position }}</p>
              </div>
              <span class="status-badge" :class="getStatusClass(person.schedule[selected.key] ?? '')">
                {{ normalizeStatusText(person.schedule[selected.key] ?? '') }}
              </span>
            </div>
            <div class="person-card-divider"></div>
            <div class="person-meta-grid">
              <div class="person-meta-item">
                <span>Tanggal</span>
                <strong>{{ selected.dayName }}, {{ selected.label }}</strong>
              </div>
              <div class="person-meta-item">
                <span>Jam Kerja</span>
                <strong>{{ shiftHoursText(person.schedule[selected.key] ?? '') }}</strong>
              </div>
            </div>
          </article>
        </div>
      </template>
    </section>

    <!-- ================= BAGIAN 2: TABEL ROSTER BULANAN ================= -->
    <section v-if="roster && monthlySummary" class="view-panel modern-roster-section">
      <div class="section-header-bar">
        <div>
          <span class="section-step-pill secondary">BAGIAN 2 • MATRIKS ROSTER BULANAN</span>
          <h2>Tabel Roster Bulanan — {{ roster.monthLabel }}</h2>
          <p class="section-subtitle">
            Klik pada kolom tanggal di tabel untuk melihat detail harian pada bagian atas.
          </p>
        </div>
        <div class="legend-inline">
          <span class="legend-badge pagi">PAGI</span>
          <span class="legend-badge siang">SIANG</span>
          <span class="legend-badge office">Office Hour</span>
          <span class="legend-badge empty">Libur</span>
        </div>
      </div>

      <div class="report-summary-grid modern-monthly-stats">
        <div class="report-stat-box">
          <span>Periode</span>
          <strong>{{ roster.periodLabel }}</strong>
        </div>
        <div class="report-stat-box">
          <span>Total Personel</span>
          <strong>{{ monthlySummary.total }} Orang</strong>
        </div>
        <div class="report-stat-box pagi-stat">
          <span>Total Shift PAGI</span>
          <strong>{{ monthlySummary.pagi }}</strong>
        </div>
        <div class="report-stat-box siang-stat">
          <span>Total Shift SIANG</span>
          <strong>{{ monthlySummary.siang }}</strong>
        </div>
        <div class="report-stat-box office-stat">
          <span>Total Office Hour</span>
          <strong>{{ monthlySummary.office }}</strong>
        </div>
        <div class="report-stat-box empty-stat">
          <span>Total Libur</span>
          <strong>{{ monthlySummary.empty }}</strong>
        </div>
      </div>

      <div v-if="!searchedPersonnel.length" class="empty-state">
        Tidak ada personel yang cocok dengan kata kunci pencarian.
      </div>
      <div v-else class="table-scroll modern-monthly-scroll">
        <table class="monthly-table modern-monthly-table">
          <thead>
            <tr>
              <th class="sticky-col person-column">Personel</th>
              <th class="department-column">Departemen</th>
              <th class="role-column">Jabatan</th>
              <th
                v-for="date in roster.dates"
                :key="date.key"
                class="clickable-date-col"
                :class="{ 'is-selected-col': date.key === rosterStore.selectedDate }"
                :title="`Klik untuk memilih tanggal ${date.label}`"
                @click="rosterStore.selectedDate = date.key"
              >
                <span>{{ date.dayName }}</span>
                <small>{{ date.label }}</small>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="person in searchedPersonnel"
              :key="person.name"
              :class="{ 'is-me-row': isCurrentUser(person.name) }"
            >
              <td class="sticky-col person-cell">
                <div class="person-cell-inner">
                  <strong>{{ person.name }}</strong>
                  <span v-if="isCurrentUser(person.name)" class="me-pill">Anda</span>
                </div>
              </td>
              <td>{{ person.department }}</td>
              <td>{{ person.position }}</td>
              <td
                v-for="date in roster.dates"
                :key="date.key"
                :class="{ 'is-selected-col': date.key === rosterStore.selectedDate }"
                @click="rosterStore.selectedDate = date.key"
              >
                <span
                  v-if="person.schedule[date.key]"
                  class="table-status"
                  :class="getStatusClass(person.schedule[date.key])"
                >
                  {{ person.schedule[date.key] }}
                </span>
                <span v-else class="empty-pill">Libur</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
