// ============================================================
// SUPABASE CONFIGURATIE
// Vervang onderstaande waarden met jouw eigen Supabase project.
// Je vindt deze in: Supabase Dashboard → Project Settings → API
// ============================================================

const SUPABASE_URL = 'https://hhrfrawgrsxrmgxzfewd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhocmZyYXdncnN4cm1neHpmZXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTU4OTUsImV4cCI6MjA5NjY5MTg5NX0.ANwuNwfQGUO4BjdQ3OXWYfz04m_QvmnhB44wy1g8yfg';

// Initialiseer de Supabase client
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Hulpfuncties
async function getCurrentUser() {
  const { data: { user } } = await sb.auth.getUser();
  return user;
}

async function getUserProfile(userId) {
  const { data } = await sb.from('users').select('*, organisations(name)').eq('id', userId).single();
  return data;
}

async function isAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  const profile = await getUserProfile(user.id);
  return profile?.role === 'admin';
}

async function requireAuth(redirectTo = 'index.html') {
  const user = await getCurrentUser();
  if (!user) { window.location.href = redirectTo; return null; }
  const profile = await getUserProfile(user.id);
  if (profile?.must_change_password) { window.location.href = 'invite.html'; return null; }
  return user;
}

async function requireAdmin() {
  const user = await requireAuth();
  if (!user) return null;
  const admin = await isAdmin();
  if (!admin) { window.location.href = 'app.html'; return null; }
  return user;
}

function showAlert(msg, type = 'error', containerId = 'alert') {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = msg;
  el.style.display = 'block';
  if (type === 'success') setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function hideAlert(containerId = 'alert') {
  const el = document.getElementById(containerId);
  if (el) el.style.display = 'none';
}

// ============================================================
// KETENTEST SELECTIE
// Beheert welke ketentest actief is, gedeeld over alle pagina's.
// De keuze zelf gebeurt op het inlogscherm (index.html); hier wordt
// alleen bijgehouden/gevalideerd welke ketentest actief is en welke
// ketentesten de huidige gebruiker mag zien.
// ============================================================

const KETENTEST_STORAGE_KEY = 'actieve_ketentest_id';

function getActiveKetentestId() {
  return localStorage.getItem(KETENTEST_STORAGE_KEY) || null;
}

function setActiveKetentestId(id) {
  localStorage.setItem(KETENTEST_STORAGE_KEY, id);
}

async function loadAllKetentests() {
  const { data } = await sb.from('ketentests').select('*').order('naam');
  return data || [];
}

// Geeft de ketentesten terug die de huidige gebruiker mag zien: alleen
// de ketentesten waarvoor expliciet toegang is verleend
// (user_ketentest_access) — dit geldt sinds kort ook voor beheerders,
// die niet langer automatisch overal toegang toe hebben. Altijd
// alfabetisch gesorteerd op naam.
async function getAccessibleKetentests() {
  const user = await getCurrentUser();
  if (!user) return [];

  const { data } = await sb.from('user_ketentest_access').select('ketentest_id, ketentests(*)').eq('user_id', user.id);
  const list = (data || []).map(r => r.ketentests).filter(Boolean);
  list.sort((a, b) => (a.naam || '').localeCompare(b.naam || '', 'nl'));
  return list;
}

// Zorgt dat er altijd een geldige, toegestane actieve ketentest is.
// Als de opgeslagen id niet meer bestaat of niet (meer) toegestaan is,
// valt terug op de eerste beschikbare (alfabetisch). Geeft het volledige
// ketentests-object terug, of null als de gebruiker geen enkele
// ketentest mag zien.
async function ensureActiveKetentest() {
  const all = await getAccessibleKetentests();
  if (!all.length) return null;

  let activeId = getActiveKetentestId();
  let active = all.find(k => k.id === activeId);

  if (!active) {
    active = all[0];
    setActiveKetentestId(active.id);
  }

  return { active, all };
}

// Toont de naam van de actieve ketentest in de navigatiebalk, met een
// link om terug te gaan naar het keuzescherm (index.html) om te
// wisselen. Verwacht een element met id="ketentestSwitcher".
// Toont de naam van de actieve ketentest als niet-klikbaar label in de
// navigatiebalk. Verwacht een element met id="ketentestLabel".
async function renderActiveKetentestLabel() {
  const el = document.getElementById('ketentestLabel');
  const result = await ensureActiveKetentest();

  if (!result) {
    if (el) el.style.display = 'none';
    return null;
  }

  if (el) {
    el.textContent = result.active.naam;
    el.style.display = '';
  }

  // Toon "Notificaties" bij een Netwerkmodel-ketentest, "Berichten" bij
  // een Estafettemodel-ketentest — nooit allebei tegelijk.
  const notifLink = document.getElementById('navNotifLink');
  const berichtenLink = document.getElementById('navBerichtenLink');
  const isEstafette = result.active.model === 'estafettemodel';
  if (notifLink) notifLink.style.display = isEstafette ? 'none' : '';
  if (berichtenLink) berichtenLink.style.display = isEstafette ? '' : 'none';

  return result.active;
}

// Opmerking: het tonen van de actieve ketentest in de navigatiebalk is
// verwijderd (was overbodig sinds de keuze op het inlogscherm gebeurt).
// ensureActiveKetentest() hierboven blijft wél gebruikt om te bepalen
// welke ketentest actief is.

// Geeft de weergavenaam van een flow terug, met het (verplichte) nummer
// ervoor — bijv. "3. Toewijzen Menzis (BR)". Gebruikt op elke pagina waar
// een flownaam wordt getoond, zodat dit overal consistent is.
function flowLabel(flow) {
  if (!flow) return '';
  return flow.nummer != null ? `${flow.nummer}. ${flow.name}` : flow.name;
}
