-- ============================================================
-- Getme — Profils enrichis, photos, confidentialité, signalements
-- À exécuter dans Supabase → SQL Editor
-- Safe to re-run (IF NOT EXISTS / additive alters)
-- ============================================================

-- ── 1) Colonnes profil ──────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age integer,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS photo_visibility text NOT NULL DEFAULT 'public',
  ADD COLUMN IF NOT EXISTS banned boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_age_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_age_check
  CHECK (age IS NULL OR (age >= 18 AND age <= 120));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_gender_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_gender_check
  CHECK (gender IS NULL OR gender IN ('femme', 'homme', 'autre'));

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_photo_visibility_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_photo_visibility_check
  CHECK (photo_visibility IN ('public', 'private', 'on_request'));

-- ── 2) Demandes d'accès aux photos (avant galerie — RLS) ────
CREATE TABLE IF NOT EXISTS public.photo_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id, requester_id)
);

CREATE INDEX IF NOT EXISTS photo_access_owner_idx
  ON public.photo_access_requests(owner_id);
CREATE INDEX IF NOT EXISTS photo_access_requester_idx
  ON public.photo_access_requests(requester_id);

ALTER TABLE public.photo_access_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_select_parties" ON public.photo_access_requests;
CREATE POLICY "access_select_parties" ON public.photo_access_requests
  FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR requester_id = auth.uid());

DROP POLICY IF EXISTS "access_insert_requester" ON public.photo_access_requests;
CREATE POLICY "access_insert_requester" ON public.photo_access_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = auth.uid() AND owner_id <> auth.uid());

DROP POLICY IF EXISTS "access_update_owner" ON public.photo_access_requests;
CREATE POLICY "access_update_owner" ON public.photo_access_requests
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ── 3) Galerie photos ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  public_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_photos_user_id_idx
  ON public.profile_photos(user_id);

ALTER TABLE public.profile_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "photos_select_visible" ON public.profile_photos;
CREATE POLICY "photos_select_visible" ON public.profile_photos
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_photos.user_id
        AND p.photo_visibility = 'public'
        AND coalesce(p.banned, false) = false
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.photo_access_requests r
        ON r.owner_id = p.id
       AND r.requester_id = auth.uid()
       AND r.status = 'approved'
      WHERE p.id = profile_photos.user_id
        AND p.photo_visibility = 'on_request'
        AND coalesce(p.banned, false) = false
    )
  );

DROP POLICY IF EXISTS "photos_insert_own" ON public.profile_photos;
CREATE POLICY "photos_insert_own" ON public.profile_photos
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "photos_update_own" ON public.profile_photos;
CREATE POLICY "photos_update_own" ON public.profile_photos
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "photos_delete_own" ON public.profile_photos;
CREATE POLICY "photos_delete_own" ON public.profile_photos
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- ── 4) Signalements ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reported_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status);

ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid());

DROP POLICY IF EXISTS "reports_select_own" ON public.reports;
CREATE POLICY "reports_select_own" ON public.reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- ── 5) Blocages (si RPC block_user s'appuie dessus) ─────────
CREATE TABLE IF NOT EXISTS public.blocks (
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

ALTER TABLE public.blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_all_own" ON public.blocks;
CREATE POLICY "blocks_all_own" ON public.blocks
  FOR ALL TO authenticated
  USING (blocker_id = auth.uid())
  WITH CHECK (blocker_id = auth.uid());

-- Drop ALL overloads of block_user (return type cannot be changed in place)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'block_user'
  LOOP
    EXECUTE 'DROP FUNCTION IF EXISTS ' || r.sig || ' CASCADE';
  END LOOP;
END
$$;

CREATE FUNCTION public.block_user(blocker uuid, blocked uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF blocker IS NULL OR blocked IS NULL OR blocker = blocked THEN
    RAISE EXCEPTION 'invalid block';
  END IF;
  IF blocker <> auth.uid() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  INSERT INTO public.blocks (blocker_id, blocked_id)
  VALUES (blocker, blocked)
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user(uuid, uuid) TO authenticated;

-- ── 6) Storage bucket (privé recommandé) ────────────────────
-- Créer aussi via Dashboard → Storage → New bucket :
--   name: profile-photos
--   public: false
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- Owner peut uploader / supprimer ses fichiers
DROP POLICY IF EXISTS "profile_photos_upload_own" ON storage.objects;
CREATE POLICY "profile_photos_upload_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_photos_update_own" ON storage.objects;
CREATE POLICY "profile_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "profile_photos_delete_own" ON storage.objects;
CREATE POLICY "profile_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lecture storage : propriétaire uniquement côté Storage.
-- Les autres passent par la Netlify function /api/photo-url (signed URL)
-- après contrôle photo_visibility + photo_access_requests.
DROP POLICY IF EXISTS "profile_photos_select_own" ON storage.objects;
CREATE POLICY "profile_photos_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Garder aussi le bucket avatars public pour la photo de profil principale
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
