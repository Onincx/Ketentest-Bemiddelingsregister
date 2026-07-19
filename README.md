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
8. Beheerders kunnen per flow een **doel** vastleggen (via het ✏️-icoon in de flowlijst op de Flow-pagina). Dit doel en de lijst van onderliggende scenario's (codes) worden automatisch getoond bij elke flow op de Deelname-pagina, zodat gebruikers meteen begrijpen waar ze een keuze over maken. Voer hiervoor eenmalig `flows-doel-setup.sql` uit in de Supabase SQL Editor.

Dit overzicht is puur informatief: het beïnvloedt (nog) niets in de ketentest-app zelf (`app.html`).

---

## Flows: één canvas per start (nieuw)

De Flow-pagina werkte voorheen met één groot, gedeeld canvas per ketentest. Dat is vervangen door aparte, benoembare canvassen ("flows"): elk kaartje dat als **start** wordt gemarkeerd hoort voortaan bij zijn eigen flow.

1. Voer eenmalig `flows-setup.sql` uit in de Supabase **SQL Editor**. Dit voegt de tabel `flows` toe en een `flow_id`-kolom aan `flow_nodes` en `flow_edges`.
2. Open daarna de **Flow**-pagina als beheerder. Bij het eerste bezoek per ketentest migreert de app **automatisch**: bestaande startkaartjes (en alles wat daar transitief mee verbonden was) worden opgesplitst in aparte flows, genoemd naar het startscenario. Kaartjes die nergens bij een start hoorden komen in een verzamelflow "Overige kaartjes" terecht — er gaat dus niets verloren. Dit gebeurt maar één keer; hierna beheer je flows gewoon zelf.
3. In de linkerkolom kies je met welke flow (canvas) je werkt. Beheerders kunnen daar ook een nieuwe flow aanmaken (✏️ om te hernoemen, 🗑 om te verwijderen).
4. "Scenario's toevoegen" in de linkerkolom voegt een scenario toe aan de **geselecteerde** flow. Een scenario kan (net als voorheen) maar op één canvas tegelijk staan.
5. De gast-flow (`flow-gast.html`, bereikt via een deellink) toont dezelfde flows met een keuzemenu bovenaan. **Let op:** dit werkt pas zodra ook de achterliggende database-functie `get_guest_ketentest_data` is bijgewerkt om de nieuwe `flows`-tabel mee te geven — zolang dat niet is gebeurd, valt de gastweergave automatisch terug op het oude gedrag (alles op één canvas), dus er breekt niets.

## Verplichte wachtwoordwijziging bij eerste login (nieuw)

Beheerders kunnen nu bij het aanmaken van een gebruiker zelf een **tijdelijk wachtwoord** invoeren (in plaats van een uitnodigingsmail te versturen):

1. Voer eenmalig `users-force-password-setup.sql` uit in de Supabase SQL Editor. Dit voegt het veld `must_change_password` toe aan `users`.
2. Bij **Beheer → Gebruikers → Gebruiker uitnodigen** vul je naast de gebruikersgegevens ook een tijdelijk wachtwoord in (of klik op "🎲 Genereer" voor een willekeurig wachtwoord). Geef dit tijdelijke wachtwoord zelf door aan de gebruiker (telefonisch, persoonlijk, etc.) — er wordt geen e-mail meer verstuurd.
3. Zodra die gebruiker voor het eerst inlogt met het tijdelijke wachtwoord, wordt die **automatisch doorgestuurd** naar een scherm om direct een eigen wachtwoord te kiezen — pas daarna kan de rest van de applicatie gebruikt worden. Het tijdelijke wachtwoord werkt vanaf dat moment niet meer (het is overschreven door het zelfgekozen wachtwoord).

