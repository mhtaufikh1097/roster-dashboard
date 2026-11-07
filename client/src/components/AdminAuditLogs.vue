<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import { api } from '../api';
import { setNotice } from '../notice';
import type { AuditAction, AuditLogItem, AuditLogResponse, Role } from '../types';

const logs = ref<AuditLogItem[]>([]);
const loading = ref(false);
const page = ref(1);
const total = ref(0);
const totalPages = ref(1);
const LIMIT = 5;

const filters = reactive({
  search: '',
  action: '' as '' | AuditAction,
  module: '',
  date: '',
});

const roleLabel: Record<Role, string> = {
  admin: 'Administrator',
  supervisor: 'IT Engineer',
  user: 'IT Technician',
};

const actionLabel: Record<AuditAction, string> = {
  LOGIN: 'Login',
  LOGOUT: 'Logout',
  EDIT: 'Edit Data',
  DELETE: 'Hapus Data',
};

const actionTone = (action: AuditAction): string => {
  if (action === 'LOGIN') return 'log-login';
  if (action === 'LOGOUT') return 'log-logout';
  if (action === 'DELETE') return 'log-delete';
  return 'log-edit';
};

const formatLogTime = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

const loadLogs = async (): Promise<void> => {
  loading.value = true;
  try {
    const params = new URLSearchParams();
    params.set('limit', String(LIMIT));
    params.set('page', String(page.value));
    if (filters.action) params.set('action', filters.action);
    if (filters.module) params.set('module', filters.module);
    if (filters.date) params.set('date', filters.date);
    if (filters.search.trim()) params.set('search', filters.search.trim());

    const res = await api<AuditLogResponse>('GET', `/audit-logs?${params.toString()}`);
    logs.value = res.items.slice(0, LIMIT);
    total.value = res.total;
    totalPages.value = res.totalPages;
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal memuat log aktivitas pengguna.', 'error');
  } finally {
    loading.value = false;
  }
};

watch(
  () => [filters.action, filters.module, filters.date, filters.search],
  () => {
    page.value = 1;
    void loadLogs();
  },
);

const changePage = (nextPage: number): void => {
  if (nextPage < 1 || nextPage > totalPages.value) return;
  page.value = nextPage;
  void loadLogs();
};

const resetFilters = (): void => {
  filters.search = '';
  filters.action = '';
  filters.module = '';
  filters.date = '';
};

onMounted(loadLogs);
</script>

