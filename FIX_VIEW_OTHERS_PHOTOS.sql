-- ============================================================
-- Voir les photos des autres (Public / Sur demande approuvé)
-- Supabase → SQL Editor → Run
-- ============================================================

-- Storage: lecture si propriétaire OU profil public OU accès approuvé
DROP POLICY IF EXISTS "profile_photos_select_own" ON storage.objects;
DROP POLICY IF EXISTS "profile_photos_select_visible" ON storage.objects;

CREATE POLICY "profile_photos_select_visible" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      -- Own files
      (storage.foldername(name))[1] = auth.uid()::text
      -- Public profiles
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.photo_visibility = 'public'
          AND coalesce(p.banned, false) = false
      )
      -- On-request + approved
      OR EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.photo_access_requests r
          ON r.owner_id = p.id
         AND r.requester_id = auth.uid()
         AND r.status = 'approved'
        WHERE p.id::text = (storage.foldername(name))[1]
          AND p.photo_visibility = 'on_request'
          AND coalesce(p.banned, false) = false
      )
    )
  );
