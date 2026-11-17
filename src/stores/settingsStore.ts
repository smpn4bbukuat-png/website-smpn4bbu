import {computed, reactive} from 'vue';
import {isSchemaMissingError} from '@/lib/supabase';
import {eosisApi} from '@/services/eosisApi';
import type {SchoolSettings} from '@/types/eosis';

export const DEFAULT_SCHOOL_LOGO = '/src/assets/images/school_emblem_logo_1794926104357.jpg';

const state = reactive<{
  settings: SchoolSettings;
  loaded: boolean;
  loading: boolean;
  schemaMissing: boolean;
  connectionError: string | null;
}>({
  settings: {
    id: 1,
    school_name: 'SMA Negeri Nusantara',
    school_logo_url: null,
    election_period: '2026 / 2027',
    election_title: 'Pemilihan Ketua & Wakil Ketua OSIS',
    is_voting_open: true,
  },
  loaded: false,
  loading: false,
  schemaMissing: false,
  connectionError: null,
});

export const settingsStore = {
  state,
  effectiveLogoUrl: computed(() => state.settings.school_logo_url || DEFAULT_SCHOOL_LOGO),

  async loadSettings(force = false): Promise<void> {
    if (state.loaded && !force) return;
    state.loading = true;
    state.connectionError = null;
    try {
      const data = await eosisApi.getSchoolSettings();
      if (data) {
        state.settings = data;
      }
      state.schemaMissing = false;
      state.loaded = true;
      document.title = `eOSIS — ${state.settings.school_name} (${state.settings.election_period})`;
    } catch (error) {
      if (isSchemaMissingError(error)) {
        state.schemaMissing = true;
      } else {
        state.connectionError =
          error instanceof Error ? error.message : 'Gagal terhubung ke database Supabase.';
      }
    } finally {
      state.loading = false;
    }
  },
};
