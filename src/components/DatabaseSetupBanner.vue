<script setup lang="ts">
import {ref} from 'vue';
import schemaSql from '../../supabase/schema.sql?raw';
import {settingsStore} from '@/stores/settingsStore';
import {showToast} from '@/stores/toastStore';

const showSqlPreview = ref(false);
const checking = ref(false);

async function copySql(): Promise<void> {
  try {
    await navigator.clipboard.writeText(schemaSql);
    showToast('Script SQL schema.sql berhasil disalin ke clipboard.', 'success');
  } catch {
    showToast('Gagal menyalin otomatis. Silakan buka file supabase/schema.sql.', 'warning');
  }
}

async function recheckDatabase(): Promise<void> {
  checking.value = true;
  await settingsStore.loadSettings(true);
  checking.value = false;
  if (!settingsStore.state.schemaMissing && !settingsStore.state.connectionError) {
    showToast('Koneksi database Supabase berhasil diverifikasi.', 'success');
  } else {
    showToast('Tabel atau fungsi RPC eOSIS belum ditemukan di Supabase.', 'warning');
  }
}
</script>

<template>
  <div v-if="settingsStore.state.schemaMissing" class="container py-4">
    <div class="eosis-card p-4 border-warning">
      <div class="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <div class="d-flex align-items-center gap-2 text-warning fw-bold mb-1">
            <i class="bi bi-database-exclamation fs-5" aria-hidden="true"></i>
            <span>Inisialisasi Database Supabase Diperlukan</span>
          </div>
          <p class="text-secondary mb-0 small">
            Aplikasi terhubung ke Supabase, namun tabel dan fungsi RPC <code>eosis_*</code> belum
            dijalankan pada project database Anda. Salin dan jalankan script
            <code>supabase/schema.sql</code> di Supabase SQL Editor untuk mengaktifkan seluruh fitur
            login, voting, CRUD, dan penyimpanan logo/foto.
          </p>
        </div>
        <div class="d-flex flex-wrap gap-2 flex-shrink-0">
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="showSqlPreview = !showSqlPreview">
            <i class="bi bi-code-square" aria-hidden="true"></i>
            <span>{{ showSqlPreview ? 'Sembunyikan SQL' : 'Lihat SQL' }}</span>
          </button>
          <button type="button" class="btn btn-primary btn-sm" @click="copySql">
            <i class="bi bi-clipboard-check" aria-hidden="true"></i>
            <span>Salin SQL Migration</span>
          </button>
          <button
            type="button"
            class="btn btn-success btn-sm"
            :disabled="checking"
            @click="recheckDatabase"
          >
            <span v-if="checking" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <i v-else class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            <span>Periksa Koneksi Ulang</span>
          </button>
        </div>
      </div>

      <div v-if="showSqlPreview" class="mt-3">
        <pre
          class="bg-dark text-light p-3 rounded small mb-0 font-mono-num"
          style="max-height: 320px; overflow: auto"
        >{{ schemaSql }}</pre>
      </div>
    </div>
  </div>
</template>
