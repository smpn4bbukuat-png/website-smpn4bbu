<script setup lang="ts">
import {ref} from 'vue';
import {useRouter} from 'vue-router';
import DatabaseSetupBanner from '@/components/DatabaseSetupBanner.vue';
import {extractErrorMessage, isSchemaMissingError} from '@/lib/supabase';
import {authStore} from '@/stores/authStore';
import {settingsStore} from '@/stores/settingsStore';
import {showToast} from '@/stores/toastStore';

const router = useRouter();

const activeTab = ref<'student' | 'admin'>('student');
const loading = ref(false);
const errorMessage = ref('');
const showPassword = ref(false);

// Student form
const nisn = ref('');
const birthDate = ref('');

// Admin form
const username = ref('');
const password = ref('');

function switchRole(role: 'student' | 'admin'): void {
  activeTab.value = role;
  errorMessage.value = '';
}

async function handleStudentSubmit(): Promise<void> {
  errorMessage.value = '';
  if (!nisn.value.trim() || !birthDate.value) {
    errorMessage.value = 'Mohon lengkapi NISN dan tanggal lahir.';
    return;
  }

  loading.value = true;
  try {
    await authStore.loginStudent(nisn.value.trim(), birthDate.value);
    showToast(`Selamat datang, ${authStore.state.student?.full_name}.`, 'success');
    await router.replace('/bilik-suara');
  } catch (error) {
    if (isSchemaMissingError(error)) {
      settingsStore.state.schemaMissing = true;
      errorMessage.value = 'Database belum diinisialisasi. Jalankan script supabase/schema.sql terlebih dahulu.';
    } else {
      errorMessage.value = extractErrorMessage(error, 'NISN atau tanggal lahir tidak valid.');
    }
  } finally {
    loading.value = false;
  }
}

