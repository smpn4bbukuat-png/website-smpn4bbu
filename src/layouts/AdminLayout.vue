<script setup lang="ts">
import {computed, ref} from 'vue';
import {useRoute, useRouter} from 'vue-router';
import AdminSidebar from '@/components/AdminSidebar.vue';
import {authStore} from '@/stores/authStore';
import {settingsStore} from '@/stores/settingsStore';
import {showToast} from '@/stores/toastStore';

const route = useRoute();
const router = useRouter();
const mobileMenuOpen = ref(false);

const pageTitle = computed(() => (route.meta.title as string) || 'Beranda Admin');

async function handleLogout(): Promise<void> {
  mobileMenuOpen.value = false;
  await authStore.logout();
  showToast('Anda telah keluar dari panel admin.', 'info');
  await router.replace('/login');
}
</script>

<template>
  <div class="admin-shell">
    <!-- Desktop Fixed Sidebar -->
    <aside class="admin-sidebar d-none d-lg-flex">
      <AdminSidebar
        :active-path="route.path"
        @logout="handleLogout"
      />
    </aside>

    <!-- Mobile/Tablet Drawer Sidebar -->
    <div
      v-if="mobileMenuOpen"
      class="offcanvas offcanvas-start show d-lg-none"
      tabindex="-1"
      style="background-color: var(--eosis-sidebar-bg); width: 264px; visibility: visible; z-index: 1055"
      aria-modal="true"
      role="dialog"
    >
      <div class="d-flex justify-content-end p-2 pb-0">
        <button
          type="button"
          class="btn-close btn-close-white"
          aria-label="Tutup menu"
          @click="mobileMenuOpen = false"
        ></button>
      </div>
      <AdminSidebar
        :active-path="route.path"
        @navigate="mobileMenuOpen = false"
        @logout="handleLogout"
      />
    </div>
    <div
      v-if="mobileMenuOpen"
      class="offcanvas-backdrop fade show d-lg-none"
      style="z-index: 1050"
      @click="mobileMenuOpen = false"
    ></div>

    <!-- Main Viewport -->
    <div class="admin-main">
      <header class="admin-topbar">
        <div class="d-flex align-items-center gap-3 min-w-0">
          <button
            type="button"
            class="btn btn-outline-secondary d-lg-none px-2"
            aria-label="Buka menu navigasi"
            @click="mobileMenuOpen = true"
          >
            <i class="bi bi-list fs-5" aria-hidden="true"></i>
          </button>
          <div class="min-w-0">
            <h1 class="h5 fw-bold mb-0 text-truncate">{{ pageTitle }}</h1>
            <div class="text-muted small text-truncate">
              {{ settingsStore.state.settings.election_title }} · Periode
              {{ settingsStore.state.settings.election_period }}
            </div>
          </div>
        </div>

        <div class="d-flex align-items-center gap-3 flex-shrink-0">
          <div class="d-none sm:flex text-end d-sm-block">
            <div class="fw-semibold small text-dark">
              {{ authStore.state.admin?.full_name || 'Administrator' }}
            </div>
            <div class="text-muted" style="font-size: 0.75rem">
              @{{ authStore.state.admin?.username }}
            </div>
          </div>
          <button
            type="button"
            class="btn btn-outline-danger btn-sm"
            @click="handleLogout"
          >
            <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
            <span class="d-none d-md-inline">Keluar</span>
          </button>
        </div>
      </header>

      <main class="admin-content">
        <router-view />
      </main>
    </div>
  </div>
</template>
