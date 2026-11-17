<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {useRouter} from 'vue-router';
import ConfirmModal from '@/components/ConfirmModal.vue';
import {extractErrorMessage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {settingsStore} from '@/stores/settingsStore';
import {showToast} from '@/stores/toastStore';
import type {CandidateItem} from '@/types/eosis';

const router = useRouter();

const candidates = ref<CandidateItem[]>([]);
const loadingCandidates = ref(true);
const selectedCandidate = ref<CandidateItem | null>(null);
const showConfirmModal = ref(false);
const submittingVote = ref(false);
const voteJustSucceeded = ref(false);
const brokenImages = ref<Record<string, boolean>>({});

const student = computed(() => authStore.state.student);
const isVotingOpen = computed(() => settingsStore.state.settings.is_voting_open);

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

function formatDateTime(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

function missionLines(mission: string): string[] {
  return mission
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

async function loadData(): Promise<void> {
  loadingCandidates.value = true;
  try {
    await Promise.all([
      settingsStore.loadSettings(true),
      authStore.refreshStudentProfile(),
      eosisApi.getPublicCandidates().then((rows) => {
        candidates.value = rows;
      }),
    ]);
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memuat data bilik suara.'), 'danger');
  } finally {
    loadingCandidates.value = false;
  }
}

function promptVote(candidate: CandidateItem): void {
  if (!isVotingOpen.value) {
    showToast('Pemungutan suara sedang ditutup oleh panitia.', 'warning');
    return;
  }
  if (student.value?.has_voted) {
    showToast('Anda sudah memberikan suara dan tidak dapat memilih kembali.', 'warning');
    return;
  }
  selectedCandidate.value = candidate;
  showConfirmModal.value = true;
}

async function confirmVote(): Promise<void> {
  if (!selectedCandidate.value || !authStore.state.token) return;
  submittingVote.value = true;
  try {
    await eosisApi.castStudentVote(authStore.state.token, selectedCandidate.value.id);
    await authStore.refreshStudentProfile();
    showConfirmModal.value = false;
    voteJustSucceeded.value = true;
    showToast('Pemilihan berhasil dilakukan. Terima kasih telah berpartisipasi!', 'success');
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menyimpan suara.'), 'danger');
    await authStore.refreshStudentProfile();
  } finally {
    submittingVote.value = false;
  }
}

async function handleLogout(): Promise<void> {
  await authStore.logout();
  showToast('Sesi siswa diakhiri. Perangkat siap digunakan siswa berikutnya.', 'info');
  await router.replace('/login');
}

onMounted(loadData);
</script>

<template>
  <div class="min-vh-100 d-flex flex-column" style="background-color: var(--eosis-bg)">
    <!-- Simple Student Header -->
    <header class="bg-white border-bottom sticky-top" style="z-index: 20">
      <div class="container py-3 d-flex align-items-center justify-content-between gap-3">
        <div class="d-flex align-items-center gap-3 min-w-0">
          <img
            :src="settingsStore.effectiveLogoUrl.value"
            :alt="settingsStore.state.settings.school_name"
            class="school-logo-box"
            referrerpolicy="no-referrer"
          />
          <div class="min-w-0">
            <div class="fw-bold text-dark text-truncate">
              {{ settingsStore.state.settings.school_name }}
            </div>
            <div class="text-muted small text-truncate">
              {{ settingsStore.state.settings.election_title }} · Periode
              {{ settingsStore.state.settings.election_period }}
            </div>
          </div>
        </div>

        <button
          type="button"
          class="btn btn-outline-danger btn-sm flex-shrink-0"
          @click="handleLogout"
        >
          <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
          <span>Logout</span>
        </button>
      </div>
    </header>

    <main class="container py-4 flex-grow-1" style="max-width: 1180px">
      <!-- Student Biodata Card -->
      <section class="eosis-card mb-4" aria-label="Biodata Pemilih">
        <div class="eosis-card-body">
          <div class="row g-3 align-items-center">
            <div class="col-lg-8">
              <div class="text-muted small fw-semibold mb-1">Biodata Pemilih Terverifikasi</div>
              <h1 class="h4 fw-bold mb-2">{{ student?.full_name }}</h1>
              <div class="d-flex flex-wrap gap-4 small text-secondary">
                <div>
                  <span class="text-muted">NISN:</span>
                  <span class="fw-semibold text-dark font-mono-num ms-1">{{ student?.nisn }}</span>
                </div>
                <div>
                  <span class="text-muted">Kelas:</span>
                  <span class="fw-semibold text-dark ms-1">{{ student?.class_name }}</span>
                </div>
                <div>
                  <span class="text-muted">Tanggal Lahir:</span>
                  <span class="fw-semibold text-dark ms-1">{{ formatDate(student?.birth_date) }}</span>
                </div>
              </div>
            </div>

            <div class="col-lg-4 text-lg-end">
              <div class="text-muted small mb-1">Status Hak Suara</div>
              <div v-if="student?.has_voted" class="status-label is-voted fs-6 justify-content-lg-end">
                <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
                <span>Sudah Memilih</span>
              </div>
              <div v-else class="status-label is-pending fs-6 justify-content-lg-end">
                <i class="bi bi-hourglass-split" aria-hidden="true"></i>
                <span>Belum Memilih</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Already Voted / Success State -->
      <section v-if="student?.has_voted" class="eosis-card p-4 p-md-5 text-center mx-auto" style="max-width: 680px">
        <div
          class="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
          style="width: 68px; height: 68px; background-color: var(--eosis-success-soft); color: var(--eosis-success)"
        >
          <i class="bi bi-check2-circle fs-1" aria-hidden="true"></i>
        </div>

        <h2 class="h3 fw-bold text-dark mb-2">
          {{ voteJustSucceeded ? 'Pemilihan Berhasil Dilakukan!' : 'Hak Suara Anda Sudah Tercatat' }}
        </h2>
        <p class="text-secondary mb-3">
          Terima kasih, <strong>{{ student.full_name }}</strong>. Suara Anda telah tersimpan secara
          anonim dan aman ke dalam kotak suara elektronik sekolah.
        </p>
        <div class="text-muted small mb-4 font-mono-num">
          Waktu pencatatan: {{ formatDateTime(student.voted_at) }}
        </div>

        <div class="alert alert-light border text-start small text-secondary mb-4">
          <i class="bi bi-info-circle me-1 text-primary" aria-hidden="true"></i>
          Setiap NISN hanya dapat memberikan satu suara. Silakan klik tombol
          <strong>Logout</strong> di bawah ini apabila perangkat akan digunakan secara bergantian oleh siswa lainnya.
        </div>

        <button type="button" class="btn btn-primary btn-lg px-4" @click="handleLogout">
          <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
          <span>Logout &amp; Selesai Memilih</span>
        </button>
      </section>

      <!-- Voting Closed Banner -->
      <section v-else-if="!isVotingOpen" class="eosis-card p-4 p-md-5 text-center mx-auto" style="max-width: 640px">
        <i class="bi bi-lock fs-1 text-warning mb-3 d-block" aria-hidden="true"></i>
        <h2 class="h4 fw-bold mb-2">Pemungutan Suara Sedang Ditutup</h2>
        <p class="text-secondary mb-4">
          Panitia pemilihan belum membuka atau telah menutup akses pemungutan suara saat ini.
          Silakan hubungi panitia OSIS untuk informasi lebih lanjut.
        </p>
        <button type="button" class="btn btn-outline-secondary" @click="handleLogout">
          <i class="bi bi-box-arrow-right" aria-hidden="true"></i>
          <span>Keluar</span>
        </button>
      </section>

      <!-- Active Ballot Candidate List -->
      <section v-else>
        <div class="d-flex flex-column flex-md-row align-items-md-end justify-content-between gap-2 mb-3">
          <div>
            <h2 class="h4 fw-bold mb-1">Daftar Calon Ketua &amp; Wakil Ketua OSIS</h2>
            <p class="text-secondary small mb-0">
              Cermati visi, misi, dan slogan setiap pasangan calon. Pilih tepat satu pasangan calon terbaik Anda.
            </p>
          </div>
          <div class="text-muted small font-mono-num">
            Total Kandidat: {{ candidates.length }}
          </div>
        </div>

        <div v-if="loadingCandidates" class="row g-4">
          <div v-for="n in 3" :key="n" class="col-md-6 col-xl-4">
            <div class="eosis-card p-3 placeholder-glow">
              <div class="placeholder w-100 mb-3 rounded" style="height: 210px"></div>
              <div class="placeholder col-8 mb-2"></div>
              <div class="placeholder col-12 mb-3"></div>
              <div class="placeholder col-12" style="height: 40px"></div>
            </div>
          </div>
        </div>

        <div v-else-if="candidates.length === 0" class="eosis-card p-5 text-center">
          <i class="bi bi-person-badge fs-1 text-muted mb-2 d-block" aria-hidden="true"></i>
          <h3 class="h5 fw-bold">Belum Ada Pasangan Calon</h3>
          <p class="text-muted mb-0">Panitia belum menambahkan daftar kandidat OSIS.</p>
        </div>

        <div v-else class="row g-4">
          <div
            v-for="candidate in candidates"
            :key="candidate.id"
            class="col-12 col-md-6 col-xl-4"
          >
            <article
              class="ballot-card"
              :class="{'is-selected': selectedCandidate?.id === candidate.id}"
            >
              <div class="candidate-photo-frame">
                <img
                  v-if="candidate.photo_url && !brokenImages[candidate.id]"
                  :src="candidate.photo_url"
                  :alt="`Pasangan Calon Nomor Urut ${candidate.order_number}: ${candidate.chairperson_name} dan ${candidate.vice_chairperson_name}`"
                  referrerpolicy="no-referrer"
                  @error="brokenImages[candidate.id] = true"
                />
                <div
                  v-else
                  class="w-100 h-100 d-flex flex-column align-items-center justify-content-center text-muted"
                >
                  <i class="bi bi-people fs-1 mb-1" aria-hidden="true"></i>
                  <span class="small">Foto Pasangan Calon {{ candidate.order_number }}</span>
                </div>
                <div class="candidate-order-tag">No. {{ String(candidate.order_number).padStart(2, '0') }}</div>
              </div>

              <div class="p-4 d-flex flex-column flex-grow-1">
                <div class="mb-3">
                  <div class="text-primary fw-semibold small mb-1">
                    “{{ candidate.slogan }}”
                  </div>
                  <h3 class="h5 fw-bold mb-1">
                    {{ candidate.chairperson_name }}
                  </h3>
                  <div class="text-secondary small">
                    Calon Ketua &amp; <strong>{{ candidate.vice_chairperson_name }}</strong> (Wakil Ketua)
                  </div>
                </div>

                <div class="mb-3 pt-3 border-top">
                  <div class="fw-bold small text-dark mb-1">Visi</div>
                  <p class="small text-secondary mb-0" style="line-height: 1.55">
                    {{ candidate.vision }}
                  </p>
                </div>

                <div class="mb-4 flex-grow-1">
                  <div class="fw-bold small text-dark mb-1">Misi</div>
                  <ul class="small text-secondary ps-3 mb-0" style="line-height: 1.55">
                    <li v-for="(line, idx) in missionLines(candidate.mission)" :key="idx" class="mb-1">
                      {{ line }}
                    </li>
                  </ul>
                </div>

                <button
                  type="button"
                  class="btn btn-primary w-100 mt-auto"
                  style="min-height: 44px"
                  @click="promptVote(candidate)"
                >
                  <i class="bi bi-check2-square" aria-hidden="true"></i>
                  <span>Pilih Pasangan No. {{ candidate.order_number }}</span>
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>
    </main>

    <!-- Vote Confirmation Modal -->
    <ConfirmModal
      :show="showConfirmModal"
      title="Konfirmasi Pilihan Anda"
      confirm-label="Ya, Kirim Suara Saya"
      cancel-label="Periksa Kembali"
      confirm-variant="primary"
      :loading="submittingVote"
      @confirm="confirmVote"
      @cancel="showConfirmModal = false"
    >
      <div v-if="selectedCandidate">
        <p class="text-secondary small mb-3">
          Apakah Anda yakin ingin memberikan suara kepada pasangan calon berikut? Pilihan yang sudah
          dikirim <strong>tidak dapat diubah atau dibatalkan</strong>.
        </p>

        <div class="border rounded p-3 bg-light d-flex align-items-center gap-3">
          <div
            class="fw-bold font-mono-num bg-dark text-white rounded d-flex align-items-center justify-content-center flex-shrink-0"
            style="width: 48px; height: 48px; font-size: 1.15rem"
          >
            {{ String(selectedCandidate.order_number).padStart(2, '0') }}
          </div>
          <div class="min-w-0">
            <div class="fw-bold text-dark">
              {{ selectedCandidate.chairperson_name }} &amp; {{ selectedCandidate.vice_chairperson_name }}
            </div>
            <div class="small text-primary">“{{ selectedCandidate.slogan }}”</div>
          </div>
        </div>
      </div>
    </ConfirmModal>
  </div>
</template>
