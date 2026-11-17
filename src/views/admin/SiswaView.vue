<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import ConfirmModal from '@/components/ConfirmModal.vue';
import {extractErrorMessage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {showToast} from '@/stores/toastStore';
import type {ClassItem, StudentUser} from '@/types/eosis';

const students = ref<StudentUser[]>([]);
const classes = ref<ClassItem[]>([]);
const loading = ref(true);

// Filters
const searchQuery = ref('');
const filterClassId = ref('');
const filterStatus = ref<'all' | 'voted' | 'pending'>('all');

// Form modal
const showFormModal = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const formNisn = ref('');
const formFullName = ref('');
const formBirthDate = ref('');
const formClassId = ref('');

// Delete modal
const showDeleteModal = ref(false);
const deleting = ref(false);
const deletingStudent = ref<StudentUser | null>(null);

const filteredStudents = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  return students.value.filter((s) => {
    const matchQuery =
      !q ||
      s.nisn.toLowerCase().includes(q) ||
      s.full_name.toLowerCase().includes(q) ||
      s.class_name.toLowerCase().includes(q);
    const matchClass = !filterClassId.value || s.class_id === filterClassId.value;
    const matchStatus =
      filterStatus.value === 'all' ||
      (filterStatus.value === 'voted' && s.has_voted) ||
      (filterStatus.value === 'pending' && !s.has_voted);
    return matchQuery && matchClass && matchStatus;
  });
});

function formatBirthDate(dateStr: string): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

async function loadData(): Promise<void> {
  if (!authStore.state.token) return;
  loading.value = true;
  try {
    const [studentRows, classRows] = await Promise.all([
      eosisApi.listStudents(authStore.state.token),
      eosisApi.listClasses(authStore.state.token),
    ]);
    students.value = studentRows;
    classes.value = classRows;
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal memuat data siswa.'), 'danger');
  } finally {
    loading.value = false;
  }
}

function openCreateModal(): void {
  if (classes.value.length === 0) {
    showToast('Tambahkan minimal 1 kelas terlebih dahulu sebelum menambah siswa.', 'warning');
    return;
  }
  editingId.value = null;
  formNisn.value = '';
  formFullName.value = '';
  formBirthDate.value = '';
  formClassId.value = classes.value[0].id;
  showFormModal.value = true;
}

function openEditModal(student: StudentUser): void {
  editingId.value = student.id;
  formNisn.value = student.nisn;
  formFullName.value = student.full_name;
  formBirthDate.value = student.birth_date;
  formClassId.value = student.class_id;
  showFormModal.value = true;
}

async function handleSave(): Promise<void> {
  if (!authStore.state.token) return;
  if (!formNisn.value.trim() || !formFullName.value.trim() || !formBirthDate.value || !formClassId.value) {
    showToast('Seluruh data siswa wajib diisi.', 'warning');
    return;
  }
  saving.value = true;
  try {
    await eosisApi.upsertStudent(authStore.state.token, {
      id: editingId.value,
      nisn: formNisn.value.trim(),
      full_name: formFullName.value.trim(),
      birth_date: formBirthDate.value,
      class_id: formClassId.value,
    });
    showFormModal.value = false;
    showToast(editingId.value ? 'Data siswa diperbarui.' : 'Siswa baru ditambahkan.', 'success');
    await loadData();
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menyimpan data siswa.'), 'danger');
  } finally {
    saving.value = false;
  }
}

function promptDelete(student: StudentUser): void {
  deletingStudent.value = student;
  showDeleteModal.value = true;
}

async function confirmDelete(): Promise<void> {
  if (!authStore.state.token || !deletingStudent.value) return;
  deleting.value = true;
  try {
    await eosisApi.deleteStudent(authStore.state.token, deletingStudent.value.id);
    showDeleteModal.value = false;
    showToast('Data siswa berhasil dihapus.', 'success');
    await loadData();
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal menghapus siswa.'), 'danger');
  } finally {
    deleting.value = false;
  }
}

onMounted(loadData);
</script>