<template>
  <div class="activity-card audit-log-card">
    <div class="activity-card-header">
      <div>
        <div class="audit-title-row">
          <h3>Tabel Log Aktivitas Pengguna</h3>
          <span class="multi-count-badge">Limit 5 Data Tampilan</span>
        </div>
        <p class="field-hint">
          Rekam jejak otomatis saat pengguna Login, Logout, Edit Data, dan Menghapus Data di sistem.
        </p>
      </div>
      <div class="inline-actions">
        <button
          v-if="filters.search || filters.action || filters.module || filters.date"
          type="button"
          class="secondary-button compact-button"
          @click="resetFilters"
        >
          Reset Filter
        </button>
        <button type="button" class="secondary-button compact-button" :disabled="loading" @click="loadLogs">
          {{ loading ? 'Memuat...' : 'Refresh Log' }}
        </button>
      </div>
    </div>

    <!-- Pill Filter Cepat Jenis Aksi -->
    <div class="audit-quick-pills">
      <button
        type="button"
        class="shift-pill-btn"
        :class="{ 'is-active': filters.action === '' }"
        @click="filters.action = ''"
      >
        Semua Aksi ({{ total }})
      </button>
      <button
        type="button"
        class="shift-pill-btn"
        :class="{ 'is-active': filters.action === 'LOGIN' }"
        @click="filters.action = 'LOGIN'"
      >
        Login
      </button>
      <button
        type="button"
        class="shift-pill-btn"
        :class="{ 'is-active': filters.action === 'LOGOUT' }"
        @click="filters.action = 'LOGOUT'"
      >
        Logout
      </button>
      <button
        type="button"
        class="shift-pill-btn"
        :class="{ 'is-active': filters.action === 'EDIT' }"
        @click="filters.action = 'EDIT'"
      >
        Edit Data
      </button>
      <button
        type="button"
        class="shift-pill-btn"
        :class="{ 'is-active': filters.action === 'DELETE' }"
        @click="filters.action = 'DELETE'"
      >
        Hapus Data
      </button>
    </div>

    <!-- Baris Filter Pencarian, Aksi, Modul, Tanggal -->
    <div class="activity-filters audit-filter-grid">
      <label class="field-wrap compact-field">
        <span>Cari Pengguna / Keterangan</span>
        <input
          v-model="filters.search"
          type="search"
          placeholder="Nama user, @username, atau aktivitas..."
        />
      </label>

      <label class="field-wrap compact-field">
        <span>Filter Jenis Aksi</span>
        <select v-model="filters.action">
          <option value="">Semua Aksi</option>
          <option value="LOGIN">Login</option>
          <option value="LOGOUT">Logout</option>
          <option value="EDIT">Edit / Perubahan Data</option>
          <option value="DELETE">Menghapus Data</option>
        </select>
      </label>

      <label class="field-wrap compact-field">
        <span>Filter Modul</span>
        <select v-model="filters.module">
          <option value="">Semua Modul</option>
          <option value="Autentikasi">Autentikasi (Login/Logout)</option>
          <option value="Daily Activity">Daily Activity</option>
          <option value="Jadwal Roster">Jadwal Roster</option>
          <option value="Manajemen User">Manajemen User</option>
          <option value="Master Personel">Master Personel</option>
        </select>
      </label>

      <label class="field-wrap compact-field">
        <span>Filter Tanggal</span>
        <input v-model="filters.date" type="date" />
      </label>
    </div>

    <!-- Tabel Log (Maksimal 5 Baris Tampilan) -->
    <div class="table-scroll">
      <table class="daily-activity-table audit-log-table">
        <thead>
          <tr>
            <th style="width: 170px">Waktu</th>
            <th style="width: 220px">Pengguna</th>
            <th style="width: 120px">Aksi</th>
            <th style="width: 150px">Modul</th>
            <th>Detail Aktivitas</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="loading && !logs.length">
            <td colspan="5" class="empty-state">Memuat data log aktivitas...</td>
          </tr>
          <tr v-else-if="!logs.length">
            <td colspan="5" class="empty-state">Belum ada log aktivitas yang cocok dengan filter.</td>
          </tr>
          <tr v-for="item in logs" :key="item.id">
            <td class="audit-time-cell">
              <strong>{{ formatLogTime(item.createdAt) }}</strong>
            </td>
            <td>
              <div class="audit-user-cell">
                <strong>{{ item.fullName || item.username }}</strong>
                <div class="audit-user-sub">
                  <span>@{{ item.username }}</span>
                  <span class="user-role-badge" :class="item.role">
                    {{ roleLabel[item.role] ?? item.role }}
                  </span>
                </div>
              </div>
            </td>
            <td>
              <span class="audit-action-badge" :class="actionTone(item.action)">
                {{ actionLabel[item.action] ?? item.action }}
              </span>
            </td>
            <td>
              <span class="work-pill">{{ item.module }}</span>
            </td>
            <td class="audit-desc-cell">
              {{ item.description }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Footer Informasi Limit 5 Data & Navigasi Halaman -->
    <div class="audit-pagination-bar">
      <span class="field-hint">
        Menampilkan <strong>{{ logs.length }}</strong> data (maks. 5 baris per tampilan) dari total
        <strong>{{ total }}</strong> log aktivitas.
      </span>
      <div class="inline-actions">
        <button
          type="button"
          class="secondary-button compact-button"
          :disabled="page <= 1 || loading"
          @click="changePage(page - 1)"
        >
          ‹ Sebelumnya
        </button>
        <span class="audit-page-indicator">Halaman {{ page }} / {{ totalPages }}</span>
        <button
          type="button"
          class="secondary-button compact-button"
          :disabled="page >= totalPages || loading"
          @click="changePage(page + 1)"
        >
          Berikutnya ›
        </button>
      </div>
    </div>
  </div>
</template>

