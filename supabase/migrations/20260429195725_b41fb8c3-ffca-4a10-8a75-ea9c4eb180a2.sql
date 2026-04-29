
-- =========================================================
-- ENUMS
-- =========================================================
CREATE TYPE public.sleep_type AS ENUM ('day', 'night');
CREATE TYPE public.relation_type AS ENUM ('mother', 'father', 'other');
CREATE TYPE public.gender_type AS ENUM ('male', 'female', 'other');

-- =========================================================
-- PROFILES
-- =========================================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profiles viewable by authenticated users"
  ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- =========================================================
-- CHILDREN
-- =========================================================
CREATE TABLE public.children (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  birth_date DATE,
  photo_url TEXT,
  gender public.gender_type,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- CHILD_USERS (link table)
-- =========================================================
CREATE TABLE public.child_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relation_type public.relation_type NOT NULL DEFAULT 'other',
  custom_relation_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(child_id, user_id)
);
ALTER TABLE public.child_users ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_child_users_user ON public.child_users(user_id);
CREATE INDEX idx_child_users_child ON public.child_users(child_id);

-- Security definer to avoid recursive RLS
CREATE OR REPLACE FUNCTION public.user_has_child_access(_user_id UUID, _child_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.child_users
    WHERE user_id = _user_id AND child_id = _child_id
  );
$$;

-- Children policies
CREATE POLICY "Users see linked children"
  ON public.children FOR SELECT TO authenticated
  USING (public.user_has_child_access(auth.uid(), id));
CREATE POLICY "Authenticated users can create children"
  ON public.children FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Linked users update children"
  ON public.children FOR UPDATE TO authenticated
  USING (public.user_has_child_access(auth.uid(), id));
CREATE POLICY "Linked users delete children"
  ON public.children FOR DELETE TO authenticated
  USING (public.user_has_child_access(auth.uid(), id));

-- Child users policies
CREATE POLICY "See own child links and links of shared children"
  ON public.child_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Insert own link or to a shared child"
  ON public.child_users FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Update own link"
  ON public.child_users FOR UPDATE TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Delete own link"
  ON public.child_users FOR DELETE TO authenticated USING (user_id = auth.uid());

-- =========================================================
-- CHILD_SETTINGS
-- =========================================================
CREATE TABLE public.child_settings (
  child_id UUID PRIMARY KEY REFERENCES public.children(id) ON DELETE CASCADE,
  night_start_time TIME NOT NULL DEFAULT '19:00',
  night_end_time TIME NOT NULL DEFAULT '07:00',
  split_night_sleep_by_date BOOLEAN NOT NULL DEFAULT false,
  min_wake_window_minutes INT NOT NULL DEFAULT 90,
  max_wake_window_minutes INT NOT NULL DEFAULT 180,
  show_sleep_place BOOLEAN NOT NULL DEFAULT true,
  show_falling_asleep_method BOOLEAN NOT NULL DEFAULT true,
  show_interruptions BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.child_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Linked users see settings" ON public.child_settings FOR SELECT TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users insert settings" ON public.child_settings FOR INSERT TO authenticated
  WITH CHECK (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users update settings" ON public.child_settings FOR UPDATE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

-- =========================================================
-- SLEEP_PLACES
-- =========================================================
CREATE TABLE public.sleep_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sleep_places ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sleep_places_child ON public.sleep_places(child_id);
CREATE POLICY "Linked users see places" ON public.sleep_places FOR SELECT TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users insert places" ON public.sleep_places FOR INSERT TO authenticated
  WITH CHECK (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users update places" ON public.sleep_places FOR UPDATE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users delete places" ON public.sleep_places FOR DELETE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

-- =========================================================
-- SETTLING_METHODS
-- =========================================================
CREATE TABLE public.settling_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settling_methods ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_settling_methods_child ON public.settling_methods(child_id);
CREATE POLICY "Linked users see methods" ON public.settling_methods FOR SELECT TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users insert methods" ON public.settling_methods FOR INSERT TO authenticated
  WITH CHECK (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users update methods" ON public.settling_methods FOR UPDATE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users delete methods" ON public.settling_methods FOR DELETE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

-- =========================================================
-- SLEEP_SESSIONS
-- =========================================================
CREATE TABLE public.sleep_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id UUID NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  sleep_type public.sleep_type NOT NULL DEFAULT 'day',
  sleep_place_id UUID REFERENCES public.sleep_places(id) ON DELETE SET NULL,
  settling_method_id UUID REFERENCES public.settling_methods(id) ON DELETE SET NULL,
  comment TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  updated_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sleep_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_sleep_sessions_child_start ON public.sleep_sessions(child_id, start_time DESC);
CREATE POLICY "Linked users see sessions" ON public.sleep_sessions FOR SELECT TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users insert sessions" ON public.sleep_sessions FOR INSERT TO authenticated
  WITH CHECK (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users update sessions" ON public.sleep_sessions FOR UPDATE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));
CREATE POLICY "Linked users delete sessions" ON public.sleep_sessions FOR DELETE TO authenticated
  USING (public.user_has_child_access(auth.uid(), child_id));

-- =========================================================
-- SLEEP_INTERRUPTIONS
-- =========================================================
CREATE TABLE public.sleep_interruptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sleep_session_id UUID NOT NULL REFERENCES public.sleep_sessions(id) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  comment TEXT,
  created_by_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sleep_interruptions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_interruptions_session ON public.sleep_interruptions(sleep_session_id);

CREATE OR REPLACE FUNCTION public.user_has_session_access(_user_id UUID, _session_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.sleep_sessions s
    JOIN public.child_users cu ON cu.child_id = s.child_id
    WHERE s.id = _session_id AND cu.user_id = _user_id
  );
$$;

CREATE POLICY "Linked users see interruptions" ON public.sleep_interruptions FOR SELECT TO authenticated
  USING (public.user_has_session_access(auth.uid(), sleep_session_id));
CREATE POLICY "Linked users insert interruptions" ON public.sleep_interruptions FOR INSERT TO authenticated
  WITH CHECK (public.user_has_session_access(auth.uid(), sleep_session_id));
CREATE POLICY "Linked users update interruptions" ON public.sleep_interruptions FOR UPDATE TO authenticated
  USING (public.user_has_session_access(auth.uid(), sleep_session_id));
CREATE POLICY "Linked users delete interruptions" ON public.sleep_interruptions FOR DELETE TO authenticated
  USING (public.user_has_session_access(auth.uid(), sleep_session_id));

-- =========================================================
-- TRIGGERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_children_updated BEFORE UPDATE ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.child_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_sessions_updated BEFORE UPDATE ON public.sleep_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create defaults for a new child
CREATE OR REPLACE FUNCTION public.handle_new_child()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.child_settings (child_id) VALUES (NEW.id);
  INSERT INTO public.sleep_places (child_id, name) VALUES
    (NEW.id, 'Crib'), (NEW.id, 'Bed'), (NEW.id, 'Stroller'), (NEW.id, 'Car');
  INSERT INTO public.settling_methods (child_id, name) VALUES
    (NEW.id, 'Rocking'), (NEW.id, 'Nursing'), (NEW.id, 'Independent'), (NEW.id, 'Walking');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_child_created
  AFTER INSERT ON public.children
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_child();
