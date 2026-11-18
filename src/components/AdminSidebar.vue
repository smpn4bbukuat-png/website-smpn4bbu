<script setup lang="ts">
import {settingsStore} from '@/stores/settingsStore';

defineProps<{
  activePath: string;
}>();

const emit = defineEmits<{
  (e: 'navigate'): void;
  (e: 'logout'): void;
}>();

const navItems = [
  {to: '/admin/beranda', label: 'Beranda', icon: 'bi-grid-1x2'},
  {to: '/admin/kelas', label: 'Kelas', icon: 'bi-building'},
  {to: '/admin/siswa', label: 'Siswa/User', icon: 'bi-people'},
  {to: '/admin/kandidat', label: 'Calon Kandidat', icon: 'bi-person-badge'},
  {to: '/admin/perolehan-suara', label: 'Perolehan Suara', icon: 'bi-bar-chart-line'},
  {to: '/admin/rekapitulasi', label: 'Rekapitulasi Akhir', icon: 'bi-file-earmark-arrow-down'},
  {to: '/admin/pengaturan', label: 'Pengaturan', icon: 'bi-gear'},
];
</script>

<template>
  <div class="d-flex flex-column h-100 p-3">
    <!-- School Brand Lockup -->
    <div class="d-flex align-items-center gap-2 pb-3 mb-3 border-bottom border-secondary border-opacity-25">
      <img
        :src="settingsStore.effectiveLogoUrl.value"
        :alt="settingsStore.state.settings.school_name"
        class="school-logo-box"
        referrerpolicy="no-referrer"
      />
      <div class="min-w-0">
        <div class="fw-bold text-white text-truncate" style="font-size: 0.98rem">eOSIS Panel</div>
        <div class="text-truncate" style="font-size: 0.76rem; color: #94a3b8">
          {{ settingsStore.state.settings.school_name }}
        </div>
      </div>
    </div>

    <!-- Navigation Links -->
    <nav class="d-flex flex-column gap-1 flex-grow-1" aria-label="Menu Admin">
      <router-link
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="admin-nav-link"
        :class="{active: activePath === item.to}"
        @click="emit('navigate')"
      >
        <i class="bi" :class="item.icon" aria-hidden="true"></i>
        <span>{{ item.label }}</span>
      </router-link>
    </nav>

    <!-- Bottom Period & Logout -->
    <div class="pt-3 mt-3 border-top border-secondary border-opacity-25">
      <div class="px-2 mb-2" style="font-size: 0.75rem; color: #94a3b8">
        Periode {{ settingsStore.state.settings.election_period }}
      </div>
      <button
        type="button"
        class="admin-nav-link w-100 border-0 bg-transparent text-start text-danger-emphasis"
        style="color: #fca5a5 !important"
        @click="emit('logout')"
      >
        <i class="bi bi-box-arrow-left" aria-hidden="true"></i>
        <span>Keluar</span>
      </button>
    </div>
  </div>
</template>