<template>
  <div>
    <!-- Filter & Action Toolbar -->
    <div class="eosis-card p-3 mb-4">
      <div class="row g-2 align-items-center">
        <div class="col-lg-4">
          <div class="input-group">
            <span class="input-group-text bg-white text-muted">
              <i class="bi bi-search" aria-hidden="true"></i>
            </span>
            <input
              v-model="searchQuery"
              type="search"
              class="form-control"
              placeholder="Cari NISN atau nama siswa..."
              aria-label="Cari siswa"
            />
          </div>
        </div>
        <div class="col-sm-6 col-lg-3">
          <select v-model="filterClassId" class="form-select" aria-label="Filter kelas">
            <option value="">Semua Kelas</option>
            <option v-for="cls in classes" :key="cls.id" :value="cls.id">
              {{ cls.name }}
            </option>
          </select>
        </div>
        <div class="col-sm-6 col-lg-3">
          <select v-model="filterStatus" class="form-select" aria-label="Filter status memilih">
            <option value="all">Semua Status Memilih</option>
            <option value="voted">Sudah Memilih</option>
            <option value="pending">Belum Memilih</option>
          </select>
        </div>
        <div class="col-lg-2 text-lg-end">
          <button type="button" class="btn btn-primary w-100" @click="openCreateModal">
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
            <span>Tambah Siswa</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Students Table (Secret Ballot Enforced: NO candidate column) -->
    <div class="eosis-card overflow-hidden">
      <div class="eosis-card-header d-flex flex-column flex-sm-row align-items-sm-center justify-content-between gap-2">
        <div>
          <h2 class="h6 fw-bold mb-0">Daftar Siswa Pemilih</h2>
          <div class="text-muted small">
            Demi kerahasiaan suara, sistem hanya menampilkan status sudah/belum memilih.
          </div>
        </div>
        <span class="text-muted small font-mono-num">{{ filteredStudents.length }} siswa</span>
      </div>

      <div class="table-responsive">
        <table class="table eosis-table">
          <thead>
            <tr>
              <th>NISN</th>
              <th>Nama Lengkap</th>
              <th>Kelas</th>
              <th>Tanggal Lahir</th>
              <th>Status Memilih</th>
              <th class="text-end" style="width: 150px">Aksi</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="loading">
              <td colspan="6" class="text-center py-4 text-muted">Memuat data siswa...</td>
            </tr>
            <tr v-else-if="filteredStudents.length === 0">
              <td colspan="6" class="text-center py-4 text-muted">
                Tidak ada data siswa yang sesuai filter.
              </td>
            </tr>
            <tr v-for="student in filteredStudents" :key="student.id">
              <td class="font-mono-num fw-semibold text-dark">{{ student.nisn }}</td>
              <td class="fw-semibold">{{ student.full_name }}</td>
              <td>{{ student.class_name }}</td>
              <td class="font-mono-num text-secondary">{{ formatBirthDate(student.birth_date) }}</td>
              <td>
                <span v-if="student.has_voted" class="status-label is-voted">
                  <i class="bi bi-check-circle-fill" aria-hidden="true"></i>
                  <span>Sudah Memilih</span>
                </span>
                <span v-else class="status-label is-pending">
                  <i class="bi bi-hourglass-split" aria-hidden="true"></i>
                  <span>Belum Memilih</span>
                </span>
              </td>
              <td class="text-end">
                <div class="d-inline-flex gap-1">
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    title="Ubah data siswa"
                    @click="openEditModal(student)"
                  >
                    <i class="bi bi-pencil" aria-hidden="true"></i>
                    <span>Ubah</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-danger btn-sm"
                    title="Hapus siswa"
                    @click="promptDelete(student)"
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

    <!-- Create / Edit Student Modal -->
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
              {{ editingId ? 'Ubah Data Siswa' : 'Tambah Siswa Baru' }}
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
              <label for="studentFormNisn" class="form-label fw-semibold small">NISN</label>
              <input
                id="studentFormNisn"
                v-model="formNisn"
                type="text"
                inputmode="numeric"
                class="form-control font-mono-num"
                placeholder="Minimal 5 digit NISN"
                required
              />
            </div>
            <div class="mb-3">
              <label for="studentFormName" class="form-label fw-semibold small">Nama Lengkap</label>
              <input
                id="studentFormName"
                v-model="formFullName"
                type="text"
                class="form-control"
                placeholder="Nama lengkap siswa"
                required
              />
            </div>
            <div class="row g-3">
              <div class="col-sm-6">
                <label for="studentFormDob" class="form-label fw-semibold small">Tanggal Lahir</label>
                <input
                  id="studentFormDob"
                  v-model="formBirthDate"
                  type="date"
                  class="form-control font-mono-num"
                  required
                />
              </div>
              <div class="col-sm-6">
                <label for="studentFormClass" class="form-label fw-semibold small">Kelas</label>
                <select id="studentFormClass" v-model="formClassId" class="form-select" required>
                  <option v-for="cls in classes" :key="cls.id" :value="cls.id">
                    {{ cls.name }}
                  </option>
                </select>
              </div>
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
      title="Hapus Data Siswa"
      confirm-label="Ya, Hapus"
      confirm-variant="danger"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="showDeleteModal = false"
    >
      <p class="mb-0 text-secondary">
        Apakah Anda yakin ingin menghapus data siswa
        <strong>{{ deletingStudent?.full_name }}</strong> (NISN:
        <span class="font-mono-num">{{ deletingStudent?.nisn }}</span>)?
      </p>
    </ConfirmModal>
  </div>
</template>
