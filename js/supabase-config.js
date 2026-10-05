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

// De ingelogde gebruiker wordt per paginalading maar één keer bij de
// auth-server opgevraagd: sb.auth.getUser() is een echte netwerkaanroep,
// en werd tot voor kort tientallen keren per pagina herhaald (in
// requireAuth, in elke ketentest-controle, in elke badge). Er wordt de
// promise onthouden, zodat ook gelijktijdige aanroepen samenvallen tot
// één verzoek. Een 'niet ingelogd'-uitkomst (of een fout) wordt bewust
// niet onthouden, zodat inloggen op dezelfde pagina gewoon werkt.
let _huidigeGebruikerPromise = null;
let _profielCache = {};
let _ketentestsCache = null;
async function getCurrentUser() {
  if (!_huidigeGebruikerPromise) {
    _huidigeGebruikerPromise = sb.auth.getUser().then(r => r?.data?.user || null);
  }
  let user;
  try { user = await _huidigeGebruikerPromise; }
  catch (e) { _huidigeGebruikerPromise = null; throw e; }
  if (!user) _huidigeGebruikerPromise = null;
  return user;
}
// Bij in- of uitloggen (of een wijziging aan het account) de onthouden gebruiker vergeten.
sb.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' || event === 'SIGNED_IN' || event === 'USER_UPDATED') {
    _huidigeGebruikerPromise = null;
    _profielCache = {};
    _ketentestsCache = null;
  }
  // Bij uitloggen ook de onthouden badge-uitkomsten wissen, zodat een volgende
  // gebruiker in hetzelfde tabblad ze niet overneemt. (Bewust niet bij SIGNED_IN:
  // supabase-js meldt dat ook bij het terugkeren naar het tabblad, en dan zou de
  // cache continu leeggemaakt worden.)
  if (event === 'SIGNED_OUT') invalideerBadgeCache();
});

// Idem voor het profiel: requireAuth() haalt het al op, en vrijwel elke
// pagina deed dat daarna nóg een keer. Een leeg of mislukt resultaat
// wordt niet onthouden.
async function getUserProfile(userId) {
  if (!_profielCache[userId]) {
    _profielCache[userId] = (async () => {
      const { data } = await sb.from('users').select('*, organisations(name)').eq('id', userId).single();
      return data;
    })();
  }
  let profiel;
  try { profiel = await _profielCache[userId]; }
  catch (e) { delete _profielCache[userId]; throw e; }
  if (!profiel) delete _profielCache[userId];
  return profiel;
}

async function isAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  const profile = await getUserProfile(user.id);
  return profile?.role === 'admin';
}

// ============================================================
// CONSISTENTE ORGANISATIEKLEUREN
// Elke organisatie krijgt altijd dezelfde kleur, ongeacht of ze als
// verantwoordelijke, acceptant, eigenaar, melder, enz. wordt getoond —
// en die kleur is uniek ten opzichte van elke andere organisatie
// binnen dezelfde ketentest (alfabetische volgorde op naam bepaalt de
// toewijzing, dus stabiel en overal identiek).
// ============================================================
const ORG_KLEUREN_PALET = [
  { bg: '#eef2ff', fg: '#3730a3' }, // indigo
  { bg: '#fef3c7', fg: '#92400e' }, // amber
  { bg: '#dcfce7', fg: '#166534' }, // groen
  { bg: '#fce7f3', fg: '#9d174d' }, // roze
  { bg: '#ede9fe', fg: '#5b21b6' }, // paars
  { bg: '#ccfbf1', fg: '#0f766e' }, // teal
  { bg: '#ffedd5', fg: '#9a3412' }, // oranje
  { bg: '#cffafe', fg: '#155e75' }, // cyaan
  { bg: '#ecfccb', fg: '#3f6212' }, // limoen
  { bg: '#ffe4e6', fg: '#9f1239' }, // roos
  { bg: '#f3e8ff', fg: '#6b21a8' }, // violet
  { bg: '#f1f5f9', fg: '#334155' }, // grijsblauw
];

function getOrgKleur(orgId, alleOrgs) {
  if (!orgId || !alleOrgs || !alleOrgs.length) return ORG_KLEUREN_PALET[0];
  const gesorteerd = [...alleOrgs].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const index = gesorteerd.findIndex(o => o.id === orgId);
  return ORG_KLEUREN_PALET[index === -1 ? 0 : index % ORG_KLEUREN_PALET.length];
}

async function requireAuth(redirectTo = 'index.html') {
  const user = await getCurrentUser();
  if (!user) { window.location.href = redirectTo; return null; }
  const profile = await getUserProfile(user.id);
  if (profile?.must_change_password) { window.location.href = 'invite.html'; return null; }
  startIdleTimeoutWatcher();
  return user;
}

