import {jsPDF} from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {DashboardStats, SchoolSettings, VoteResultsSummary} from '@/types/eosis';

export interface RecapSignatories {
  city: string;
  chairperson: string;
  advisor: string;
  principal: string;
}

export interface RecapExportPayload {
  settings: SchoolSettings;
  stats: DashboardStats;
  results: VoteResultsSummary;
  signatories: RecapSignatories;
  generatedAt: Date;
}

function slugifyFilename(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function formatIndonesianDate(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export function formatIndonesianDateTime(date: Date): string {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function buildFileBaseName(payload: RecapExportPayload): string {
  const schoolSlug = slugifyFilename(payload.settings.school_name || 'sekolah');
  const periodSlug = slugifyFilename(payload.settings.election_period || 'periode');
  const dateStamp = payload.generatedAt.toISOString().slice(0, 10);
  return `rekapitulasi-akhir-eosis-${schoolSlug}-${periodSlug}-${dateStamp}`;
}

function getRankMap(results: VoteResultsSummary): Map<string, number> {
  const sorted = [...results.candidates].sort((a, b) => {
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
  return rankMap;
}

export function exportRecapPdf(payload: RecapExportPayload): string {
  const {settings, stats, results, signatories, generatedAt} = payload;
  const doc = new jsPDF({orientation: 'portrait', unit: 'mm', format: 'a4'});
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 16;

  // Header kop resmi
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(settings.school_name.toUpperCase(), pageWidth / 2, 18, {align: 'center'});

  doc.setFontSize(11);
  doc.text('BERITA ACARA & REKAPITULASI AKHIR PENGHITUNGAN SUARA', pageWidth / 2, 24.5, {
    align: 'center',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `${settings.election_title} · Periode ${settings.election_period}`,
    pageWidth / 2,
    30,
    {align: 'center'}
  );

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.6);
  doc.line(marginX, 34, pageWidth - marginX, 34);
  doc.setLineWidth(0.2);
  doc.line(marginX, 35.2, pageWidth - marginX, 35.2);

  // Meta ringkas
  const statusText = settings.is_voting_open
    ? 'Pemungutan Suara Masih Dibuka (Sementara)'
    : 'Pemungutan Suara Ditutup (Final)';

  doc.setFontSize(8.8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Waktu Cetak: ${formatIndonesianDateTime(generatedAt)}`, marginX, 41);
  doc.text(`Status Pemilihan: ${statusText}`, pageWidth - marginX, 41, {align: 'right'});

  // 1. Ringkasan Partisipasi
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('I. Ringkasan Statistik Pemilih & Surat Suara', marginX, 49);

  autoTable(doc, {
    startY: 52,
    margin: {left: marginX, right: marginX},
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.6,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    head: [['Indikator Pemilihan', 'Jumlah', 'Keterangan']],
    body: [
      ['Total Pemilih Terdaftar (DPT)', String(stats.total_students), `${stats.total_classes} kelas terdaftar`],
      ['Siswa Sudah Memilih', String(stats.voted_count), `Tingkat partisipasi ${stats.participation_percentage}%`],
      ['Siswa Belum Memilih', String(stats.not_voted_count), 'Tidak/belum menggunakan hak pilih'],
      ['Total Suara Sah Masuk', String(results.total_votes), `${stats.total_candidates} pasangan calon`],
    ],
    columnStyles: {
      1: {halign: 'right', fontStyle: 'bold', cellWidth: 28},
    },
  });

  // 2. Perolehan Suara Pasangan Calon
  const afterSummaryY = (doc as unknown as {lastAutoTable?: {finalY: number}}).lastAutoTable?.finalY ?? 90;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('II. Rekapitulasi Perolehan Suara Pasangan Calon', marginX, afterSummaryY + 9);

  const rankMap = getRankMap(results);
  const maxVotes = results.candidates.reduce((max, c) => Math.max(max, c.vote_count), 0);

  autoTable(doc, {
    startY: afterSummaryY + 12,
    margin: {left: marginX, right: marginX},
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: 2.8,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [29, 78, 216],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    head: [['No. Urut', 'Calon Ketua & Wakil Ketua OSIS', 'Suara', 'Persentase', 'Peringkat']],
    body:
      results.candidates.length > 0
        ? results.candidates.map((cand) => {
            const rank = rankMap.get(cand.id) ?? 1;
            const isLeader = maxVotes > 0 && cand.vote_count === maxVotes;
            return [
              `No. ${String(cand.order_number).padStart(2, '0')}`,
              `${cand.chairperson_name} & ${cand.vice_chairperson_name}\n"${cand.slogan}"`,
              String(cand.vote_count),
              `${cand.percentage}%`,
              isLeader ? `#${rank} (Tertinggi)` : `#${rank}`,
            ];
          })
        : [['-', 'Belum ada pasangan calon terdaftar', '0', '0%', '-']],
    foot: [['TOTAL', 'Jumlah Keseluruhan Suara Sah', String(results.total_votes), results.total_votes > 0 ? '100%' : '0%', '']],
    footStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: {cellWidth: 20, halign: 'center', fontStyle: 'bold'},
      2: {cellWidth: 22, halign: 'right', fontStyle: 'bold'},
      3: {cellWidth: 24, halign: 'right'},
      4: {cellWidth: 28, halign: 'center'},
    },
  });

  // 3. Partisipasi per Kelas
  const afterCandidatesY =
    (doc as unknown as {lastAutoTable?: {finalY: number}}).lastAutoTable?.finalY ?? 150;
  let section3Y = afterCandidatesY + 10;
  if (section3Y > pageHeight - 55) {
    doc.addPage();
    section3Y = 20;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('III. Rekapitulasi Partisipasi Pemilih per Kelas', marginX, section3Y);

  autoTable(doc, {
    startY: section3Y + 3,
    margin: {left: marginX, right: marginX},
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 8.8,
      cellPadding: 2.4,
      textColor: [15, 23, 42],
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    head: [['Kelas', 'Tingkat', 'Total Siswa', 'Sudah Memilih', 'Belum Memilih', 'Partisipasi']],
    body:
      stats.class_breakdown.length > 0
        ? stats.class_breakdown.map((cls) => {
            const pct =
              cls.total_students > 0
                ? `${((cls.voted_count / cls.total_students) * 100).toFixed(1)}%`
                : '0.0%';
            return [
              cls.name,
              cls.grade_level,
              String(cls.total_students),
              String(cls.voted_count),
              String(cls.not_voted_count),
              pct,
            ];
          })
        : [['-', '-', '0', '0', '0', '0.0%']],
    columnStyles: {
      2: {halign: 'right'},
      3: {halign: 'right'},
      4: {halign: 'right'},
      5: {halign: 'right', fontStyle: 'bold'},
    },
  });

  // Catatan privasi + Blok Tanda Tangan
  const afterClassY =
    (doc as unknown as {lastAutoTable?: {finalY: number}}).lastAutoTable?.finalY ?? 210;
  let sigY = afterClassY + 10;
  if (sigY > pageHeight - 58) {
    doc.addPage();
    sigY = 24;
  }

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text(
    'Catatan: Rekapitulasi ini dihasilkan secara otomatis oleh sistem eOSIS berdasarkan kotak suara anonim tanpa mencatat keterkaitan identitas pemilih dengan pilihan kandidat.',
    marginX,
    sigY,
    {maxWidth: pageWidth - marginX * 2}
  );

  const dateLineY = sigY + 11;
  const cityPrefix = signatories.city.trim() ? `${signatories.city.trim()}, ` : '';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`${cityPrefix}${formatIndonesianDate(generatedAt)}`, pageWidth - marginX, dateLineY, {
    align: 'right',
  });

  const colWidth = (pageWidth - marginX * 2) / 3;
  const labelsY = dateLineY + 7;
  const namesY = labelsY + 24;

  const sigCols = [
    {role: 'Ketua Panitia Pemilihan', name: signatories.chairperson.trim() || '( .................................... )'},
    {role: 'Pembina OSIS', name: signatories.advisor.trim() || '( .................................... )'},
    {role: 'Mengetahui, Kepala Sekolah', name: signatories.principal.trim() || '( .................................... )'},
  ];

  sigCols.forEach((col, idx) => {
    const centerX = marginX + colWidth * idx + colWidth / 2;
    doc.setFont('helvetica', 'normal');
    doc.text(col.role, centerX, labelsY, {align: 'center'});
    doc.setFont('helvetica', 'bold');
    doc.text(col.name, centerX, namesY, {align: 'center'});
  });

  const filename = `${buildFileBaseName(payload)}.pdf`;
  doc.save(filename);
  return filename;
}

