<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api';
import { auth } from '../auth';
import { getHomeRouteForRole } from '../router';
import type { Role } from '../types';

type RosterAccount = { username: string; name: string; position?: string; role: Role };

const router = useRouter();
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const showAccountsPopup = ref(false);
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
const engineerAccounts = computed(() => accounts.value.filter((a) => a.role === 'supervisor'));

const fillAccount = (user: string, pass: string): void => {
  username.value = user;
  password.value = pass;
  error.value = '';
  showAccountsPopup.value = false;
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
  <div class="login-screen modern-login-screen">
    <section class="modern-login-card">
      <div class="login-logo-header">
        <img src="/img/PT_KCIC_logo.png" alt="Logo PT KCIC" class="kcic-login-logo" />
        <span class="login-badge-pill">HPIO • ROSTER &amp; DAILY ACTIVITY</span>
        <h1>Masuk ke Sistem</h1>
        <p>Masukkan username atau nama lengkap sesuai jadwal roster Anda.</p>
      </div>

      <form class="login-form" novalidate @submit.prevent="submit">
        <label class="login-field">
          <span>Username / Nama Lengkap</span>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            placeholder="Contoh: Urwah / Zigmahara / admin"
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
          <span class="login-button-label">{{ loading ? 'Memproses...' : 'Masuk ke Sistem' }}</span>
        </button>

        <p class="login-error" :class="{ visible: error }" role="alert" aria-live="polite">{{ error }}</p>
      </form>
    </section>

    <!-- Floating Popover Daftar Akun Sistem di Pojok Kanan Bawah -->
    <div class="login-floating-corner">
      <div v-if="showAccountsPopup" class="login-accounts-popover">
        <div class="popover-header">
          <div>
            <span class="eyebrow">Akses Cepat</span>
            <h3>Daftar Akun Sistem</h3>
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Tutup daftar akun"
            @click="showAccountsPopup = false"
          >
            ×
          </button>
        </div>

        <div class="popover-body">
          <div class="account-quick-section">
            <small class="quick-label-dark">1. IT Technician Roster (Password: <strong>Admin123!</strong>)</small>
            <div class="quick-chip-list">
              <button
                v-for="acc in techAccounts"
                :key="acc.username"
                type="button"
                class="quick-account-chip-light"
                @click="fillAccount(acc.name, 'Admin123!')"
              >
                <strong>{{ acc.name }}</strong>
                <small>@{{ acc.username }} • {{ acc.position || 'IT Technician' }}</small>
              </button>
            </div>
          </div>

          <div class="account-quick-section">
            <small class="quick-label-dark">2. Approval / IT Engineer (Password: <strong>Supervisor123!</strong>)</small>
            <div class="quick-chip-list">
              <button
                v-for="eng in engineerAccounts"
                :key="eng.username"
                type="button"
                class="quick-account-chip-light engineer-chip"
                @click="fillAccount(eng.name, 'Supervisor123!')"
              >
                <strong>{{ eng.name }}</strong>
                <small>@{{ eng.username }} • {{ eng.position || 'IT Engineer' }}</small>
              </button>
            </div>
          </div>

          <div class="account-quick-section">
            <small class="quick-label-dark">3. Administrator Sistem</small>
            <button
              type="button"
              class="quick-account-chip-light admin-chip"
              @click="fillAccount('admin', 'Admin123!')"
            >
              <strong>Administrator</strong>
              <small>@admin • Password: Admin123!</small>
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        class="floating-accounts-btn"
        :class="{ 'is-open': showAccountsPopup }"
        @click="showAccountsPopup = !showAccountsPopup"
      >
        <span>{{ showAccountsPopup ? '✕ Tutup Daftar Akun' : '👤 Daftar Akun Sistem' }}</span>
      </button>
    </div>
  </div>
</template>