**Belangrijk:** wil je dat gebruikers meteen met hun tijdelijke wachtwoord kunnen inloggen (zonder eerst een bevestigingsmail te hoeven openen), zorg dan dat in Supabase onder **Authentication → Providers → Email** de optie **"Confirm email"** staat **uitgeschakeld**. Staat die optie aan, dan moet de gebruiker eerst een bevestigingslink volgen voordat inloggen lukt — en die e-mail wordt in deze flow niet meer verstuurd.

---

## Wachtwoord vergeten (nieuw)

Op het inlogscherm staat nu een link **"Wachtwoord vergeten?"**. Een gebruiker die zijn/haar eigen wachtwoord kwijt is, kan zelf een e-mailadres invullen en krijgt (als dat adres bekend is) een e-mail met een link om een nieuw wachtwoord in te stellen — zonder dat de beheerder hoeft in te grijpen. Dit hergebruikt dezelfde `invite.html`-pagina als de nieuwe-gebruiker-flow, en dezelfde melding wordt getoond ongeacht of het e-mailadres wel of niet bestaat (om te voorkomen dat iemand kan aftasten welke e-mailadressen geregistreerd staan). Geen SQL-wijziging nodig.

**Let op:** dit gebruikt Supabase's ingebouwde `resetPasswordForEmail`, wat een e-mail verstuurt — controleer dus of e-mailverzending in je Supabase-project is ingesteld (SMTP), anders komt de link niet aan.

---

## Ketentest kiezen bij het inloggen + toegang per gebruiker (nieuw)

De ketentest-keuze is verplaatst van een dropdown in de navigatiebalk naar het **inlogscherm**, en beheerders kunnen nu per gebruiker bepalen welke ketentest(en) die gebruiker mag zien:

1. Voer eenmalig `user-ketentest-access-setup.sql` uit in de Supabase SQL Editor. Dit voegt de koppeltabel `user_ketentest_access` toe.
2. Bij **Beheer → Gebruikers** kun je per gebruiker (rol "Gebruiker" of "Manager") aanvinken tot welke ketentesten die toegang heeft. Beheerders zijn hiervan uitgezonderd — die zien altijd alle ketentesten.
3. Na het inloggen:
   - Heeft een gebruiker toegang tot **precies 1** ketentest, dan komt die er automatisch in terecht (geen extra stap).
   - Heeft een gebruiker toegang tot **meerdere** ketentesten, dan verschijnt een keuzescherm met de ketentesten **alfabetisch gesorteerd**.
   - Heeft een gebruiker **geen enkele** ketentest toegewezen gekregen, dan verschijnt een melding om contact op te nemen met de beheerder.
4. In de navigatiebalk staat nu alleen nog een label met de actieve ketentest, met een link terug naar het keuzescherm om te wisselen (in plaats van de oude dropdown die de pagina liet verversen).

## Voorbereiding op vrijgave: laatste login, startmoment en logboek (nieuw)

Drie aanvullingen om de ketentestmonitor gecontroleerd te kunnen vrijgeven:

1. **Laatste login per gebruiker** — voer eenmalig `users-last-login-setup.sql` uit. Dit voegt een beveiligde functie toe die (alleen voor beheerders) het laatste inlogmoment per gebruiker ophaalt uit Supabase Auth. Zichtbaar als nieuwe kolom bij **Beheer → Gebruikers**.
2. **Startmoment per ketentest** — voer eenmalig `ketentest-start-setup.sql` uit. Bij **Beheer → Ketentesten** kun je nu per ketentest een start-datum/tijd instellen. Zolang dat moment niet is bereikt, kunnen gewone gebruikers (en managers) geen activiteiten op OK/NOK zetten — ze zien in plaats daarvan wanneer de test start. Beheerders zijn hiervan altijd uitgezonderd, zodat je zelf kunt voorbereiden/testen. Laat je dit veld leeg, dan geldt (zoals voorheen) geen enkele beperking.
   - Voer daarnaast `ketentest-start-trigger-setup.sql` uit: dit maakt de beperking ook **databasezijdig** hard (via een trigger op `activity_results`), zodat ze niet meer te omzeilen is door de pagina te manipuleren. Zie de sectie hieronder voor details.
