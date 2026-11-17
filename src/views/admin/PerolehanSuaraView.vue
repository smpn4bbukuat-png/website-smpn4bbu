<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import VoteChart from '@/components/VoteChart.vue';
import {extractErrorMessage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {showToast} from '@/stores/toastStore';
import type {VoteResultsSummary} from '@/types/eosis';

const loading = ref(true);
const chartType = ref<'bar' | 'doughnut'>('bar');
const summary = ref<VoteResultsSummary>({
  total_votes: 0,
  total_students: 0,
  voted_students: 0,
  candidates: [],
});

const participationRate = computed(() => {
  if (summary.value.total_students <= 0) return '0.0';
  return ((summary.value.voted_students / summary.value.total_students) * 100).toFixed(1);
});

async function loadResults(): Promise<void> {
  if (!authStore.state.token) return;
  loading.value = true;
  try {
    summary.value = await eosisApi.getVoteResults(authStore.state.token);
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memuat hasil perolehan suara.'), 'danger');
  } finally {
    loading.value = false;
  }
}

onMounted(loadResults);
</script>

<template>
  <div>
    <!-- Top Summary Strip -->
    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="eosis-card p-3 h-100">
          <div class="text-muted small fw-semibold mb-1">Total Suara Masuk</div>
          <div class="h2 fw-bold mb-0 font-mono-num text-primary">{{ summary.total_votes }}</div>
          <div class="text-muted small mt-1">Surat suara sah tersimpan anonim</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="eosis-card p-3 h-100">
          <div class="text-muted small fw-semibold mb-1">Pemilih Menggunakan Hak Suara</div>
          <div class="h2 fw-bold mb-0 font-mono-num">
            {{ summary.voted_students }} <span class="fs-6 fw-normal text-muted">/ {{ summary.total_students }}</span>
          </div>
          <div class="text-muted small mt-1">Tingkat partisipasi {{ participationRate }}%</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="eosis-card p-3 h-100 d-flex flex-column justify-content-between">
          <div>
            <div class="text-muted small fw-semibold mb-1">Privasi Kotak Suara</div>
            <div class="small text-secondary">
              Hasil dihitung secara agregat. Sistem memisahkan identitas siswa dari pilihan kandidat.
            </div>
          </div>
          <div class="mt-2">
            <button
              type="button"
              class="btn btn-outline-secondary btn-sm"
              :disabled="loading"
              @click="loadResults"
            >
              <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <i v-else class="bi bi-arrow-clockwise" aria-hidden="true"></i>
              <span>Perbarui Hasil</span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Chart + Table Grid -->
    <div class="row g-4">
      <!-- Chart Card -->
      <div class="col-lg-6">
        <div class="eosis-card h-100">
          <div class="eosis-card-header d-flex align-items-center justify-content-between gap-2">
            <div>
              <h2 class="h6 fw-bold mb-0">Grafik Perolehan Suara</h2>
              <div class="text-muted small">Visualisasi distribusi suara antar pasangan calon</div>
            </div>
            <div class="btn-group btn-group-sm" role="group" aria-label="Jenis grafik">
              <button
                type="button"
                class="btn"
                :class="chartType === 'bar' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="chartType = 'bar'"
              >
                <i class="bi bi-bar-chart" aria-hidden="true"></i>
                <span>Batang</span>
              </button>
              <button
                type="button"
                class="btn"
                :class="chartType === 'doughnut' ? 'btn-primary' : 'btn-outline-secondary'"
                @click="chartType = 'doughnut'"
              >
                <i class="bi bi-pie-chart" aria-hidden="true"></i>
                <span>Lingkaran</span>
              </button>
            </div>
          </div>

          <div class="eosis-card-body">
            <div v-if="loading" class="text-center py-5 text-muted">Memuat grafik...</div>
            <div v-else-if="summary.candidates.length === 0" class="text-center py-5 text-muted">
              Belum ada kandidat terdaftar.
            </div>
            <VoteChart v-else :candidates="summary.candidates" :chart-type="chartType" />
          </div>
        </div>
      </div>

      <!-- Results Table Card -->
      <div class="col-lg-6">
        <div class="eosis-card h-100 overflow-hidden">
          <div class="eosis-card-header">
            <h2 class="h6 fw-bold mb-0">Rincian Perolehan Suara</h2>
            <div class="text-muted small">Urutan berdasarkan nomor urut pasangan calon</div>
          </div>

          <div class="table-responsive">
            <table class="table eosis-table">
              <thead>
                <tr>
                  <th style="width: 72px">No. Urut</th>
                  <th>Pasangan Calon</th>
                  <th class="text-end">Suara</th>
                  <th style="width: 160px">Persentase</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="loading">
                  <td colspan="4" class="text-center py-4 text-muted">Memuat tabel perolehan suara...</td>
                </tr>
                <tr v-else-if="summary.candidates.length === 0">
                  <td colspan="4" class="text-center py-4 text-muted">Belum ada pasangan calon.</td>
                </tr>
                <tr v-for="cand in summary.candidates" :key="cand.id">
                  <td class="font-mono-num fw-bold">No. {{ String(cand.order_number).padStart(2, '0') }}</td>
                  <td>
                    <div class="fw-semibold text-dark">
                      {{ cand.chairperson_name }} &amp; {{ cand.vice_chairperson_name }}
                    </div>
                    <div class="text-muted small">“{{ cand.slogan }}”</div>
                  </td>
                  <td class="text-end font-mono-num fw-bold fs-6">{{ cand.vote_count }}</td>
                  <td>
                    <div class="d-flex align-items-center gap-2">
                      <div class="progress flex-grow-1" style="height: 8px">
                        <div
                          class="progress-bar bg-primary"
                          :style="{width: `${cand.percentage}%`}"
                        ></div>
                      </div>
                      <span class="small font-mono-num fw-semibold" style="width: 52px; text-align: right">
                        {{ cand.percentage }}%
                      </span>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
