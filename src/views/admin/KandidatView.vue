<script setup lang="ts">
import {onMounted, ref} from 'vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import {extractErrorMessage, uploadAssetToStorage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {showToast} from '@/stores/toastStore';
import type {CandidateItem} from '@/types/eosis';

const candidates = ref<CandidateItem[]>([]);
const loading = ref(true);
const brokenImages = ref<Record<string, boolean>>({});

// Form modal
const showFormModal = ref(false);
const saving = ref(false);
const uploadingPhoto = ref(false);
const editingId = ref<string | null>(null);
const formOrderNumber = ref(1);
const formPhotoUrl = ref('');
const formChairperson = ref('');
const formViceChairperson = ref('');
const formSlogan = ref('');
const formVision = ref('');
const formMission = ref('');

// Delete modal
const showDeleteModal = ref(false);
const deleting = ref(false);
const deletingCandidate = ref<CandidateItem | null>(null);

async function loadCandidates(): Promise<void> {
  if (!authStore.state.token) return;
  loading.value = true;
  try {
    candidates.value = await eosisApi.listCandidates(authStore.state.token);
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memuat daftar kandidat.'), 'danger');
  } finally {
    loading.value = false;
  }
}

function openCreateModal(): void {
  editingId.value = null;
  const maxOrder = candidates.value.reduce((acc, c) => Math.max(acc, c.order_number), 0);
  formOrderNumber.value = maxOrder + 1;
  formPhotoUrl.value = '';
  formChairperson.value = '';
  formViceChairperson.value = '';
  formSlogan.value = '';
  formVision.value = '';
  formMission.value = '';
  showFormModal.value = true;
}

function openEditModal(item: CandidateItem): void {
  editingId.value = item.id;
  formOrderNumber.value = item.order_number;
  formPhotoUrl.value = item.photo_url ?? '';
  formChairperson.value = item.chairperson_name;
  formViceChairperson.value = item.vice_chairperson_name;
  formSlogan.value = item.slogan;
  formVision.value = item.vision;
  formMission.value = item.mission;
  showFormModal.value = true;
}

async function handlePhotoUpload(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  uploadingPhoto.value = true;
  try {
    const publicUrl = await uploadAssetToStorage(file, 'candidates');
    formPhotoUrl.value = publicUrl;
    showToast('Foto kandidat berhasil diunggah ke Supabase Storage.', 'success');
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal mengunggah foto kandidat.'), 'danger');
  } finally {
    uploadingPhoto.value = false;
    input.value = '';
  }
}

async function handleSave(): Promise<void> {
  if (!authStore.state.token) return;
  if (
    !formOrderNumber.value ||
    !formChairperson.value.trim() ||
    !formViceChairperson.value.trim() ||
    !formSlogan.value.trim() ||
    !formVision.value.trim() ||
    !formMission.value.trim()
  ) {
    showToast('Mohon lengkapi seluruh data pasangan calon.', 'warning');
    return;
  }

  saving.value = true;
  try {
    await eosisApi.upsertCandidate(authStore.state.token, {
      id: editingId.value,
      order_number: Number(formOrderNumber.value),
      photo_url: formPhotoUrl.value.trim() || null,
      chairperson_name: formChairperson.value.trim(),
      vice_chairperson_name: formViceChairperson.value.trim(),
      vision: formVision.value.trim(),
      mission: formMission.value.trim(),
      slogan: formSlogan.value.trim(),
    });
    showFormModal.value = false;
    showToast(editingId.value ? 'Data kandidat diperbarui.' : 'Kandidat baru ditambahkan.', 'success');
    await loadCandidates();
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menyimpan data kandidat.'), 'danger');
  } finally {
    saving.value = false;
  }
}

function promptDelete(item: CandidateItem): void {
  deletingCandidate.value = item;
  showDeleteModal.value = true;
}

async function confirmDelete(): Promise<void> {
  if (!authStore.state.token || !deletingCandidate.value) return;
  deleting.value = true;
  try {
    await eosisApi.deleteCandidate(authStore.state.token, deletingCandidate.value.id);
    showDeleteModal.value = false;
    showToast('Kandidat berhasil dihapus.', 'success');
    await loadCandidates();
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menghapus kandidat.'), 'danger');
  } finally {
    deleting.value = false;
  }
}

