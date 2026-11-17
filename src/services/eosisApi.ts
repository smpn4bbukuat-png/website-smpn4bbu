import {supabase} from '@/lib/supabase';
import type {
  AdminUser,
  CandidateItem,
  ClassItem,
  DashboardStats,
  SchoolSettings,
  StudentUser,
  VoteResultsSummary,
} from '@/types/eosis';

async function callRpc<T>(fnName: string, params: Record<string, unknown> = {}): Promise<T> {
  const {data, error} = await supabase.rpc(fnName, params);
  if (error) {
    throw error;
  }
  return data as T;
}

export const eosisApi = {
  // Public
  async getSchoolSettings(): Promise<SchoolSettings | null> {
    const rows = await callRpc<SchoolSettings[]>('get_school_settings');
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  },

  async getPublicCandidates(): Promise<CandidateItem[]> {
    return await callRpc<CandidateItem[]>('get_candidates_public');
  },

  // Admin Auth
  async adminLogin(username: string, password: string): Promise<{token: string; admin: AdminUser}> {
    return await callRpc<{token: string; admin: AdminUser}>('admin_login', {
      p_username: username,
      p_password: password,
    });
  },

  async adminVerifySession(token: string): Promise<AdminUser> {
    return await callRpc<AdminUser>('admin_verify_session', {p_token: token});
  },

  async adminLogout(token: string): Promise<void> {
    await callRpc<void>('admin_logout', {p_token: token});
  },

  // Student Auth & Voting
  async studentLogin(nisn: string, birthDate: string): Promise<{token: string; student: StudentUser}> {
    return await callRpc<{token: string; student: StudentUser}>('student_login', {
      p_nisn: nisn,
      p_birth_date: birthDate,
    });
  },

  async studentGetProfile(token: string): Promise<StudentUser> {
    return await callRpc<StudentUser>('student_get_profile', {p_token: token});
  },

  async studentLogout(token: string): Promise<void> {
    await callRpc<void>('student_logout', {p_token: token});
  },

  async castStudentVote(
    studentToken: string,
    candidateId: string
  ): Promise<{success: boolean; voted_at: string}> {
    return await callRpc<{success: boolean; voted_at: string}>('cast_student_vote', {
      p_student_token: studentToken,
      p_candidate_id: candidateId,
    });
  },

  // Admin Dashboard
  async getDashboardStats(token: string): Promise<DashboardStats> {
    return await callRpc<DashboardStats>('admin_get_dashboard_stats', {p_token: token});
  },

  // Admin Classes CRUD
  async listClasses(token: string): Promise<ClassItem[]> {
    return await callRpc<ClassItem[]>('admin_list_classes', {p_token: token});
  },

  async upsertClass(
    token: string,
    payload: {id?: string | null; name: string; grade_level: string}
  ): Promise<string> {
    return await callRpc<string>('admin_upsert_class', {
      p_token: token,
      p_id: payload.id ?? null,
      p_name: payload.name,
      p_grade_level: payload.grade_level,
    });
  },

  async deleteClass(token: string, id: string): Promise<void> {
    await callRpc<void>('admin_delete_class', {p_token: token, p_id: id});
  },

  // Admin Students CRUD
  async listStudents(token: string): Promise<StudentUser[]> {
    return await callRpc<StudentUser[]>('admin_list_students', {p_token: token});
  },

  async upsertStudent(
    token: string,
    payload: {
      id?: string | null;
      nisn: string;
      full_name: string;
      birth_date: string;
      class_id: string;
    }
  ): Promise<string> {
    return await callRpc<string>('admin_upsert_student', {
      p_token: token,
      p_id: payload.id ?? null,
      p_nisn: payload.nisn,
      p_full_name: payload.full_name,
      p_birth_date: payload.birth_date,
      p_class_id: payload.class_id,
    });
  },

  async deleteStudent(token: string, id: string): Promise<void> {
    await callRpc<void>('admin_delete_student', {p_token: token, p_id: id});
  },

  // Admin Candidates CRUD
  async listCandidates(token: string): Promise<CandidateItem[]> {
    return await callRpc<CandidateItem[]>('admin_list_candidates', {p_token: token});
  },

  async upsertCandidate(
    token: string,
    payload: {
      id?: string | null;
      order_number: number;
      photo_url: string | null;
      chairperson_name: string;
      vice_chairperson_name: string;
      vision: string;
      mission: string;
      slogan: string;
    }
  ): Promise<string> {
    return await callRpc<string>('admin_upsert_candidate', {
      p_token: token,
      p_id: payload.id ?? null,
      p_order_number: payload.order_number,
      p_photo_url: payload.photo_url,
      p_chairperson_name: payload.chairperson_name,
      p_vice_chairperson_name: payload.vice_chairperson_name,
      p_vision: payload.vision,
      p_mission: payload.mission,
      p_slogan: payload.slogan,
    });
  },

  async deleteCandidate(token: string, id: string): Promise<void> {
    await callRpc<void>('admin_delete_candidate', {p_token: token, p_id: id});
  },

  // Admin Vote Results (Anonymous Aggregate Only)
  async getVoteResults(token: string): Promise<VoteResultsSummary> {
    return await callRpc<VoteResultsSummary>('admin_get_vote_results', {p_token: token});
  },

  // Admin Settings & Credentials
  async updateSettings(
    token: string,
    payload: {
      school_name: string;
      school_logo_url: string | null;
      election_period: string;
      election_title: string;
      is_voting_open: boolean;
    }
  ): Promise<void> {
    await callRpc<void>('admin_update_settings', {
      p_token: token,
      p_school_name: payload.school_name,
      p_school_logo_url: payload.school_logo_url,
      p_election_period: payload.election_period,
      p_election_title: payload.election_title,
      p_is_voting_open: payload.is_voting_open,
    });
  },

  async updateAdminCredentials(
    token: string,
    payload: {
      current_password: string;
      new_username: string;
      new_password: string;
      full_name: string;
    }
  ): Promise<AdminUser> {
    return await callRpc<AdminUser>('admin_update_credentials', {
      p_token: token,
      p_current_password: payload.current_password,
      p_new_username: payload.new_username,
      p_new_password: payload.new_password,
      p_full_name: payload.full_name,
    });
  },
};
