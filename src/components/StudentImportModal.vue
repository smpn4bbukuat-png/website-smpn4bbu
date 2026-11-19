<script setup lang="ts">
import {computed, ref} from 'vue';
import {extractErrorMessage} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import {authStore} from '@/stores/authStore';
import {showToast} from '@/stores/toastStore';
import type {ClassItem, StudentUser} from '@/types/eosis';
import {
  downloadStudentTemplateCsv,
  downloadStudentTemplateXlsx,
  inferGradeLevel,
  parseStudentImportFile,
  type ParsedStudentRow,
} from '@/utils/studentTransfer';

const props = defineProps<{
  show: boolean;
  classes: ClassItem[];
  students: StudentUser[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'imported'): void;
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFileName = ref('');
const parsing = ref(false);
const parsedRows = ref<ParsedStudentRow[]>([]);
const missingColumns = ref<string[]>([]);

// Import options
const duplicateMode = ref<'skip' | 'update'>('skip');
const autoCreateClasses = ref(true);

// Progress & execution state
const importing = ref(false);
const progressDone = ref(0);
const progressTotal = ref(0);
const importErrors = ref<string[]>([]);

const validRows = computed(() => parsedRows.value.filter((r) => r.errors.length === 0));
const invalidRows = computed(() => parsedRows.value.filter((r) => r.errors.length > 0));
const existingValidRows = computed(() => validRows.value.filter((r) => Boolean(r.existingStudentId)));
const newValidRows = computed(() => validRows.value.filter((r) => !r.existingStudentId));
const missingClassNames = computed(() => {
  const names = new Set<string>();
  validRows.value.forEach((r) => {
    if (r.needsNewClass && r.className) {
      names.add(r.className);
    }
  });
  return Array.from(names);
});

const actionableRows = computed(() => {
  return validRows.value.filter((r) => {
    if (!autoCreateClasses.value && r.needsNewClass) return false;
    if (duplicateMode.value === 'skip' && r.existingStudentId) return false;
    return true;
  });
});

function resetState(): void {
  selectedFileName.value = '';
  parsedRows.value = [];
  missingColumns.value = [];
  importErrors.value = [];
  progressDone.value = 0;
  progressTotal.value = 0;
  if (fileInputRef.value) {
    fileInputRef.value.value = '';
  }
}

function handleClose(): void {
  if (importing.value) return;
  resetState();
  emit('close');
}

function handleDownloadTemplate(format: 'xlsx' | 'csv'): void {
  const filename =
    format === 'xlsx'
      ? downloadStudentTemplateXlsx(props.classes)
      : downloadStudentTemplateCsv(props.classes);
  showToast(`Template "${filename}" berhasil diunduh.`, 'success');
}

async function handleFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  parsing.value = true;
  importErrors.value = [];
  missingColumns.value = [];
  parsedRows.value = [];
  selectedFileName.value = file.name;

  try {
    const result = await parseStudentImportFile(file, props.classes, props.students);
    missingColumns.value = result.missingColumns;
    parsedRows.value = result.rows;
    if (result.missingColumns.length > 0) {
      showToast(
        `Kolom wajib tidak ditemukan: ${result.missingColumns.join(', ')}. Gunakan template import.`,
        'warning'
      );
    } else if (result.rows.length === 0) {
      showToast('File tidak berisi baris data siswa.', 'warning');
    }
  } catch (error) {
    showToast(extractErrorMessage(error, 'Gagal membaca file Excel/CSV.'), 'danger');
    resetState();
  } finally {
    parsing.value = false;
  }
}

