<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { auth } from '../auth';
import { getUserShiftInfo, rosterStore } from '../rosterStore';
import { notice } from '../notice';

const route = useRoute();
const router = useRouter();

onMounted(() => {
  void rosterStore.load();
  void rosterStore.loadPersonnel();
});

const logout = async (): Promise<void> => {
  await auth.logout();
  await router.replace({ name: 'login' });
};

const defaultJobTitle: Record<string, string> = {
  admin: 'Administrator',
  supervisor: 'IT Engineer',
  user: 'IT Technician',
};

const userJobTitle = computed(() => {
  const custom = auth.state.user?.position?.trim();
  if (custom && custom.toLowerCase() !== 'supervisor') return custom;
  return defaultJobTitle[auth.state.user?.role ?? 'user'] ?? 'IT Technician';
});

const userDisplayName = computed(() => auth.state.user?.fullName || auth.state.user?.username || 'User');

const userInitials = computed(() => {
  const parts = userDisplayName.value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
});

const userShift = computed(() => getUserShiftInfo(auth.state.user, rosterStore.selectedDate));

const currentAdminTab = computed(() => (route.query.tab as string) || 'overview');
</script>

<template>
  <div
    class="dashboard-shell"
    :class="{
      'is-supervisor-mode': auth.isSupervisor.value,
      'is-admin-mode': auth.isAdmin.value,
    }"
  >
    <aside
      class="sidebar"
      :class="{
        'supervisor-sidebar': auth.isSupervisor.value,
        'admin-sidebar': auth.isAdmin.value,
      }"
    >
      <div class="brand-wrap">
        <div class="brand-logo-box">
          <img src="/img/PT_KCIC_logo.png" alt="KCIC" class="sidebar-kcic-logo" />
        </div>
        <div>
          <p class="brand-title">
            {{ auth.isAdmin.value ? 'Admin Center' : auth.isSupervisor.value ? userJobTitle : 'Roster HPIO' }}
          </p>
          <small>
            {{
              auth.isAdmin.value
                ? 'Kendali Penuh Sistem'
                : auth.isSupervisor.value
                  ? 'Approval & Monitoring'
                  : userJobTitle
            }}
          </small>
        </div>
      </div>

      <!-- ================= MENU KHUSUS ADMIN ================= -->
      <nav v-if="auth.isAdmin.value" class="sidebar-nav" aria-label="Navigasi Admin">
        <p class="nav-section-title">KENDALI UTAMA ADMIN</p>
        <RouterLink
          class="nav-button"
          :class="{ 'is-active': route.name === 'admin' && currentAdminTab === 'overview' }"
          :to="{ path: '/admin', query: { tab: 'overview' } }"
        >
          Overview Sistem
        </RouterLink>
        <RouterLink
          class="nav-button"
          :class="{ 'is-active': route.name === 'admin' && currentAdminTab === 'users' }"
          :to="{ path: '/admin', query: { tab: 'users' } }"
        >
          Dashboard Pengguna / User
        </RouterLink>
        <RouterLink
          class="nav-button"
          :class="{ 'is-active': route.name === 'admin' && currentAdminTab === 'logs' }"
          :to="{ path: '/admin', query: { tab: 'logs' } }"
        >
          Log Aktivitas Pengguna
        </RouterLink>
        <RouterLink
          class="nav-button"
          :class="{ 'is-active': route.name === 'admin' && currentAdminTab === 'roster' }"
          :to="{ path: '/admin', query: { tab: 'roster' } }"
        >
          Kelola Tabel Roster
        </RouterLink>
        <RouterLink
          class="nav-button"
          :class="{ 'is-active': route.name === 'admin' && currentAdminTab === 'personnel' }"
          :to="{ path: '/admin', query: { tab: 'personnel' } }"
        >
          Master Data Personel
        </RouterLink>
        <RouterLink
          class="nav-button"
          :class="{ 'is-active': route.name === 'admin' && currentAdminTab === 'reports' }"
          :to="{ path: '/admin', query: { tab: 'reports' } }"
        >
          Kelola Laporan Activity
        </RouterLink>

        <p class="nav-section-title">MONITORING TAMPILAN</p>
        <RouterLink class="nav-button" active-class="is-active" to="/dashboard">
          Jadwal Roster
        </RouterLink>
        <RouterLink class="nav-button" active-class="is-active" to="/supervisor">
          Layar Approval ({{ defaultJobTitle.supervisor }})
        </RouterLink>
        <RouterLink class="nav-button" active-class="is-active" to="/activity">
          Layar Input Technician
        </RouterLink>
      </nav>

      <!-- ================= MENU KHUSUS APPROVAL / IT ENGINEER ================= -->
      <nav v-else-if="auth.isSupervisor.value" class="sidebar-nav" aria-label="Navigasi Approval">
        <p class="nav-section-title">MODUL {{ userJobTitle.toUpperCase() }}</p>
        <RouterLink class="nav-button" active-class="is-active" to="/supervisor">
          Approval Laporan Technician
        </RouterLink>
        <RouterLink class="nav-button" active-class="is-active" to="/dashboard">
          Jadwal Roster
        </RouterLink>
      </nav>

      <!-- ================= MENU KHUSUS TECHNICIAN ================= -->
      <nav v-else class="sidebar-nav" aria-label="Navigasi Technician">
        <p class="nav-section-title">MENU TECHNICIAN</p>
        <RouterLink class="nav-button" active-class="is-active" to="/dashboard">Jadwal Roster</RouterLink>
        <RouterLink class="nav-button" active-class="is-active" to="/activity">Daily Activity Shift</RouterLink>
      </nav>

      <div class="sidebar-card">
        <p class="card-kicker">Legenda Shift</p>
        <div class="legend-list">
          <span class="legend-badge pagi">PAGI</span>
          <span class="legend-badge siang">SIANG</span>
          <span class="legend-badge office">Office Hour</span>
          <span class="legend-badge empty">Libur</span>
        </div>
      </div>
    </aside>

    <main class="main-panel">
      <header
        class="topbar"
        :class="{
          'supervisor-topbar': auth.isSupervisor.value,
          'admin-topbar': auth.isAdmin.value,
        }"
      >
        <div class="topbar-heading">
          <p class="eyebrow">
            {{
              auth.isAdmin.value
                ? 'Admin Control Center — Pusat Pengelolaan Pengguna, Roster, Personel & Laporan HPIO'
                : auth.isSupervisor.value
                  ? `Portal ${userJobTitle} — Monitoring & Approval Laporan Harian Technician HPIO`
                  : 'Monitoring Personel & Daily Activity Ranger IT HPIO'
            }}
          </p>
          <h1>
            {{
              auth.isAdmin.value
                ? 'Admin Control Center HPIO'
                : auth.isSupervisor.value
                  ? `${userJobTitle} Approval & Monitoring HPIO`
                  : 'Dashboard Ranger IT HPIO'
            }}
          </h1>
        </div>

        <!-- Informasi Akun Login & Shift Kerja di Kanan Atas -->
        <div class="topbar-actions">
          <div class="topbar-user-info" :title="`Login sebagai ${userDisplayName} (@${auth.state.user?.username})`">
            <div class="topbar-user-avatar" :class="auth.state.user?.role">
              {{ userInitials }}
            </div>
            <div class="topbar-user-meta">
              <div class="topbar-name-row">
                <strong class="topbar-user-name">{{ userDisplayName }}</strong>
                <span
                  v-if="userShift"
                  class="topbar-shift-badge"
                  :class="userShift.tone"
                  :title="`Jadwal Shift (${userShift.dateLabel}): ${userShift.label} (${userShift.hours})`"
                >
                  Shift {{ userShift.label }} • {{ userShift.hours }}
                </span>
              </div>
              <span class="topbar-user-role">
                {{ userJobTitle }} • @{{ auth.state.user?.username }}
                <template v-if="userShift"> • Jadwal {{ userShift.dateLabel }}</template>
              </span>
            </div>
          </div>
          <button class="logout-button" type="button" @click="logout">Logout</button>
        </div>
      </header>

      <div v-if="notice.message" class="alert-box" :class="notice.type" aria-live="polite">{{ notice.message }}</div>
      <div v-else-if="rosterStore.error" class="alert-box error">{{ rosterStore.error }}</div>

      <section v-if="route.meta.info" class="work-hours-panel" aria-label="Informasi jam kerja">
        <div class="panel-header compact-header">
          <div>
            <p class="panel-kicker">Informasi</p>
            <h2>INFORMASI JAM KERJA</h2>
          </div>
        </div>
        <div class="work-hours-grid">
          <div class="work-hours-item pagi"><span class="work-hours-label">PAGI</span><strong>06:00–15:00</strong></div>
          <div class="work-hours-item siang"><span class="work-hours-label">SIANG</span><strong>13:00–22:00</strong></div>
          <div class="work-hours-item office"><span class="work-hours-label">OFFICE HOUR</span><strong>08:00–17:00</strong></div>
          <div class="work-hours-item empty"><span class="work-hours-label">LIBUR</span><strong>OFF Duty</strong></div>
        </div>
      </section>

      <RouterView />

      <footer v-if="route.meta.info" class="meta-bar">
        <div>
          <span class="meta-label">Last Updated</span>
          <strong>
            {{
              rosterStore.active?.updatedAt
                ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(rosterStore.active.updatedAt))
                : '--'
            }}
          </strong>
        </div>
        <div>
          <span class="meta-label">File</span>
          <strong>{{ rosterStore.active?.filename || '--' }}</strong>
        </div>
        <div>
          <span class="meta-label">Periode</span>
          <strong>{{ rosterStore.active?.periodLabel || '--' }}</strong>
        </div>
      </footer>
    </main>
  </div>
</template>
