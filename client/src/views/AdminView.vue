<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api';
import { auth } from '../auth';
import { rosterStore } from '../rosterStore';
import type { ActivityReport, ManagedUser, RosterPeriod } from '../types';
import { getMonthlySummary, getStatusClass } from '../utils/roster';
import AdminUsers from '../components/AdminUsers.vue';
import AdminPersonnel from '../components/AdminPersonnel.vue';
import AdminRoster from '../components/AdminRoster.vue';
import AdminAuditLogs from '../components/AdminAuditLogs.vue';
import ActivityView from './ActivityView.vue';

type Tab = 'overview' | 'users' | 'roster' | 'personnel' | 'reports' | 'logs';

const route = useRoute();
const router = useRouter();

const tab = ref<Tab>(((route.query.tab as Tab) || 'overview'));
watch(
  () => route.query.tab,
  (val) => {
    const next = (val as Tab) || 'overview';
    if (['overview', 'users', 'roster', 'personnel', 'reports', 'logs'].includes(next)) {
      tab.value = next;
    }
  },
);

const setTab = (next: Tab): void => {
  tab.value = next;
  void router.replace({ path: '/admin', query: { tab: next } });
};

const tabs = [
  { key: 'overview' as Tab, label: 'Overview & Tabel Roster' },
  { key: 'users' as Tab, label: 'Dashboard Pengguna / User' },
  { key: 'logs' as Tab, label: 'Log Aktivitas Pengguna' },
  { key: 'roster' as Tab, label: 'Kelola Roster (Manual / Excel)' },
  { key: 'personnel' as Tab, label: 'Master Data Personel' },
  { key: 'reports' as Tab, label: 'Kelola Laporan Activity' },
];

const users = ref<ManagedUser[]>([]);
const periods = ref<RosterPeriod[]>([]);
const reports = ref<ActivityReport[]>([]);

const loadOverview = async (): Promise<void> => {
  try {
    const [u, p, r] = await Promise.all([
      api<ManagedUser[]>('GET', '/users'),
      api<RosterPeriod[]>('GET', '/roster/periods'),
      api<ActivityReport[]>('GET', '/activity'),
    ]);
    users.value = u;
    periods.value = p;
    reports.value = r;
  } catch {
    // ditangani di masing-masing tab
  }
};

onMounted(() => {
  void loadOverview();
  if (!rosterStore.active) void rosterStore.load();
});

const activeUsers = computed(() => users.value.filter((u) => u.isActive));
const supervisorList = computed(() => activeUsers.value.filter((u) => u.role === 'supervisor'));
const techList = computed(() => activeUsers.value.filter((u) => u.role === 'user'));
const rosterSummary = computed(() => (rosterStore.active ? getMonthlySummary(rosterStore.active) : null));
</script>

