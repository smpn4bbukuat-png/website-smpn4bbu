export type UserRole = 'admin' | 'student';

export interface SchoolSettings {
  id: number;
  school_name: string;
  school_logo_url: string | null;
  election_period: string;
  election_title: string;
  is_voting_open: boolean;
  updated_at?: string;
}

export interface AdminUser {
  id: string;
  username: string;
  full_name: string;
}

export interface StudentUser {
  id: string;
  nisn: string;
  full_name: string;
  birth_date: string;
  class_id: string;
  class_name: string;
  has_voted: boolean;
  voted_at: string | null;
}

export interface ClassItem {
  id: string;
  name: string;
  grade_level: string;
  student_count?: number;
  created_at?: string;
}

export interface CandidateItem {
  id: string;
  order_number: number;
  photo_url: string | null;
  chairperson_name: string;
  vice_chairperson_name: string;
  vision: string;
  mission: string;
  slogan: string;
  created_at?: string;
}

export interface ClassParticipation {
  id: string;
  name: string;
  grade_level: string;
  total_students: number;
  voted_count: number;
  not_voted_count: number;
}

export interface DashboardStats {
  total_students: number;
  total_classes: number;
  total_candidates: number;
  voted_count: number;
  not_voted_count: number;
  participation_percentage: number;
  class_breakdown: ClassParticipation[];
}

export interface CandidateVoteResult {
  id: string;
  order_number: number;
  photo_url: string | null;
  chairperson_name: string;
  vice_chairperson_name: string;
  slogan: string;
  vote_count: number;
  percentage: number;
}

export interface VoteResultsSummary {
  total_votes: number;
  total_students: number;
  voted_students: number;
  candidates: CandidateVoteResult[];
}