onMounted(loadCandidates);
</script>

<template>
  <div>
    <!-- Header Action -->
    <div class="d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-3 mb-4">
      <div class="text-muted small">
        Kelola pasangan calon Ketua &amp; Wakil Ketua OSIS beserta foto, visi, misi, dan slogan.
      </div>
      <button type="button" class="btn btn-primary" @click="openCreateModal">
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        <span>Tambah Kandidat</span>
      </button>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="loading" class="row g-4">
      <div v-for="n in 3" :key="n" class="col-md-6 col-xl-4">
        <div class="eosis-card p-3 placeholder-glow">
          <div class="placeholder w-100 rounded mb-3" style="height: 200px"></div>
          <div class="placeholder col-7 mb-2"></div>
          <div class="placeholder col-10"></div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-else-if="candidates.length === 0" class="eosis-card p-5 text-center">
      <i class="bi bi-person-badge fs-1 text-muted mb-2 d-block" aria-hidden="true"></i>
      <h2 class="h5 fw-bold">Belum Ada Pasangan Calon</h2>
      <p class="text-muted mb-3">Tambahkan pasangan calon pertama untuk ditampilkan pada bilik suara.</p>
      <button type="button" class="btn btn-primary" @click="openCreateModal">
        <i class="bi bi-plus-lg" aria-hidden="true"></i>
        <span>Tambah Kandidat Pertama</span>
      </button>
    </div>

    <!-- Candidate Grid -->
    <div v-else class="row g-4">
      <div v-for="item in candidates" :key="item.id" class="col-md-6 col-xl-4">
        <article class="ballot-card">
          <div class="candidate-photo-frame">
            <img
              v-if="item.photo_url && !brokenImages[item.id]"
              :src="item.photo_url"
              :alt="`${item.chairperson_name} dan ${item.vice_chairperson_name}`"
              referrerpolicy="no-referrer"
              @error="brokenImages[item.id] = true"
            />
            <div
              v-else
              class="w-100 h-100 d-flex flex-column align-items-center justify-content-center text-muted"
            >
              <i class="bi bi-image fs-1 mb-1" aria-hidden="true"></i>
              <span class="small">Belum ada foto pasangan</span>
            </div>
            <div class="candidate-order-tag">No. {{ String(item.order_number).padStart(2, '0') }}</div>
          </div>

          <div class="p-4 d-flex flex-column flex-grow-1">
            <div class="text-primary fw-semibold small mb-1">“{{ item.slogan }}”</div>
            <h3 class="h5 fw-bold mb-1">{{ item.chairperson_name }}</h3>
            <div class="text-secondary small mb-3">Wakil: {{ item.vice_chairperson_name }}</div>

            <div class="mb-2 pt-2 border-top small">
              <div class="fw-bold text-dark">Visi</div>
              <p class="text-secondary mb-2" style="white-space: pre-line">{{ item.vision }}</p>
            </div>

            <div class="mb-4 small flex-grow-1">
              <div class="fw-bold text-dark">Misi</div>
              <p class="text-secondary mb-0" style="white-space: pre-line">{{ item.mission }}</p>
            </div>

            <div class="d-flex gap-2 pt-3 border-top">
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm flex-grow-1"
                @click="openEditModal(item)"
              >
                <i class="bi bi-pencil" aria-hidden="true"></i>
                <span>Ubah</span>
              </button>
              <button
                type="button"
                class="btn btn-outline-danger btn-sm"
                title="Hapus kandidat"
                @click="promptDelete(item)"
              >
                <i class="bi bi-trash" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </article>
      </div>
    </div>

    <!-- Create / Edit Candidate Modal -->
    <div
      v-if="showFormModal"
      class="modal fade show d-block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      style="background-color: rgba(15, 23, 42, 0.55); z-index: 1060"
    >
      <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
        <form class="modal-content border-0 shadow" @submit.prevent="handleSave">
          <div class="modal-header border-bottom">
            <h5 class="modal-title fw-bold fs-6">
              {{ editingId ? 'Ubah Data Kandidat' : 'Tambah Pasangan Kandidat' }}
            </h5>
            <button
              type="button"
              class="btn-close"
              :disabled="saving"
              aria-label="Tutup"
              @click="showFormModal = false"
            ></button>
          </div>
          <div class="modal-body">
            <div class="row g-3">
              <div class="col-md-4">
                <label for="candOrder" class="form-label fw-semibold small">Nomor Urut</label>
                <input
                  id="candOrder"
                  v-model.number="formOrderNumber"
                  type="number"
                  min="1"
                  class="form-control font-mono-num"
                  required
                />
              </div>
              <div class="col-md-8">
                <label for="candSlogan" class="form-label fw-semibold small">Slogan Kampanye</label>
                <input
                  id="candSlogan"
                  v-model="formSlogan"
                  type="text"
                  class="form-control"
                  placeholder="Contoh: Sinergi Muda, Prestasi Nyata!"
                  required
                />
              </div>

              <div class="col-md-6">
                <label for="candChair" class="form-label fw-semibold small">Nama Calon Ketua OSIS</label>
                <input
                  id="candChair"
                  v-model="formChairperson"
                  type="text"
                  class="form-control"
                  required
                />
              </div>
              <div class="col-md-6">
                <label for="candVice" class="form-label fw-semibold small">Nama Calon Wakil Ketua OSIS</label>
                <input
                  id="candVice"
                  v-model="formViceChairperson"
                  type="text"
                  class="form-control"
                  required
                />
              </div>

              <!-- Photo Upload to Supabase Storage -->
              <div class="col-12">
                <label class="form-label fw-semibold small">Foto Pasangan Calon</label>
                <div class="d-flex flex-column flex-sm-row gap-3 align-items-sm-center p-3 border rounded bg-light">
                  <img
                    v-if="formPhotoUrl"
                    :src="formPhotoUrl"
                    alt="Preview foto kandidat"
                    class="rounded border object-fit-cover flex-shrink-0"
                    style="width: 112px; height: 84px"
                    referrerpolicy="no-referrer"
                  />
                  <div class="flex-grow-1 min-w-0">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      class="form-control form-control-sm mb-2"
                      :disabled="uploadingPhoto"
                      @change="handlePhotoUpload"
                    />
                    <input
                      v-model="formPhotoUrl"
                      type="text"
                      class="form-control form-control-sm"
                      placeholder="Atau tempel URL foto kandidat..."
                    />
                    <div class="form-text mb-0">
                      {{ uploadingPhoto ? 'Mengunggah foto ke Supabase Storage...' : 'Format PNG/JPG/WEBP maksimal 2 MB.' }}
                    </div>
                  </div>
                </div>
              </div>

              <div class="col-12">
                <label for="candVision" class="form-label fw-semibold small">Visi</label>
                <textarea
                  id="candVision"
                  v-model="formVision"
                  rows="2"
                  class="form-control"
                  placeholder="Tuliskan visi pasangan calon..."
                  required
                ></textarea>
              </div>
              <div class="col-12">
                <label for="candMission" class="form-label fw-semibold small">Misi</label>
                <textarea
                  id="candMission"
                  v-model="formMission"
                  rows="4"
                  class="form-control"
                  placeholder="Tuliskan poin-poin misi (pisahkan per baris)..."
                  required
                ></textarea>
              </div>
            </div>
          </div>
          <div class="modal-footer border-top">
            <button
              type="button"
              class="btn btn-outline-secondary"
              :disabled="saving || uploadingPhoto"
              @click="showFormModal = false"
            >
              Batal
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving || uploadingPhoto">
              <span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <span>Simpan Kandidat</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <ConfirmModal
      :show="showDeleteModal"
      title="Hapus Kandidat"
      confirm-label="Ya, Hapus"
      confirm-variant="danger"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    >
      <p class="mb-0 text-secondary">
        Apakah Anda yakin ingin menghapus Pasangan Calon Nomor Urut
        <strong>{{ deletingCandidate?.order_number }}</strong> ({{ deletingCandidate?.chairperson_name }} &amp;
        {{ deletingCandidate?.vice_chairperson_name }})? Kandidat yang sudah menerima suara tidak dapat dihapus.
      </p>
    </ConfirmModal>
  </div>
</template>
