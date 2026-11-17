import {reactive} from 'vue';

export type ToastVariant = 'success' | 'danger' | 'warning' | 'info';

export interface ToastItem {
  id: number;
  title: string;
  message: string;
  variant: ToastVariant;
}

let nextId = 1;

export const toastState = reactive<{items: ToastItem[]}>({
  items: [],
});

export function showToast(
  message: string,
  variant: ToastVariant = 'info',
  title?: string,
  durationMs = 4500
): void {
  const id = nextId++;
  const resolvedTitle =
    title ??
    (variant === 'success'
      ? 'Berhasil'
      : variant === 'danger'
        ? 'Terjadi Kesalahan'
        : variant === 'warning'
          ? 'Perhatian'
          : 'Informasi');

  toastState.items.push({
    id,
    title: resolvedTitle,
    message,
    variant,
  });

  if (durationMs > 0) {
    window.setTimeout(() => {
      dismissToast(id);
    }, durationMs);
  }
}

export function dismissToast(id: number): void {
  const idx = toastState.items.findIndex((item) => item.id === id);
  if (idx !== -1) {
    toastState.items.splice(idx, 1);
  }
}
