import { createRouter, createWebHashHistory } from 'vue-router';
import { auth } from './auth';

export const getHomeRouteForRole = () => {
  if (auth.isAdmin.value) return { name: 'admin' };
  if (auth.isSupervisor.value) return { name: 'supervisor' };
  return { name: 'daily' };
};

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', name: 'login', component: () => import('./views/LoginView.vue') },
    {
      path: '/',
      component: () => import('./views/DashboardLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: () => {
            if (auth.isAdmin.value) return '/admin';
            if (auth.isSupervisor.value) return '/supervisor';
            return '/dashboard';
          },
        },
        { path: 'dashboard', name: 'daily', component: () => import('./views/DailyView.vue'), meta: { info: true } },
        { path: 'monthly', redirect: '/dashboard' },
        {
          path: 'activity',
          name: 'activity',
          component: () => import('./views/ActivityView.vue'),
          meta: { techOrAdmin: true },
        },
        {
          path: 'supervisor',
          name: 'supervisor',
          component: () => import('./views/SupervisorView.vue'),
          meta: { supervisorOrAdmin: true },
        },
        { path: 'admin', name: 'admin', component: () => import('./views/AdminView.vue'), meta: { adminOnly: true } },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
});

router.beforeEach(async (to) => {
  if (!auth.state.ready) await auth.restore();
  const loggedIn = !!auth.state.user;
  const defaultRoute = getHomeRouteForRole();

  if (to.name === 'login') return loggedIn ? defaultRoute : true;
  if (to.matched.some((r) => r.meta.requiresAuth) && !loggedIn) return { name: 'login' };
  if (to.meta.adminOnly && !auth.isAdmin.value) return defaultRoute;
  if (to.meta.supervisorOrAdmin && !auth.canReview.value) return defaultRoute;
  if (to.meta.techOrAdmin && auth.isSupervisor.value) return { name: 'supervisor' };
  return true;
});
