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
// Geeft de HTML voor precies ÉÉN link terug — "Berichten" bij een
// Estafettemodel-ketentest, anders "Notificaties". Er wordt dus nooit
// een verkeerde/overbodige link ergens verborgen achtergelaten; de
// andere bestaat simpelweg niet in de pagina.
function notifBerichtenLinkHtml(model, isAdminPage) {
  if (model === 'estafettemodel') {
    return `<a href="berichten.html" id="navBerichtenLink"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Berichten</a>`;
  }
  const onclick = isAdminPage ? ` onclick="return navTab('notifications', event)"` : '';
  return `<a href="admin.html?tab=notifications" id="navNotifLink"${onclick}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg> Notificaties</a>`;
}

// Zelfde aanpak als notifBerichtenLinkHtml hierboven: bouwt exact één
// werkende "Testscenario's"-link op — naar app.html voor gewone
// gebruikers/managers, naar de beheerversie (admin.html) voor
// beheerders. Voorkomt dat een niet-werkende link voor de verkeerde
// rol per ongeluk zichtbaar blijft.
function scenariosLinkHtml(role, isAdminPage) {
  const icon = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><polyline points="3 6 4 7 6 5"/><polyline points="3 12 4 13 6 11"/><polyline points="3 18 4 19 6 17"/></svg>';
  if (role === 'admin') {
    const onclick = isAdminPage ? ` onclick="return navTab('scenarios', event)"` : '';
    return `<a href="admin.html?tab=scenarios" id="navScenariosLink"${onclick}>${icon} Testscenario's</a>`;
  }
  return `<a href="app.html" id="navScenariosLink">${icon} Testscenario's</a>`;
}

// Werkt het 'Ketentest'-hoofdlink zelf (het woord bovenaan de
// dropdown, niet het 'Testscenario's'-sublink) rolafhankelijk bij.
// Zonder dit ging een beheerder die op dit hoofdlink klikte altijd
// naar de gewone testerspagina (app.html) i.p.v. naar het
// scenario-beheerscherm — ook al klopte het sublink 'Testscenario's'
// wel. Roep dit aan op elke pagina die deze link heeft, meteen na het
// vullen van 'navScenariosSlot'.
function updateKetentestHoofdlink(role, isAdminPage) {
  const link = document.getElementById('navKetentestLink');
  if (!link) return;
  if (role === 'admin') {
    link.href = 'admin.html?tab=scenarios';
    if (isAdminPage) link.onclick = (event) => navTab('scenarios', event);
  } else {
    link.href = 'app.html';
    link.onclick = null;
  }
}

// Toont in de navigatiebalk (element met id="nokBadge") hoeveel
// openstaande bevindingen aan de organisatie van de huidige gebruiker
// zijn toegewezen om op te lossen. Werkt op elke pagina die dit
// element heeft, en haalt de stand altijd rechtstreeks en actueel op
// (niet uit eventueel al geladen/verouderde paginagegevens) — de
// badge blijft daardoor overal zichtbaar, ook op Beheer → NOK-opvolging
// zelf, en verandert nooit door alleen maar te navigeren.
// Haalt ALLE rijen van een query op, ook als het totaal boven de
// standaardlimiet van 1000 rijen per verzoek uitkomt (een bekende
// Supabase/PostgREST-beperking). Geef een functie mee die, gegeven een
// 'from'/'to'-bereik, de bijbehorende (nog niet uitgevoerde) Supabase-
// query teruggeeft — bijv.:
//   await fetchAllRows((from, to) => sb.from('activities').select('*').in('scenario_id', ids).range(from, to))
// Belangrijk: de query moet consistent gesorteerd zijn (voeg zo nodig
// een .order() toe) zodat elke pagina een ander, aansluitend deel van
// de data teruggeeft.
async function fetchAllRows(queryBuilderFn, batchSize = 1000) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await queryBuilderFn(from, from + batchSize - 1);
    if (error) return { data: allRows, error };
    allRows = allRows.concat(data || []);
    if (!data || data.length < batchSize) break;
    from += batchSize;
  }
  return { data: allRows, error: null };
}

