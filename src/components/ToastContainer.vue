<script setup lang="ts">
import {dismissToast, toastState} from '@/stores/toastStore';

function iconClass(variant: string): string {
  switch (variant) {
    case 'success':
      return 'bi-check-circle-fill text-success';
    case 'danger':
      return 'bi-exclamation-octagon-fill text-danger';
    case 'warning':
      return 'bi-exclamation-triangle-fill text-warning';
    default:
      return 'bi-info-circle-fill text-primary';
  }
}
</script>

<template>
  <div
    class="toast-container position-fixed bottom-0 end-0 p-3"
    style="z-index: 1090"
    aria-live="polite"
    aria-atomic="true"
  >
    <div
      v-for="item in toastState.items"
      :key="item.id"
      class="toast show bg-white border shadow-sm mb-2"
      role="alert"
    >
      <div class="toast-header bg-white border-bottom">
        <i class="bi me-2" :class="iconClass(item.variant)" aria-hidden="true"></i>
        <strong class="me-auto text-dark">{{ item.title }}</strong>
        <button
          type="button"
          class="btn-close"
          aria-label="Tutup notifikasi"
          @click="dismissToast(item.id)"
        ></button>
      </div>
      <div class="toast-body text-secondary">
        {{ item.message }}
      </div>
    </div>
  </div>
</template>