<template>
  <div v-if="auth.isAdmin.value" class="admin-portal-wrap">
    <!-- Tab Navigasi Atas Admin Control Center -->
    <section class="view-panel">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Admin Control Center</p>
          <h2>Pusat Kendali Sistem Roster &amp; Daily Activity HPIO</h2>
        </div>
      </div>

      <div class="admin-tabs" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.key"
          type="button"
          role="tab"
          class="admin-tab"
          :class="{ 'is-active': tab === t.key }"
          @click="setTab(t.key)"
        >
          {{ t.label }}
        </button>
      </div>

      <!-- ================= TAB 1: OVERVIEW & TABEL ROSTER ADMIN ================= -->
      <div v-if="tab === 'overview'" class="admin-block">
        <div class="supervisor-kpi-grid">
          <button type="button" class="supervisor-kpi-card progress" @click="setTab('users')">
            <span class="kpi-label">Dashboard Pengguna / User</span>
            <strong class="kpi-value">{{ activeUsers.length }} Akun</strong>
            <small>{{ supervisorList.length }} IT Engineer • {{ techList.length }} Technician</small>
          </button>

          <button type="button" class="supervisor-kpi-card approved" @click="setTab('roster')">
            <span class="kpi-label">Periode Roster Aktif</span>
            <strong class="kpi-value">{{ rosterStore.active?.monthLabel || 'Belum Ada' }}</strong>
            <small>{{ periods.length }} periode tersimpan di DB</small>
          </button>

          <button type="button" class="supervisor-kpi-card all" @click="setTab('personnel')">
            <span class="kpi-label">Master Data Personel</span>
            <strong class="kpi-value">{{ rosterStore.personnel.length }} Orang</strong>
            <small>IT Technician HPIO</small>
          </button>

          <button type="button" class="supervisor-kpi-card pending" @click="setTab('reports')">
            <span class="kpi-label">Laporan Daily Activity</span>
            <strong class="kpi-value">{{ reports.length }} Laporan</strong>
            <small>Kelola, edit &amp; cetak periode</small>
          </button>
        </div>

        <!-- Ringkasan Cepat Akun Supervisor & Technician -->
        <div class="admin-overview-columns">
          <div class="activity-card">
            <div class="activity-card-header">
              <h3>Akun IT Engineer (Approval) Aktif</h3>
              <button type="button" class="secondary-button compact-button" @click="setTab('users')">
                Kelola User →
              </button>
            </div>
            <div class="multi-person-chips">
              <span v-for="s in supervisorList" :key="s.id" class="user-role-badge supervisor">
                {{ s.fullName }} • {{ s.position || 'IT Engineer' }} (@{{ s.username }})
              </span>
            </div>
          </div>

          <div class="activity-card">
            <div class="activity-card-header">
              <h3>Akun Technician Sesuai Roster</h3>
              <button type="button" class="secondary-button compact-button" @click="setTab('users')">
                Kelola User →
              </button>
            </div>
            <div class="multi-person-chips">
              <span v-for="t in techList" :key="t.id" class="user-role-badge user">
                {{ t.fullName }} (@{{ t.username }})
              </span>
            </div>
          </div>
        </div>

        <!-- Tabel Roster Aktif yang tersimpan di halaman Admin -->
        <div class="activity-card">
          <div class="activity-card-header">
            <div>
              <h3>Tabel Roster Aktif ({{ rosterStore.active?.monthLabel || '—' }})</h3>
              <p class="field-hint">
                Periode: {{ rosterStore.active?.periodLabel || '—' }} • Total PAGI: {{ rosterSummary?.pagi ?? 0 }} • SIANG: {{ rosterSummary?.siang ?? 0 }} • Office Hour: {{ rosterSummary?.office ?? 0 }}
              </p>
            </div>
            <button type="button" class="primary-button compact-button" @click="setTab('roster')">
              Edit / Upload Jadwal Roster
            </button>
          </div>

          <div v-if="rosterStore.active" class="table-scroll">
            <table class="monthly-table">
              <thead>
                <tr>
                  <th class="sticky-col person-column">Personel</th>
                  <th class="department-column">Departemen</th>
                  <th class="role-column">Jabatan</th>
                  <th v-for="date in rosterStore.active.dates" :key="date.key">
                    <span>{{ date.dayName }}</span><small>{{ date.label }}</small>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="person in rosterStore.active.personnel" :key="person.name">
                  <td class="sticky-col person-cell"><strong>{{ person.name }}</strong></td>
                  <td>{{ person.department }}</td>
                  <td>{{ person.position }}</td>
                  <td v-for="date in rosterStore.active.dates" :key="date.key">
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
          <div v-else class="empty-state">
            Belum ada roster aktif. Klik "Edit / Upload Jadwal Roster" untuk membuat atau mengunggah Excel.
          </div>
        </div>

        <!-- Tabel Log Aktivitas Pengguna (Limit 5 Data Tampilan + Filter) -->
        <AdminAuditLogs />
      </div>

      <!-- ================= TAB 2: DASHBOARD PENGGUNA / USER ================= -->
      <div v-else-if="tab === 'users'" class="admin-block">
        <AdminUsers />
        <AdminAuditLogs />
      </div>

      <!-- ================= TAB LOG AKTIVITAS PENGGUNA ================= -->
      <AdminAuditLogs v-else-if="tab === 'logs'" />

      <!-- ================= TAB 3: KELOLA ROSTER ================= -->
      <AdminRoster v-else-if="tab === 'roster'" />

      <!-- ================= TAB 4: MASTER DATA PERSONEL ================= -->
      <AdminPersonnel v-else-if="tab === 'personnel'" />
    </section>

    <!-- ================= TAB 5: KELOLA LAPORAN ACTIVITY ================= -->
    <ActivityView v-if="tab === 'reports'" />
  </div>
</template>
