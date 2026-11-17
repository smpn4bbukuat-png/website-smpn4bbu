-- ============================================================================
-- eOSIS — Database Schema, Constraints, RLS Policies, Voting RPCs & Storage
-- Jalankan script ini di Supabase SQL Editor (Project -> SQL Editor -> New Query)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Pengaturan Aplikasi & Sekolah (Singleton row id = 1)
CREATE TABLE IF NOT EXISTS public.eosis_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  school_name TEXT NOT NULL DEFAULT 'SMA Negeri Nusantara',
  school_logo_url TEXT,
  election_period TEXT NOT NULL DEFAULT '2026 / 2027',
  election_title TEXT NOT NULL DEFAULT 'Pemilihan Ketua & Wakil Ketua OSIS',
  is_voting_open BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Akun Admin (Password wajib terenkripsi bcrypt via pgcrypto)
CREATE TABLE IF NOT EXISTS public.eosis_admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE CHECK (char_length(trim(username)) >= 3),
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT 'Administrator OSIS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Sesi Admin (Token server-side, tidak menaruh Service Role Key di frontend)
CREATE TABLE IF NOT EXISTS public.eosis_admin_sessions (
  token TEXT PRIMARY KEY,
  admin_id UUID NOT NULL REFERENCES public.eosis_admins(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Master Kelas
CREATE TABLE IF NOT EXISTS public.eosis_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) >= 1),
  grade_level TEXT NOT NULL CHECK (char_length(trim(grade_level)) >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Data Siswa / Pemilih
-- CATATAN KEAMANAN: Tidak ada kolom candidate_id di tabel siswa.
-- Admin hanya melihat status has_voted (sudah/belum memilih).
CREATE TABLE IF NOT EXISTS public.eosis_students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nisn TEXT NOT NULL UNIQUE CHECK (char_length(trim(nisn)) >= 5),
  full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) >= 2),
  birth_date DATE NOT NULL,
  class_id UUID NOT NULL REFERENCES public.eosis_classes(id) ON DELETE RESTRICT,
  has_voted BOOLEAN NOT NULL DEFAULT FALSE,
  voted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Sesi Siswa (Login NISN + Tanggal Lahir)
