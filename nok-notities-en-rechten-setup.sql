-- ============================================================
-- NOK-OPVOLGING: NOTITIES + RECHTEN OP ORGANISATIENIVEAU
-- Plak dit in: Supabase Dashboard → SQL Editor → Run
--
-- Vereist dat 'nok-opvolging-setup.sql' al is gedraaid.
--
-- Dit script doet twee dingen:
-- 1. Voegt een tabel 'nok_notities' toe: meerdere opmerkingen per NOK
--    (in plaats van het ene 'reden'-veld), zichtbaar voor iedereen,
--    maar alleen te muteren door de organisatie die als eigenaar van
--    de NOK is ingesteld (of een beheerder).
-- 2. Zorgt dat het wijzigen van de NOK-status of -eigenaar alleen kan
--    door de huidige eigenaar-organisatie (of een beheerder) — een
--    gebruiker van een andere organisatie kan alle NOK's wel lezen,
--    maar niet aanpassen.
-- ============================================================

-- 1. Notities-tabel
CREATE TABLE IF NOT EXISTS nok_notities (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_result_id  uuid NOT NULL REFERENCES activity_results(id) ON DELETE CASCADE,
  tekst               text NOT NULL,
  organisation_id     uuid REFERENCES organisations(id),
  created_by          uuid REFERENCES users(id),
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz
);

ALTER TABLE nok_notities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Iedereen mag NOK-notities lezen" ON nok_notities;
CREATE POLICY "Iedereen mag NOK-notities lezen"
  ON nok_notities FOR SELECT TO authenticated USING (true);

-- Alleen de eigenaar-organisatie van de bijbehorende NOK (of een
-- beheerder) mag notities aanmaken/bewerken/verwijderen.
DROP POLICY IF EXISTS "Eigenaar-organisatie mag NOK-notities aanmaken" ON nok_notities;
CREATE POLICY "Eigenaar-organisatie mag NOK-notities aanmaken"
  ON nok_notities FOR INSERT TO authenticated WITH CHECK (
    is_admin() OR organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Eigenaar-organisatie mag NOK-notities bijwerken" ON nok_notities;
CREATE POLICY "Eigenaar-organisatie mag NOK-notities bijwerken"
  ON nok_notities FOR UPDATE TO authenticated USING (
    is_admin() OR organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Eigenaar-organisatie mag NOK-notities verwijderen" ON nok_notities;
CREATE POLICY "Eigenaar-organisatie mag NOK-notities verwijderen"
  ON nok_notities FOR DELETE TO authenticated USING (
    is_admin() OR organisation_id IN (SELECT organisation_id FROM users WHERE id = auth.uid())
  );

-- 2. Alleen de huidige eigenaar-organisatie (of een beheerder) mag de
-- NOK-status of -eigenaar van een activiteitresultaat wijzigen.
CREATE OR REPLACE FUNCTION check_nok_mutatie_rechten()
RETURNS trigger AS $$
BEGIN
  -- Deze check geldt alleen voor het WIJZIGEN van een al bestaande
  -- eigenaar/status ZONDER dat het onderliggende resultaat verandert —
  -- dat is de "iemand past de NOK-opvolging handmatig aan"-situatie
  -- (bijv. via het beheerscherm). De natuurlijke hertest-actie (de
  -- acceptant zet de activiteit na een NOK weer op OK) verandert het
  -- resultaat wél, en blijft daarom altijd toegestaan voor wie sowieso
  -- al resultaten mag invullen — ongeacht welke organisatie eigenaar
  -- van de NOK is.
  IF NEW.result = OLD.result AND OLD.nok_owner_org_id IS NOT NULL AND (
    NEW.nok_status IS DISTINCT FROM OLD.nok_status
    OR NEW.nok_owner_org_id IS DISTINCT FROM OLD.nok_owner_org_id
  ) THEN
    IF NOT is_admin() AND OLD.nok_owner_org_id NOT IN (SELECT organisation_id FROM users WHERE id = auth.uid()) THEN
      RAISE EXCEPTION 'Alleen de eigenaar-organisatie van deze NOK (of een beheerder) mag de status of eigenaar wijzigen';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_check_nok_mutatie_rechten ON activity_results;
CREATE TRIGGER trg_check_nok_mutatie_rechten
  BEFORE UPDATE ON activity_results
  FOR EACH ROW EXECUTE FUNCTION check_nok_mutatie_rechten();
