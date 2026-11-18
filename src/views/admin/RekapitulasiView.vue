<script setup lang="ts">
import {computed, onMounted, reactive, ref} from 'vue';
import {extractErrorMessage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {settingsStore} from '@/stores/settingsStore';
import {showToast} from '@/stores/toastStore';
import type {DashboardStats, VoteResultsSummary} from '@/types/eosis';
import {
  exportRecapCsv,
  exportRecapPdf,
  formatIndonesianDate,
  formatIndonesianDateTime,
} from '@/utils/recapExport';

const loading = ref(true);
const exportingPdf = ref(false);
const exportingCsv = ref(false);
const lastRefreshed = ref<Date>(new Date());

const stats = ref<DashboardStats>({
  total_students: 0,
  total_classes: 0,
  total_candidates: 0,
  voted_count: 0,
  not_voted_count: 0,
  participation_percentage: 0,
  class_breakdown: [],
});

const results = ref<VoteResultsSummary>({
  total_votes: 0,
  total_students: 0,
  voted_students: 0,
  candidates: [],
});

const signatories = reactive({
  city: '',
  chairperson: authStore.state.admin?.full_name || '',
  advisor: '',
  principal: '',
});

const rankedCandidates = computed(() => {
  const sorted = [...results.value.candidates].sort((a, b) => {
    if (b.vote_count !== a.vote_count) return b.vote_count - a.vote_count;
    return a.order_number - b.order_number;
  });

  const rankMap = new Map<string, number>();
  let currentRank = 0;
  let lastVotes: number | null = null;
  sorted.forEach((cand, idx) => {
    if (lastVotes === null || cand.vote_count < lastVotes) {
      currentRank = idx + 1;
      lastVotes = cand.vote_count;
    }
    rankMap.set(cand.id, currentRank);
  });

  const maxVotes = results.value.candidates.reduce((m, c) => Math.max(m, c.vote_count), 0);

  return results.value.candidates.map((cand) => ({
    ...cand,
    rank: rankMap.get(cand.id) ?? 1,
    isLeader: maxVotes > 0 && cand.vote_count === maxVotes,
  }));
});

const leadingPairText = computed(() => {
  const leaders = rankedCandidates.value.filter((c) => c.isLeader);
  if (leaders.length === 0) return 'Belum ada suara masuk';
  return leaders
    .map((c) => `No. ${String(c.order_number).padStart(2, '0')} (${c.chairperson_name} & ${c.vice_chairperson_name})`)
    .join(' · ');
});

async function loadRecapData(): Promise<void> {
  if (!authStore.state.token) return;
  loading.value = true;
  try {
    const [, dashStats, voteSummary] = await Promise.all([
      settingsStore.loadSettings(true),
      eosisApi.getDashboardStats(authStore.state.token),
      eosisApi.getVoteResults(authStore.state.token),
    ]);
    stats.value = dashStats;
    results.value = voteSummary;
    lastRefreshed.value = new Date();
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memuat data rekapitulasi akhir.'), 'danger');
  } finally {
    loading.value = false;
  }
}

function handleDownloadPdf(): void {
  exportingPdf.value = true;
  try {
    const filename = exportRecapPdf({
      settings: settingsStore.state.settings,
      stats: stats.value,
      results: results.value,
      signatories: {...signatories},
      generatedAt: new Date(),
    });
    showToast(`File PDF "${filename}" berhasil diunduh.`, 'success');
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal membuat dokumen PDF rekapitulasi.'), 'danger');
  } finally {
    exportingPdf.value = false;
  }
}

function handleDownloadCsv(): void {
  exportingCsv.value = true;
  try {
    const filename = exportRecapCsv({
      settings: settingsStore.state.settings,
      stats: stats.value,
      results: results.value,
      signatories: {...signatories},
      generatedAt: new Date(),
    });
    showToast(`File Excel/CSV "${filename}" berhasil diunduh.`, 'success');
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal membuat file CSV rekapitulasi.'), 'danger');
  } finally {
    exportingCsv.value = false;
  }
}

function handlePrintReport(): void {
  window.print();
}

onMounted(loadRecapData);
</script>

<template>
  <div>
    <!-- Export Control Bar (Hidden when printing) -->
    <div class="eosis-card p-4 mb-4 no-print">
      <div class="d-flex flex-column flex-lg-row align-items-lg-center justify-content-between gap-3">
        <div>
          <h2 class="h6 fw-bold mb-1">Unduh Hasil Rekapitulasi Akhir Penghitungan Suara</h2>
          <p class="text-secondary small mb-0">
            Ekspor Berita Acara resmi dalam format PDF siap tanda tangan, spreadsheet Excel/CSV,
            atau cetak langsung. Data pemilih tetap anonim tanpa keterkaitan pilihan suara.
          </p>
        </div>

        <div class="d-flex flex-wrap gap-2 flex-shrink-0">
          <button
            type="button"
            class="btn btn-outline-secondary btn-sm"
            :disabled="loading"
            @click="loadRecapData"
          >
            <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <i v-else class="bi bi-arrow-clockwise" aria-hidden="true"></i>
            <span>Segarkan</span>
          </button>
          <button
            type="button"
            class="btn btn-outline-primary btn-sm"
            :disabled="loading || exportingCsv"
            @click="handleDownloadCsv"
          >
            <i class="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i>
            <span>Unduh Excel / CSV</span>
          </button>
          <button
            type="button"
            class="btn btn-outline-dark btn-sm"
            :disabled="loading"
            @click="handlePrintReport"
          >
            <i class="bi bi-printer" aria-hidden="true"></i>
            <span>Cetak</span>
          </button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            :disabled="loading || exportingPdf"
            @click="handleDownloadPdf"
          >
            <span v-if="exportingPdf" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <i v-else class="bi bi-file-earmark-pdf" aria-hidden="true"></i>
            <span>Unduh PDF Berita Acara</span>
          </button>
        </div>
      </div>

      <!-- Optional Signatory Inputs for Official PDF & Print -->
      <div class="pt-3 mt-3 border-top">
        <div class="small fw-semibold text-dark mb-2">
          Penandatangan Berita Acara (Opsional — otomatis muncul di PDF &amp; hasil cetak)
        </div>
        <div class="row g-2">
          <div class="col-sm-6 col-lg-3">
            <label for="sigCity" class="form-label small text-muted mb-1">Kota Penetapan</label>
            <input
              id="sigCity"
              v-model="signatories.city"
              type="text"
              class="form-control form-control-sm"
              placeholder="Contoh: Surakarta"
            />
          </div>
          <div class="col-sm-6 col-lg-3">
            <label for="sigChair" class="form-label small text-muted mb-1">Ketua Panitia Pemilihan</label>
            <input
              id="sigChair"
              v-model="signatories.chairperson"
              type="text"
              class="form-control form-control-sm"
              placeholder="Nama Ketua Panitia"
            />
          </div>
          <div class="col-sm-6 col-lg-3">
            <label for="sigAdvisor" class="form-label small text-muted mb-1">Pembina OSIS</label>
            <input
              id="sigAdvisor"
              v-model="signatories.advisor"
              type="text"
              class="form-control form-control-sm"
              placeholder="Nama Pembina OSIS"
            />
          </div>
          <div class="col-sm-6 col-lg-3">
            <label for="sigPrincipal" class="form-label small text-muted mb-1">Kepala Sekolah</label>
            <input
              id="sigPrincipal"
              v-model="signatories.principal"
              type="text"
              class="form-control form-control-sm"
              placeholder="Nama Kepala Sekolah"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Voting Open Advisory Notice (Hidden on print) -->
    <div
      v-if="settingsStore.state.settings.is_voting_open"
      class="alert alert-warning d-flex align-items-center justify-content-between gap-3 small mb-4 no-print"
      role="status"
    >
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-exclamation-triangle-fill flex-shrink-0" aria-hidden="true"></i>
        <span>
          Status bilik suara saat ini masih <strong>Dibuka</strong>. Untuk menetapkan hasil final,
          tutup pemungutan suara terlebih dahulu di menu Pengaturan.
        </span>
      </div>
      <router-link to="/admin/pengaturan" class="btn btn-outline-dark btn-sm flex-shrink-0">
        Ke Pengaturan
      </router-link>
    </div>

    <!-- Official Printable Recapitulation Sheet Preview -->
    <article class="eosis-card p-4 p-md-5 recap-document">
      <!-- Kop Resmi -->
      <header class="d-flex flex-column flex-sm-row align-items-center gap-3 pb-3 mb-4 border-bottom border-dark border-2">
        <img
          :src="settingsStore.effectiveLogoUrl.value"
          :alt="settingsStore.state.settings.school_name"
          class="school-logo-lg flex-shrink-0"
          referrerpolicy="no-referrer"
        />
        <div class="text-center text-sm-start flex-grow-1">
          <div class="fw-bold text-dark fs-5">
            {{ settingsStore.state.settings.school_name }}
          </div>
          <h2 class="h5 fw-bold text-dark mb-1">
            Berita Acara &amp; Rekapitulasi Akhir Penghitungan Suara
          </h2>
          <div class="text-secondary small">
            {{ settingsStore.state.settings.election_title }} · Periode
            {{ settingsStore.state.settings.election_period }}
          </div>
        </div>
        <div class="text-center text-sm-end small text-muted font-mono-num flex-shrink-0">
          <div>{{ formatIndonesianDateTime(lastRefreshed) }}</div>
          <div class="fw-semibold" :class="settingsStore.state.settings.is_voting_open ? 'text-warning' : 'text-success'">
            {{ settingsStore.state.settings.is_voting_open ? 'Status: Sementara' : 'Status: Final' }}
          </div>
        </div>
      </header>

      <!-- Section I: Summary KPIs -->
      <section class="mb-4">
        <h3 class="h6 fw-bold text-dark mb-3">I. Ringkasan Statistik Pemilih &amp; Surat Suara</h3>
        <div class="row g-3">
          <div class="col-6 col-md-3">
            <div class="border rounded p-3 h-100">
              <div class="text-muted small">Total Pemilih (DPT)</div>
              <div class="h4 fw-bold font-mono-num mb-0 mt-1">{{ stats.total_students }}</div>
              <div class="text-muted small">{{ stats.total_classes }} kelas</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="border rounded p-3 h-100">
              <div class="text-muted small">Sudah Memilih</div>
              <div class="h4 fw-bold font-mono-num text-success mb-0 mt-1">{{ stats.voted_count }}</div>
              <div class="text-muted small">Partisipasi {{ stats.participation_percentage }}%</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="border rounded p-3 h-100">
              <div class="text-muted small">Belum Memilih</div>
              <div class="h4 fw-bold font-mono-num text-warning mb-0 mt-1">{{ stats.not_voted_count }}</div>
              <div class="text-muted small">Tidak/belum memilih</div>
            </div>
          </div>
          <div class="col-6 col-md-3">
            <div class="border rounded p-3 h-100">
              <div class="text-muted small">Total Suara Sah</div>
              <div class="h4 fw-bold font-mono-num text-primary mb-0 mt-1">{{ results.total_votes }}</div>
              <div class="text-muted small">{{ stats.total_candidates }} pasangan calon</div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section II: Candidate Vote Results -->
      <section class="mb-4">
        <div class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-1 mb-2">
          <h3 class="h6 fw-bold text-dark mb-0">II. Rekapitulasi Perolehan Suara Pasangan Calon</h3>
          <div class="small text-secondary">
            Perolehan tertinggi: <strong class="text-dark">{{ leadingPairText }}</strong>
          </div>
        </div>

        <div class="table-responsive border rounded">
          <table class="table eosis-table">
            <thead>
              <tr>
                <th style="width: 84px">No. Urut</th>
                <th>Pasangan Calon Ketua &amp; Wakil Ketua OSIS</th>
                <th class="text-end" style="width: 110px">Jumlah Suara</th>
                <th class="text-end" style="width: 110px">Persentase</th>
                <th class="text-center" style="width: 130px">Peringkat</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="5" class="text-center py-4 text-muted">Memuat hasil penghitungan suara...</td>
              </tr>
              <tr v-else-if="rankedCandidates.length === 0">
                <td colspan="5" class="text-center py-4 text-muted">Belum ada pasangan calon terdaftar.</td>
              </tr>
              <tr v-for="cand in rankedCandidates" :key="cand.id">
                <td class="font-mono-num fw-bold">No. {{ String(cand.order_number).padStart(2, '0') }}</td>
                <td>
                  <div class="fw-semibold text-dark">
                    {{ cand.chairperson_name }} &amp; {{ cand.vice_chairperson_name }}
                  </div>
                  <div class="small text-muted">“{{ cand.slogan }}”</div>
                </td>
                <td class="text-end font-mono-num fw-bold">{{ cand.vote_count }}</td>
                <td class="text-end font-mono-num">{{ cand.percentage }}%</td>
                <td class="text-center small fw-semibold" :class="cand.isLeader ? 'text-primary' : 'text-secondary'">
                  #{{ cand.rank }}{{ cand.isLeader ? ' · Tertinggi' : '' }}
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr class="table-light fw-bold">
                <td colspan="2">Total Keseluruhan Suara Sah</td>
                <td class="text-end font-mono-num">{{ results.total_votes }}</td>
                <td class="text-end font-mono-num">{{ results.total_votes > 0 ? '100%' : '0%' }}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <!-- Section III: Per-Class Participation -->
      <section class="mb-4">
        <h3 class="h6 fw-bold text-dark mb-2">III. Rekapitulasi Partisipasi Pemilih per Kelas</h3>
        <div class="table-responsive border rounded">
          <table class="table eosis-table">
            <thead>
              <tr>
                <th>Kelas</th>
                <th>Tingkat</th>
                <th class="text-end">Total Siswa</th>
                <th class="text-end">Sudah Memilih</th>
                <th class="text-end">Belum Memilih</th>
                <th class="text-end">Partisipasi</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="loading">
                <td colspan="6" class="text-center py-4 text-muted">Memuat rekap kelas...</td>
              </tr>
              <tr v-else-if="stats.class_breakdown.length === 0">
                <td colspan="6" class="text-center py-4 text-muted">Belum ada data kelas terdaftar.</td>
              </tr>
              <tr v-for="cls in stats.class_breakdown" :key="cls.id">
                <td class="fw-semibold">{{ cls.name }}</td>
                <td class="text-secondary">{{ cls.grade_level }}</td>
                <td class="text-end font-mono-num">{{ cls.total_students }}</td>
                <td class="text-end font-mono-num text-success fw-semibold">{{ cls.voted_count }}</td>
                <td class="text-end font-mono-num text-warning fw-semibold">{{ cls.not_voted_count }}</td>
                <td class="text-end font-mono-num fw-semibold">
                  {{
                    cls.total_students > 0
                      ? `${((cls.voted_count / cls.total_students) * 100).toFixed(1)}%`
                      : '0.0%'
                  }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Privacy Attestation & Signature Block -->
      <footer class="pt-3 border-top">
        <p class="small text-muted mb-4">
          Berita acara ini disusun secara otomatis dari kotak suara elektronik eOSIS yang memisahkan
          identitas pemilih dengan kandidat pilihannya sesuai asas langsung, umum, bebas, rahasia,
          jujur, dan adil.
        </p>

        <div class="text-end small text-dark mb-4">
          {{ signatories.city.trim() ? `${signatories.city.trim()}, ` : ''
          }}{{ formatIndonesianDate(lastRefreshed) }}
        </div>

        <div class="row g-4 text-center small">
          <div class="col-md-4">
            <div class="text-secondary mb-5">Ketua Panitia Pemilihan</div>
            <div class="fw-bold text-dark pt-3">
              {{ signatories.chairperson.trim() || '( .................................... )' }}
            </div>
          </div>
          <div class="col-md-4">
            <div class="text-secondary mb-5">Pembina OSIS</div>
            <div class="fw-bold text-dark pt-3">
              {{ signatories.advisor.trim() || '( .................................... )' }}
            </div>
          </div>
          <div class="col-md-4">
            <div class="text-secondary mb-5">Mengetahui, Kepala Sekolah</div>
            <div class="fw-bold text-dark pt-3">
              {{ signatories.principal.trim() || '( .................................... )' }}
            </div>
          </div>
        </div>
      </footer>
    </article>
  </div>
</template>