// ============================================================
// AUTOMATISCH UITLOGGEN BIJ INACTIVITEIT (beveiliging)
// Na 15 minuten zonder muis-/toetsenbordgebruik/klikken wordt de
// gebruiker uitgelogd. De laatste minuut daarvan verschijnt eerst een
// waarschuwing met de mogelijkheid om aangemeld te blijven.
// ============================================================
const IDLE_TIMEOUT_MINUTEN = 15;
const IDLE_WAARSCHUWING_SECONDEN = 60;

let idleWatcherGestart = false;
let idleLastActivityTime = 0;
let idleCheckInterval = null;
let idleWaarschuwingActief = false;
let idleWaarschuwingStartTime = 0;

function startIdleTimeoutWatcher() {
  if (idleWatcherGestart) return; // voorkomt dubbele listeners bij meerdere requireAuth-aanroepen
  idleWatcherGestart = true;
  idleLastActivityTime = Date.now();
  // Bewust beperkt tot échte, bewuste interacties met de tool zelf —
  // niet 'mousemove' of 'scroll', die ook afgaan bij de geringste
  // muistrilling of sensorruis, zonder dat er daadwerkelijk iets in de
  // monitor gebeurt.
  ['click', 'keydown'].forEach(evt => {
    document.addEventListener(evt, () => { if (!idleWaarschuwingActief) idleLastActivityTime = Date.now(); }, { passive: true });
  });

  // Een setInterval wordt door de browser vertraagd zodra het tabblad
  // op de achtergrond staat (soms tot maar 1x per minuut of minder) —
  // maar omdat hier steeds tegen de wérkelijke kloktijd wordt
  // vergeleken (Date.now() - idleLastActivityTime), klopt de uitkomst
  // nog steeds zodra de check alsnog wordt uitgevoerd. Daarnaast wordt
  // er ook direct gecontroleerd zodra het tabblad weer zichtbaar wordt,
  // zodat er niet gewacht hoeft te worden op de eerstvolgende tick.
  idleCheckInterval = setInterval(controleerIdleTijd, 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') controleerIdleTijd();
  });
}

function controleerIdleTijd() {
  const waarschuwingsGrensMs = (IDLE_TIMEOUT_MINUTEN * 60 - IDLE_WAARSCHUWING_SECONDEN) * 1000;
  if (!idleWaarschuwingActief) {
    if (Date.now() - idleLastActivityTime >= waarschuwingsGrensMs) toonIdleWaarschuwing();
    return;
  }
  // De waarschuwing staat al open: ook de aftelling zelf hier tegen de
  // kloktijd aflezen (i.p.v. simpelweg te decrementen), zodat een
  // vertraagde tick alsnog het juiste aantal seconden toont — of, als
  // de tijd inmiddels al om is, meteen uitlogt.
  const secondenOver = IDLE_WAARSCHUWING_SECONDEN - Math.floor((Date.now() - idleWaarschuwingStartTime) / 1000);
  const el = document.getElementById('idleSecondenOver');
  if (el) el.textContent = Math.max(secondenOver, 0);
  if (secondenOver <= 0) logUitWegensInactiviteit();
}