async function handleAdminSubmit(): Promise<void> {
  errorMessage.value = '';
  if (!username.value.trim() || !password.value) {
    errorMessage.value = 'Mohon masukkan username dan password admin.';
    return;
  }

  loading.value = true;
  try {
    await authStore.loginAdmin(username.value.trim(), password.value);
    showToast('Login admin berhasil.', 'success');
    await router.replace('/admin/beranda');
  } catch (error) {
    if (isSchemaMissingError(error)) {
      settingsStore.state.schemaMissing = true;
      errorMessage.value = 'Database belum diinisialisasi. Jalankan script supabase/schema.sql terlebih dahulu.';
    } else {
      errorMessage.value = extractErrorMessage(error, 'Username atau password salah.');
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-page">
    <DatabaseSetupBanner />

    <div class="container flex-grow-1 d-flex align-items-center justify-content-center py-4 py-lg-5">
      <div class="row w-100 justify-content-center align-items-stretch g-4" style="max-width: 1020px">
        <!-- Left Institutional Info Panel -->
        <div class="col-lg-6 d-flex">
          <div class="eosis-card p-4 p-lg-5 d-flex flex-column justify-content-between w-100">
            <div>
              <div class="d-flex align-items-center gap-3 mb-4">
                <img
                  :src="settingsStore.effectiveLogoUrl.value"
                  :alt="settingsStore.state.settings.school_name"
                  class="school-logo-lg"
                  referrerpolicy="no-referrer"
                />
                <div>
                  <div class="text-primary fw-bold small">
                    eOSIS · Periode {{ settingsStore.state.settings.election_period }}
                  </div>
                  <div class="h5 fw-bold mb-0 text-dark">
                    {{ settingsStore.state.settings.school_name }}
                  </div>
                </div>
              </div>

              <h1 class="h2 fw-bold text-dark mb-3" style="text-wrap: balance">
                {{ settingsStore.state.settings.election_title }}
              </h1>
              <p class="text-secondary mb-4" style="line-height: 1.65">
                Gunakan hak suara Anda secara jujur, bebas, dan rahasia. Setiap siswa yang terdaftar
                berhak memberikan satu suara menggunakan NISN dan tanggal lahir yang tercatat di sekolah.
              </p>
            </div>

            <div class="pt-3 border-top">
              <div class="row g-3 small text-secondary">
                <div class="col-sm-6">
                  <div class="fw-semibold text-dark mb-1">
                    <i class="bi bi-shield-lock text-primary me-1" aria-hidden="true"></i>
                    Kerahasiaan Terjaga
                  </div>
                  Pilihan siswa dianonimkan dan tidak dapat ditelusuri oleh panitia maupun admin.
                </div>
                <div class="col-sm-6">
                  <div class="fw-semibold text-dark mb-1">
                    <i class="bi bi-person-check text-primary me-1" aria-hidden="true"></i>
                    Satu NISN Satu Suara
                  </div>
                  Sistem otomatis mengunci hak pilih setelah suara dikonfirmasi.
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Login Form Card -->
        <div class="col-lg-6 d-flex">
          <div class="login-card w-100 d-flex flex-column justify-content-center">
            <div class="mb-4">
              <h2 class="h4 fw-bold mb-1">Masuk ke Sistem</h2>
              <p class="text-muted small mb-3">
                Pilih peran Anda untuk melanjutkan ke bilik suara atau panel panitia.
              </p>

              <div class="role-switcher" role="tablist" aria-label="Pilih peran login">
                <button
                  type="button"
                  role="tab"
                  :aria-selected="activeTab === 'student'"
                  class="role-switcher-btn"
                  :class="{active: activeTab === 'student'}"
                  @click="switchRole('student')"
                >
                  <i class="bi bi-mortarboard me-1" aria-hidden="true"></i>
                  Pemilih (Siswa)
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="activeTab === 'admin'"
                  class="role-switcher-btn"
                  :class="{active: activeTab === 'admin'}"
                  @click="switchRole('admin')"
                >
                  <i class="bi bi-shield-check me-1" aria-hidden="true"></i>
                  Admin Panitia
                </button>
              </div>
            </div>

            <div v-if="errorMessage" class="alert alert-danger py-2 px-3 small d-flex align-items-center gap-2" role="alert">
              <i class="bi bi-exclamation-circle-fill flex-shrink-0" aria-hidden="true"></i>
              <span>{{ errorMessage }}</span>
            </div>

            <!-- Student Login Form -->
            <form v-if="activeTab === 'student'" @submit.prevent="handleStudentSubmit" novalidate>
              <div class="mb-3">
                <label for="studentNisn" class="form-label fw-semibold small">NISN</label>
                <input
                  id="studentNisn"
                  v-model="nisn"
                  type="text"
                  inputmode="numeric"
                  class="form-control form-control-lg font-mono-num"
                  placeholder="Contoh: 0081234561"
                  autocomplete="username"
                  required
                />
              </div>

              <div class="mb-4">
                <label for="studentBirthDate" class="form-label fw-semibold small">Tanggal Lahir</label>
                <input
                  id="studentBirthDate"
                  v-model="birthDate"
                  type="date"
                  class="form-control form-control-lg font-mono-num"
                  required
                />
                <div class="form-text">Sesuai data tanggal lahir yang terdaftar pada daftar pemilih.</div>
              </div>

              <button
                type="submit"
                class="btn btn-primary btn-lg w-100"
                :disabled="loading"
              >
                <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                <i v-else class="bi bi-box-arrow-in-right" aria-hidden="true"></i>
                <span>Masuk ke Bilik Suara</span>
              </button>
            </form>

            <!-- Admin Login Form -->
            <form v-else @submit.prevent="handleAdminSubmit" novalidate>
              <div class="mb-3">
                <label for="adminUsername" class="form-label fw-semibold small">Username Admin</label>
                <input
                  id="adminUsername"
                  v-model="username"
                  type="text"
                  class="form-control form-control-lg"
                  placeholder="Masukkan username admin"
                  autocomplete="username"
                  required
                />
              </div>

              <div class="mb-4">
                <label for="adminPassword" class="form-label fw-semibold small">Password</label>
                <div class="input-group input-group-lg">
                  <input
                    id="adminPassword"
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    class="form-control"
                    placeholder="Masukkan password"
                    autocomplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    class="btn btn-outline-secondary"
                    :aria-label="showPassword ? 'Sembunyikan password' : 'Lihat password'"
                    @click="showPassword = !showPassword"
                  >
                    <i class="bi" :class="showPassword ? 'bi-eye-slash' : 'bi-eye'" aria-hidden="true"></i>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                class="btn btn-primary btn-lg w-100"
                :disabled="loading"
              >
                <span v-if="loading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
                <i v-else class="bi bi-shield-lock" aria-hidden="true"></i>
                <span>Masuk Panel Admin</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
