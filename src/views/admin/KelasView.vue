<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import {extractErrorMessage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {showToast} from '@/stores/toastStore';
import type {ClassItem} from '@/types/eosis';

const classes = ref<ClassItem[]>([]);
const loading = ref(true);
const searchQuery = ref('');

// Form modal
const showFormModal = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const formName = ref('');
const formGrade = ref('X');

// Delete modal
const showDeleteModal = ref(false);
const deleting = ref(false);
const deletingItem = ref<ClassItem | null>(null);

const filteredClasses = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return classes.value;
  return classes.value.filter(
    (c) => c.name.toLowerCase().includes(q) || c.grade_level.toLowerCase().includes(q)
  );
});

async function loadClasses(): Promise<void> {
  if (!authStore.state.token) return;
  loading.value = true;
  try {
    classes.value = await eosisApi.listClasses(authStore.state.token);
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memuat data kelas.'), 'danger');
  } finally {
    loading.value = false;
  }
}

function openCreateModal(): void {
  editingId.value = null;
  formName.value = '';
  formGrade.value = 'X';
  showFormModal.value = true;
}

function openEditModal(item: ClassItem): void {
  editingId.value = item.id;
  formName.value = item.name;
  formGrade.value = item.grade_level;
  showFormModal.value = true;
}

async function handleSave(): Promise<void> {
  if (!authStore.state.token) return;
  if (!formName.value.trim() || !formGrade.value.trim()) {
    showToast('Nama kelas dan tingkat wajib diisi.', 'warning');
    return;
  }
  saving.value = true;
  try {
    await eosisApi.upsertClass(authStore.state.token, {
      id: editingId.value,
      name: formName.value.trim(),
      grade_level: formGrade.value.trim(),
    });
    showFormModal.value = false;
    showToast(editingId.value ? 'Data kelas diperbarui.' : 'Kelas baru ditambahkan.', 'success');
    await loadClasses();
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menyimpan data kelas.'), 'danger');
  } finally {
    saving.value = false;
  }
}

function promptDelete(item: ClassItem): void {
  deletingItem.value = item;
  showDeleteModal.value = true;
}

async function confirmDelete(): Promise<void> {
  if (!authStore.state.token || !deletingItem.value) return;
  deleting.value = true;
  try {
    await eosisApi.deleteClass(authStore.state.token, deletingItem.value.id);
    showDeleteModal.value = false;
    showToast('Kelas berhasil dihapus.', 'success');
    await loadClasses();
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menghapus kelas.'), 'danger');
  } finally {
    deleting.value = false;
  }
}

onMounted(loadClasses);
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="eosis-card p-3 mb-4">
      <div class="row g-2 align-items-center justify-content-between">
        <div class="col-md-5">
          <div class="input-group">
            <span class="input-group-text bg-white text-muted">
              <i class="bi bi-search" aria-hidden="true"></i>
            </span>
            <input
              v-model="searchQuery"
              type="search"
              class="form-control"
              placeholder="Cari nama kelas atau tingkat..."
              aria-label="Cari kelas"
            />
          </div>
        </div>
        <div class="col-md-auto d-flex gap-2">
          <button type="button" class="btn btn-primary" @click="openCreateModal">
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
            <span>Tambah Kelas</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Classes Table -->
    <div class="eosis-card overflow-hidden">
      <div class="eosis-card-header d-flex align-items-center justify-content-between">
        <h2 class="h6 fw-bold mb-0">Daftar Kelas</h2>
        <span class="text-muted small font-mono-num">{{ filteredClasses.length }} kelas</span>
      </div>

      <div class="table-responsive">
        <table class="table eosis-table">
          <thead>
            <tr>
              <th style="width: 72px">No</th>
              <th>Nama Kelas</th>
              <th>Tingkat</th>
              <th class="text-end">Jumlah Siswa</th>
              <th class="text-end" style="width: 160px">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="5" class="text-center py-4 text-muted">Memuat data kelas...</td>
            </tr>
            <tr v-else-if="filteredClasses.length === 0">
              <td colspan="5" class="text-center py-4 text-muted">
                Tidak ada data kelas yang sesuai.
              </td>
            </tr>
            <tr v-for="(item, idx) in filteredClasses" :key="item.id">
              <td class="font-mono-num text-muted">{{ idx + 1 }}</td>
              <td class="fw-semibold">{{ item.name }}</td>
              <td>{{ item.grade_level }}</td>
              <td class="text-end font-mono-num">{{ item.student_count ?? 0 }}</td>
              <td class="text-end">
                <div class="d-inline-flex gap-1">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    title="Ubah kelas"
                    @click="openEditModal(item)"
                  >
                    <i class="bi bi-pencil" aria-hidden="true"></i>
                    <span>Ubah</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-danger btn-sm"
                    title="Hapus kelas"
                    @click="promptDelete(item)"
                  >
                    <i class="bi bi-trash" aria-hidden="true"></i>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Create / Edit Class Modal -->
    <div
      v-if="showFormModal"
      class="modal fade show d-block"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      style="background-color: rgba(15, 23, 42, 0.55); z-index: 1060"
    >
      <div class="modal-dialog modal-dialog-centered">
        <form class="modal-content border-0 shadow" @submit.prevent="handleSave">
          <div class="modal-header border-bottom">
            <h5 class="modal-title fw-bold fs-6">
              {{ editingId ? 'Ubah Data Kelas' : 'Tambah Kelas Baru' }}
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
            <div class="mb-3">
              <label for="classGrade" class="form-label fw-semibold small">Tingkat</label>
              <input
                id="classGrade"
                v-model="formGrade"
                type="text"
                class="form-control"
                placeholder="Contoh: X, XI, XII atau VII, VIII, IX"
                required
              />
            </div>
            <div class="mb-0">
              <label for="className" class="form-label fw-semibold small">Nama Kelas</label>
              <input
                id="className"
                v-model="formName"
                type="text"
                class="form-control"
                placeholder="Contoh: X IPA 1"
                required
              />
            </div>
          </div>
          <div class="modal-footer border-top">
            <button
              type="button"
              class="btn btn-outline-secondary"
              :disabled="saving"
              @click="showFormModal = false"
            >
              Batal
            </button>
            <button type="submit" class="btn btn-primary" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
              <span>Simpan</span>
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <ConfirmModal
      :show="showDeleteModal"
      title="Hapus Kelas"
      confirm-label="Ya, Hapus"
      confirm-variant="danger"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    >
      <p class="mb-0 text-secondary">
        Apakah Anda yakin ingin menghapus kelas <strong>{{ deletingItem?.name }}</strong>? Kelas yang
        masih memiliki data siswa tidak dapat dihapus.
      </p>
    </ConfirmModal>
  </div>
</template>
