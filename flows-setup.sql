-- ============================================================
-- FLOWS: elk startkaartje krijgt een eigen canvas
-- Plak dit in: Supabase Dashboard → SQL Editor → Run
--
-- Vereist dat de tabellen 'flow_nodes' en 'flow_edges' al bestaan
-- (die zijn buiten de repo-scripts om aangemaakt bij een eerdere
-- sessie, samen met 'ketentests'). Dit script raakt niets aan wat
-- al bestaat: het voegt alleen een nieuwe tabel + twee kolommen toe.
--
-- De daadwerkelijke opsplitsing van bestaande kaartjes/verbindingen
-- in aparte flows gebeurt automatisch in de app (flow.html) zodra
-- een beheerder de Flow-pagina opent voor een ketentest — dat hoeft
-- dus niet via SQL.
-- ============================================================

CREATE TABLE IF NOT EXISTS flows (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ketentest_id  uuid NOT NULL REFERENCES ketentests(id) ON DELETE CASCADE,
  name          text NOT NULL,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Ingelogde gebruikers zien alle flows" ON flows;
CREATE POLICY "Ingelogde gebruikers zien alle flows"
  ON flows FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin mag flows beheren" ON flows;
CREATE POLICY "Admin mag flows beheren"
  ON flows FOR ALL TO authenticated USING (is_admin());

-- Elk kaartje en elke verbinding hoort voortaan bij precies één flow
-- (canvas). Bestaande rijen krijgen tijdelijk flow_id = NULL; de app
-- vult dit automatisch in bij het eerste bezoek aan de Flow-pagina.
ALTER TABLE flow_nodes ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES flows(id) ON DELETE CASCADE;
ALTER TABLE flow_edges ADD COLUMN IF NOT EXISTS flow_id uuid REFERENCES flows(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_flow_nodes_flow_id ON flow_nodes(flow_id);
CREATE INDEX IF NOT EXISTS idx_flow_edges_flow_id ON flow_edges(flow_id);
