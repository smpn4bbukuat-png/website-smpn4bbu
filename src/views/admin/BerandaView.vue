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

const quickLinks = [
  {
    to: '/admin/kelas',
    title: 'Data Kelas',
    subtitle: 'Atur rombongan belajar',
    icon: 'bi-building',
    tone: 'kpi-tone-indigo',
  },
  {
    to: '/admin/siswa',
    title: 'Daftar Pemilih',
    subtitle: 'Kelola NISN & status pilih',
    icon: 'bi-people',
    tone: 'kpi-tone-blue',
  },
  {
    to: '/admin/kandidat',
    title: 'Calon Kandidat',
    subtitle: 'Foto, visi, misi & slogan',
    icon: 'bi-person-badge',
    tone: 'kpi-tone-teal',
  },
  {
    to: '/admin/rekapitulasi',
    title: 'Rekapitulasi Akhir',
    subtitle: 'Unduh PDF & Excel resmi',
    icon: 'bi-file-earmark-arrow-down',
    tone: 'kpi-tone-emerald',
  },
];

function classProgressBarClass(pct: number): string {
  if (pct >= 80) return 'bg-success';
  if (pct >= 40) return 'bg-primary';
  return 'bg-warning';
}

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
    <!-- Vibrant Hero Banner: Portal Kontrol Pemilihan -->
    <section class="beranda-hero mb-4" aria-label="Portal Kontrol Pemilihan">
      <div class="beranda-hero-inner">
        <div class="row g-4 align-items-center justify-content-between">
          <div class="col-lg-8">
            <div class="d-flex flex-column flex-sm-row align-items-start align-items-sm-center gap-3">
              <img
                :src="settingsStore.effectiveLogoUrl.value"
                :alt="settingsStore.state.settings.school_name"
                class="beranda-hero-logo"
                referrerpolicy="no-referrer"
              />
              <div>
                <div class="beranda-hero-kicker mb-1">
                  Portal Kontrol Pemilihan · Periode {{ settingsStore.state.settings.election_period }}
                </div>
                <h2 class="h2 fw-bold text-white mb-1" style="text-wrap: balance">
                  Selamat Datang di eOSIS
                </h2>
                <div class="beranda-hero-meta d-flex flex-wrap align-items-center gap-2">
                  <span>{{ settingsStore.state.settings.school_name }}</span>
                  <span aria-hidden="true">·</span>
                  <span>{{ settingsStore.state.settings.election_title }}</span>
                  <span aria-hidden="true">·</span>
                  <span class="fw-semibold text-white">
                    <i
                      class="bi me-1"
                      :class="settingsStore.state.settings.is_voting_open ? 'bi-unlock-fill' : 'bi-lock-fill'"
                      aria-hidden="true"
                    ></i>
                    Bilik Suara {{ settingsStore.state.settings.is_voting_open ? 'Dibuka' : 'Ditutup' }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="col-lg-4 d-flex flex-wrap justify-content-lg-end gap-2">
            <router-link to="/admin/perolehan-suara" class="btn beranda-hero-btn-light btn-sm px-3">
              <i class="bi bi-bar-chart-line" aria-hidden="true"></i>
              <span>Perolehan Suara</span>
            </router-link>
            <button
              type="button"
              class="btn beranda-hero-btn-outline btn-sm px-3"
              :disabled="loading"
              @click="loadStats"
            >
              <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <i v-else class="bi bi-arrow-clockwise" aria-hidden="true"></i>
              <span>Muat Ulang</span>
            </button>
          </div>
        </div>

        <!-- Identitas & Motto SMP Negeri 4 Blambangan Umpu -->
        <div class="beranda-slogan-strip" aria-label="SMP Negeri 4 Blambangan Umpu KUAT">
          <div class="beranda-slogan-school">
            SMP NEGERI 4 BLAMBANGAN UMPU
          </div>
          <div class="beranda-slogan-expression">
            <span class="beranda-slogan-kuat">“KUAT”</span>
            <span class="beranda-slogan-motto">
              (<span class="beranda-slogan-initial">K</span>reatif
              <span class="beranda-slogan-initial ms-1">U</span>nggul
              <span class="beranda-slogan-initial ms-1">A</span>ktif
              <span class="beranda-slogan-initial ms-1">T</span>aqwa)
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Colorful Primary KPI Grid -->
    <section class="row g-3 mb-4" aria-label="Statistik Pemilihan">
      <div class="col-12 col-sm-6 col-xl-4">
        <div class="kpi-card">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div class="text-secondary small fw-semibold mb-1">Total Siswa Terdaftar</div>
              <div class="h2 fw-bold mb-1 font-mono-num text-dark">{{ stats.total_students }}</div>
              <div class="text-muted small">Pemilih aktif dalam DPT sekolah</div>
            </div>
            <div class="kpi-icon-tile kpi-tone-blue">
              <i class="bi bi-people-fill" aria-hidden="true"></i>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="kpi-card">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div class="text-secondary small fw-semibold mb-1">Total Kelas</div>
              <div class="h2 fw-bold mb-1 font-mono-num text-dark">{{ stats.total_classes }}</div>
              <div class="text-muted small">Rombongan belajar terdaftar</div>
            </div>
            <div class="kpi-icon-tile kpi-tone-indigo">
              <i class="bi bi-building-fill" aria-hidden="true"></i>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="kpi-card">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div class="text-secondary small fw-semibold mb-1">Pasangan Kandidat</div>
              <div class="h2 fw-bold mb-1 font-mono-num text-dark">{{ stats.total_candidates }}</div>
              <div class="text-muted small">Calon Ketua &amp; Wakil Ketua OSIS</div>
            </div>
            <div class="kpi-icon-tile kpi-tone-teal">
              <i class="bi bi-person-badge-fill" aria-hidden="true"></i>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="kpi-card">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div class="text-secondary small fw-semibold mb-1">Sudah Memilih</div>
              <div class="h2 fw-bold mb-1 font-mono-num text-success">{{ stats.voted_count }}</div>
              <div class="text-muted small">Siswa telah menggunakan hak pilih</div>
            </div>
            <div class="kpi-icon-tile kpi-tone-emerald">
              <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="kpi-card">
          <div class="d-flex align-items-start justify-content-between gap-3">
            <div>
              <div class="text-secondary small fw-semibold mb-1">Belum Memilih</div>
              <div class="h2 fw-bold mb-1 font-mono-num text-warning">{{ stats.not_voted_count }}</div>
              <div class="text-muted small">Siswa belum memberikan suara</div>
            </div>
            <div class="kpi-icon-tile kpi-tone-amber">
              <i class="bi bi-hourglass-split" aria-hidden="true"></i>
            </div>
          </div>
        </div>
      </div>

      <div class="col-12 col-sm-6 col-xl-4">
        <div class="kpi-card kpi-card-highlight">
          <div class="d-flex align-items-start justify-content-between gap-3 mb-2">
            <div>
              <div class="text-secondary small fw-semibold mb-1">Persentase Partisipasi</div>
              <div class="h2 fw-bold mb-0 font-mono-num text-primary">{{ stats.participation_percentage }}%</div>
            </div>
            <div class="kpi-icon-tile kpi-tone-sky">
              <i class="bi bi-pie-chart-fill" aria-hidden="true"></i>
            </div>
          </div>
          <div
            class="progress bg-white"
            style="height: 9px"
            role="progressbar"
            :aria-valuenow="stats.participation_percentage"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="progress-bar"
              style="background: linear-gradient(90deg, #1d4ed8 0%, #0d9488 100%)"
              :style="{width: `${stats.participation_percentage}%`}"
            ></div>
          </div>
          <div class="text-secondary small mt-2 font-mono-num">
            {{ stats.voted_count }} dari {{ stats.total_students }} siswa berpartisipasi
          </div>
        </div>
      </div>
    </section>

    <!-- Quick Navigation Shortcuts -->
    <section class="row g-3 mb-4" aria-label="Akses Cepat Panitia">
      <div v-for="item in quickLinks" :key="item.to" class="col-12 col-sm-6 col-xl-3">
        <router-link :to="item.to" class="quick-action-tile h-100">
          <div class="kpi-icon-tile" :class="item.tone">
            <i class="bi" :class="item.icon" aria-hidden="true"></i>
          </div>
          <div class="min-w-0 flex-grow-1">
            <div class="fw-bold small text-dark text-truncate">{{ item.title }}</div>
            <div class="text-muted text-truncate" style="font-size: 0.78rem">{{ item.subtitle }}</div>
          </div>
          <i class="bi bi-chevron-right text-muted flex-shrink-0" aria-hidden="true"></i>
        </router-link>
      </div>
    </section>

    <!-- Participation per Class Table -->
    <section class="eosis-card overflow-hidden">
      <div class="eosis-card-header d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
        <div>
          <h3 class="h6 fw-bold mb-0">Partisipasi Pemilih per Kelas</h3>
          <div class="text-muted small">
            Rekap status memilih tiap kelas tanpa menampilkan pilihan suara siswa.
          </div>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <router-link to="/admin/rekapitulasi" class="btn btn-outline-primary btn-sm">
            <i class="bi bi-file-earmark-arrow-down" aria-hidden="true"></i>
            <span>Rekapitulasi Akhir</span>
          </router-link>
          <router-link to="/admin/perolehan-suara" class="btn btn-primary btn-sm">
            <i class="bi bi-bar-chart-line" aria-hidden="true"></i>
            <span>Lihat Perolehan Suara</span>
          </router-link>
        </div>
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
                  <div class="progress flex-grow-1" style="height: 7px">
                    <div
                      class="progress-bar"
                      :class="
                        classProgressBarClass(
                          cls.total_students > 0 ? Math.round((cls.voted_count / cls.total_students) * 100) : 0
                        )
                      "
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
    </section>
  </div>
</template>
