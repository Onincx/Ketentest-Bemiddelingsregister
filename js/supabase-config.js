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
// ============================================================

const KETENTEST_STORAGE_KEY = 'actieve_ketentest_id';

function getActiveKetentestId() {
  return localStorage.getItem(KETENTEST_STORAGE_KEY) || null;
}

function setActiveKetentestId(id) {
  localStorage.setItem(KETENTEST_STORAGE_KEY, id);
}

async function loadAllKetentests() {
  const { data } = await sb.from('ketentests').select('*').order('created_at');
  return data || [];
}

// Zorgt dat er altijd een geldige actieve ketentest is.
// Als de opgeslagen id niet meer bestaat, valt terug op de eerste beschikbare.
// Geeft het volledige ketentests-object terug, of null als er geen ketentests zijn.
async function ensureActiveKetentest() {
  const all = await loadAllKetentests();
  if (!all.length) return null;

  let activeId = getActiveKetentestId();
  let active = all.find(k => k.id === activeId);

  if (!active) {
    active = all[0];
    setActiveKetentestId(active.id);
  }

  return { active, all };
}

// Bouwt de ketentest-dropdown in de navigatiebalk.
// Verwacht een element met id="ketentestSwitcher" in de pagina.
async function renderKetentestSwitcher(onChangeCallback) {
  const container = document.getElementById('ketentestSwitcher');
  if (!container) return null;

  const result = await ensureActiveKetentest();
  if (!result) {
    container.innerHTML = '';
    return null;
  }

  const { active, all } = result;

  container.innerHTML = `
    <div style="position:relative; display:inline-block;">
      <button id="ketentestSwitcherBtn" onclick="toggleKetentestDropdown()"
        style="background:#fff; border:none; color:#154273;
        border-radius:6px; padding:6px 14px; font-size:13px; font-weight:700; cursor:pointer;
        display:flex; align-items:center; gap:7px; box-shadow:0 1px 3px rgba(0,0,0,0.15);">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#39870c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <span id="ketentestSwitcherLabel">${active.naam}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      <div id="ketentestDropdownMenu" style="display:none; position:absolute; top:38px; left:0; min-width:220px;
        background:#fff; border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,0.18); z-index:500; overflow:hidden;">
        ${all.map(k => `
          <div onclick="selectKetentest('${k.id}')"
            style="padding:10px 14px; font-size:13px; cursor:pointer; color:#1a1a1a; display:flex; align-items:center; gap:8px; ${k.id === active.id ? 'background:#eaf3e0; font-weight:600;' : ''}"
            onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='${k.id === active.id ? '#eaf3e0' : 'transparent'}'">
            ${k.id === active.id ? '<span style="color:#39870c;">✓</span>' : '<span style="width:14px;"></span>'}
            ${k.naam}
          </div>`).join('')}
      </div>
    </div>`;

  window._ketentestChangeCallback = onChangeCallback;
  return active;
}

function toggleKetentestDropdown() {
  const menu = document.getElementById('ketentestDropdownMenu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  menu.style.display = isOpen ? 'none' : '';
  if (!isOpen) {
    setTimeout(() => {
      document.addEventListener('click', closeKetentestDropdownOnOutsideClick);
    }, 10);
  }
}

function closeKetentestDropdownOnOutsideClick(e) {
  const container = document.getElementById('ketentestSwitcher');
  if (container && !container.contains(e.target)) {
    document.getElementById('ketentestDropdownMenu').style.display = 'none';
    document.removeEventListener('click', closeKetentestDropdownOnOutsideClick);
  }
}

async function selectKetentest(id) {
  setActiveKetentestId(id);
  document.getElementById('ketentestDropdownMenu').style.display = 'none';
  if (window._ketentestChangeCallback) {
    await window._ketentestChangeCallback(id);
  } else {
    window.location.reload();
  }
}

// Toont de naam van de actieve ketentest prominent in de pagina-titel.
// Verwacht een element met id="activeKetentestName".
async function renderActiveKetentestBanner() {
  const el = document.getElementById('activeKetentestName');
  if (!el) return;
  const result = await ensureActiveKetentest();
  if (result) el.textContent = result.active.naam;
}