CREATE TABLE IF NOT EXISTS public.eosis_student_sessions (
  token TEXT PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.eosis_students(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Pasangan Calon Ketua & Wakil Ketua OSIS
CREATE TABLE IF NOT EXISTS public.eosis_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number INTEGER NOT NULL UNIQUE CHECK (order_number > 0),
  photo_url TEXT,
  chairperson_name TEXT NOT NULL CHECK (char_length(trim(chairperson_name)) >= 2),
  vice_chairperson_name TEXT NOT NULL CHECK (char_length(trim(vice_chairperson_name)) >= 2),
  vision TEXT NOT NULL CHECK (char_length(trim(vision)) >= 3),
  mission TEXT NOT NULL CHECK (char_length(trim(mission)) >= 3),
  slogan TEXT NOT NULL CHECK (char_length(trim(slogan)) >= 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Salt Internal Privat untuk Nullifier Surat Suara
CREATE TABLE IF NOT EXISTS public.eosis_internal_secrets (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  ballot_salt TEXT NOT NULL
);

-- 9. Kotak Suara Anonim (Secret Ballot)
-- CATATAN KEAMANAN: Tidak menyimpan student_id, NISN, maupun jam tepat pemilihan.
-- voter_nullifier = SHA-256(student_id || ':' || ballot_salt) menjamin 1 siswa = 1 suara di level DB.
CREATE TABLE IF NOT EXISTS public.eosis_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.eosis_candidates(id) ON DELETE RESTRICT,
  voter_nullifier TEXT NOT NULL UNIQUE,
  cast_date DATE NOT NULL DEFAULT CURRENT_DATE
);

-- Indeks untuk performa query statistik & autentikasi
CREATE INDEX IF NOT EXISTS idx_eosis_students_class_id ON public.eosis_students(class_id);
CREATE INDEX IF NOT EXISTS idx_eosis_students_has_voted ON public.eosis_students(has_voted);
CREATE INDEX IF NOT EXISTS idx_eosis_votes_candidate_id ON public.eosis_votes(candidate_id);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.eosis_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_student_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_internal_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eosis_votes ENABLE ROW LEVEL SECURITY;

-- Kebijakan baca publik hanya untuk identitas sekolah & daftar kandidat
DROP POLICY IF EXISTS "Public read eosis_settings" ON public.eosis_settings;
CREATE POLICY "Public read eosis_settings"
  ON public.eosis_settings FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read eosis_candidates" ON public.eosis_candidates;
CREATE POLICY "Public read eosis_candidates"
  ON public.eosis_candidates FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read eosis_classes" ON public.eosis_classes;
CREATE POLICY "Public read eosis_classes"
  ON public.eosis_classes FOR SELECT
  TO anon, authenticated
  USING (true);

-- Tabel sensitif (admins, sessions, students, internal_secrets, votes)
-- TIDAK memiliki policy SELECT/INSERT/UPDATE/DELETE untuk anon/authenticated,
-- sehingga 100% tertutup dari akses REST langsung dan hanya dapat diakses melalui RPC SECURITY DEFINER.

-- ============================================================================
-- HELPER VALIDASI SESI
-- ============================================================================

CREATE OR REPLACE FUNCTION public.assert_admin_session(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'Sesi admin tidak ditemukan. Silakan login kembali.' USING ERRCODE = 'P0001';
  END IF;

  SELECT admin_id INTO v_admin_id
  FROM public.eosis_admin_sessions
  WHERE token = p_token AND expires_at > NOW();

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Sesi admin tidak valid atau telah kedaluwarsa.' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_admin_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_student_session(p_token TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student_id UUID;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN
    RAISE EXCEPTION 'Sesi siswa tidak ditemukan. Silakan login kembali.' USING ERRCODE = 'P0001';
  END IF;

  SELECT student_id INTO v_student_id
  FROM public.eosis_student_sessions
  WHERE token = p_token AND expires_at > NOW();

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Sesi siswa tidak valid atau telah berakhir.' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_student_id;
END;
$$;

-- ============================================================================
-- RPC PUBLIK & AUTENTIKASI
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_school_settings()
RETURNS TABLE (
  id INTEGER,
  school_name TEXT,
  school_logo_url TEXT,
  election_period TEXT,
  election_title TEXT,
  is_voting_open BOOLEAN,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id, school_name, school_logo_url, election_period, election_title, is_voting_open, updated_at
  FROM public.eosis_settings
  WHERE id = 1;
$$;

CREATE OR REPLACE FUNCTION public.get_candidates_public()
RETURNS TABLE (
  id UUID,
  order_number INTEGER,
  photo_url TEXT,
  chairperson_name TEXT,
  vice_chairperson_name TEXT,
  vision TEXT,
  mission TEXT,
  slogan TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT id, order_number, photo_url, chairperson_name, vice_chairperson_name, vision, mission, slogan
  FROM public.eosis_candidates
  ORDER BY order_number ASC;
$$;

CREATE OR REPLACE FUNCTION public.admin_login(p_username TEXT, p_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin RECORD;
  v_token TEXT;
BEGIN
  SELECT id, username, password_hash, full_name
  INTO v_admin
  FROM public.eosis_admins
  WHERE lower(username) = lower(trim(p_username));

  IF v_admin.id IS NULL OR v_admin.password_hash <> crypt(p_password, v_admin.password_hash) THEN
    RAISE EXCEPTION 'Username atau password admin salah.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.eosis_admin_sessions WHERE expires_at <= NOW();

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.eosis_admin_sessions (token, admin_id, expires_at)
  VALUES (v_token, v_admin.id, NOW() + INTERVAL '12 hours');

  RETURN jsonb_build_object(
    'token', v_token,
    'admin', jsonb_build_object(
      'id', v_admin.id,
      'username', v_admin.username,
      'full_name', v_admin.full_name
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_verify_session(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_id UUID;
  v_admin RECORD;
BEGIN
  v_admin_id := public.assert_admin_session(p_token);

  SELECT id, username, full_name
  INTO v_admin
  FROM public.eosis_admins
  WHERE id = v_admin_id;

  RETURN jsonb_build_object(
    'id', v_admin.id,
    'username', v_admin.username,
    'full_name', v_admin.full_name
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_logout(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM public.eosis_admin_sessions WHERE token = p_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.student_login(p_nisn TEXT, p_birth_date DATE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student RECORD;
  v_token TEXT;
BEGIN
  SELECT s.id, s.nisn, s.full_name, s.birth_date, s.class_id, c.name AS class_name, s.has_voted, s.voted_at
  INTO v_student
  FROM public.eosis_students s
  JOIN public.eosis_classes c ON c.id = s.class_id
  WHERE trim(s.nisn) = trim(p_nisn) AND s.birth_date = p_birth_date;

  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'NISN atau tanggal lahir tidak cocok dengan data pemilih.' USING ERRCODE = 'P0001';
  END IF;

  DELETE FROM public.eosis_student_sessions WHERE expires_at <= NOW();

  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.eosis_student_sessions (token, student_id, expires_at)
  VALUES (v_token, v_student.id, NOW() + INTERVAL '2 hours');

  RETURN jsonb_build_object(
    'token', v_token,
    'student', jsonb_build_object(
      'id', v_student.id,
      'nisn', v_student.nisn,
      'full_name', v_student.full_name,
      'birth_date', v_student.birth_date,
      'class_id', v_student.class_id,
      'class_name', v_student.class_name,
      'has_voted', v_student.has_voted,
      'voted_at', v_student.voted_at
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.student_get_profile(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student_id UUID;
  v_student RECORD;
BEGIN
  v_student_id := public.assert_student_session(p_token);

  SELECT s.id, s.nisn, s.full_name, s.birth_date, s.class_id, c.name AS class_name, s.has_voted, s.voted_at
  INTO v_student
  FROM public.eosis_students s
  JOIN public.eosis_classes c ON c.id = s.class_id
  WHERE s.id = v_student_id;

  RETURN jsonb_build_object(
    'id', v_student.id,
    'nisn', v_student.nisn,
    'full_name', v_student.full_name,
    'birth_date', v_student.birth_date,
    'class_id', v_student.class_id,
    'class_name', v_student.class_name,
    'has_voted', v_student.has_voted,
    'voted_at', v_student.voted_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.student_logout(p_token TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  DELETE FROM public.eosis_student_sessions WHERE token = p_token;
END;
$$;

-- ============================================================================
-- RPC VOTING AMAN & ATOMIK (1 NISN = 1 SUARA, SECRET BALLOT)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cast_student_vote(p_student_token TEXT, p_candidate_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student_id UUID;
  v_has_voted BOOLEAN;
  v_is_open BOOLEAN;
  v_candidate_exists BOOLEAN;
  v_salt TEXT;
  v_nullifier TEXT;
  v_voted_at TIMESTAMPTZ;
BEGIN
  v_student_id := public.assert_student_session(p_student_token);

  SELECT is_voting_open INTO v_is_open FROM public.eosis_settings WHERE id = 1;
  IF COALESCE(v_is_open, FALSE) = FALSE THEN
    RAISE EXCEPTION 'Pemungutan suara sedang ditutup oleh panitia.' USING ERRCODE = 'P0001';
  END IF;

  -- Kunci baris siswa untuk mencegah race condition / double submit
  SELECT has_voted INTO v_has_voted
  FROM public.eosis_students
  WHERE id = v_student_id
  FOR UPDATE;

  IF v_has_voted IS NULL THEN
    RAISE EXCEPTION 'Data siswa tidak ditemukan.' USING ERRCODE = 'P0001';
  END IF;

  IF v_has_voted THEN
    RAISE EXCEPTION 'Anda sudah memberikan suara dan tidak dapat melakukan pemilihan kembali.' USING ERRCODE = 'P0001';
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.eosis_candidates WHERE id = p_candidate_id) INTO v_candidate_exists;
  IF NOT v_candidate_exists THEN
    RAISE EXCEPTION 'Pasangan calon kandidat tidak ditemukan.' USING ERRCODE = 'P0001';
  END IF;

  SELECT ballot_salt INTO v_salt FROM public.eosis_internal_secrets WHERE id = 1;
  v_nullifier := encode(digest(v_student_id::text || ':' || v_salt, 'sha256'), 'hex');

  -- Simpan surat suara anonim (tanpa identitas siswa)
  INSERT INTO public.eosis_votes (candidate_id, voter_nullifier)
  VALUES (p_candidate_id, v_nullifier);

  -- Tandai status memilih pada siswa
  v_voted_at := NOW();
  UPDATE public.eosis_students
  SET has_voted = TRUE, voted_at = v_voted_at, updated_at = NOW()
  WHERE id = v_student_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'voted_at', v_voted_at
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Suara untuk NISN ini sudah tercatat di kotak suara.' USING ERRCODE = 'P0001';
END;
$$;

-- ============================================================================
-- RPC ADMIN: BERANDA, CRUD KELAS, SISWA, KANDIDAT, PEROLEHAN SUARA, PENGATURAN
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_get_dashboard_stats(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_total_students INTEGER;
  v_total_classes INTEGER;
  v_total_candidates INTEGER;
  v_voted_count INTEGER;
  v_not_voted_count INTEGER;
  v_participation NUMERIC;
  v_class_stats JSONB;
BEGIN
  PERFORM public.assert_admin_session(p_token);

  SELECT COUNT(*)::INTEGER,
         COUNT(*) FILTER (WHERE has_voted)::INTEGER,
         COUNT(*) FILTER (WHERE NOT has_voted)::INTEGER
  INTO v_total_students, v_voted_count, v_not_voted_count
  FROM public.eosis_students;

  SELECT COUNT(*)::INTEGER INTO v_total_classes FROM public.eosis_classes;
  SELECT COUNT(*)::INTEGER INTO v_total_candidates FROM public.eosis_candidates;

  IF v_total_students > 0 THEN
    v_participation := ROUND((v_voted_count::NUMERIC / v_total_students::NUMERIC) * 100, 1);
  ELSE
    v_participation := 0;
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_class_stats
  FROM (
    SELECT
      c.id,
      c.name,
      c.grade_level,
      COUNT(s.id)::INTEGER AS total_students,
      COUNT(s.id) FILTER (WHERE s.has_voted)::INTEGER AS voted_count,
      COUNT(s.id) FILTER (WHERE NOT s.has_voted)::INTEGER AS not_voted_count
    FROM public.eosis_classes c
    LEFT JOIN public.eosis_students s ON s.class_id = c.id
    GROUP BY c.id, c.name, c.grade_level
    ORDER BY c.grade_level ASC, c.name ASC
  ) t;

  RETURN jsonb_build_object(
    'total_students', v_total_students,
    'total_classes', v_total_classes,
    'total_candidates', v_total_candidates,
    'voted_count', v_voted_count,
    'not_voted_count', v_not_voted_count,
    'participation_percentage', v_participation,
    'class_breakdown', v_class_stats
  );
END;
$$;

-- CRUD Kelas
CREATE OR REPLACE FUNCTION public.admin_list_classes(p_token TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  grade_level TEXT,
  student_count BIGINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.assert_admin_session(p_token);

  RETURN QUERY
  SELECT c.id, c.name, c.grade_level, COUNT(s.id) AS student_count, c.created_at
  FROM public.eosis_classes c
  LEFT JOIN public.eosis_students s ON s.class_id = c.id
  GROUP BY c.id, c.name, c.grade_level, c.created_at
  ORDER BY c.grade_level ASC, c.name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_class(p_token TEXT, p_id UUID, p_name TEXT, p_grade_level TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.assert_admin_session(p_token);

  IF p_id IS NULL THEN
    INSERT INTO public.eosis_classes (name, grade_level)
    VALUES (trim(p_name), trim(p_grade_level))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.eosis_classes
    SET name = trim(p_name), grade_level = trim(p_grade_level)
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_class(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.assert_admin_session(p_token);
  DELETE FROM public.eosis_classes WHERE id = p_id;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Kelas tidak dapat dihapus karena masih memiliki data siswa.' USING ERRCODE = 'P0001';
END;
$$;

-- CRUD Siswa (Admin hanya melihat status has_voted, BUKAN kandidat pilihannya)
CREATE OR REPLACE FUNCTION public.admin_list_students(p_token TEXT)
RETURNS TABLE (
  id UUID,
  nisn TEXT,
  full_name TEXT,
  birth_date DATE,
  class_id UUID,
  class_name TEXT,
  has_voted BOOLEAN,
  voted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.assert_admin_session(p_token);

  RETURN QUERY
  SELECT s.id, s.nisn, s.full_name, s.birth_date, s.class_id, c.name AS class_name, s.has_voted, s.voted_at, s.created_at
  FROM public.eosis_students s
  JOIN public.eosis_classes c ON c.id = s.class_id
  ORDER BY c.name ASC, s.full_name ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_student(
  p_token TEXT,
  p_id UUID,
  p_nisn TEXT,
  p_full_name TEXT,
  p_birth_date DATE,
  p_class_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.assert_admin_session(p_token);

  IF p_id IS NULL THEN
    INSERT INTO public.eosis_students (nisn, full_name, birth_date, class_id)
    VALUES (trim(p_nisn), trim(p_full_name), p_birth_date, p_class_id)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.eosis_students
    SET nisn = trim(p_nisn),
        full_name = trim(p_full_name),
        birth_date = p_birth_date,
        class_id = p_class_id,
        updated_at = NOW()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_student(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.assert_admin_session(p_token);
  DELETE FROM public.eosis_students WHERE id = p_id;
END;
$$;

-- CRUD Calon Kandidat
CREATE OR REPLACE FUNCTION public.admin_list_candidates(p_token TEXT)
RETURNS TABLE (
  id UUID,
  order_number INTEGER,
  photo_url TEXT,
  chairperson_name TEXT,
  vice_chairperson_name TEXT,
  vision TEXT,
  mission TEXT,
  slogan TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.assert_admin_session(p_token);

  RETURN QUERY
  SELECT c.id, c.order_number, c.photo_url, c.chairperson_name, c.vice_chairperson_name, c.vision, c.mission, c.slogan, c.created_at
  FROM public.eosis_candidates c
  ORDER BY c.order_number ASC;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_upsert_candidate(
  p_token TEXT,
  p_id UUID,
  p_order_number INTEGER,
  p_photo_url TEXT,
  p_chairperson_name TEXT,
  p_vice_chairperson_name TEXT,
  p_vision TEXT,
  p_mission TEXT,
  p_slogan TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  PERFORM public.assert_admin_session(p_token);

  IF p_id IS NULL THEN
    INSERT INTO public.eosis_candidates (
      order_number, photo_url, chairperson_name, vice_chairperson_name, vision, mission, slogan
    )
    VALUES (
      p_order_number, NULLIF(trim(COALESCE(p_photo_url, '')), ''), trim(p_chairperson_name),
      trim(p_vice_chairperson_name), trim(p_vision), trim(p_mission), trim(p_slogan)
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.eosis_candidates
    SET order_number = p_order_number,
        photo_url = NULLIF(trim(COALESCE(p_photo_url, '')), ''),
        chairperson_name = trim(p_chairperson_name),
        vice_chairperson_name = trim(p_vice_chairperson_name),
        vision = trim(p_vision),
        mission = trim(p_mission),
        slogan = trim(p_slogan),
        updated_at = NOW()
    WHERE id = p_id
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_candidate(p_token TEXT, p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.assert_admin_session(p_token);
  DELETE FROM public.eosis_candidates WHERE id = p_id;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Kandidat tidak dapat dihapus karena sudah memiliki perolehan suara.' USING ERRCODE = 'P0001';
END;
$$;

-- Perolehan Suara (Agregat Anonim, TANPA identitas siswa)
CREATE OR REPLACE FUNCTION public.admin_get_vote_results(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_total_votes INTEGER;
  v_total_students INTEGER;
  v_voted_students INTEGER;
  v_candidates JSONB;
BEGIN
  PERFORM public.assert_admin_session(p_token);

  SELECT COUNT(*)::INTEGER INTO v_total_votes FROM public.eosis_votes;
  SELECT COUNT(*)::INTEGER, COUNT(*) FILTER (WHERE has_voted)::INTEGER
  INTO v_total_students, v_voted_students
  FROM public.eosis_students;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  INTO v_candidates
  FROM (
    SELECT
      c.id,
      c.order_number,
      c.photo_url,
      c.chairperson_name,
      c.vice_chairperson_name,
      c.slogan,
      COUNT(v.id)::INTEGER AS vote_count,
      CASE
        WHEN v_total_votes > 0 THEN ROUND((COUNT(v.id)::NUMERIC / v_total_votes::NUMERIC) * 100, 1)
        ELSE 0
      END AS percentage
    FROM public.eosis_candidates c
    LEFT JOIN public.eosis_votes v ON v.candidate_id = c.id
    GROUP BY c.id, c.order_number, c.photo_url, c.chairperson_name, c.vice_chairperson_name, c.slogan
    ORDER BY c.order_number ASC
  ) t;

  RETURN jsonb_build_object(
    'total_votes', v_total_votes,
    'total_students', v_total_students,
    'voted_students', v_voted_students,
    'candidates', v_candidates
  );
END;
$$;

-- Pengaturan Sekolah & Akun Admin
CREATE OR REPLACE FUNCTION public.admin_update_settings(
  p_token TEXT,
  p_school_name TEXT,
  p_school_logo_url TEXT,
  p_election_period TEXT,
  p_election_title TEXT,
  p_is_voting_open BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  PERFORM public.assert_admin_session(p_token);

  UPDATE public.eosis_settings
  SET school_name = trim(p_school_name),
      school_logo_url = NULLIF(trim(COALESCE(p_school_logo_url, '')), ''),
      election_period = trim(p_election_period),
      election_title = trim(p_election_title),
      is_voting_open = p_is_voting_open,
      updated_at = NOW()
  WHERE id = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_credentials(
  p_token TEXT,
  p_current_password TEXT,
  p_new_username TEXT,
  p_new_password TEXT,
  p_full_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin_id UUID;
  v_admin RECORD;
BEGIN
  v_admin_id := public.assert_admin_session(p_token);

  SELECT id, username, password_hash, full_name
  INTO v_admin
  FROM public.eosis_admins
  WHERE id = v_admin_id;

  IF v_admin.password_hash <> crypt(p_current_password, v_admin.password_hash) THEN
    RAISE EXCEPTION 'Password saat ini tidak sesuai.' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.eosis_admins
  SET username = COALESCE(NULLIF(trim(p_new_username), ''), v_admin.username),
      full_name = COALESCE(NULLIF(trim(p_full_name), ''), v_admin.full_name),
      password_hash = CASE
        WHEN p_new_password IS NOT NULL AND length(trim(p_new_password)) >= 6
          THEN crypt(p_new_password, gen_salt('bf', 10))
        ELSE v_admin.password_hash
      END,
      updated_at = NOW()
  WHERE id = v_admin_id
  RETURNING id, username, full_name INTO v_admin;

  RETURN jsonb_build_object(
    'id', v_admin.id,
    'username', v_admin.username,
    'full_name', v_admin.full_name
  );
END;
$$;

-- Berikan izin eksekusi RPC ke anon & authenticated
GRANT EXECUTE ON FUNCTION public.get_school_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_candidates_public() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_login(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_session(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_logout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_login(TEXT, DATE) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_get_profile(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.student_logout(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cast_student_vote(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_dashboard_stats(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_classes(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_class(TEXT, UUID, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_class(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_students(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_student(TEXT, UUID, TEXT, TEXT, DATE, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_student(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_candidates(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_candidate(TEXT, UUID, INTEGER, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_candidate(TEXT, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_vote_results(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_settings(TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_credentials(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ============================================================================
-- SUPABASE STORAGE: BUCKET & POLICY UNTUK LOGO SEKOLAH & FOTO KANDIDAT
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'eosis-assets',
  'eosis-assets',
  true,
  2097152,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

DROP POLICY IF EXISTS "Public read eosis-assets" ON storage.objects;
CREATE POLICY "Public read eosis-assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'eosis-assets');

DROP POLICY IF EXISTS "Upload eosis-assets branding and candidates" ON storage.objects;
CREATE POLICY "Upload eosis-assets branding and candidates"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'eosis-assets'
    AND (storage.foldername(name))[1] IN ('branding', 'candidates')
  );

DROP POLICY IF EXISTS "Update eosis-assets branding and candidates" ON storage.objects;
CREATE POLICY "Update eosis-assets branding and candidates"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (
    bucket_id = 'eosis-assets'
    AND (storage.foldername(name))[1] IN ('branding', 'candidates')
  );

DROP POLICY IF EXISTS "Delete eosis-assets branding and candidates" ON storage.objects;
CREATE POLICY "Delete eosis-assets branding and candidates"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (
    bucket_id = 'eosis-assets'
    AND (storage.foldername(name))[1] IN ('branding', 'candidates')
  );

-- ============================================================================
-- DATA AWAL (SEED)
-- ============================================================================

INSERT INTO public.eosis_settings (id, school_name, school_logo_url, election_period, election_title, is_voting_open)
VALUES (1, 'SMA Negeri Nusantara', NULL, '2026 / 2027', 'Pemilihan Ketua & Wakil Ketua OSIS', TRUE)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.eosis_internal_secrets (id, ballot_salt)
VALUES (1, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- Akun admin default: username "admin" | password "admin123" (segera ubah di menu Pengaturan)
INSERT INTO public.eosis_admins (username, password_hash, full_name)
VALUES ('admin', crypt('admin123', gen_salt('bf', 10)), 'Ketua Panitia Pemilihan OSIS')
ON CONFLICT (username) DO NOTHING;

-- Contoh kelas awal
INSERT INTO public.eosis_classes (name, grade_level) VALUES
  ('X IPA 1', 'X'),
  ('X IPA 2', 'X'),
  ('XI IPA 1', 'XI'),
  ('XI IPS 1', 'XI'),
  ('XII IPA 1', 'XII')
ON CONFLICT (name) DO NOTHING;

-- Contoh data siswa awal untuk pengujian login siswa (NISN + Tanggal Lahir)
INSERT INTO public.eosis_students (nisn, full_name, birth_date, class_id)
SELECT v.nisn, v.full_name, v.birth_date::DATE, c.id
FROM (VALUES
  ('0081234561', 'Rafi Pratama Putra', '2009-04-12', 'X IPA 1'),
  ('0081234562', 'Nadia Kusuma Wardani', '2009-08-23', 'X IPA 1'),
  ('0081234563', 'Bagas Aditya Saputra', '2009-01-19', 'X IPA 2'),
  ('0071234564', 'Aulia Zahra Permata', '2008-11-05', 'XI IPA 1'),
  ('0071234565', 'Dimas Fajar Nugroho', '2008-06-30', 'XI IPS 1'),
  ('0061234566', 'Siti Rahmawati Putri', '2007-09-14', 'XII IPA 1')
) AS v(nisn, full_name, birth_date, class_name)
JOIN public.eosis_classes c ON c.name = v.class_name
ON CONFLICT (nisn) DO NOTHING;

-- Contoh 3 pasangan kandidat awal
INSERT INTO public.eosis_candidates (order_number, photo_url, chairperson_name, vice_chairperson_name, vision, mission, slogan)
VALUES
  (
    1,
    '/src/assets/images/candidate_pair_one_1794926105432.jpg',
    'Raka Mahendra',
    'Clarissa Putri Wijaya',
    'Mewujudkan OSIS yang inklusif, inovatif, dan berorientasi pada prestasi akademik maupun non-akademik seluruh siswa.',
    E'1. Mengoptimalkan program ekstrakurikuler berbasis minat dan bakat.\n2. Membangun kanal aspirasi siswa yang transparan dan responsif.\n3. Mengadakan festival literasi, sains, dan seni tahunan sekolah.',
    'Sinergi Muda, Prestasi Nyata!'
  ),
  (
    2,
    '/src/assets/images/candidate_pair_two_1794926106302.jpg',
    'Farah Nabila Azzahra',
    'Kevin Anggara Pratama',
    'Menjadikan OSIS sebagai motor penggerak karakter disiplin, kepedulian sosial, dan transformasi digital lingkungan sekolah.',
    E'1. Digitalisasi informasi kegiatan dan kalender acara sekolah.\n2. Menggerakkan program sekolah hijau dan bank sampah siswa.\n3. Memperkuat solidaritas antarangkatan melalui aksi sosial rutin.',
    'Bersama Berkarya, Sekolah Berdaya!'
  ),
  (
    3,
    '/src/assets/images/candidate_pair_three_1794926106950.jpg',
    'Yasmine Pramudita',
    'Reza Fadhil Ramadhan',
    'Menciptakan ekosistem organisasi siswa yang kreatif, kolaboratif, dan menjunjung tinggi nilai integritas.',
    E'1. Membuka ruang kolaborasi antar-ekstrakurikuler dan komunitas belajar.\n2. Menyelenggarakan pelatihan kepemimpinan dan kewirausahaan muda.\n3. Meningkatkan tata kelola anggaran OSIS yang terbuka dan akuntabel.',
    'Kreatif, Kolaboratif, Berintegritas!'
  )
ON CONFLICT (order_number) DO NOTHING;