3. **Logboek** — voer eenmalig `activity-log-setup.sql` uit. Onder **Beheer → Logboek** zie je de laatste 300 handelingen binnen de actieve ketentest: wie een resultaat (OK/NOK) heeft gezet, en wie een deelname-keuze heeft gemaakt of gewist, met tijdstip en details. Filterbaar per type handeling.

---

## Startmoment ook databasezijdig afgedwongen (nieuw)

Bovenop de client-side blokkade in `app.html` (die blijft ongewijzigd bestaan voor een nette gebruikerservaring) voegt `ketentest-start-trigger-setup.sql` een **databasetrigger** toe op `activity_results`. Die weigert het aanmaken/wijzigen van een resultaat zolang `ketentests.start_op` nog niet bereikt is — ook als iemand de website zelf zou proberen te manipuleren. Beheerders zijn hiervan altijd uitgezonderd. De foutmelding van de trigger wordt in `app.html` netjes getoond (net zoals de bestaande "vorige activiteit moet eerst op OK"-regel dat al deed).

Voer hiervoor eenmalig `ketentest-start-trigger-setup.sql` uit in de Supabase SQL Editor (vereist dat `ketentest-start-setup.sql` al eerder is gedraaid).

---

## Logboek databasezijdig vastgelegd (nieuw)

Het logboek (Beheer → Logboek) werd voorheen vanuit de browser zelf weggeschreven, in een try/catch — bij een verbindingsprobleem werd een handeling dan stilzwijgend niet gelogd. `activity-log-trigger-setup.sql` voegt triggers toe op `activity_results` en `flow_participation` die dit automatisch en betrouwbaar doen, ongeacht wat de browser doet. De client-side logging-code in `app.html` en `deelname.html` is verwijderd om dubbele logregels te voorkomen.

Voer hiervoor eenmalig `activity-log-trigger-setup.sql` uit in de Supabase SQL Editor (vereist dat `activity-log-setup.sql` al eerder is gedraaid). Het Logboek-scherm zelf blijft er identiek uitzien.

---

## Zoeken in de grote overzichten (nieuw)

Bij **Beheer → Gebruikers**, **Beheer → Organisaties** en **Beheer → Testscenario's** staat nu een zoekveld bovenaan de lijst. Typen filtert direct (geen knop nodig):
- Gebruikers: op naam, e-mail of organisatie
- Organisaties: op naam of code
- Testscenario's: op code of titel — dit doorzoekt alle tabbladen (prefixes) tegelijk, niet alleen het actieve tabblad

Dit is puur client-side (geen database-wijziging nodig) en filtert de al geladen lijst.

---

## Voortgang exporteren als PDF (nieuw)

Op het Dashboard staan nu twee exportknoppen, naast "Vernieuwen":

- **Exporteren (dashboard, PDF)** — bevat alles wat op het dashboard staat, in dezelfde volgorde: kerncijfers (incl. totale voortgang), verdeling activiteiten (OK/NOK/Open), scenario's met NOK's, voortgang per organisatie, voortgang per flow, nog te beoordelen per partij, en openstaande NOK's. Geschikt voor een compleet management-overzicht in één document.
- **Exporteren (detail, PDF)** — één rij per activiteit, met alle beschikbare context: flow, scenario (code + titel), stapnummer, activiteit, verwacht resultaat, verantwoordelijke organisatie, acceptant, resultaat, opmerking, en wie het resultaat wanneer heeft ingevuld. Geschikt als volledig audit-trail voor stakeholders.

