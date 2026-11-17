import {computed, reactive} from 'vue';
import {eosisApi} from '@/services/eosisApi';
import type {AdminUser, StudentUser, UserRole} from '@/types/eosis';

const STORAGE_KEY_ROLE = 'eosis_auth_role';
const STORAGE_KEY_TOKEN = 'eosis_auth_token';

interface AuthState {
  role: UserRole | null;
  token: string | null;
  admin: AdminUser | null;
  student: StudentUser | null;
  initialized: boolean;
}

const state = reactive<AuthState>({
  role: (sessionStorage.getItem(STORAGE_KEY_ROLE) as UserRole | null) ?? null,
  token: sessionStorage.getItem(STORAGE_KEY_TOKEN) ?? null,
  admin: null,
  student: null,
  initialized: false,
});

function persistSession(role: UserRole | null, token: string | null): void {
  state.role = role;
  state.token = token;
  if (role && token) {
    sessionStorage.setItem(STORAGE_KEY_ROLE, role);
    sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
  } else {
    sessionStorage.removeItem(STORAGE_KEY_ROLE);
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
  }
}

export const authStore = {
  state,
  isAuthenticated: computed(() => Boolean(state.role && state.token && (state.admin || state.student))),
  isAdmin: computed(() => state.role === 'admin' && Boolean(state.token && state.admin)),
  isStudent: computed(() => state.role === 'student' && Boolean(state.token && state.student)),

  async restoreSession(): Promise<void> {
    if (state.initialized) return;
    const savedRole = sessionStorage.getItem(STORAGE_KEY_ROLE) as UserRole | null;
    const savedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN);

    if (!savedRole || !savedToken) {
      persistSession(null, null);
      state.initialized = true;
      return;
    }

    try {
      if (savedRole === 'admin') {
        const admin = await eosisApi.adminVerifySession(savedToken);
        state.admin = admin;
        state.student = null;
        persistSession('admin', savedToken);
      } else if (savedRole === 'student') {
        const student = await eosisApi.studentGetProfile(savedToken);
        state.student = student;
        state.admin = null;
        persistSession('student', savedToken);
      }
    } catch {
      state.admin = null;
      state.student = null;
      persistSession(null, null);
    } finally {
      state.initialized = true;
    }
  },

  async loginAdmin(username: string, password: string): Promise<void> {
    const res = await eosisApi.adminLogin(username, password);
    state.admin = res.admin;
    state.student = null;
    state.initialized = true;
    persistSession('admin', res.token);
  },

  async loginStudent(nisn: string, birthDate: string): Promise<void> {
    const res = await eosisApi.studentLogin(nisn, birthDate);
    state.student = res.student;
    state.admin = null;
    state.initialized = true;
    persistSession('student', res.token);
  },

  async refreshStudentProfile(): Promise<void> {
    if (state.role !== 'student' || !state.token) return;
    const profile = await eosisApi.studentGetProfile(state.token);
    state.student = profile;
  },

  updateAdminProfile(admin: AdminUser): void {
    state.admin = admin;
  },

  async logout(): Promise<void> {
    const currentRole = state.role;
    const currentToken = state.token;
    state.admin = null;
    state.student = null;
    persistSession(null, null);

    if (currentToken) {
      try {
        if (currentRole === 'admin') {
          await eosisApi.adminLogout(currentToken);
        } else if (currentRole === 'student') {
          await eosisApi.studentLogout(currentToken);
        }
      } catch {
        // Ignore network errors during logout cleanup
      }
    }
  },
};
