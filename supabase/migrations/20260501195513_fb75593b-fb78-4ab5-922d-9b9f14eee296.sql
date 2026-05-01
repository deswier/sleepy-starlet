
-- 1) Profile language
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS language text;

-- 2) Storage buckets (public read; user-folder-scoped writes)
INSERT INTO storage.buckets (id, name, public) VALUES ('child-photos', 'child-photos', true)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true)
  ON CONFLICT (id) DO NOTHING;

-- Public read access
DO $$ BEGIN
  CREATE POLICY "Public read child-photos" ON storage.objects FOR SELECT USING (bucket_id = 'child-photos');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Public read avatars" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Authenticated users may write within their own folder (first path segment = their auth.uid())
DO $$ BEGIN
  CREATE POLICY "Users upload own child-photos" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'child-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own child-photos" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'child-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users delete own child-photos" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'child-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users upload own avatar" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users update own avatar" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY "Users delete own avatar" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Overlap helper for sleep sessions
CREATE OR REPLACE FUNCTION public.sleep_overlaps(
  _child_id uuid,
  _start timestamptz,
  _end timestamptz,
  _exclude_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sleep_sessions
    WHERE child_id = _child_id
      AND (_exclude_id IS NULL OR id <> _exclude_id)
      AND _start < COALESCE(end_time, now())
      AND _end   > start_time
  );
$$;
