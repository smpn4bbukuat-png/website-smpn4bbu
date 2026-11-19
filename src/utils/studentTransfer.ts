import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type {ClassItem, SchoolSettings, StudentUser} from '@/types/eosis';

export interface ParsedStudentRow {
  rowNumber: number;
  nisn: string;
  fullName: string;
  birthDate: string; // YYYY-MM-DD
  className: string;
  matchedClassId: string | null;
  needsNewClass: boolean;
  existingStudentId: string | null;
  errors: string[];
}

export interface StudentParseResult {
  rows: ParsedStudentRow[];
  detectedColumns: {
    nisn: string | null;
    fullName: string | null;
    birthDate: string | null;
    className: string | null;
  };
  missingColumns: string[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1950 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function normalizeBirthDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
    const y = raw.getFullYear();
    const m = raw.getMonth() + 1;
    const d = raw.getDate();
    return isValidYmd(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (parsed && isValidYmd(parsed.y, parsed.m, parsed.d)) {
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }
    return null;
  }

  const str = String(raw).trim();
  if (!str) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(str);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return isValidYmd(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  const dmyMatch = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(str);
  if (dmyMatch) {
    const d = Number(dmyMatch[1]);
    const m = Number(dmyMatch[2]);
    const y = Number(dmyMatch[3]);
    return isValidYmd(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }

  // Pure numeric Excel serial string
  if (/^\d{5}$/.test(str)) {
    const parsed = XLSX.SSF.parse_date_code(Number(str));
    if (parsed && isValidYmd(parsed.y, parsed.m, parsed.d)) {
      return `${parsed.y}-${pad2(parsed.m)}-${pad2(parsed.d)}`;
    }
  }

  return null;
}

export function normalizeNisn(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .trim()
    .replace(/^'+/, '')
    .replace(/\s+/g, '');
}

export function inferGradeLevel(className: string): string {
  const cleaned = className.trim().toUpperCase();
  const romanMatch = /^(XII|XI|IX|VIII|VII|X)\b/.exec(cleaned);
  if (romanMatch) return romanMatch[1];
  const numericMatch = /^(12|11|10|9|8|7)/.exec(cleaned);
  if (numericMatch) {
    const map: Record<string, string> = {
      '7': 'VII',
      '8': 'VIII',
      '9': 'IX',
      '10': 'X',
      '11': 'XI',
      '12': 'XII',
    };
    return map[numericMatch[1]] ?? numericMatch[1];
  }
  const firstToken = cleaned.split(/[\s-]+/)[0];
  return firstToken || 'Umum';
}

function normalizeHeaderKey(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findHeaderKey(headers: string[], candidates: string[]): string | null {
  for (const h of headers) {
    const norm = normalizeHeaderKey(h);
    if (candidates.includes(norm)) return h;
  }
  for (const h of headers) {
    const norm = normalizeHeaderKey(h);
    if (candidates.some((c) => norm.includes(c))) return h;
  }
  return null;
}

export async function parseStudentImportFile(
  file: File,
  existingClasses: ClassItem[],
  existingStudents: StudentUser[]
): Promise<StudentParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, {type: 'array', raw: true});
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return {
      rows: [],
      detectedColumns: {nisn: null, fullName: null, birthDate: null, className: null},
      missingColumns: ['NISN', 'Nama Lengkap', 'Tanggal Lahir', 'Kelas'],
    };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rawObjects = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: true,
  });

  if (rawObjects.length === 0) {
    return {
      rows: [],
      detectedColumns: {nisn: null, fullName: null, birthDate: null, className: null},
      missingColumns: [],
    };
  }

  const headers = Object.keys(rawObjects[0]);
  const nisnKey = findHeaderKey(headers, ['nisn', 'nomor induk siswa nasional', 'no nisn', 'username']);
  const nameKey = findHeaderKey(headers, ['nama lengkap', 'nama siswa', 'nama', 'full name', 'fullname']);
  const dobKey = findHeaderKey(headers, [
    'tanggal lahir',
    'tgl lahir',
    'birth date',
    'birthdate',
    'ttl',
    'dob',
    'password',
  ]);
  const classKey = findHeaderKey(headers, ['kelas', 'nama kelas', 'class', 'class name', 'rombel']);

  const missingColumns: string[] = [];
  if (!nisnKey) missingColumns.push('NISN');
  if (!nameKey) missingColumns.push('Nama Lengkap');
  if (!dobKey) missingColumns.push('Tanggal Lahir');
  if (!classKey) missingColumns.push('Kelas');

  if (missingColumns.length > 0) {
    return {
      rows: [],
      detectedColumns: {
        nisn: nisnKey,
        fullName: nameKey,
        birthDate: dobKey,
        className: classKey,
      },
      missingColumns,
    };
  }

  const classByName = new Map<string, ClassItem>();
  existingClasses.forEach((cls) => {
    classByName.set(cls.name.trim().toLowerCase(), cls);
  });

  const studentByNisn = new Map<string, StudentUser>();
  existingStudents.forEach((st) => {
    studentByNisn.set(st.nisn.trim(), st);
  });

  const seenNisnInFile = new Set<string>();
  const rows: ParsedStudentRow[] = [];

  rawObjects.forEach((record, index) => {
    const nisn = normalizeNisn(record[nisnKey!]);
    const fullName = String(record[nameKey!] ?? '').trim();
    const rawDob = record[dobKey!];
    const birthDate = normalizeBirthDate(rawDob);
    const className = String(record[classKey!] ?? '').trim();

    // Skip completely empty rows
    if (!nisn && !fullName && !rawDob && !className) {
      return;
    }

    const errors: string[] = [];
    if (!nisn || nisn.length < 5) {
      errors.push('NISN minimal 5 karakter');
    } else if (seenNisnInFile.has(nisn)) {
      errors.push('NISN duplikat di dalam file');
    } else {
      seenNisnInFile.add(nisn);
    }

    if (!fullName || fullName.length < 2) {
      errors.push('Nama lengkap minimal 2 karakter');
    }

    if (!birthDate) {
      errors.push('Format tanggal lahir tidak valid (gunakan YYYY-MM-DD atau DD/MM/YYYY)');
    }

    if (!className) {
      errors.push('Nama kelas wajib diisi');
    }

    const matchedClass = className ? classByName.get(className.toLowerCase()) ?? null : null;
    const existingStudent = nisn ? studentByNisn.get(nisn) ?? null : null;

    rows.push({
      rowNumber: index + 2,
      nisn,
      fullName,
      birthDate: birthDate ?? '',
      className,
      matchedClassId: matchedClass?.id ?? null,
      needsNewClass: Boolean(className) && !matchedClass,
      existingStudentId: existingStudent?.id ?? null,
      errors,
    });
  });

  return {
    rows,
    detectedColumns: {
      nisn: nisnKey,
      fullName: nameKey,
      birthDate: dobKey,
      className: classKey,
    },
    missingColumns: [],
  };
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadStudentTemplateXlsx(classes: ClassItem[]): string {
  const sampleClass1 = classes[0]?.name || 'VII A';
  const sampleClass2 = classes[1]?.name || sampleClass1;

  const dataRows = [
    ['NISN', 'Nama Lengkap', 'Tanggal Lahir', 'Kelas'],
    ['0091234501', 'Ahmad Fauzan Pratama', '2012-05-14', sampleClass1],
    ['0091234502', 'Siti Aisyah Rahmawati', '2012-09-22', sampleClass2],
  ];

  const wsData = XLSX.utils.aoa_to_sheet(dataRows);
  wsData['!cols'] = [{wch: 16}, {wch: 30}, {wch: 16}, {wch: 16}];

  // Ensure NISN sample cells stay text
  ['A2', 'A3'].forEach((addr) => {
    if (wsData[addr]) wsData[addr].t = 's';
  });

  const guideRows = [
    ['PANDUAN IMPORT DATA SISWA eOSIS'],
    [],
    ['Kolom', 'Keterangan & Format'],
    ['NISN', 'Wajib unik, minimal 5 digit. Simpan sebagai teks agar angka 0 di depan tidak hilang.'],
    ['Nama Lengkap', 'Nama lengkap siswa (minimal 2 karakter).'],
    ['Tanggal Lahir', 'Format YYYY-MM-DD (contoh: 2012-05-14) atau DD/MM/YYYY (contoh: 14/05/2012).'],
    ['Kelas', 'Sesuaikan dengan nama kelas terdaftar, atau aktifkan opsi buat kelas otomatis saat import.'],
    [],
    ['Daftar Kelas Terdaftar Saat Ini:'],
    ...(classes.length > 0 ? classes.map((c) => [c.name, `Tingkat ${c.grade_level}`]) : [['Belum ada kelas', '-']]),
  ];

  const wsGuide = XLSX.utils.aoa_to_sheet(guideRows);
  wsGuide['!cols'] = [{wch: 24}, {wch: 76}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsData, 'Data Siswa');
  XLSX.utils.book_append_sheet(wb, wsGuide, 'Panduan');

  const filename = 'template-import-siswa-eosis.xlsx';
  XLSX.writeFile(wb, filename);
  return filename;
}

export function downloadStudentTemplateCsv(classes: ClassItem[]): string {
  const sampleClass1 = classes[0]?.name || 'VII A';
  const sampleClass2 = classes[1]?.name || sampleClass1;
  const rows = [
    ['NISN', 'Nama Lengkap', 'Tanggal Lahir', 'Kelas'],
    ['0091234501', 'Ahmad Fauzan Pratama', '2012-05-14', sampleClass1],
    ['0091234502', 'Siti Aisyah Rahmawati', '2012-09-22', sampleClass2],
  ];
  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], {type: 'text/csv;charset=utf-8;'});
  const filename = 'template-import-siswa-eosis.csv';
  triggerBlobDownload(blob, filename);
  return filename;
}