function csvCell(value: string | number): string {
  const str = String(value ?? '');
  if (/[",\n\r;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportRecapCsv(payload: RecapExportPayload): string {
  const {settings, stats, results, generatedAt} = payload;
  const rankMap = getRankMap(results);

  const lines: string[][] = [
    ['REKAPITULASI AKHIR PENGHITUNGAN SUARA eOSIS'],
    ['Nama Sekolah', settings.school_name],
    ['Judul Pemilihan', settings.election_title],
    ['Periode Pemilihan', settings.election_period],
    ['Status Pemungutan Suara', settings.is_voting_open ? 'Dibuka (Sementara)' : 'Ditutup (Final)'],
    ['Waktu Unduh', formatIndonesianDateTime(generatedAt)],
    [],
    ['RINGKASAN STATISTIK PEMILIH'],
    ['Indikator', 'Jumlah'],
    ['Total Siswa Terdaftar (DPT)', String(stats.total_students)],
    ['Total Kelas', String(stats.total_classes)],
    ['Total Pasangan Kandidat', String(stats.total_candidates)],
    ['Siswa Sudah Memilih', String(stats.voted_count)],
    ['Siswa Belum Memilih', String(stats.not_voted_count)],
    ['Persentase Partisipasi (%)', `${stats.participation_percentage}%`],
    ['Total Suara Sah Masuk', String(results.total_votes)],
    [],
    ['PEROLEHAN SUARA PASANGAN CALON'],
    ['Nomor Urut', 'Calon Ketua OSIS', 'Calon Wakil Ketua OSIS', 'Slogan', 'Jumlah Suara', 'Persentase (%)', 'Peringkat'],
    ...results.candidates.map((cand) => [
      String(cand.order_number),
      cand.chairperson_name,
      cand.vice_chairperson_name,
      cand.slogan,
      String(cand.vote_count),
      `${cand.percentage}%`,
      String(rankMap.get(cand.id) ?? 1),
    ]),
    [],
    ['PARTISIPASI PEMILIH PER KELAS'],
    ['Nama Kelas', 'Tingkat', 'Total Siswa', 'Sudah Memilih', 'Belum Memilih', 'Partisipasi (%)'],
    ...stats.class_breakdown.map((cls) => [
      cls.name,
      cls.grade_level,
      String(cls.total_students),
      String(cls.voted_count),
      String(cls.not_voted_count),
      cls.total_students > 0 ? `${((cls.voted_count / cls.total_students) * 100).toFixed(1)}%` : '0.0%',
    ]),
  ];

  const csvBody = lines.map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csvBody], {type: 'text/csv;charset=utf-8;'});
  const filename = `${buildFileBaseName(payload)}.csv`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);

  return filename;
}
