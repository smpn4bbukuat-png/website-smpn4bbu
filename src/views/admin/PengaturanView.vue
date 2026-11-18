<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import {extractErrorMessage, isSchemaMissingError, uploadAssetToStorage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {DEFAULT_SCHOOL_LOGO, settingsStore} from '@/stores/settingsStore';
import {showToast} from '@/stores/toastStore';

// School Settings Form
const schoolName = ref('');
const electionTitle = ref('');
const electionPeriod = ref('');
const schoolLogoUrl = ref('');
const isVotingOpen = ref(true);
const savingSettings = ref(false);
const uploadingLogo = ref(false);

// Admin Credentials Form
const adminFullName = ref('');
const newUsername = ref('');
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const savingCreds = ref(false);

// Reset Election Modal & State
const showResetModal = ref(false);
const resetConfirmText = ref('');
const resetAdminPassword = ref('');
const resettingElection = ref(false);
const resetRpcMissing = ref(false);

const canConfirmReset = computed(
  () => resetConfirmText.value.trim().toUpperCase() === 'RESET' && resetAdminPassword.value.length > 0
);

const RESET_RPC_SQL = `CREATE OR REPLACE FUNCTION public.admin_reset_election(p_token TEXT, p_admin_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_id UUID;
  v_password_hash TEXT;
  v_deleted_votes INTEGER;
  v_reset_students INTEGER;
BEGIN
  v_admin_id := public.assert_admin_session(p_token);
  SELECT password_hash INTO v_password_hash FROM public.eosis_admins WHERE id = v_admin_id;
  IF v_password_hash IS NULL OR v_password_hash <> crypt(COALESCE(p_admin_password, ''), v_password_hash) THEN
    RAISE EXCEPTION 'Password admin tidak sesuai. Reset pemilihan dibatalkan.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.eosis_votes;
  GET DIAGNOSTICS v_deleted_votes = ROW_COUNT;
  UPDATE public.eosis_students SET has_voted = FALSE, voted_at = NULL, updated_at = NOW() WHERE has_voted = TRUE OR voted_at IS NOT NULL;
  GET DIAGNOSTICS v_reset_students = ROW_COUNT;
  DELETE FROM public.eosis_student_sessions;
  UPDATE public.eosis_internal_secrets SET ballot_salt = encode(gen_random_bytes(32), 'hex') WHERE id = 1;
  RETURN jsonb_build_object('deleted_votes', v_deleted_votes, 'reset_students', v_reset_students);
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_reset_election(TEXT, TEXT) TO anon, authenticated;`;

function syncFromStores(): void {
  schoolName.value = settingsStore.state.settings.school_name;
  electionTitle.value = settingsStore.state.settings.election_title;
  electionPeriod.value = settingsStore.state.settings.election_period;
  schoolLogoUrl.value = settingsStore.state.settings.school_logo_url ?? '';
  isVotingOpen.value = settingsStore.state.settings.is_voting_open;

  adminFullName.value = authStore.state.admin?.full_name ?? '';
  newUsername.value = authStore.state.admin?.username ?? '';
}

async function handleLogoUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingLogo.value = true;
  try {
    const publicUrl = await uploadAssetToStorage(file, 'branding');
    schoolLogoUrl.value = publicUrl;
    showToast('Logo sekolah berhasil diunggah ke Supabase Storage.', 'success');
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal mengunggah logo sekolah.'), 'danger');
  } finally {
    uploadingLogo.value = false;
    input.value = '';
  }
}

async function handleSaveSettings(): Promise<void> {
  if (!authStore.state.token) return;
  if (!schoolName.value.trim() || !electionPeriod.value.trim() || !electionTitle.value.trim()) {
    showToast('Nama sekolah, judul pemilihan, dan periode wajib diisi.', 'warning');
    return;
  }

  savingSettings.value = true;
  try {
    await eosisApi.updateSettings(authStore.state.token, {
      school_name: schoolName.value.trim(),
      school_logo_url: schoolLogoUrl.value.trim() || null,
      election_period: electionPeriod.value.trim(),
      election_title: electionTitle.value.trim(),
      is_voting_open: isVotingOpen.value,
    });
    await settingsStore.loadSettings(true);
    showToast('Pengaturan sekolah dan periode pemilihan berhasil disimpan.', 'success');
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menyimpan pengaturan.'), 'danger');
  } finally {
    savingSettings.value = false;
  }
}