export function exportStudentsXlsx(
  students: StudentUser[],
  schoolName: string,
  scopeLabel = 'semua'
): string {
  const rows = [
    ['No', 'NISN', 'Nama Lengkap', 'Tanggal Lahir', 'Kelas', 'Status Memilih'],
    ...students.map((s, idx) => [
      idx + 1,
      s.nisn,
      s.full_name,
      s.birth_date,
      s.class_name,
      s.has_voted ? 'Sudah Memilih' : 'Belum Memilih',
    ]),
  ];

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch: 6}, {wch: 16}, {wch: 30}, {wch: 15}, {wch: 16}, {wch: 16}];

  // Preserve NISN leading zeros as string cells
  for (let i = 0; i < students.length; i++) {
    const cellRef = `B${i + 2}`;
    if (ws[cellRef]) {
      ws[cellRef].t = 's';
      ws[cellRef].v = String(students[i].nisn);
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data User Siswa');

  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `data-user-siswa-${slugify(schoolName || 'eosis')}-${slugify(scopeLabel)}-${dateStamp}.xlsx`;
  XLSX.writeFile(wb, filename);
  return filename;
}

export function exportStudentsCsv(
  students: StudentUser[],
  schoolName: string,
  scopeLabel = 'semua'
): string {
  const rows = [
    ['No', 'NISN', 'Nama Lengkap', 'Tanggal Lahir', 'Kelas', 'Status Memilih'],
    ...students.map((s, idx) => [
      idx + 1,
      s.nisn,
      s.full_name,
      s.birth_date,
      s.class_name,
      s.has_voted ? 'Sudah Memilih' : 'Belum Memilih',
    ]),
  ];

  const body = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + body], {type: 'text/csv;charset=utf-8;'});
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `data-user-siswa-${slugify(schoolName || 'eosis')}-${slugify(scopeLabel)}-${dateStamp}.csv`;
  triggerBlobDownload(blob, filename);
  return filename;
}

