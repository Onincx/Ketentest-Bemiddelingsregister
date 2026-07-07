-- ============================================================
-- FLOW-DEELNAME: organisaties accepteren nu een hele flow i.p.v.
-- een los scenario.
-- Plak dit in: Supabase Dashboard → SQL Editor → Run
--
-- Vereist dat de tabellen 'flows' en 'flow_nodes' al bestaan
-- (zie flows-setup.sql).
--
-- Dit vervangt het gebruik van 'scenario_participation' door een
-- nieuwe tabel 'flow_participation'. De oude tabel wordt NIET
-- verwijderd (voor het geval je de oude gegevens nog wilt
-- raadplegen), maar de Deelname-pagina gebruikt 'm niet meer.
-- ============================================================

CREATE TABLE IF NOT EXISTS flow_participation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id         uuid NOT NULL REFERENCES flows(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  wants_to_test   boolean NOT NULL,
  reason          text,
  decided_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (flow_id, organisation_id),
  CONSTRAINT reason_verplicht_bij_afwijzen CHECK (
    wants_to_test = true OR (reason IS NOT NULL AND length(trim(reason)) > 0)
  )
);

ALTER TABLE flow_participation ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ingelogde gebruikers zien alle flow-deelname" ON flow_participation;
CREATE POLICY "Ingelogde gebruikers zien alle flow-deelname"
  ON flow_participation FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Gebruiker mag keuze eigen organisatie aanmaken" ON flow_participation;
CREATE POLICY "Gebruiker mag keuze eigen organisatie aanmaken"
  ON flow_participation FOR INSERT TO authenticated
  WITH CHECK (organisation_id = my_organisation_id() OR is_admin());

DROP POLICY IF EXISTS "Gebruiker mag keuze eigen organisatie bijwerken" ON flow_participation;
CREATE POLICY "Gebruiker mag keuze eigen organisatie bijwerken"
  ON flow_participation FOR UPDATE TO authenticated
  USING (organisation_id = my_organisation_id() OR is_admin());

-- Nieuw: keuze ook weer kunnen verwijderen (terug naar "nog geen keuze")
DROP POLICY IF EXISTS "Gebruiker mag keuze eigen organisatie verwijderen" ON flow_participation;
CREATE POLICY "Gebruiker mag keuze eigen organisatie verwijderen"
  ON flow_participation FOR DELETE TO authenticated
  USING (organisation_id = my_organisation_id() OR is_admin());

DROP POLICY IF EXISTS "Admin mag alle flow-deelname beheren" ON flow_participation;
CREATE POLICY "Admin mag alle flow-deelname beheren"
  ON flow_participation FOR ALL TO authenticated USING (is_admin());

CREATE OR REPLACE FUNCTION touch_flow_participation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_flow_participation ON flow_participation;
CREATE TRIGGER trg_touch_flow_participation
BEFORE UPDATE ON flow_participation
FOR EACH ROW EXECUTE FUNCTION touch_flow_participation();