function toonIdleWaarschuwing() {
  idleWaarschuwingActief = true;
  idleWaarschuwingStartTime = Date.now();

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'idleWaarschuwingOverlay';
  modal.style.cssText = 'display:flex; z-index:9999;';
  modal.innerHTML = `
    <div class="modal" style="max-width:420px;" onclick="event.stopPropagation()">
      <div class="modal-header">
        <h3>Sessie verloopt binnenkort</h3>
      </div>
      <div class="modal-body">
        <p style="font-size:14px; line-height:1.6;">Wegens inactiviteit word je over <strong id="idleSecondenOver">${IDLE_WAARSCHUWING_SECONDEN}</strong> seconden automatisch uitgelogd.</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-primary" onclick="blijfAangemeld()">Ingelogd blijven</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
}

function blijfAangemeld() {
  idleWaarschuwingActief = false;
  document.getElementById('idleWaarschuwingOverlay')?.remove();
  idleLastActivityTime = Date.now();
}

async function logUitWegensInactiviteit() {
  idleWaarschuwingActief = false;
  clearInterval(idleCheckInterval);
  document.getElementById('idleWaarschuwingOverlay')?.remove();
  await sb.auth.signOut();
  window.location.href = 'index.html?reden=inactiviteit';
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

const VIEWING_ORG_STORAGE_KEY = 'viewingOrgId';

function getViewingOrgId() {
  return localStorage.getItem(VIEWING_ORG_STORAGE_KEY) || null;
}

function setViewingOrgId(orgId) {
  if (orgId) localStorage.setItem(VIEWING_ORG_STORAGE_KEY, orgId);
  else localStorage.removeItem(VIEWING_ORG_STORAGE_KEY);
}

async function getMeekijkOrganisaties(userId) {
  const { data } = await sb.from('meekijk_organisaties').select('organisations(id, name)').eq('user_id', userId);
  return (data || []).map(m => m.organisations).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

// Vult het element met id="navOrg": voor een normale gebruiker gewoon
// de naam van de eigen organisatie (ongewijzigd gedrag), voor een
// Softwareleverancier een schakelaar waarmee hij tussen zijn gekoppelde
// organisaties kan wisselen. Retourneert de organisatie-id die de
// pagina verder als 'huidige organisatie' moet gebruiken bij het
// bepalen wat er getoond wordt (dus NIET voor muteerrechten — die
// blijven overal gebaseerd op profile.organisation_id zelf, wat voor
// deze rol altijd leeg is).
async function renderNavOrgSwitcher(profile) {
  const el = document.getElementById('navOrg');
  if (!el) return profile?.organisation_id || null;

  if (profile?.role !== 'softwareleverancier') {
    el.textContent = profile?.organisations?.name || '';
    return profile?.organisation_id || null;
  }

  const koppelingen = await getMeekijkOrganisaties(profile.id);
  if (!koppelingen.length) {
    el.textContent = 'Geen organisaties gekoppeld';
    return null;
  }

  let gekozen = getViewingOrgId();
  if (!gekozen || !koppelingen.some(o => o.id === gekozen)) {
    gekozen = koppelingen[0].id;
    setViewingOrgId(gekozen);
  }

  el.innerHTML = `<select onchange="setViewingOrgId(this.value); location.reload();" title="Bekijk als organisatie" style="background:rgba(255,255,255,0.15); color:#fff; border:none; border-radius:99px; padding:2px 8px; font-size:12px; font-weight:600; cursor:pointer;">`
    + koppelingen.map(o => `<option value="${o.id}" style="color:#111;" ${o.id === gekozen ? 'selected' : ''}>${o.name}</option>`).join('')
    + `</select>`;

  return gekozen;
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

  // Deze lijst werd per paginalading 5× opgehaald (elke ketentest-controle
  // en elke badge deed het opnieuw). Nu wordt het resultaat 15 seconden
  // onthouden — genoeg om die burst samen te laten vallen, kort genoeg dat
  // een wijziging (nieuwe ketentest, toegang gewijzigd) snel zichtbaar is;
  // de beheerpagina wist de cache bovendien expliciet na zo'n wijziging
  // (invalideerKetentestCache). Een mislukte query wordt niet onthouden.
  const nu = Date.now();
  if (!_ketentestsCache || _ketentestsCache.userId !== user.id || nu - _ketentestsCache.t >= 15000) {
    const promise = (async () => {
      const { data, error } = await sb.from('user_ketentest_access').select('ketentest_id, ketentests(*)').eq('user_id', user.id);
      const list = (data || []).map(r => r.ketentests).filter(Boolean);
      list.sort((a, b) => (a.naam || '').localeCompare(b.naam || '', 'nl'));
      return { list, ok: !error };
    })();
    const invoer = { t: nu, userId: user.id, promise };
    _ketentestsCache = invoer;
    promise.then(r => { if (!r.ok && _ketentestsCache === invoer) _ketentestsCache = null; })
           .catch(() => { if (_ketentestsCache === invoer) _ketentestsCache = null; });
  }
  const { list } = await _ketentestsCache.promise;
  return [...list]; // kopie, zodat aanroepers die de array wijzigen de cache niet beschadigen
}

function invalideerKetentestCache() { _ketentestsCache = null; }

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
  // 'Testscenario's' onder Ketentest toont voortaan voor iedereen —
  // ook de beheerder — de weergave zoals een gebruiker die ziet
  // (app.html). Het beheerscherm om scenario's te muteren/beheren zit
  // voortaan apart onder Beheer → 'Scenario's beheren'.
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
  // Ook het hoofdlink 'Ketentest' zelf gaat voortaan voor iedereen naar
  // de gebruikersweergave (app.html) — zie scenariosLinkHtml hierboven.
  link.href = 'app.html';
  link.onclick = null;
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
  // Eerste batch apart: is die niet vol, dan is er niets meer op te halen
  // (het gewone geval voor de meeste tabellen).
  const eerste = await queryBuilderFn(0, batchSize - 1);
  if (eerste.error) return { data: [], error: eerste.error };
  let allRows = eerste.data || [];
  if (allRows.length < batchSize) return { data: allRows, error: null };

  // Er is meer: de vervolgbatches worden niet meer één voor één, maar in
  // groepjes van 3 tegelijk opgehaald. Batches voorbij het einde leveren
  // gewoon een lege lijst op. De uitkomst wordt in volgorde verwerkt,
  // dus het resultaat (en het gedrag bij een fout: alles t/m de laatste
  // geslaagde batch + de fout) is identiek aan de oude, sequentiële versie.
  const PARALLEL = 3;
  let volgendeStart = batchSize;
  while (true) {
    const starts = Array.from({ length: PARALLEL }, (_, i) => volgendeStart + i * batchSize);
    const resultaten = await Promise.all(starts.map(s => queryBuilderFn(s, s + batchSize - 1)));
    for (const res of resultaten) {
      if (res.error) return { data: allRows, error: res.error };
      const rows = res.data || [];
      allRows = allRows.concat(rows);
      if (rows.length < batchSize) return { data: allRows, error: null };
    }
    volgendeStart += PARALLEL * batchSize;
  }
}

// Voor queries met een lange lijst id's (.in('kolom', ids)): één enkele
// query met duizenden UUID's levert een URL van tientallen kilobytes op,
// die door de server geweigerd kan worden (en dan stilzwijgend een lege
// uitkomst geeft). Deze functie verdeelt de lijst in stukken van 200 en
// haalt die tegelijk op. 'bouwQuery' krijgt een stuk id's en geeft de
// query terug (zónder .range — dat regelt fetchAllRows).
async function fetchInChunks(ids, bouwQuery, chunkSize = 200) {
  if (!ids.length) return { data: [], error: null };
  const stukken = [];
  for (let i = 0; i < ids.length; i += chunkSize) stukken.push(ids.slice(i, i + chunkSize));
  const delen = await Promise.all(stukken.map(stuk => fetchAllRows((from, to) => bouwQuery(stuk).range(from, to))));
  return { data: delen.flatMap(d => d.data || []), error: delen.find(d => d.error)?.error || null };
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

// ============================================================
// PRESTATIES VAN DE NAVIGATIEBADGES
// De badges 'acties voor jou' en 'Go/No-go nodig' berekenen hun getal uit
// (vrijwel) alle activiteiten en resultaten van de hele ketentest. Dat
// draaide op ELKE pagina, bij ELKE navigatie, en concurreerde bovendien
// met de eigen queries van de pagina. Daarom:
//   1. de uitkomst wordt 45 seconden onthouden (sessionStorage, dus ook
//      over pagina's heen) — bij een navigatie is de badge direct klaar;
//   2. de berekening zelf wordt pas gestart als de pagina klaar is met
//      tekenen (naEersteRender), zodat de badge de pagina niet vertraagt;
//   3. beide badges delen één ophaalronde van activiteiten en resultaten;
//   4. onafhankelijke queries lopen parallel, en lange id-lijsten worden
//      in stukken opgehaald (zie fetchInChunks);
//   5. na een wijziging (bijv. een resultaat op OK zetten) wist
//      invalideerBadgeCache() de onthouden uitkomsten, zodat de badge
//      direct de nieuwe stand toont.
// ============================================================
const BADGE_CACHE_TTL_MS = 45000;
const BADGE_DATA_TTL_MS = 30000;

function badgeCacheKey(soort, ketentestId, orgId) { return `badgeCache:${soort}:${ketentestId}:${orgId}`; }
function leesBadgeCache(sleutel) {
  try {
    const raw = sessionStorage.getItem(sleutel);
    if (!raw) return undefined;
    const { t, v } = JSON.parse(raw);
    return (Date.now() - t < BADGE_CACHE_TTL_MS) ? v : undefined;
  } catch (e) { return undefined; }
}
function schrijfBadgeCache(sleutel, waarde) {
  try { sessionStorage.setItem(sleutel, JSON.stringify({ t: Date.now(), v: waarde })); } catch (e) { /* opslag vol/uitgeschakeld: dan gewoon niet onthouden */ }
}
let _badgeDataCache = null; // { ketentestId, t, promise }
// Teller die bij elke invalidatie omhoog gaat. Een berekening die vóór een
// wijziging is gestart en er ná afrondt, mag zijn (inmiddels verouderde)
// uitkomst niet meer in de cache zetten of tonen — anders zou die de
// verse uitkomst kunnen overschrijven.
let _badgeGeneratie = 0;
function invalideerBadgeCache() {
  try { Object.keys(sessionStorage).filter(k => k.startsWith('badgeCache:')).forEach(k => sessionStorage.removeItem(k)); } catch (e) {}
  _badgeDataCache = null;
  _badgeGeneratie++;
}

// Voert werk uit zodra de browser even niets anders te doen heeft
// (uiterlijk na 2 seconden), zodat achtergrondwerk het tekenen van de
// pagina zelf niet in de weg zit.
function naEersteRender(fn) {
  return new Promise((resolve, reject) => {
    const run = () => { Promise.resolve().then(fn).then(resolve, reject); };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2000 });
    else setTimeout(run, 150);
  });
}

// Activiteiten + resultaten van de ketentest, in lichte vorm, gedeeld
// tussen de badges. Een mislukte ophaalronde wordt niet onthouden.
async function laadBadgeData(ketentestId) {
  const { data: scenarioData, error: e1 } = await sb.from('scenarios').select('id').eq('ketentest_id', ketentestId);
  const scenarioIds = (scenarioData || []).map(s => s.id);
  if (!scenarioIds.length) return { ok: !e1, activities: [], results: [] };

  // De ORDER BY heeft een unieke tiebreaker (id): sort_order alleen is niet
  // uniek, waardoor paginering (range) anders rijen kon dubbelen of missen.
  const { data: activityData, error: e2 } = await fetchAllRows((from, to) =>
    sb.from('activities').select('id,scenario_id,sort_order,organisation_id,acceptant_org_id').in('scenario_id', scenarioIds).order('sort_order').order('id').range(from, to)
  );
  const activities = activityData || [];
  const { data: resultData, error: e3 } = await fetchInChunks(activities.map(a => a.id), ids =>
    sb.from('activity_results').select('activity_id,result').in('activity_id', ids).order('id')
  );
  return { ok: !e1 && !e2 && !e3, activities, results: resultData || [] };
}
function haalBadgeData(ketentestId) {
  const nu = Date.now();
  if (_badgeDataCache && _badgeDataCache.ketentestId === ketentestId && nu - _badgeDataCache.t < BADGE_DATA_TTL_MS) return _badgeDataCache.promise;
  const promise = laadBadgeData(ketentestId);
  const invoer = { ketentestId, t: nu, promise };
  _badgeDataCache = invoer;
  promise.then(r => { if (!r.ok && _badgeDataCache === invoer) _badgeDataCache = null; })
         .catch(() => { if (_badgeDataCache === invoer) _badgeDataCache = null; });
  return promise;
}

// Toont in de navigatiebalk (element met id="mijnActiesBadge") hoeveel
// scenario's op dit moment "nu te doen" zijn voor de organisatie van de
// huidige gebruiker — d.w.z. scenario's waarbij de eerstvolgende nog
// niet-OK activiteit aan deze organisatie toebehoort (als
// verantwoordelijke of acceptant). Na een wijziging roept de pagina
// eerst invalideerBadgeCache() aan en ververst dan de badges.
function toonActiesBadge(badge, count) {
  if (count > 0) {
    badge.textContent = `🔔 ${count} actie${count === 1 ? '' : 's'} voor jou`;
    badge.style.display = '';
  } else {
    badge.style.display = 'none';
  }
}

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

  const ketentestId = result.active.id;
  const sleutel = badgeCacheKey('acties', ketentestId, orgId);
  const onthouden = leesBadgeCache(sleutel);
  if (onthouden !== undefined) { toonActiesBadge(badge, onthouden); return; }
  const generatie = _badgeGeneratie;

  try {
    await naEersteRender(async () => {
      const [data, nodeRes, edgeRes] = await Promise.all([
        haalBadgeData(ketentestId),
        fetchAllRows((from, to) => sb.from('flow_nodes').select('scenario_id,flow_id,is_start').eq('ketentest_id', ketentestId).order('id').range(from, to)),
        fetchAllRows((from, to) => sb.from('flow_edges').select('from_id,to_id').eq('ketentest_id', ketentestId).order('id').range(from, to)),
      ]);
      const fNodes = nodeRes.data || [];
      const fEdges = edgeRes.data || [];

      const resultsMap = {};
      data.results.forEach(r => { resultsMap[r.activity_id] = r.result; });

      const byScenario = {};
      data.activities.forEach(a => { (byScenario[a.scenario_id] = byScenario[a.scenario_id] || []).push(a); });

      // Zelfde regel als in app.html/mijn-acties.html: de eerste activiteit
      // van een vervolgscenario in een flow telt pas mee zodra alle directe
      // voorganger(s) in die flow volledig op OK staan.
      function scenarioVolledigOk(scenarioId) {
        const acts = byScenario[scenarioId];
        if (!acts || !acts.length) return false;
        return acts.every(a => (resultsMap[a.id] || 'open') === 'ok');
      }
      function eersteActiviteitMagStarten(scenarioId) {
        const node = fNodes.find(n => n.scenario_id === scenarioId);
        if (!node || !node.flow_id || node.is_start) return true;
        let voorgangers = fEdges.filter(e => e.to_id === scenarioId).map(e => e.from_id);
        if (!voorgangers.length) voorgangers = fEdges.filter(e => e.from_id === scenarioId).map(e => e.to_id);
        if (!voorgangers.length) return true;
        return voorgangers.every(scenarioVolledigOk);
      }

      let count = 0;
      Object.entries(byScenario).forEach(([scenarioId, acts]) => {
        acts.sort((a, b) => a.sort_order - b.sort_order);
        const bottleneck = acts.find(a => (resultsMap[a.id] || 'open') !== 'ok');
        if (!bottleneck) return;
        const isEersteActiviteit = acts[0] && acts[0].id === bottleneck.id;
        if (isEersteActiviteit && !eersteActiviteitMagStarten(scenarioId)) return;
        // Zelfde regel als de OK/NOK-rechten elders: is er een acceptant,
        // dan telt alleen die acceptant mee — niet de verantwoordelijke.
        if (bottleneck.acceptant_org_id === orgId || (!bottleneck.acceptant_org_id && bottleneck.organisation_id === orgId)) count++;
      });

      if (generatie !== _badgeGeneratie) return; // inmiddels verouderd: een nieuwere berekening neemt het over
      // Alleen onthouden als álle onderliggende queries geslaagd zijn —
      // anders zou een tijdelijke fout een verkeerd getal 45 seconden vastzetten.
      if (data.ok && !nodeRes.error && !edgeRes.error) schrijfBadgeCache(sleutel, count);
      toonActiesBadge(badge, count);
    });
  } catch (e) {
    console.error('Kon de badge "acties voor jou" niet bijwerken:', e);
  }
}

// Toont in de navigatiebalk (element met id="gonogoBadge") of er voor
// deze manager een openstaande Go/No-go-beslissing klaarstaat: de
// ketentest is volledig afgerond, er zijn geen blokkerende bevindingen
// meer open, en de eigen organisatie heeft nog geen keuze afgegeven.
// Alleen relevant voor de rol 'manager' — zij geven dit namens hun
// organisatie af (zie dashboard.html).
async function refreshGonogoBadge(orgId, role) {
  const badge = document.getElementById('gonogoBadge');
  if (!badge) return;
  if (role !== 'manager' || !orgId) { badge.style.display = 'none'; return; }

  const result = await ensureActiveKetentest();
  if (!result) { badge.style.display = 'none'; return; }
  const ketentestId = result.active.id;

  const toon = tonen => {
    if (tonen) { badge.textContent = '⚑ Go/No-go nodig'; badge.style.display = ''; }
    else badge.style.display = 'none';
  };
  const sleutel = badgeCacheKey('gonogo', ketentestId, orgId);
  const onthouden = leesBadgeCache(sleutel);
  if (onthouden !== undefined) { toon(onthouden); return; }
  const generatie = _badgeGeneratie;

  try {
    await naEersteRender(async () => {
      const [data, bevRes, gngRes] = await Promise.all([
        haalBadgeData(ketentestId),
        sb.from('bevindingen').select('id,prioriteit,status').eq('ketentest_id', ketentestId),
        sb.from('ketentest_gonogo').select('id').eq('ketentest_id', ketentestId).eq('organisation_id', orgId),
      ]);
      const alleOk = !bevRes.error && !gngRes.error && data.ok;
      const bewaar = tonen => {
        if (generatie !== _badgeGeneratie) return; // inmiddels verouderd: een nieuwere berekening neemt het over
        if (alleOk) schrijfBadgeCache(sleutel, tonen);
        toon(tonen);
      };

      const activities = data.activities;
      if (!activities.length) return bewaar(false);

      const resultsMap = {};
      data.results.forEach(r => { resultsMap[r.activity_id] = r.result; });
      const isVolledigCompleet = activities.every(a => resultsMap[a.id] === 'ok');
      if (!isVolledigCompleet) return bewaar(false);

      const heeftBlokkerend = (bevRes.data || []).some(b => b.prioriteit === 'blokkerend' && b.status !== 'hertest_ok' && b.status !== 'vervallen');
      if (heeftBlokkerend) return bewaar(false);

      // Is deze organisatie ook echt betrokken (verantwoordelijk of acceptant
      // van minstens 1 activiteit)? Zo niet, hoeft er niets van hen.
      const betrokken = activities.some(a => a.organisation_id === orgId || a.acceptant_org_id === orgId);
      if (!betrokken) return bewaar(false);

      const alBeslist = (gngRes.data || []).length > 0;
      bewaar(!alBeslist);
    });
  } catch (e) {
    console.error('Kon de Go/No-go-badge niet bijwerken:', e);
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
    const isAfgesloten = result.active.status === 'afgesloten';
    el.textContent = (isAfgesloten ? '🔒 ' : '') + result.active.naam + (isAfgesloten ? ' (afgesloten)' : '');
    el.style.background = isAfgesloten ? 'rgba(55,65,81,0.85)' : 'rgba(255,255,255,0.15)';
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

// ============================================================
// HISTORIE PER OBJECT (bevinding / scenario en zijn activiteiten)
// Toont de regels uit activity_log die bij één object horen, op de plek
// waar dat object wordt bekeken. Wie welke regels mag zien, regelt de
// database (row-level security: betrokken organisaties en beheerders);
// deze code vraagt gewoon op en toont wat terugkomt. Per regel wordt de
// ORGANISATIE getoond, niet de persoon: gewone gebruikers mogen de
// gebruikerslijst niet lezen.
// ============================================================
const HISTORIE_STATUS = { nieuw: 'Nieuw', in_behandeling: 'In behandeling', opgelost_wacht_hertest: 'Opgelost, wacht op hertest', hertest_ok: 'Hertest OK', vervallen: 'Vervallen' };
const HISTORIE_PRIORITEIT = { laag: 'Laag', midden: 'Midden', hoog: 'Hoog', blokkerend: 'Blokkerend' };
const HISTORIE_RESULTAAT = { ok: 'OK', nok: 'NOK', open: 'Open' };

// Alles wat een gebruiker kan hebben ingetypt (titels, opmerkingen, omschrijvingen)
// gaat door deze functie voordat het in de pagina komt.
function historieEsc(t) {
  return String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function historieKort(t, max = 120) {
  const s = String(t ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max) + '…' : s;
}
function historieWaarde(v) {
  return (v === null || v === undefined || v === '') ? '<em>leeg</em>' : `“${historieEsc(historieKort(v))}”`;
}
function historieVet(t) { return `<strong>${historieEsc(t)}</strong>`; }
function historieHoofdletter(t) { const s = String(t ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); }

// Vertaalt één logregel naar { label, html }. 'label' is een korte soortnaam (voor het
// centrale logboek), 'html' de zin — al veilig gemaakt om in de pagina te zetten.
function historieRegel(l, opties = {}) {
  const d = l.details || {};
  // In een scenario-overzicht staan de regels van meerdere activiteiten door elkaar: noem dan de activiteit erbij.
  const actTekst = d.beschrijving || d.activity_description;
  const act = opties.metActiviteit && actTekst ? `Activiteit “${historieEsc(historieKort(actTekst, 80))}”: ` : '';
  const oudNieuw = (oud, nieuw, kaal = false) => `${kaal ? historieVet(oud ?? '—') : historieWaarde(oud)} → ${kaal ? historieVet(nieuw ?? '—') : historieWaarde(nieuw)}`;
  const blok = () => `${historieEsc(historieHoofdletter(d.groep))}${d.volgnummer ? ' #' + historieEsc(d.volgnummer) : ''}`;

  switch (l.action) {
    case 'activity_result':
      return { label: 'Resultaat gezet', html: `${act}resultaat gezet op ${historieVet(HISTORIE_RESULTAAT[d.result] || d.result || '—')}${d.notes ? ` — opmerking: “${historieEsc(historieKort(d.notes))}”` : ''}` };
    case 'bevinding_aangemaakt':
      return { label: 'Bevinding aangemaakt', html: `Bevinding aangemaakt: ${historieWaarde(d.titel)}${d.prioriteit ? `, prioriteit ${historieVet(HISTORIE_PRIORITEIT[d.prioriteit] || d.prioriteit)}` : ''}${d.eigenaar ? `, eigenaar ${historieVet(d.eigenaar)}` : ''}` };
    case 'bevinding_wijziging':
      if (d.veld === 'status') return { label: 'Bevinding gewijzigd', html: `Status: ${oudNieuw(HISTORIE_STATUS[d.oud] || d.oud, HISTORIE_STATUS[d.nieuw] || d.nieuw, true)}` };
      if (d.veld === 'prioriteit') return { label: 'Bevinding gewijzigd', html: `Prioriteit: ${oudNieuw(HISTORIE_PRIORITEIT[d.oud] || d.oud, HISTORIE_PRIORITEIT[d.nieuw] || d.nieuw, true)}` };
      if (d.veld === 'eigenaar') return { label: 'Bevinding gewijzigd', html: `Eigenaar: ${oudNieuw(d.oud, d.nieuw, true)}` };
      if (d.veld === 'titel') return { label: 'Bevinding gewijzigd', html: `Titel: ${oudNieuw(d.oud, d.nieuw)}` };
      if (d.veld === 'omschrijving_probleem') return { label: 'Bevinding gewijzigd', html: `Omschrijving probleem gewijzigd: ${oudNieuw(d.oud, d.nieuw)}` };
      return { label: 'Bevinding gewijzigd', html: `${historieEsc(d.veld)}: ${oudNieuw(d.oud, d.nieuw)}` };
    case 'bevinding_toelichting':
      return { label: 'Toelichting', html: d.bewerkt ? 'Toelichting gewijzigd' : 'Toelichting toegevoegd' };
    case 'activiteit_wijziging':
      return { label: 'Activiteit gewijzigd', html: `${act}${historieEsc(d.veld)}: ${oudNieuw(d.oud, d.nieuw, d.veld === 'verantwoordelijke' || d.veld === 'acceptant')}` };
    case 'activiteit_verwijderd':
      return { label: 'Activiteit verwijderd', html: `Activiteit ${historieWaarde(d.beschrijving)} verwijderd${d.verantwoordelijke ? ` (verantwoordelijke ${historieVet(d.verantwoordelijke)}${d.acceptant ? `, acceptant ${historieVet(d.acceptant)}` : ''})` : ''}` };
    case 'scenario_wijziging':
      return { label: 'Scenario gewijzigd', html: `Scenario ${historieEsc(d.veld)}: ${oudNieuw(d.oud, d.nieuw)}` };
    case 'scenario_verwijderd':
      return { label: 'Scenario verwijderd', html: `Scenario ${historieEsc(d.code || '')} ${historieWaarde(d.titel)} verwijderd` };
    case 'kenmerk_wijziging':
      return { label: 'Kenmerk gewijzigd', html: `${blok()} — ${historieEsc(d.kenmerk || 'veld')}: ${oudNieuw(d.oud, d.nieuw)}` };
    case 'kenmerk_blok_toegevoegd':
      return { label: 'Kenmerk gewijzigd', html: `${blok()} toegevoegd` };
    case 'kenmerk_blok_verwijderd': {
      const waarden = Object.entries(d.waarden || {}).map(([k, v]) => `${historieEsc(k)}: ${historieWaarde(v)}`).join(', ');
      return { label: 'Kenmerk gewijzigd', html: `${blok()} verwijderd${waarden ? ` — inhoud was: ${waarden}` : ''}` };
    }
    default:
      return { label: l.action, html: historieEsc(JSON.stringify(d)) };
  }
}

function renderHistorieHtml(rijen, opties = {}) {
  if (!rijen || !rijen.length) {
    return '<p style="font-size:12px; color:var(--text-muted); font-style:italic; margin:0;">Nog geen wijzigingen vastgelegd. De historie wordt bijgehouden vanaf de invoering ervan, en is alleen zichtbaar voor betrokken organisaties en beheerders.</p>';
  }
  return rijen.map(l => {
    const r = historieRegel(l, opties);
    const tijd = new Date(l.created_at).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const org = l.details && l.details.organisatie;
    return `<div style="padding:8px 0; border-bottom:1px solid var(--border);">
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:2px;">${historieEsc(tijd)}${org ? ` · ${historieEsc(org)}` : ''}</div>
      <div style="font-size:13px; line-height:1.5;">${r.html}</div>
    </div>`;
  }).join('');
}

// soort: 'bevinding' | 'activiteit' (één activiteit) | 'scenario' (het scenario en al zijn activiteiten)
function haalHistorie(soort, id) {
  let q = sb.from('activity_log')
    .select('id, action, details, created_at, object_type, object_id, scenario_id')
    .order('created_at', { ascending: false })
    .limit(200);
  if (soort === 'scenario') q = q.eq('scenario_id', id).in('object_type', ['scenario', 'activiteit']);
  else q = q.eq('object_type', soort).eq('object_id', id);
  return q;
}

async function laadHistorieIn(soort, id, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '<p style="font-size:12px; color:var(--text-muted); margin:0;">Laden…</p>';
  const { data, error } = await haalHistorie(soort, id);
  if (error) {
    const nogNietKlaar = error.code === '42703' || /object_type|scenario_id/.test(error.message || '');
    el.innerHTML = `<p style="font-size:12px; color:var(--danger); margin:0;">${nogNietKlaar
      ? 'De historie is nog niet beschikbaar: het databasescript "historie-per-object-setup.sql" is nog niet uitgevoerd.'
      : 'De historie kon niet worden geladen: ' + historieEsc(error.message)}</p>`;
    return;
  }
  let rijen = data || [];
  // Vangnet: het aanmaken van een bevinding moet ALTIJD zichtbaar zijn. Ontbreekt de
  // logregel (bijv. omdat de database-trigger faalde), dan bouwen we die regel hier uit de
  // bevinding zelf, zodat wie/wanneer nooit ontbreekt.
  if (soort === 'bevinding' && !rijen.some(r => r.action === 'bevinding_aangemaakt')) {
    const { data: b } = await sb.from('bevindingen')
      .select('titel, prioriteit, owner_org_id, gemeld_door_org_id, created_at').eq('id', id).maybeSingle();
    if (b && b.created_at) {
      const ids = [b.owner_org_id, b.gemeld_door_org_id].filter(Boolean);
      const namen = {};
      if (ids.length) {
        const { data: orgRijen } = await sb.from('organisations').select('id, name').in('id', ids);
        (orgRijen || []).forEach(o => { namen[o.id] = o.name; });
      }
      rijen = [...rijen, {
        id: 'afgeleid-aanmaak', action: 'bevinding_aangemaakt', created_at: b.created_at,
        details: { titel: b.titel, prioriteit: b.prioriteit, eigenaar: namen[b.owner_org_id], organisatie: namen[b.gemeld_door_org_id] },
      }].sort((x, y) => new Date(y.created_at) - new Date(x.created_at));
    }
  }
  el.innerHTML = renderHistorieHtml(rijen, { metActiviteit: soort === 'scenario' });
}