export function downloadUsersPdf(
  students: StudentUser[],
  settings: SchoolSettings,
  scopeLabel = 'Semua Kelas'
): string {
  const doc = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4'});
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 14;
  const now = new Date();
  const dateStr = new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text(settings.school_name.toUpperCase(), pageWidth / 2, 16, {align: 'center'});

  doc.setFontSize(10.5);
  doc.text('DAFTAR AKUN USER / PEMILIH SISWA eOSIS', pageWidth / 2, 22, {align: 'center'});

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${settings.election_title} · Periode ${settings.election_period}`,
    pageWidth / 2,
    27,
    {align: 'center'}
  );

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.5);
  doc.line(marginX, 30.5, pageWidth - marginX, 30.5);

  doc.setFontSize(8.5);
  doc.text(`Cakupan Data: ${scopeLabel} (${students.length} siswa)`, marginX, 36);
  doc.text(`Dicetak: ${dateStr}`, pageWidth - marginX, 36, {align: 'right'});

  autoTable(doc, {
    startY: 40,
    margin: {left: marginX, right: marginX},
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      cellPadding: 2.2,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    head: [['No', 'NISN (Login)', 'Nama Lengkap', 'Kelas', 'Tanggal Lahir', 'Status']],
    body:
      students.length > 0
        ? students.map((s, idx) => [
            String(idx + 1),
            s.nisn,
            s.full_name,
            s.class_name,
            s.birth_date,
            s.has_voted ? 'Sudah Memilih' : 'Belum Memilih',
          ])
        : [['-', '-', 'Tidak ada data siswa', '-', '-', '-']],
    columnStyles: {
      0: {cellWidth: 10, halign: 'center'},
      1: {cellWidth: 28, fontStyle: 'bold'},
      3: {cellWidth: 22},
      4: {cellWidth: 26, halign: 'center'},
      5: {cellWidth: 28, halign: 'center'},
    },
  });

  const dateStamp = now.toISOString().slice(0, 10);
  const filename = `daftar-user-siswa-${slugify(settings.school_name || 'eosis')}-${slugify(scopeLabel)}-${dateStamp}.pdf`;
  doc.save(filename);
  return filename;
}
