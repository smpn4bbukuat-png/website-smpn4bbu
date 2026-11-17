import {createClient} from '@supabase/supabase-js';

export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL || 'https://gexswkduxoehgssatzjf.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdleHN3a2R1eG9laGdzc2F0empmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4NTU5MDIsImV4cCI6MjExMDQzMTkwMn0.Tuj2rCRn6q55EKkxfC--hBJb2-viOZQLADLxh24Us2s';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

export const STORAGE_BUCKET = 'eosis-assets';

export function isSchemaMissingError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as {code?: string; message?: string; status?: number};
  const code = err.code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  return (
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    code === '42883' ||
    msg.includes('could not find the function') ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist')
  );
}

export function extractErrorMessage(error: unknown, fallback = 'Terjadi kesalahan pada server.'): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (typeof error === 'object') {
    const err = error as {message?: string; details?: string; hint?: string};
    if (err.message) return err.message;
  }
  return fallback;
}

export async function uploadAssetToStorage(
  file: File,
  folder: 'branding' | 'candidates'
): Promise<string> {
  const maxBytes = 2 * 1024 * 1024;
  if (file.size > maxBytes) {
    throw new Error('Ukuran file maksimal 2 MB.');
  }

  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
  if (!allowedTypes.includes(file.type)) {
    throw new Error('Format gambar harus PNG, JPG, WEBP, atau SVG.');
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${folder}/${safeName}`;

  const {error: uploadError} = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type,
    });

  if (uploadError) {
    throw new Error(
      `Gagal mengunggah gambar ke Supabase Storage (${uploadError.message}). Pastikan bucket "${STORAGE_BUCKET}" dan storage policy sudah dibuat.`
    );
  }

  const {data} = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
