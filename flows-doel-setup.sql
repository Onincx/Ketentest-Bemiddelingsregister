-- ============================================================
-- DOEL PER FLOW
-- Plak dit in: Supabase Dashboard → SQL Editor → Run
--
-- Voegt een optioneel tekstveld 'doel' toe aan de tabel 'flows',
-- waarin de beheerder kan omschrijven waar een flow voor dient.
-- Dit doel wordt (samen met de onderliggende scenario's) automatisch
-- getoond op de Deelname-pagina.
-- ============================================================

ALTER TABLE flows ADD COLUMN IF NOT EXISTS doel text;