async function handleUpdateCredentials(): Promise<void> {
  if (!authStore.state.token) return;
  if (!currentPassword.value) {
    showToast('Masukkan password saat ini untuk verifikasi.', 'warning');
    return;
  }
  if (!newUsername.value.trim() || newUsername.value.trim().length < 3) {
    showToast('Username minimal 3 karakter.', 'warning');
    return;
  }
  if (newPassword.value && newPassword.value.length < 6) {
    showToast('Password baru minimal 6 karakter.', 'warning');
    return;
  }
  if (newPassword.value && newPassword.value !== confirmNewPassword.value) {
    showToast('Konfirmasi password baru tidak cocok.', 'warning');
    return;
  }

  savingCreds.value = true;
  try {
    const updatedAdmin = await eosisApi.updateAdminCredentials(authStore.state.token, {
      current_password: currentPassword.value,
      new_username: newUsername.value.trim(),
      new_password: newPassword.value,
      full_name: adminFullName.value.trim(),
    });
    authStore.updateAdminProfile(updatedAdmin);
    currentPassword.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';
    showToast('Username dan/atau password admin berhasil diperbarui.', 'success');
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memperbarui akun admin.'), 'danger');
  } finally {
    savingCreds.value = false;
  }
}

function openResetModal(): void {
  resetConfirmText.value = '';
  resetAdminPassword.value = '';
  showResetModal.value = true;
}

async function handleConfirmReset(): Promise<void> {
  if (!authStore.state.token) return;
  if (!canConfirmReset.value) {
    showToast('Ketik RESET dan masukkan password admin untuk melanjutkan.', 'warning');
    return;
  }

  resettingElection.value = true;
  try {
    const res = await eosisApi.resetElection(authStore.state.token, resetAdminPassword.value);
    showResetModal.value = false;
    resetRpcMissing.value = false;
    resetConfirmText.value = '';
    resetAdminPassword.value = '';
    showToast(
      `Pemilihan berhasil direset (${res.deleted_votes} suara dihapus, ${res.reset_students} status siswa dikembalikan ke Belum Memilih).`,
      'success',
      'Reset Pemilihan Berhasil'
    );
  } catch (error) {
    if (isSchemaMissingError(error)) {
      resetRpcMissing.value = true;
      showResetModal.value = false;
      showToast(
        'Fungsi RPC admin_reset_election belum tersedia di Supabase. Jalankan SQL pembaruan pada panel Reset Pemilihan.',
        'warning'
      );
    } else {
      showToast(extractErrorMessage(error, 'Gagal mereset pemilihan.'), 'danger');
    }
  } finally {
    resettingElection.value = false;
  }
}

async function copyResetSql(): Promise<void> {
  try {
    await navigator.clipboard.writeText(RESET_RPC_SQL);
    showToast('SQL fungsi admin_reset_election berhasil disalin.', 'success');
  } catch {
    showToast('Gagal menyalin SQL otomatis. Silakan salin dari file supabase/schema.sql.', 'warning');
  }
}

onMounted(async () => {
  await settingsStore.loadSettings(true);
  syncFromStores();
});
</script>

