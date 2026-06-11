-- ============================================================
-- KETENTEST BEMIDDELINGSREGISTER — DATABASE SETUP
-- Plak dit script in: Supabase Dashboard → SQL Editor → Run
-- ============================================================

-- 1. ORGANISATIES
CREATE TABLE IF NOT EXISTS organisations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  code        text NOT NULL UNIQUE,
  created_at  timestamptz DEFAULT now()
);

-- 2. GEBRUIKERS (uitbreiding op Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text NOT NULL,
  name            text,
  organisation_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  role            text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  activated       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now()
);

-- 3. TESTSCENARIO'S
CREATE TABLE IF NOT EXISTS scenarios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,  -- bijv. TS-001
  title       text NOT NULL,
  description text,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

-- 4. ACTIVITEITEN (stappen binnen een scenario, per organisatie)
CREATE TABLE IF NOT EXISTS activities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id     uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  description     text NOT NULL,
  expected_result text,
  organisation_id uuid REFERENCES organisations(id) ON DELETE SET NULL,
  sort_order      int DEFAULT 1,
  created_at      timestamptz DEFAULT now()
);

-- 5. RESULTATEN (per gebruiker per activiteit)
CREATE TABLE IF NOT EXISTS activity_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  result      text NOT NULL DEFAULT 'open' CHECK (result IN ('open', 'ok', 'nok', 'skip')),
  notes       text DEFAULT '',
  updated_at  timestamptz DEFAULT now(),
  created_at  timestamptz DEFAULT now(),
  UNIQUE(activity_id, user_id)
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE organisations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios         ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_results  ENABLE ROW LEVEL SECURITY;

-- Helper functie: is de huidige gebruiker een admin?
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- Helper functie: organisatie van huidige gebruiker
CREATE OR REPLACE FUNCTION my_organisation_id()
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  SELECT organisation_id FROM users WHERE id = auth.uid();
$$;

-- ORGANISATIONS: iedereen leest, alleen admins schrijven
CREATE POLICY "Alle ingelogde gebruikers kunnen organisaties zien"
  ON organisations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Alleen admins mogen organisaties aanpassen"
  ON organisations FOR ALL TO authenticated USING (is_admin());

-- USERS: iedereen ziet alle profielen, zelf bewerken of admin
CREATE POLICY "Ingelogde gebruikers zien alle profielen"
  ON users FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gebruiker mag eigen profiel bijwerken"
  ON users FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Admin mag alle gebruikers beheren"
  ON users FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "Gebruiker mag zichzelf aanmaken"
  ON users FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- SCENARIOS: iedereen leest, alleen admins schrijven
CREATE POLICY "Alle gebruikers zien scenario's"
  ON scenarios FOR SELECT TO authenticated USING (true);
CREATE POLICY "Alleen admins mogen scenario's beheren"
  ON scenarios FOR ALL TO authenticated USING (is_admin());

-- ACTIVITIES: iedereen leest, alleen admins schrijven
CREATE POLICY "Alle gebruikers zien activiteiten"
  ON activities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Alleen admins mogen activiteiten beheren"
  ON activities FOR ALL TO authenticated USING (is_admin());

-- ACTIVITY_RESULTS:
-- Lezen: eigen resultaten, of resultaten van eigen organisatie, of admin
CREATE POLICY "Gebruiker ziet eigen resultaten"
  ON activity_results FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM activities a
      JOIN users u ON u.id = auth.uid()
      WHERE a.id = activity_id AND a.organisation_id = u.organisation_id
    )
  );

-- Schrijven: eigen resultaten aanmaken/bijwerken
CREATE POLICY "Gebruiker mag eigen resultaten aanmaken"
  ON activity_results FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Gebruiker mag eigen resultaten bijwerken"
  ON activity_results FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admin mag alle resultaten beheren"
  ON activity_results FOR ALL TO authenticated USING (is_admin());

-- ============================================================
-- TRIGGER: profiel aanmaken bij nieuwe auth gebruiker
-- ============================================================
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO users (id, email, activated)
  VALUES (NEW.id, NEW.email, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- TRIGGER: activated = true bij eerste login
-- ============================================================
CREATE OR REPLACE FUNCTION handle_user_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE users SET activated = true WHERE id = NEW.id AND activated = false;
  RETURN NEW;
END;
$$;

-- ============================================================
-- EERSTE ADMIN AANMAKEN
-- Voer dit uit NA het aanmaken van je account via de login pagina.
-- Vervang het e-mailadres door jouw eigen adres.
-- ============================================================

-- UPDATE users SET role = 'admin' WHERE email = 'JOUW_EMAIL@ADRES.NL';
