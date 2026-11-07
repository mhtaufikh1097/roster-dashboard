import { computed, reactive } from 'vue';
import { api, getToken, setToken, setUnauthorizedHandler } from './api';
import type { AuthUser } from './types';

const state = reactive<{ user: AuthUser | null; ready: boolean }>({ user: null, ready: false });

export const auth = {
  state,
  isAdmin: computed(() => state.user?.role === 'admin'),
  isSupervisor: computed(() => state.user?.role === 'supervisor'),
  /** Boleh acknowledge/review: supervisor dan admin. */
  canReview: computed(() => state.user?.role === 'supervisor' || state.user?.role === 'admin'),

  async restore(): Promise<void> {
    if (getToken()) {
      try {
        state.user = await api<AuthUser>('GET', '/auth/me');
      } catch {
        setToken(null);
        state.user = null;
      }
    }
    state.ready = true;
  },

  async login(username: string, password: string): Promise<void> {
    const result = await api<{ token: string; user: AuthUser }>('POST', '/auth/login', { username, password });
    setToken(result.token);
    state.user = result.user;
  },

  async logout(silent = false): Promise<void> {
    if (!silent && getToken()) {
      try {
        await api('POST', '/auth/logout');
      } catch {
        // Abaikan jika token sudah kadaluarsa
      }
    }
    setToken(null);
    state.user = null;
  },
};

setUnauthorizedHandler(() => {
  void auth.logout(true);
  window.location.hash = '#/login';
});

