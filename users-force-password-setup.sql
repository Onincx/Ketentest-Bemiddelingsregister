-- ============================================================
-- VERPLICHTE WACHTWOORDWIJZIGING BIJ EERSTE LOGIN
-- Plak dit in: Supabase Dashboard → SQL Editor → Run
--
-- Voegt een vlag toe aan 'users' waarmee wordt bijgehouden of een
-- gebruiker nog met een door de beheerder ingesteld tijdelijk
-- wachtwoord inlogt. Zolang deze vlag aan staat, wordt de gebruiker
-- bij elke pagina automatisch doorgestuurd naar het scherm om een
-- eigen wachtwoord te kiezen (invite.html), voordat men verder kan.
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