<template>
  <div class="row g-4">
    <!-- School Identity & Period Settings -->
    <div class="col-lg-7">
      <form class="eosis-card h-100" @submit.prevent="handleSaveSettings">
        <div class="eosis-card-header">
          <h2 class="h6 fw-bold mb-0">Identitas Sekolah &amp; Periode Pemilihan</h2>
          <div class="text-muted small">
            Perubahan otomatis tampil pada halaman login, panel admin, dan bilik suara siswa.
          </div>
        </div>
        <div class="eosis-card-body">
          <div class="mb-3">
            <label for="settingSchoolName" class="form-label fw-semibold small">Nama Sekolah</label>
            <input
              id="settingSchoolName"
              v-model="schoolName"
              type="text"
              class="form-control"
              required
            />
          </div>

          <div class="row g-3 mb-3">
            <div class="col-sm-7">
              <label for="settingElectionTitle" class="form-label fw-semibold small">Judul Pemilihan</label>
              <input
                id="settingElectionTitle"
                v-model="electionTitle"
                type="text"
                class="form-control"
                required
              />
            </div>
            <div class="col-sm-5">
              <label for="settingPeriod" class="form-label fw-semibold small">Periode Pemilihan</label>
              <input
                id="settingPeriod"
                v-model="electionPeriod"
                type="text"
                class="form-control font-mono-num"
                placeholder="Contoh: 2026 / 2027"
                required
              />
            </div>
          </div>

          <!-- School Logo Upload -->
          <div class="mb-3">
            <label class="form-label fw-semibold small">Logo Sekolah (Supabase Storage)</label>
            <div class="d-flex flex-column flex-sm-row gap-3 align-items-sm-center p-3 border rounded bg-light">
              <img
                :src="schoolLogoUrl || DEFAULT_SCHOOL_LOGO"
                alt="Preview Logo Sekolah"
                class="school-logo-lg flex-shrink-0"
                referrerpolicy="no-referrer"
              />
              <div class="flex-grow-1 min-w-0">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml"
                  class="form-control form-control-sm mb-2"
                  :disabled="uploadingLogo"
                  @change="handleLogoUpload"
                />
                <input
                  v-model="schoolLogoUrl"
                  type="text"
                  class="form-control form-control-sm"
                  placeholder="URL logo sekolah (kosongkan untuk memakai logo bawaan)"
                />
                <div class="form-text mb-0">
                  {{ uploadingLogo ? 'Mengunggah logo ke Supabase Storage...' : 'Format PNG/JPG/SVG/WEBP maksimal 2 MB.' }}
                </div>
              </div>
            </div>
          </div>

          <!-- Voting Open Toggle -->
          <div class="mb-4 p-3 border rounded d-flex align-items-center justify-content-between gap-3">
            <div>
              <div class="fw-semibold small text-dark">Status Pemungutan Suara</div>
              <div class="text-muted small">
                Nonaktifkan apabila waktu pemilihan telah berakhir untuk menutup bilik suara siswa.
              </div>
            </div>
            <div class="form-check form-switch fs-5 mb-0">
              <input
                id="settingVotingOpen"
                v-model="isVotingOpen"
                class="form-check-input"
                type="checkbox"
                role="switch"
              />
            </div>
          </div>

          <button type="submit" class="btn btn-primary" :disabled="savingSettings || uploadingLogo">
            <span v-if="savingSettings" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <i v-else class="bi bi-check2" aria-hidden="true"></i>
            <span>Simpan Pengaturan Sekolah</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Admin Credentials Form -->
    <div class="col-lg-5">
      <form class="eosis-card h-100" @submit.prevent="handleUpdateCredentials">
        <div class="eosis-card-header">
          <h2 class="h6 fw-bold mb-0">Keamanan Akun Admin</h2>
          <div class="text-muted small">
            Password disimpan terenkripsi menggunakan bcrypt di database.
          </div>
        </div>
        <div class="eosis-card-body">
          <div class="mb-3">
            <label for="adminFullNameInput" class="form-label fw-semibold small">Nama Tampilan Admin</label>
            <input
              id="adminFullNameInput"
              v-model="adminFullName"
              type="text"
              class="form-control"
              required
            />
          </div>

          <div class="mb-3">
            <label for="adminNewUsername" class="form-label fw-semibold small">Username Admin</label>
            <input
              id="adminNewUsername"
              v-model="newUsername"
              type="text"
              class="form-control"
              required
            />
          </div>

          <hr class="my-3" />

          <div class="mb-3">
            <label for="adminCurrentPw" class="form-label fw-semibold small">
              Password Saat Ini <span class="text-danger">*</span>
            </label>
            <input
              id="adminCurrentPw"
              v-model="currentPassword"
              type="password"
              class="form-control"
              placeholder="Wajib diisi untuk menyimpan perubahan"
              required
            />
          </div>

          <div class="mb-3">
            <label for="adminNewPw" class="form-label fw-semibold small">Password Baru (Opsional)</label>
            <input
              id="adminNewPw"
              v-model="newPassword"
              type="password"
              class="form-control"
              placeholder="Kosongkan jika tidak ingin mengganti password"
            />
          </div>

          <div class="mb-4">
            <label for="adminConfirmPw" class="form-label fw-semibold small">Konfirmasi Password Baru</label>
            <input
              id="adminConfirmPw"
              v-model="confirmNewPassword"
              type="password"
              class="form-control"
              placeholder="Ulangi password baru"
            />
          </div>

          <button type="submit" class="btn btn-outline-primary w-100" :disabled="savingCreds">
            <span v-if="savingCreds" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <i v-else class="bi bi-shield-lock" aria-hidden="true"></i>
            <span>Perbarui Kredensial Admin</span>
          </button>
        </div>
      </form>
    </div>

    <!-- Reset Election Section -->
    <div class="col-12">
      <div class="eosis-card border-danger-subtle">
        <div class="eosis-card-header d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-2">
          <div>
            <h2 class="h6 fw-bold text-danger mb-0">Reset Pemilihan</h2>
            <div class="text-muted small">
              Mulai ulang seluruh proses penghitungan suara untuk simulasi atau periode pemilihan baru.
            </div>
          </div>
          <button
            type="button"
            class="btn btn-danger btn-sm align-self-start align-self-md-auto"
            @click="openResetModal"
          >
            <i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
            <span>Reset Pemilihan</span>
          </button>
        </div>

        <div class="eosis-card-body">
          <div class="row g-3 small text-secondary">
            <div class="col-md-6">
              <div class="fw-semibold text-dark mb-1">Data yang akan direset:</div>
              <ul class="mb-0 ps-3">
                <li>Seluruh surat suara pada kotak suara elektronik dihapus permanen.</li>
                <li>Status memilih semua siswa dikembalikan menjadi <strong>Belum Memilih</strong>.</li>
                <li>Seluruh sesi login siswa yang sedang aktif akan diakhiri.</li>
              </ul>
            </div>
            <div class="col-md-6">
              <div class="fw-semibold text-dark mb-1">Data yang tetap aman:</div>
              <ul class="mb-0 ps-3">
                <li>Data kelas, daftar siswa (NISN &amp; tanggal lahir), dan calon kandidat tetap tersimpan.</li>
                <li>Identitas sekolah, logo sekolah, periode, dan akun admin tidak berubah.</li>
              </ul>
            </div>
          </div>

          <div v-if="resetRpcMissing" class="alert alert-warning mt-3 mb-0 small">
            <div class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
              <span>
                Fungsi <code>admin_reset_election</code> belum terpasang di Supabase Anda. Jalankan
                script SQL berikut di Supabase SQL Editor lalu coba lagi.
              </span>
              <button type="button" class="btn btn-outline-dark btn-sm flex-shrink-0" @click="copyResetSql">
                <i class="bi bi-clipboard-check" aria-hidden="true"></i>
                <span>Salin SQL Reset</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Reset Election Confirmation Modal -->
    <ConfirmModal
      :show="showResetModal"
      title="Konfirmasi Reset Pemilihan"
      confirm-label="Ya, Reset Seluruh Suara"
      cancel-label="Batal"
      confirm-variant="danger"
      :loading="resettingElection"
      @confirm="handleConfirmReset"
      @cancel="showResetModal = false"
    >
      <div class="alert alert-danger py-2 px-3 small mb-3">
        <i class="bi bi-exclamation-octagon-fill me-1" aria-hidden="true"></i>
        Tindakan ini akan menghapus seluruh perolehan suara secara permanen dan mengembalikan status
        seluruh siswa menjadi <strong>Belum Memilih</strong>. Pastikan Anda sudah mengunduh
        Rekapitulasi Akhir apabila diperlukan.
      </div>

      <div class="mb-3">
        <label for="resetConfirmInput" class="form-label fw-semibold small">
          Ketik <code>RESET</code> untuk konfirmasi
        </label>
        <input
          id="resetConfirmInput"
          v-model="resetConfirmText"
          type="text"
          class="form-control font-mono-num"
          placeholder="Ketik RESET"
          autocomplete="off"
        />
      </div>

      <div class="mb-0">
        <label for="resetAdminPasswordInput" class="form-label fw-semibold small">
          Password Admin Saat Ini <span class="text-danger">*</span>
        </label>
        <input
          id="resetAdminPasswordInput"
          v-model="resetAdminPassword"
          type="password"
          class="form-control"
          placeholder="Masukkan password admin untuk verifikasi"
          autocomplete="current-password"
        />
      </div>
    </ConfirmModal>
  </div>
</template>
