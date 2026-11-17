<script setup lang="ts">
defineProps<{
  show: boolean;
  title: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger' | 'success';
  loading?: boolean;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();
</script>

<template>
  <div
    v-if="show"
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    style="background-color: rgba(15, 23, 42, 0.55); z-index: 1060"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 shadow">
        <div class="modal-header border-bottom">
          <h5 class="modal-title fw-bold fs-6">{{ title }}</h5>
          <button
            type="button"
            class="btn-close"
            :disabled="loading"
            aria-label="Tutup"
            @click="emit('cancel')"
          ></button>
        </div>
        <div class="modal-body">
          <slot />
        </div>
        <div class="modal-footer border-top">
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="loading"
            @click="emit('cancel')"
          >
            {{ cancelLabel ?? 'Batal' }}
          </button>
          <button
            type="button"
            class="btn"
            :class="`btn-${confirmVariant ?? 'primary'}`"
            :disabled="loading"
            @click="emit('confirm')"
          >
            <span
              v-if="loading"
              class="spinner-border spinner-border-sm"
              role="status"
              aria-hidden="true"
            ></span>
            <span>{{ confirmLabel ?? 'Konfirmasi' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
