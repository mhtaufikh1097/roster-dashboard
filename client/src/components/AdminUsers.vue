<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../api';
import { auth } from '../auth';
import { setNotice } from '../notice';
import type { ManagedUser, Personnel, Role } from '../types';

type FilterRole = 'all' | Role | 'inactive';

const users = ref<ManagedUser[]>([]);
const personnel = ref<Personnel[]>([]);
const roleFilter = ref<FilterRole>('all');
const search = ref('');
const editingId = ref<number | null>(null);

const roles: Array<{ value: Role; label: string }> = [
  { value: 'user', label: 'Technician (User)' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'admin', label: 'Admin' },
];

const form = reactive({
  username: '',
  fullName: '',
  password: '',
  role: 'user' as Role,
  personnelId: null as number | null,
});

const editForm = reactive({
  username: '',
  fullName: '',
  role: 'user' as Role,
  personnelId: null as number | null,
});

const load = async (): Promise<void> => {
  [users.value, personnel.value] = await Promise.all([
    api<ManagedUser[]>('GET', '/users'),
    api<Personnel[]>('GET', '/personnel?all=true'),
  ]);
};
onMounted(() => void load().catch((e) => setNotice(e.message, 'error')));

const stats = computed(() => {
  const active = users.value.filter((u) => u.isActive);
  return {
    total: active.length,
    inactive: users.value.filter((u) => !u.isActive).length,
    supervisors: active.filter((u) => u.role === 'supervisor').length,
    technicians: active.filter((u) => u.role === 'user').length,
    admins: active.filter((u) => u.role === 'admin').length,
  };
});

const visibleUsers = computed(() => {
  const q = search.value.trim().toLowerCase();
  return users.value.filter((u) => {
    if (roleFilter.value === 'inactive') {
      if (u.isActive) return false;
    } else if (roleFilter.value !== 'all') {
      if (!u.isActive || u.role !== roleFilter.value) return false;
    } else if (!u.isActive) {
      return false;
    }
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      (u.personnelName ?? '').toLowerCase().includes(q)
    );
  });
});

const add = async (): Promise<void> => {
  try {
    await api('POST', '/users', { ...form });
    Object.assign(form, { username: '', fullName: '', password: '', role: 'user', personnelId: null });
    setNotice('Akun pengguna baru berhasil ditambahkan.', 'success');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menambah pengguna.', 'error');
  }
};

const startEdit = (u: ManagedUser): void => {
  editingId.value = u.id;
  editForm.username = u.username;
  editForm.fullName = u.fullName;
  editForm.role = u.role;
  editForm.personnelId = u.personnelId;
};

const saveEdit = async (u: ManagedUser): Promise<void> => {
  try {
    await api('PUT', `/users/${u.id}`, {
      username: editForm.username,
      fullName: editForm.fullName,
      role: editForm.role,
      personnelId: editForm.personnelId,
    });
    editingId.value = null;
    setNotice(`Data akun ${editForm.fullName || editForm.username} berhasil disimpan.`, 'success');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal memperbarui pengguna.', 'error');
  }
};

const updatePatch = async (user: ManagedUser, patch: Record<string, unknown>, msg = 'Pengguna diperbarui.'): Promise<void> => {
  try {
    await api('PUT', `/users/${user.id}`, patch);
    setNotice(msg, 'success');
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal memperbarui pengguna.', 'error');
  }
  await load();
};

const resetPassword = async (user: ManagedUser): Promise<void> => {
  const password = window.prompt(`Masukkan password baru untuk "${user.fullName || user.username}" (minimal 6 karakter):`);
  if (password) {
    await updatePatch(user, { password }, `Password untuk ${user.fullName || user.username} berhasil direset.`);
  }
};

const deleteUser = async (user: ManagedUser): Promise<void> => {
  if (!window.confirm(`Hapus permanen akun "${user.fullName || user.username}" (@${user.username})?`)) return;
  try {
    await api('DELETE', `/users/${user.id}`);
    setNotice('Akun pengguna dihapus.', 'success');
    await load();
  } catch (e) {
    setNotice(e instanceof Error ? e.message : 'Gagal menghapus akun.', 'error');
  }
};

const roleBadgeText = (role: Role): string => {
  if (role === 'admin') return 'ADMIN';
  if (role === 'supervisor') return 'SUPERVISOR';
  return 'TECHNICIAN';
};
</script>

