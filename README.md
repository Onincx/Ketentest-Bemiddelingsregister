# Ketentest Bemiddelingsregister

Webapplicatie voor het beheren en uitvoeren van ketentestscenario's voor de implementatie van het Bemiddelingsregister.

## Functionaliteit

- Inloggen met e-mailadres en wachtwoord
- Beheerder nodigt gebruikers uit per e-mail (uitnodigingslink met wachtwoord aanmaken)
- Organisaties aanmaken en gebruikers daaraan koppelen
- Testscenario's met onderliggende activiteiten per organisatie
- Voortgang en resultaten bijhouden (OK / NOK) met notities
- Exporteren naar CSV
- Statistieken en voortgangsindicatoren

---

## Installatie in 5 stappen

### Stap 1 — Supabase project aanmaken

1. Ga naar [supabase.com](https://supabase.com) en maak een gratis account aan
2. Klik op **New project** en vul een naam in (bijv. `ketentest`)
3. Kies een regio (bijv. `West EU / Frankfurt`)
4. Stel een sterk databasewachtwoord in en sla dit op
5. Wacht tot het project is aangemaakt (~1 minuut)

### Stap 2 — Database inrichten

1. Ga in het Supabase dashboard naar **SQL Editor**
2. Klik op **New query**
3. Kopieer de volledige inhoud van `supabase-setup.sql` en plak die in de editor
4. Klik op **Run** (groene knop)
5. Je ziet "Success. No rows returned" als alles goed gaat

### Stap 3 — Uitnodigingsmail instellen

1. Ga naar **Authentication → Email Templates**
2. Klik op **Invite user**
3. Pas de `{{ .ConfirmationURL }}` aan zodat die naar jouw site wijst:
   ```
   Klik op de onderstaande link om je wachtwoord aan te maken:
   {{ .ConfirmationURL }}
   ```
4. Ga naar **Authentication → URL Configuration**
5. Voeg onder **Redirect URLs** toe: `https://JOUW_DOMEIN/invite.html`
   (bij GitHub Pages: `https://JOUW_USERNAME.github.io/JOUW_REPO/invite.html`)

### Stap 4 — js/supabase-config.js invullen

1. Ga in Supabase naar **Project Settings → API**
2. Kopieer de **Project URL** en de **anon public** key
3. Open `js/supabase-config.js` en vervang:
   ```javascript
   const SUPABASE_URL = 'https://JOUW_PROJECT_ID.supabase.co';
   const SUPABASE_ANON_KEY = 'JOUW_ANON_PUBLIC_KEY';
   ```

### Stap 5 — Publiceren via GitHub Pages

1. Maak een nieuwe **repository** aan op [github.com](https://github.com)
2. Upload alle bestanden uit deze map naar de repository
   (of gebruik `git push` als je Git kent)
3. Ga naar **Settings → Pages**
4. Kies onder **Source**: `Deploy from a branch` → `main` → `/ (root)`
5. Klik op **Save** — je site is binnen een minuut live op:
   `https://JOUW_USERNAME.github.io/JOUW_REPO/`

---

## Eerste beheerder instellen

Na het live zetten:

1. Ga naar je site en maak een account aan via de **inlogpagina**
   (klik op "Inloggen" — je maakt nu een account via Supabase Auth)

   **Of** laat Supabase direct een account aanmaken:
   - Ga naar **Authentication → Users → Add user**
   - Vul je e-mailadres en wachtwoord in

2. Ga in Supabase naar **SQL Editor** en voer dit uit
   (vervang het e-mailadres):
   ```sql
   UPDATE users SET role = 'admin' WHERE email = 'JOUW_EMAIL@ADRES.NL';
   ```

3. Log in op de site — je ziet nu het **Beheer** menu

---

## Gebruikers uitnodigen (als beheerder)

1. Log in als beheerder
2. Ga naar **Beheer → Organisaties** — voeg eerst de organisaties toe
3. Ga naar **Beheer → Gebruikers → Gebruiker uitnodigen**
4. Vul e-mailadres, naam en organisatie in
5. De gebruiker ontvangt een e-mail met een link om een wachtwoord aan te maken

---

## Testscenario's inrichten (als beheerder)

1. Ga naar **Beheer → Testscenario's**
2. Voeg een scenario toe (bijv. `TS-001 — Registratie aanmaken`)
3. Klik op **+ Activiteit** om stappen toe te voegen
4. Koppel elke activiteit aan de verantwoordelijke **organisatie**

Gebruikers van die organisatie kunnen de activiteit dan bewerken in de app.

---

## Deelname aan testscenario's (nieuw)

Voordat organisaties een testscenario daadwerkelijk gaan uitvoeren, geven ze eerst aan of ze dat scenario willen testen:

1. Voer eenmalig `deelname-setup.sql` uit in de Supabase **SQL Editor** (zelfde werkwijze als `supabase-setup.sql`). Dit voegt de tabel `scenario_participation` toe met de bijbehorende beveiliging (RLS).
2. Voer daarna ook `flow-deelname-setup.sql` uit — dit voegt de tabel `flow_participation` toe. **Sinds deze update werkt de Deelname-pagina op flow-niveau, niet meer op scenarioniveau** (zie hieronder); `scenario_participation` wordt niet meer gebruikt door de pagina zelf, maar blijft bestaan voor het geval je de oude gegevens nog wilt inzien.
3. Gebruikers vinden het overzicht via **Ketentest → Deelname** in de bovenbalk.
4. Per **flow** (niet per los scenario) ziet een organisatie een compacte matrix: één kolom per betrokken organisatie, met een status (✅ wil testen, ❌ wil niet testen, ⏳ nog geen keuze). Een organisatie is "betrokken" bij een flow zodra ze bij minimaal één activiteit van minimaal één scenario in die flow verantwoordelijk of acceptant zijn.
5. Elke gebruiker mag de keuze invullen, wijzigen **of weer wissen** (terug naar "nog geen keuze") namens de **eigen** organisatie (beheerders mogen dit namens elke organisatie). Bij "niet testen" is een reden verplicht.
6. Gewone gebruikers zien alleen de flows waar hun eigen organisatie bij betrokken is; beheerders zien alle flows.
7. Per flow wordt automatisch bepaald of deze **wordt uitgevoerd** (iedereen wil), **niet wordt uitgevoerd** (niemand wil), **verdeeld** is (sommigen wel, sommigen niet), of nog **wacht op input**.

Dit overzicht is puur informatief: het beïnvloedt (nog) niets in de ketentest-app zelf (`app.html`).

---

## Flows: één canvas per start (nieuw)

De Flow-pagina werkte voorheen met één groot, gedeeld canvas per ketentest. Dat is vervangen door aparte, benoembare canvassen ("flows"): elk kaartje dat als **start** wordt gemarkeerd hoort voortaan bij zijn eigen flow.

1. Voer eenmalig `flows-setup.sql` uit in de Supabase **SQL Editor**. Dit voegt de tabel `flows` toe en een `flow_id`-kolom aan `flow_nodes` en `flow_edges`.
2. Open daarna de **Flow**-pagina als beheerder. Bij het eerste bezoek per ketentest migreert de app **automatisch**: bestaande startkaartjes (en alles wat daar transitief mee verbonden was) worden opgesplitst in aparte flows, genoemd naar het startscenario. Kaartjes die nergens bij een start hoorden komen in een verzamelflow "Overige kaartjes" terecht — er gaat dus niets verloren. Dit gebeurt maar één keer; hierna beheer je flows gewoon zelf.
3. In de linkerkolom kies je met welke flow (canvas) je werkt. Beheerders kunnen daar ook een nieuwe flow aanmaken (✏️ om te hernoemen, 🗑 om te verwijderen).
4. "Scenario's toevoegen" in de linkerkolom voegt een scenario toe aan de **geselecteerde** flow. Een scenario kan (net als voorheen) maar op één canvas tegelijk staan.
5. De gast-flow (`flow-gast.html`, bereikt via een deellink) toont dezelfde flows met een keuzemenu bovenaan. **Let op:** dit werkt pas zodra ook de achterliggende database-functie `get_guest_ketentest_data` is bijgewerkt om de nieuwe `flows`-tabel mee te geven — zolang dat niet is gebeurd, valt de gastweergave automatisch terug op het oude gedrag (alles op één canvas), dus er breekt niets.

---

## Bestandsstructuur

```
/
├── index.html            Inlogpagina
├── invite.html           Wachtwoord aanmaken (uitnodigingslink)
├── app.html              Ketentest applicatie (voor gebruikers)
├── admin.html            Beheerderspanel
├── dashboard.html        Dashboard met voortgang en statistieken
├── deelname.html         Overzicht: wie gaat welk scenario testen
├── flow.html / flow-gast.html   Flow-weergave
├── gast.html              Alleen-lezen overzicht voor externen
├── css/
│   └── style.css         Gedeelde stijlen
├── js/
│   └── supabase-config.js  Configuratie (URL + key invullen)
├── supabase-setup.sql    Database setup script (basis)
├── deelname-setup.sql    Database uitbreiding voor deelname-functionaliteit (legacy, scenario-niveau)
├── flow-deelname-setup.sql Database uitbreiding voor deelname op flow-niveau (huidige opzet)
├── flows-setup.sql       Database uitbreiding voor losse flows (canvassen)
└── README.md             Deze handleiding
```

---

## Alternatief: Vercel

Wil je meer controle of een eigen domein koppelen?

1. Maak een account op [vercel.com](https://vercel.com)
2. Importeer je GitHub repository
3. Vercel deployt automatisch bij elke wijziging in GitHub
4. Koppel een eigen domein via **Settings → Domains**

---

## Vragen of problemen?

- Supabase documentatie: [supabase.com/docs](https://supabase.com/docs)
- GitHub Pages: [docs.github.com/pages](https://docs.github.com/en/pages)
