import {createRouter, createWebHistory, type RouteRecordRaw} from 'vue-router';
import AdminLayout from '@/layouts/AdminLayout.vue';
import {authStore} from '@/stores/authStore';
import {settingsStore} from '@/stores/settingsStore';
import type {UserRole} from '@/types/eosis';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/login',
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginView.vue'),
    meta: {guestOnly: true, title: 'Masuk'},
  },
  {
    path: '/bilik-suara',
    name: 'StudentVoting',
    component: () => import('@/views/StudentVotingView.vue'),
    meta: {requiresAuth: true, role: 'student' as UserRole, title: 'Bilik Suara'},
  },
  {
    path: '/admin',
    component: AdminLayout,
    redirect: '/admin/beranda',
    meta: {requiresAuth: true, role: 'admin' as UserRole},
    children: [
      {
        path: 'beranda',
        name: 'AdminBeranda',
        component: () => import('@/views/admin/BerandaView.vue'),
        meta: {requiresAuth: true, role: 'admin' as UserRole, title: 'Beranda'},
      },
      {
        path: 'kelas',
        name: 'AdminKelas',
        component: () => import('@/views/admin/KelasView.vue'),
        meta: {requiresAuth: true, role: 'admin' as UserRole, title: 'Manajemen Kelas'},
      },
      {
        path: 'siswa',
        name: 'AdminSiswa',
        component: () => import('@/views/admin/SiswaView.vue'),
        meta: {requiresAuth: true, role: 'admin' as UserRole, title: 'Data Siswa / Pemilih'},
      },
      {
        path: 'kandidat',
        name: 'AdminKandidat',
        component: () => import('@/views/admin/KandidatView.vue'),
        meta: {requiresAuth: true, role: 'admin' as UserRole, title: 'Calon Kandidat OSIS'},
      },
      {
        path: 'perolehan-suara',
        name: 'AdminPerolehanSuara',
        component: () => import('@/views/admin/PerolehanSuaraView.vue'),
        meta: {requiresAuth: true, role: 'admin' as UserRole, title: 'Perolehan Suara'},
      },
      {
        path: 'rekapitulasi',
        name: 'AdminRekapitulasi',
        component: () => import('@/views/admin/RekapitulasiView.vue'),
        meta: {requiresAuth: true, role: 'admin' as UserRole, title: 'Rekapitulasi Akhir'},
      },
      {
        path: 'pengaturan',
        name: 'AdminPengaturan',
        component: () => import('@/views/admin/PengaturanView.vue'),
        meta: {requiresAuth: true, role: 'admin' as UserRole, title: 'Pengaturan Sistem'},
      },
    ],
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/login',
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return {top: 0};
  },
});

router.beforeEach(async (to) => {
  await Promise.all([settingsStore.loadSettings(), authStore.restoreSession()]);

  const requiresAuth = Boolean(to.meta.requiresAuth);
  const requiredRole = to.meta.role as UserRole | undefined;
  const guestOnly = Boolean(to.meta.guestOnly);

  if (guestOnly && authStore.isAuthenticated.value) {
    return authStore.isAdmin.value ? '/admin/beranda' : '/bilik-suara';
  }

  if (requiresAuth) {
    if (!authStore.isAuthenticated.value) {
      return '/login';
    }
    if (requiredRole === 'admin' && !authStore.isAdmin.value) {
      return '/bilik-suara';
    }
    if (requiredRole === 'student' && !authStore.isStudent.value) {
      return '/admin/beranda';
    }
  }

  return true;
});