<template>
  <div class="admin-block">
    <!-- Kartu Statistik Dashboard Pengguna -->
    <div class="supervisor-kpi-grid">
      <button
        type="button"
        class="supervisor-kpi-card all"
        :class="{ 'is-selected': roleFilter === 'all' }"
        @click="roleFilter = 'all'"
      >
        <span class="kpi-label">Total Akun Aktif</span>
        <strong class="kpi-value">{{ stats.total }}</strong>
        <small>Semua level pengguna aktif</small>
      </button>

      <button
        type="button"
        class="supervisor-kpi-card approved"
        :class="{ 'is-selected': roleFilter === 'supervisor' }"
        @click="roleFilter = 'supervisor'"
      >
        <span class="kpi-label">Level Supervisor</span>
        <strong class="kpi-value">{{ stats.supervisors }}</strong>
        <small>Zigmahara, Muhammad Syaeful, dll.</small>
      </button>

      <button
        type="button"
        class="supervisor-kpi-card progress"
        :class="{ 'is-selected': roleFilter === 'user' }"
        @click="roleFilter = 'user'"
      >
        <span class="kpi-label">Level Technician</span>
        <strong class="kpi-value">{{ stats.technicians }}</strong>
        <small>Sesuai personel roster</small>
      </button>

      <button
        type="button"
        class="supervisor-kpi-card pending"
        :class="{ 'is-selected': roleFilter === 'admin' }"
        @click="roleFilter = 'admin'"
      >
        <span class="kpi-label">Level Admin</span>
        <strong class="kpi-value">{{ stats.admins }}</strong>
        <small>{{ stats.inactive }} akun nonaktif</small>
      </button>
    </div>

    <!-- Form Tambah Akun Pengguna Baru -->
    <div class="activity-card">
      <h3>Tambah Akun Pengguna Baru (Technician / Supervisor / Admin)</h3>
      <form class="admin-inline-form" @submit.prevent="add">
        <label class="field-wrap compact-field">
          <span>Username Login</span>
          <input v-model="form.username" type="text" placeholder="contoh: zigmahara" required />
        </label>
        <label class="field-wrap compact-field">
          <span>Nama Lengkap</span>
          <input v-model="form.fullName" type="text" placeholder="contoh: Zigmahara" required />
        </label>
        <label class="field-wrap compact-field">
          <span>Password Awal</span>
          <input v-model="form.password" type="password" minlength="6" autocomplete="new-password" placeholder="Min. 6 karakter" required />
        </label>
        <label class="field-wrap compact-field">
          <span>Level / Role</span>
          <select v-model="form.role">
            <option v-for="r in roles" :key="r.value" :value="r.value">{{ r.label }}</option>
          </select>
        </label>
        <label class="field-wrap compact-field">
          <span>Tautkan ke Personel Roster (Opsional)</span>
          <select v-model="form.personnelId">
            <option :value="null">— Tidak ditautkan (Supervisor/Admin) —</option>
            <option v-for="p in personnel" :key="p.id" :value="p.id">{{ p.name }} ({{ p.position }})</option>
          </select>
        </label>
        <button type="submit" class="primary-button">+ Buat Akun User</button>
      </form>
    </div>

    <!-- Filter & Tabel Daftar Pengguna -->
    <div class="activity-card">
      <div class="activity-card-header">
        <div>
          <h3>Daftar Akun Pengguna Sistem</h3>
          <p class="field-hint">Admin memegang kendali penuh untuk mengubah nama, username, level role, password, dan status aktif seluruh user.</p>
        </div>
        <div class="inline-actions">
          <button
            type="button"
            class="secondary-button compact-button"
            :class="{ 'is-active': roleFilter === 'inactive' }"
            @click="roleFilter = roleFilter === 'inactive' ? 'all' : 'inactive'"
          >
            {{ roleFilter === 'inactive' ? 'Lihat Akun Aktif' : `Akun Nonaktif (${stats.inactive})` }}
          </button>
          <input v-model="search" type="search" placeholder="Cari nama atau username..." />
        </div>
      </div>

      <div class="table-scroll">
        <table class="daily-activity-table">
          <thead>
            <tr>
              <th>Nama Lengkap</th>
              <th>Username Login</th>
              <th>Level / Role</th>
              <th>Tautan Personel Roster</th>
              <th>Status</th>
              <th>Kendali Admin</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="u in visibleUsers" :key="u.id">
              <template v-if="editingId === u.id">
                <td><input v-model="editForm.fullName" type="text" placeholder="Nama lengkap" /></td>
                <td><input v-model="editForm.username" type="text" placeholder="Username" /></td>
                <td>
                  <select v-model="editForm.role" :disabled="u.id === auth.state.user?.id">
                    <option v-for="r in roles" :key="r.value" :value="r.value">{{ r.label }}</option>
                  </select>
                </td>
                <td>
                  <select v-model="editForm.personnelId">
                    <option :value="null">— Tidak ditautkan —</option>
                    <option v-for="p in personnel" :key="p.id" :value="p.id">{{ p.name }}</option>
                  </select>
                </td>
                <td>{{ u.isActive ? 'Aktif' : 'Nonaktif' }}</td>
                <td>
                  <div class="activity-actions">
                    <button type="button" class="primary-button compact-button" @click="saveEdit(u)">Simpan</button>
                    <button type="button" class="secondary-button compact-button" @click="editingId = null">Batal</button>
                  </div>
                </td>
              </template>

              <template v-else>
                <td><strong>{{ u.fullName || u.username }}</strong></td>
                <td><code>@{{ u.username }}</code></td>
                <td>
                  <span class="user-role-badge" :class="u.role">{{ roleBadgeText(u.role) }}</span>
                </td>
                <td>{{ u.personnelName || '—' }}</td>
                <td>
                  <span class="activity-status-badge" :class="u.isActive ? 'reviewed' : 'draft'">
                    {{ u.isActive ? 'Aktif' : 'Nonaktif' }}
                  </span>
                </td>
                <td>
                  <div class="activity-actions">
                    <button type="button" class="secondary-button compact-button" @click="startEdit(u)">
                      Edit User
                    </button>
                    <button type="button" class="secondary-button compact-button" @click="resetPassword(u)">
                      Reset Password
                    </button>
                    <button
                      type="button"
                      class="secondary-button compact-button"
                      :disabled="u.id === auth.state.user?.id"
                      @click="updatePatch(u, { isActive: !u.isActive })"
                    >
                      {{ u.isActive ? 'Nonaktifkan' : 'Aktifkan' }}
                    </button>
                    <button
                      v-if="u.id !== auth.state.user?.id"
                      type="button"
                      class="danger-button compact-button"
                      @click="deleteUser(u)"
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </template>
            </tr>
            <tr v-if="!visibleUsers.length">
              <td colspan="6">Tidak ada akun pengguna yang sesuai dengan filter.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