Beide genereren direct een opgemaakt `.pdf`-bestand (met datum in de bestandsnaam) via jsPDF + de autoTable-plugin — geen los installatiestap nodig, dit werkt gewoon in de browser. Lange overzichten (bijv. bij veel organisaties of NOK's) verdelen zich automatisch over meerdere pagina's. Geen SQL-wijziging nodig — dit gebruikt alleen de data die het dashboard toch al inlaadt.

---

## Releasenotes (nieuw)

Onderaan elke pagina (in de groene voettekst, bij "Over deze tool") staat nu een link **"Releasenotes"** naar een nieuwe pagina `releasenotes.html` — een chronologisch overzicht (nieuwste eerst) van wijzigingen aan het platform, met datum en korte beschrijving per regel.

Dit is bewust een **statische lijst** (geen database), rechtstreeks bijgehouden in `releasenotes.html` zelf. Vanaf nu wordt bij elke wijziging aan de tool expliciet gevraagd of die in de releasenotes moet worden opgenomen; bevestig je dat, dan komt er een nieuwe regel bovenaan de lijst bij. De pagina is ook te bekijken zonder ingelogd te zijn.

---

## Uniek nummer per flow (nieuw)

Elke flow heeft nu een **verplicht, uniek nummer** (uniek binnen de ketentest — twee ketentesten mogen wel dezelfde nummers gebruiken), zodat flows voor alle testende partijen makkelijker te herkennen zijn.

1. Voer eenmalig `flows-nummer-setup.sql` uit in de Supabase SQL Editor. Dit voegt de kolom `nummer` toe én nummert bestaande flows automatisch (op naam, per ketentest, beginnend bij 1) — er hoeft dus niets handmatig ingevuld te worden voordat het veld verplicht wordt.
2. Voer daarna ook `flows-nummer-alfanumeriek-setup.sql` uit: dit maakt het nummer **alfanumeriek** (bijv. "F1" of "3A" mag ook, niet alleen een geheel getal).
2. Bij **Ketentest → Flow** kan een beheerder het nummer aanpassen via het ✏️-icoon (met controle op uniekheid). Nieuwe flows krijgen automatisch het eerstvolgende beschikbare nummer.
3. Het nummer staat voortaan vóór de naam, overal waar de flownaam wordt getoond: de Flow-pagina zelf, Deelname, het Dashboard (schermen én PDF-exports), en de gastweergave.

---

## Flow zichtbaar bij testscenario (nieuw) + bugfix Scenario toevoegen

Bij **Beheer → Testscenario's** zie je nu, naast het aantal activiteiten, een badge 🔗 met de flow (nummer + naam) waarin het scenario is opgenomen — voor scenario's die nog bij geen enkele flow horen, wordt niets getoond. Geen SQL-wijziging nodig.

Daarnaast is een bug uit een eerdere aanpassing hersteld: de modal "Scenario toevoegen" op de Flow-pagina was per ongeluk verwijderd toen de "Flow bewerken"-modal werd toegevoegd, waardoor de knop niets meer deed. Dit werkt nu weer.

Dezelfde flow-badge (🔗 Flow + nummer) is ook toegevoegd aan **Ketentest → Testscenario's** (de pagina die gewone gebruikers zien), in dezelfde stijl als bij Beheer.

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
├── flows-doel-setup.sql  Database uitbreiding: doel-veld per flow
├── flows-nummer-setup.sql Database uitbreiding: verplicht, uniek nummer per flow
├── flows-nummer-alfanumeriek-setup.sql Database uitbreiding: flownummer alfanumeriek maken
├── users-force-password-setup.sql  Database uitbreiding: verplichte wachtwoordwijziging
├── user-ketentest-access-setup.sql Database uitbreiding: ketentesttoegang per gebruiker
├── users-last-login-setup.sql Database uitbreiding: laatste login per gebruiker
├── ketentest-start-setup.sql   Database uitbreiding: startmoment per ketentest
├── ketentest-start-trigger-setup.sql Database uitbreiding: startmoment ook hard afgedwongen (trigger)
├── activity-log-setup.sql     Database uitbreiding: logboek van gebruikershandelingen
├── activity-log-trigger-setup.sql Database uitbreiding: logboek databasezijdig (triggers)
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
