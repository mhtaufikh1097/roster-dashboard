<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { auth } from '../auth';
import { getHomeRouteForRole } from '../router';
import type { Role } from '../types';

type RosterAccount = { username: string; name: string; role: Role };

const router = useRouter();
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const error = ref('');
const loading = ref(false);
const accounts = ref<RosterAccount[]>([]);

onMounted(async () => {
  try {
    accounts.value = await api<RosterAccount[]>('GET', '/auth/roster-accounts');
  } catch {
    accounts.value = [];
  }
});

const techAccounts = computed(() => accounts.value.filter((a) => a.role === 'user'));
const supervisorAccounts = computed(() => accounts.value.filter((a) => a.role === 'supervisor'));

const fillAccount = (user: string, pass: string): void => {
  username.value = user;
  password.value = pass;
  error.value = '';
};

const submit = async (): Promise<void> => {
  if (!username.value.trim() || !password.value) {
    error.value = 'Username / Nama Lengkap dan password wajib diisi.';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await auth.login(username.value.trim(), password.value);
    await router.replace(getHomeRouteForRole());
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Login gagal.';
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="login-screen">
    <div class="login-shell">
      <section class="login-panel">
        <div class="login-brand">
          <div class="brand-mark">R</div>
          <div>
            <p class="brand-title">Roster HPIO</p>
            <small>IT Technician • Supervisor • Admin</small>
          </div>
        </div>

        <div class="login-copy">
          <p class="eyebrow">Access Portal</p>
          <h1>Masuk ke Sistem</h1>
          <p>Gunakan akun Technician sesuai nama roster, Supervisor, atau Admin.</p>
        </div>

        <form class="login-form" novalidate @submit.prevent="submit">
          <label class="login-field">
            <span>Username / Nama Lengkap</span>
            <input
              v-model="username"
              type="text"
              autocomplete="username"
              placeholder="Contoh: Urwah / Zigmahara / Muhammad Syaeful / admin"
              required
            />
          </label>

          <label class="login-field">
            <span>Password</span>
            <div class="password-wrap">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                autocomplete="current-password"
                placeholder="Masukkan password"
                required
              />
              <button class="password-toggle" type="button" @click="showPassword = !showPassword">
                {{ showPassword ? 'Hide' : 'Show' }}
              </button>
            </div>
          </label>

          <button class="login-button" type="submit" :disabled="loading">
            <span class="login-button-label">{{ loading ? 'Memproses...' : 'Login' }}</span>
          </button>

          <p class="login-error" :class="{ visible: error }" role="alert" aria-live="polite">{{ error }}</p>
        </form>
      </section>

      <aside class="login-aside">
        <div class="login-aside-card">
          <p class="eyebrow">Daftar Akun Sistem</p>
          <h2>Klik Nama untuk Isi Cepat</h2>

          <div class="account-quick-section">
            <small class="quick-label">1. Level Technician Roster (Password: <strong>Admin123!</strong>)</small>
            <div class="quick-chip-list">
              <button
                v-for="acc in techAccounts"
                :key="acc.username"
                type="button"
                class="quick-account-chip"
                @click="fillAccount(acc.name, 'Admin123!')"
              >
                <strong>{{ acc.name }}</strong>
                <small>@{{ acc.username }}</small>
              </button>
            </div>
          </div>

          <div class="account-quick-section">
            <small class="quick-label">2. Level Supervisor Approval (Password: <strong>Supervisor123!</strong>)</small>
            <div class="quick-chip-list">
              <button
                v-for="sup in supervisorAccounts"
                :key="sup.username"
                type="button"
                class="quick-account-chip supervisor-chip"
                @click="fillAccount(sup.name, 'Supervisor123!')"
              >
                <strong>{{ sup.name }}</strong>
                <small>@{{ sup.username }} • Supervisor</small>
              </button>
            </div>
          </div>

          <ul class="credential-list">
            <li class="clickable-cred" @click="fillAccount('admin', 'Admin123!')">
              <span>3. Level Admin (Kelola Semua)</span>
              <strong>admin / Admin123!</strong>
            </li>
          </ul>
          <small>Semua akun dikelola penuh oleh Admin di menu Dashboard Pengguna.</small>
        </div>
      </aside>
    </div>
  </div>
</template>
