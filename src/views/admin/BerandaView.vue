<script setup lang="ts">
import {onMounted, ref} from 'vue';
import {extractErrorMessage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {settingsStore} from '@/stores/settingsStore';
import {showToast} from '@/stores/toastStore';
import type {DashboardStats} from '@/types/eosis';

const loading = ref(true);
const stats = ref<DashboardStats>({
  total_students: 0,
  total_classes: 0,
  total_candidates: 0,
  voted_count: 0,
  not_voted_count: 0,
  participation_percentage: 0,
  class_breakdown: [],
});

async function loadStats(): Promise<void> {
  if (!authStore.state.token) return;
  loading.value = true;
  try {
    stats.value = await eosisApi.getDashboardStats(authStore.state.token);
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memuat statistik beranda.'), 'danger');
  } finally {
    loading.value = false;
  }
}

onMounted(loadStats);
</script>

<template>
  <div>
    <!-- Top Action Row -->
    <div class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-4">
      <div>
        <div class="text-muted small">
          Ringkasan partisipasi pemilih · {{ settingsStore.state.settings.school_name }}
        </div>
        <div class="fw-semibold text-dark small mt-1">
          Status Bilik Suara:
          <span
            v-if="settingsStore.state.settings.is_voting_open"
            class="text-success ms-1"
          >
            <i class="bi bi-unlock-fill" aria-hidden="true"></i> Dibuka
          </span>
          <span v-else class="text-danger ms-1">
            <i class="bi bi-lock-fill" aria-hidden="true"></i> Ditutup
          </span>
        </div>
      </div>

      <button
        type="button"
        class="btn btn-outline-secondary btn-sm align-self-start align-self-sm-auto"
        :disabled="loading"
        @click="loadStats"
      >
        <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
        <i v-else class="bi bi-arrow-clockwise" aria-hidden="true"></i>
        <span>Muat Ulang Data</span>
      </button>
    </div>

    <!-- Primary KPI Grid -->
    <div class="row g-3 mb-4">
      <div class="col-12 col-sm-6 col-xl-4">
        <div class="eosis-card p-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-muted small fw-semibold">Total Siswa Terdaftar</span>
            <i class="bi bi-people text-primary fs-5" aria-hidden="true"></i>
          </div>
          <div class="h2 fw-bold mb-0 font-mono-num">{{ stats.total_students }}</div>
          <div class="text-muted small mt-1">Pemilih aktif dalam DPT sekolah</div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="eosis-card p-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-muted small fw-semibold">Total Kelas</span>
            <i class="bi bi-building text-primary fs-5" aria-hidden="true"></i>
          </div>
          <div class="h2 fw-bold mb-0 font-mono-num">{{ stats.total_classes }}</div>
          <div class="text-muted small mt-1">Rombongan belajar terdaftar</div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="eosis-card p-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-muted small fw-semibold">Pasangan Kandidat</span>
            <i class="bi bi-person-badge text-primary fs-5" aria-hidden="true"></i>
          </div>
          <div class="h2 fw-bold mb-0 font-mono-num">{{ stats.total_candidates }}</div>
          <div class="text-muted small mt-1">Calon Ketua &amp; Wakil Ketua OSIS</div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="eosis-card p-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-muted small fw-semibold">Sudah Memilih</span>
            <i class="bi bi-check-circle-fill text-success fs-5" aria-hidden="true"></i>
          </div>
          <div class="h2 fw-bold mb-0 font-mono-num text-success">{{ stats.voted_count }}</div>
          <div class="text-muted small mt-1">Siswa telah menggunakan hak pilih</div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="eosis-card p-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-muted small fw-semibold">Belum Memilih</span>
            <i class="bi bi-hourglass-split text-warning fs-5" aria-hidden="true"></i>
          </div>
          <div class="h2 fw-bold mb-0 font-mono-num text-warning">{{ stats.not_voted_count }}</div>
          <div class="text-muted small mt-1">Siswa belum memberikan suara</div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="eosis-card p-3 h-100">
          <div class="d-flex align-items-center justify-content-between mb-2">
            <span class="text-muted small fw-semibold">Persentase Partisipasi</span>
            <i class="bi bi-pie-chart-fill text-primary fs-5" aria-hidden="true"></i>
          </div>
          <div class="h2 fw-bold mb-2 font-mono-num">{{ stats.participation_percentage }}%</div>
          <div class="progress" style="height: 8px" role="progressbar" :aria-valuenow="stats.participation_percentage" aria-valuemin="0" aria-valuemax="100">
            <div
              class="progress-bar bg-primary"
              :style="{width: `${stats.participation_percentage}%`}"
            ></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Participation per Class Table -->
    <div class="eosis-card overflow-hidden">
      <div class="eosis-card-header d-flex align-items-center justify-content-between">
        <div>
          <h2 class="h6 fw-bold mb-0">Partisipasi Pemilih per Kelas</h2>
          <div class="text-muted small">Rekap status memilih tiap kelas tanpa menampilkan pilihan suara siswa.</div>
        </div>
        <router-link to="/admin/perolehan-suara" class="btn btn-primary btn-sm">
          <i class="bi bi-bar-chart-line" aria-hidden="true"></i>
          <span>Lihat Perolehan Suara</span>
        </router-link>
      </div>

      <div class="table-responsive">
        <table class="table eosis-table">
          <thead>
            <tr>
              <th>Nama Kelas</th>
              <th>Tingkat</th>
              <th class="text-end">Total Siswa</th>
              <th class="text-end">Sudah Memilih</th>
              <th class="text-end">Belum Memilih</th>
              <th style="width: 220px">Partisipasi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="6" class="text-center py-4 text-muted">Memuat rekap kelas...</td>
            </tr>
            <tr v-else-if="stats.class_breakdown.length === 0">
              <td colspan="6" class="text-center py-4 text-muted">
                Belum ada data kelas. Tambahkan kelas melalui menu Kelas.
              </td>
            </tr>
            <tr v-for="cls in stats.class_breakdown" :key="cls.id">
              <td class="fw-semibold">{{ cls.name }}</td>
              <td class="text-secondary">{{ cls.grade_level }}</td>
              <td class="text-end font-mono-num">{{ cls.total_students }}</td>
              <td class="text-end font-mono-num text-success fw-semibold">{{ cls.voted_count }}</td>
              <td class="text-end font-mono-num text-warning fw-semibold">{{ cls.not_voted_count }}</td>
              <td>
                <div class="d-flex align-items-center gap-2">
                  <div class="progress flex-grow-1" style="height: 6px">
                    <div
                      class="progress-bar bg-primary"
                      :style="{
                        width: `${cls.total_students > 0 ? Math.round((cls.voted_count / cls.total_students) * 100) : 0}%`,
                      }"
                    ></div>
                  </div>
                  <span class="small font-mono-num text-secondary" style="width: 46px; text-align: right">
                    {{
                      cls.total_students > 0
                        ? ((cls.voted_count / cls.total_students) * 100).toFixed(0)
                        : 0
                    }}%
                  </span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