// Genereert een sterk, maar nog wel voorleesbaar tijdelijk wachtwoord:
// twee verschillende woorden uit een ruime lijst + een 5-cijferig
// getal + 1 van 10 symbolen (~2,3 miljard combinaties). Gebruikt
// crypto.getRandomValues() (cryptografisch veilige willekeur) in
// plaats van Math.random().
function genereerSterkTijdelijkWachtwoord() {
  const words = [
    'Kentest', 'Regio', 'Zorgketen', 'Bemiddel', 'Toets', 'Scenario', 'Vlucht', 'Rivier', 'Beemd', 'Wolken',
    'Kompas', 'Anker', 'Baken', 'Duin', 'Fjord', 'Gletsjer', 'Haven', 'IJsberg', 'Krater', 'Lagune',
    'Meridiaan', 'Noorden', 'Oester', 'Piek', 'Ravijn', 'Steiger', 'Terras', 'Vallei', 'Wadden', 'Zenit',
    'Bergpas', 'Delta', 'Estuarium', 'Fontein', 'Golfslag', 'Heuvel', 'Inham', 'Jachthaven', 'Kanaal', 'Landtong',
    'Moeras', 'Oase', 'Plateau', 'Rotswand', 'Stroomversnelling', 'Getij', 'Uiterwaard', 'Vaargeul', 'Waterval', 'Zandbank',
  ];
  const symbols = ['!', '#', '$', '%', '&', '*', '?', '+', '=', '@'];

  const randInt = (max) => {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return arr[0] % max;
  };

  const word1 = words[randInt(words.length)];
  let word2 = words[randInt(words.length)];
  while (word2 === word1) word2 = words[randInt(words.length)];

  const num = 10000 + randInt(90000); // 5 cijfers
  const symbol = symbols[randInt(symbols.length)];

  return `${word1}${word2}${num}${symbol}`;
}

async function refreshGlobalNokBadge(orgId) {
  const badge = document.getElementById('nokBadge');
  if (!badge) return;
  if (!orgId) { badge.style.display = 'none'; return; }

  const result = await ensureActiveKetentest();
  if (!result) { badge.style.display = 'none'; return; }

  const { data, error } = await sb.from('bevindingen').select('id')
    .eq('ketentest_id', result.active.id)
    .eq('owner_org_id', orgId)
    .neq('status', 'hertest_ok');

  if (error || !data || !data.length) { badge.style.display = 'none'; return; }

  const count = data.length;
  badge.textContent = `⚠ ${count} openstaande NOK${count === 1 ? '' : "'s"}`;
  badge.style.display = '';
}

// Toont in de navigatiebalk (element met id="mijnActiesBadge") hoeveel
// scenario's op dit moment "nu te doen" zijn voor de organisatie van de
// huidige gebruiker — d.w.z. scenario's waarbij de eerstvolgende nog
// niet-OK activiteit aan deze organisatie toebehoort (als
// verantwoordelijke of acceptant). Zelfde live/overal-zichtbare opzet
// als refreshGlobalNokBadge hierboven.
async function refreshMijnActiesBadge(orgId) {
  const badge = document.getElementById('mijnActiesBadge');
  if (!badge) return;
  if (!orgId) { badge.style.display = 'none'; return; }

  const result = await ensureActiveKetentest();
  if (!result) { badge.style.display = 'none'; return; }

  // Vóór de startdatum staat er voor niet-beheerders nog niets écht
  // open — laat de badge dan niet ten onrechte iets suggereren.
  const isAdmin = typeof currentProfile !== 'undefined' && currentProfile?.role === 'admin';
  if (result.active.start_op && new Date(result.active.start_op) > new Date() && !isAdmin) {
    badge.style.display = 'none';
    return;
  }

  const { data: scenarioData } = await sb.from('scenarios').select('id').eq('ketentest_id', result.active.id);
  const scenarioIds = (scenarioData || []).map(s => s.id);
  if (!scenarioIds.length) { badge.style.display = 'none'; return; }

  const { data: activityData } = await fetchAllRows((from, to) =>
    sb.from('activities').select('id,scenario_id,sort_order,organisation_id,acceptant_org_id').in('scenario_id', scenarioIds).order('sort_order').range(from, to)
  );
  const activityIds = (activityData || []).map(a => a.id);
  const { data: resultData } = activityIds.length
    ? await fetchAllRows((from, to) => sb.from('activity_results').select('activity_id,result').in('activity_id', activityIds).range(from, to))
    : { data: [] };

  const resultsMap = {};
  (resultData || []).forEach(r => { resultsMap[r.activity_id] = r.result; });

  const byScenario = {};
  (activityData || []).forEach(a => { (byScenario[a.scenario_id] = byScenario[a.scenario_id] || []).push(a); });

  let count = 0;
  Object.values(byScenario).forEach(acts => {
    acts.sort((a, b) => a.sort_order - b.sort_order);
    const bottleneck = acts.find(a => (resultsMap[a.id] || 'open') !== 'ok');
    if (bottleneck && (bottleneck.organisation_id === orgId || bottleneck.acceptant_org_id === orgId)) count++;
  });

  if (count > 0) {
    badge.textContent = `🔔 ${count} actie${count === 1 ? '' : 's'} voor jou`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

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

  // Bouw exact één van de twee links op in de daarvoor bestemde plek —
  // typeof navTab === 'function' is alleen waar op admin.html zelf,
  // waar de link via navTab() zonder paginaherlaad moet schakelen.
  const slot = document.getElementById('navNotifBerichtenSlot');
  if (slot) slot.innerHTML = notifBerichtenLinkHtml(result.active.model, typeof navTab === 'function');

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