async function runImport(): Promise<void> {
  if (!authStore.state.token) return;
  const rowsToProcess = actionableRows.value;
  if (rowsToProcess.length === 0) {
    showToast('Tidak ada baris valid yang siap diimpor.', 'warning');
    return;
  }

  importing.value = true;
  importErrors.value = [];
  progressDone.value = 0;
  progressTotal.value = rowsToProcess.length;

  const classIdMap = new Map<string, string>();
  props.classes.forEach((cls) => {
    classIdMap.set(cls.name.trim().toLowerCase(), cls.id);
  });

  let createdClassesCount = 0;
  let insertedCount = 0;
  let updatedCount = 0;
  const failedMessages: string[] = [];

  try {
    // 1. Auto-create missing classes first if enabled
    if (autoCreateClasses.value && missingClassNames.value.length > 0) {
      for (const clsName of missingClassNames.value) {
        const key = clsName.trim().toLowerCase();
        if (classIdMap.has(key)) continue;
        try {
          const newId = await eosisApi.upsertClass(authStore.state.token, {
            id: null,
            name: clsName.trim(),
            grade_level: inferGradeLevel(clsName),
          });
          classIdMap.set(key, newId);
          createdClassesCount++;
        } catch (error) {
          failedMessages.push(`Gagal membuat kelas "${clsName}": ${extractErrorMessage(error)}`);
        }
      }
    }

    // 2. Import students in concurrent batches of 6 for fast & safe throughput
    const batchSize = 6;
    for (let i = 0; i < rowsToProcess.length; i += batchSize) {
      const chunk = rowsToProcess.slice(i, i + batchSize);
      await Promise.all(
        chunk.map(async (row) => {
          const resolvedClassId =
            row.matchedClassId || classIdMap.get(row.className.trim().toLowerCase()) || null;

          if (!resolvedClassId) {
            failedMessages.push(`Baris ${row.rowNumber} (${row.nisn}): Kelas "${row.className}" tidak tersedia.`);
            progressDone.value++;
            return;
          }

          try {
            await eosisApi.upsertStudent(authStore.state.token!, {
              id: duplicateMode.value === 'update' ? row.existingStudentId : null,
              nisn: row.nisn,
              full_name: row.fullName,
              birth_date: row.birthDate,
              class_id: resolvedClassId,
            });
            if (row.existingStudentId && duplicateMode.value === 'update') {
              updatedCount++;
            } else {
              insertedCount++;
            }
          } catch (error) {
            failedMessages.push(
              `Baris ${row.rowNumber} (${row.nisn} - ${row.fullName}): ${extractErrorMessage(error)}`
            );
          } finally {
            progressDone.value++;
          }
        })
      );
    }

    importErrors.value = failedMessages;

    const parts: string[] = [];
    if (insertedCount > 0) parts.push(`${insertedCount} siswa ditambahkan`);
    if (updatedCount > 0) parts.push(`${updatedCount} siswa diperbarui`);
    if (createdClassesCount > 0) parts.push(`${createdClassesCount} kelas baru dibuat`);
    if (failedMessages.length > 0) parts.push(`${failedMessages.length} baris gagal`);

    showToast(
      parts.length > 0 ? `Import selesai: ${parts.join(', ')}.` : 'Proses import selesai.',
      failedMessages.length > 0 ? 'warning' : 'success',
      'Import Data Siswa'
    );

    emit('imported');

    if (failedMessages.length === 0) {
      resetState();
      emit('close');
    }
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <div
    v-if="show"
    class="modal fade show d-block"
    tabindex="-1"
    role="dialog"
    aria-modal="true"
    style="background-color: rgba(15, 23, 42, 0.55); z-index: 1060"
  >
    <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content border-0 shadow">
        <div class="modal-header border-bottom">
          <div>
            <h5 class="modal-title fw-bold fs-6 mb-0">Import Data Siswa Secara Cepat</h5>
            <div class="text-muted small">
              Unggah file Microsoft Excel (.xlsx / .xls) atau CSV untuk menambahkan banyak siswa sekaligus.
            </div>
          </div>
          <button
            type="button"
            class="btn-close"
            :disabled="importing"
            aria-label="Tutup"
            @click="handleClose"
          ></button>
        </div>

        <div class="modal-body">
          <!-- Step 1: Template & File Upload -->
          <div class="row g-3 mb-4">
            <div class="col-lg-5">
              <div class="border rounded p-3 h-100 bg-light">
                <div class="fw-semibold small text-dark mb-1">1. Unduh Format Template</div>
                <p class="small text-secondary mb-3">
                  Gunakan kolom <strong>NISN</strong>, <strong>Nama Lengkap</strong>,
                  <strong>Tanggal Lahir</strong> (<code>YYYY-MM-DD</code> atau <code>DD/MM/YYYY</code>),
                  dan <strong>Kelas</strong>.
                </p>
                <div class="d-flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="btn btn-outline-primary btn-sm"
                    :disabled="importing"
                    @click="handleDownloadTemplate('xlsx')"
                  >
                    <i class="bi bi-file-earmark-excel" aria-hidden="true"></i>
                    <span>Template Excel (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    class="btn btn-outline-secondary btn-sm"
                    :disabled="importing"
                    @click="handleDownloadTemplate('csv')"
                  >
                    <i class="bi bi-filetype-csv" aria-hidden="true"></i>
                    <span>Template CSV</span>
                  </button>
                </div>
              </div>
            </div>

            <div class="col-lg-7">
              <div class="border rounded p-3 h-100">
                <div class="fw-semibold small text-dark mb-1">2. Pilih File Data Siswa</div>
                <p class="small text-secondary mb-2">
                  Pilih file <code>.xlsx</code>, <code>.xls</code>, atau <code>.csv</code> dari komputer Anda.
                </p>
                <input
                  ref="fileInputRef"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  class="form-control mb-3"
                  :disabled="importing || parsing"
                  @change="handleFileChange"
                />

                <div class="row g-2 small">
                  <div class="col-sm-6">
                    <label for="dupModeSelect" class="form-label text-muted mb-1">Jika NISN sudah terdaftar:</label>
                    <select
                      id="dupModeSelect"
                      v-model="duplicateMode"
                      class="form-select form-select-sm"
                      :disabled="importing"
                    >
                      <option value="skip">Lewati NISN yang sudah ada</option>
                      <option value="update">Perbarui nama, tanggal lahir &amp; kelas</option>
                    </select>
                  </div>
                  <div class="col-sm-6 d-flex align-items-end">
                    <div class="form-check mb-1">
                      <input
                        id="autoCreateClassCheck"
                        v-model="autoCreateClasses"
                        class="form-check-input"
                        type="checkbox"
                        :disabled="importing"
                      />
                      <label class="form-check-label text-dark" for="autoCreateClassCheck">
                        Buat kelas otomatis jika belum ada
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Missing Columns Alert -->
          <div v-if="missingColumns.length > 0" class="alert alert-danger small mb-3">
            <i class="bi bi-exclamation-octagon-fill me-1" aria-hidden="true"></i>
            Kolom berikut tidak terdeteksi di baris header file:
            <strong>{{ missingColumns.join(', ') }}</strong>. Pastikan baris pertama berisi nama kolom
            <code>NISN</code>, <code>Nama Lengkap</code>, <code>Tanggal Lahir</code>, dan <code>Kelas</code>.
          </div>

          <!-- Parsing Indicator -->
          <div v-if="parsing" class="text-center py-4 text-muted small">
            <span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
            Membaca dan memvalidasi data siswa...
          </div>

          <!-- Validation Summary & Preview Table -->
          <div v-else-if="parsedRows.length > 0">
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
              <div class="small text-secondary">
                File: <strong class="text-dark">{{ selectedFileName }}</strong>
                <span aria-hidden="true"> · </span>
                Total baris: <strong class="font-mono-num text-dark">{{ parsedRows.length }}</strong>
                <span aria-hidden="true"> · </span>
                Siap diimpor: <strong class="font-mono-num text-success">{{ actionableRows.length }}</strong>
                <span aria-hidden="true"> · </span>
                Baru: <strong class="font-mono-num text-primary">{{ newValidRows.length }}</strong>
                <span aria-hidden="true"> · </span>
                Sudah ada: <strong class="font-mono-num text-secondary">{{ existingValidRows.length }}</strong>
                <span aria-hidden="true"> · </span>
                Tidak valid: <strong class="font-mono-num text-danger">{{ invalidRows.length }}</strong>
              </div>
              <button
                type="button"
                class="btn btn-outline-secondary btn-sm"
                :disabled="importing"
                @click="resetState"
              >
                Ganti File
              </button>
            </div>

            <div
              v-if="missingClassNames.length > 0"
              class="alert py-2 px-3 small mb-3"
              :class="autoCreateClasses ? 'alert-info' : 'alert-warning'"
            >
              <i class="bi bi-info-circle-fill me-1" aria-hidden="true"></i>
              <span v-if="autoCreateClasses">
                {{ missingClassNames.length }} kelas belum terdaftar akan dibuat otomatis:
                <strong>{{ missingClassNames.join(', ') }}</strong>.
              </span>
              <span v-else>
                {{ missingClassNames.length }} kelas belum terdaftar (<strong>{{ missingClassNames.join(', ') }}</strong>).
                Aktifkan opsi “Buat kelas otomatis” atau tambahkan kelas tersebut terlebih dahulu agar barisnya ikut diimpor.
              </span>
            </div>

            <!-- Live Progress Bar -->
            <div v-if="importing" class="mb-3">
              <div class="d-flex justify-content-between small mb-1">
                <span class="fw-semibold text-primary">Sedang mengimpor data siswa ke Supabase...</span>
                <span class="font-mono-num">{{ progressDone }} / {{ progressTotal }}</span>
              </div>
              <div class="progress" style="height: 8px">
                <div
                  class="progress-bar progress-bar-striped progress-bar-animated bg-primary"
                  :style="{
                    width: `${progressTotal > 0 ? Math.round((progressDone / progressTotal) * 100) : 0}%`,
                  }"
                ></div>
              </div>
            </div>

            <!-- Import Runtime Errors -->
            <div v-if="importErrors.length > 0" class="alert alert-danger small mb-3">
              <div class="fw-semibold mb-1">Beberapa baris gagal diimpor ({{ importErrors.length }}):</div>
              <ul class="mb-0 ps-3" style="max-height: 120px; overflow: auto">
                <li v-for="(err, idx) in importErrors" :key="idx">{{ err }}</li>
              </ul>
            </div>

            <!-- Preview Table (first 100 rows) -->
            <div class="table-responsive border rounded" style="max-height: 310px; overflow: auto">
              <table class="table eosis-table table-sm">
                <thead class="sticky-top">
                  <tr>
                    <th style="width: 64px">Baris</th>
                    <th>NISN</th>
                    <th>Nama Lengkap</th>
                    <th>Tanggal Lahir</th>
                    <th>Kelas</th>
                    <th>Status Validasi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in parsedRows.slice(0, 100)" :key="row.rowNumber">
                    <td class="font-mono-num text-muted">{{ row.rowNumber }}</td>
                    <td class="font-mono-num fw-semibold">{{ row.nisn || '-' }}</td>
                    <td>{{ row.fullName || '-' }}</td>
                    <td class="font-mono-num">{{ row.birthDate || '-' }}</td>
                    <td>
                      <span>{{ row.className || '-' }}</span>
                      <span v-if="row.needsNewClass && row.className" class="text-primary small ms-1">
                        (kelas baru)
                      </span>
                    </td>
                    <td class="small">
                      <span v-if="row.errors.length > 0" class="text-danger fw-semibold">
                        <i class="bi bi-x-circle-fill me-1" aria-hidden="true"></i>
                        {{ row.errors.join('; ') }}
                      </span>
                      <span v-else-if="row.needsNewClass && !autoCreateClasses" class="text-warning fw-semibold">
                        <i class="bi bi-exclamation-triangle-fill me-1" aria-hidden="true"></i>
                        Kelas belum ada (dilewati)
                      </span>
                      <span v-else-if="row.existingStudentId && duplicateMode === 'skip'" class="text-secondary">
                        <i class="bi bi-dash-circle me-1" aria-hidden="true"></i>
                        NISN sudah ada (dilewati)
                      </span>
                      <span v-else-if="row.existingStudentId && duplicateMode === 'update'" class="text-primary fw-semibold">
                        <i class="bi bi-arrow-repeat me-1" aria-hidden="true"></i>
                        Siap diperbarui
                      </span>
                      <span v-else class="text-success fw-semibold">
                        <i class="bi bi-check-circle-fill me-1" aria-hidden="true"></i>
                        Siap ditambahkan
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-if="parsedRows.length > 100" class="text-muted small mt-2">
              Menampilkan 100 baris pertama dari total {{ parsedRows.length }} baris. Seluruh baris valid akan diproses saat import.
            </div>
          </div>
        </div>

        <div class="modal-footer border-top">
          <button
            type="button"
            class="btn btn-outline-secondary"
            :disabled="importing"
            @click="handleClose"
          >
            Tutup
          </button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="importing || parsing || actionableRows.length === 0"
            @click="runImport"
          >
            <span v-if="importing" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
            <i v-else class="bi bi-upload" aria-hidden="true"></i>
            <span>Import {{ actionableRows.length }} Siswa</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
