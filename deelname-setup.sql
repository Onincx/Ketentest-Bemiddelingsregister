-- ============================================================
-- DEELNAME AAN TESTSCENARIO'S — DATABASE UITBREIDING
-- Plak dit script in: Supabase Dashboard → SQL Editor → Run
-- (Vereist dat supabase-setup.sql al eerder is uitgevoerd,
--  want dit script bouwt voort op de tabellen 'scenarios',
--  'organisations' en de functie 'my_organisation_id()'.)
-- ============================================================

-- Per testscenario geeft elke betrokken organisatie aan of ze
-- het scenario wel of niet gaan testen. Bij "niet testen" is
-- een reden verplicht.
CREATE TABLE IF NOT EXISTS scenario_participation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id     uuid NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  wants_to_test   boolean NOT NULL,
  reason          text,
  decided_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (scenario_id, organisation_id),
  CONSTRAINT reason_verplicht_bij_afwijzen CHECK (
    wants_to_test = true OR (reason IS NOT NULL AND length(trim(reason)) > 0)
  )
);

ALTER TABLE scenario_participation ENABLE ROW LEVEL SECURITY;

-- Iedereen die is ingelogd mag alle keuzes zien (nodig voor het
-- gezamenlijke overzicht "iedereen wil / niemand wil / verdeeld").
CREATE POLICY "Ingelogde gebruikers zien alle deelname-keuzes"
  ON scenario_participation FOR SELECT TO authenticated USING (true);

-- Elke gebruiker mag de keuze van de EIGEN organisatie aanmaken.
CREATE POLICY "Gebruiker mag keuze eigen organisatie aanmaken"
  ON scenario_participation FOR INSERT TO authenticated
  WITH CHECK (organisation_id = my_organisation_id() OR is_admin());

-- Elke gebruiker mag de keuze van de EIGEN organisatie bijwerken
-- (altijd wijzigbaar, ook nadat er al een keuze is opgeslagen).
CREATE POLICY "Gebruiker mag keuze eigen organisatie bijwerken"
  ON scenario_participation FOR UPDATE TO authenticated
  USING (organisation_id = my_organisation_id() OR is_admin());

-- Admins mogen daarnaast alles beheren (bijv. namens een organisatie
-- corrigeren, of verwijderen).
CREATE POLICY "Admin mag alle deelname-keuzes beheren"
  ON scenario_participation FOR ALL TO authenticated USING (is_admin());

-- updated_at automatisch bijwerken
CREATE OR REPLACE FUNCTION touch_scenario_participation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_scenario_participation ON scenario_participation;
CREATE TRIGGER trg_touch_scenario_participation
BEFORE UPDATE ON scenario_participation
FOR EACH ROW EXECUTE FUNCTION touch_scenario_participation();
