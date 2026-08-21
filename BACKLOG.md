# Backlog: beveiligingsverbeterpunten

Bijgehouden vanaf 2026-08-11, naar aanleiding van een beveiligingsreview voor Zorginstituut Nederland.

Elk punt heeft een status (**Open** / In behandeling / ✅ Afgerond) en een type:
- 🔧 **Bouwwerk** — kan ik voor je implementeren in de code.
- ⚙️ **Instelling** — moet jij zelf configureren in Supabase/Vercel/GitHub (geen code, of een instelling die ik niet namens jou kan/mag wijzigen).

Prioriteit is een eerste inschatting — pas gerust aan.

Bij elk afgerond punt staat een regel **"Doorgevoerd op [datum]"** met wat er precies is gedaan — zo blijft in één oogopslag te zien wanneer welke wijziging is doorgevoerd. Dat overzicht staat ook samengevat in de wijzigingsgeschiedenis hieronder.

---

## Wijzigingsgeschiedenis

| Datum | Punt | Wat is gedaan |
|---|---|---|
| 2026-08-11 | [1. Sterkte van tijdelijke wachtwoorden](#1-sterkte-van-tijdelijke-wachtwoorden) | Woordenlijst, cijfers en symbolen uitgebreid; `crypto.getRandomValues()` i.p.v. `Math.random()` — van ~540.000 naar ~2,3 miljard combinaties. |
| 2026-08-11 | [4. Volledige RLS-audit](#4-volledige-rls-audit) | Volledig afgerond: alle 6 bevindingen doorgevoerd — zelf-promotie-trigger, te ruime flow_nodes-policy verwijderd, users-leesrechten aangescherpt tot beheerder/manager, DELETE-policy toegevoegd op bevindingen, dubbele policies op notification_definitions opgeschoond. Gastlinks-mechanisme (`gast.html`) bleek al veilig via een aparte databasefunctie. |
| 2026-08-11 | [5. CORS op de Edge Function beperken](#5-cors-op-de-edge-function-beperken) | CORS beperkt tot het eigen Vercel-domein in plaats van alle domeinen (`*`). Vereist herdeployen van de Edge Function. |
| 2026-08-11 | [6. Beveiligingsheaders op de website](#6-beveiligingsheaders-op-de-website) | `vercel.json` toegevoegd met X-Frame-Options, CSP, en overige headers. CSP staat noodgedwongen `unsafe-inline` toe (zie kanttekening bij dit punt). |
| 2026-08-11 | [9. Inloggen met inlognaam](#9-inloggen-met-inlognaam-in-plaats-van-e-mailadres) | Fase 1 afgerond: `username`-veld toegevoegd en automatisch gegenereerd voor bestaande gebruikers, beheerinterface uitgebreid. Inloggen zelf werkt nog ongewijzigd met e-mailadres — dat volgt in fase 3, na controle en communicatie. |
| 2026-08-11 | [9. Inloggen met inlognaam](#9-inloggen-met-inlognaam-in-plaats-van-e-mailadres) | Fase 3 voorbereid: migratie-Edge Function + migratiepaneel in Beheer → Gebruikers toegevoegd. De inlogpagina zelf is bewust nog niet omgezet — dat gebeurt pas na een 100% succesvol migratierapport (instructies klaar in `sql/inlognaam-fase3-inlogpagina.md`). |
| 2026-08-11 | [9. Inloggen met inlognaam](#9-inloggen-met-inlognaam-in-plaats-van-e-mailadres) | Volledig afgerond: alle gebruikers succesvol gemigreerd, en de inlogpagina zelf omgezet naar inlognaam-login. Geen echte e-mailadressen meer in de database. |

---

## 1. Sterkte van tijdelijke wachtwoorden
**Type:** 🔧 Bouwwerk · **Prioriteit:** Laag · **Status:** ✅ Afgerond

Het gegenereerde tijdelijke wachtwoord (10 woorden × 9000 getallen × 6 symbolen ≈ 540.000 combinaties) kan sterker: langere/willekeurigere reeksen, of een grotere woordenlijst. Wachtwoord is kort geldig (tot eerste login), dus risico is beperkt, maar eenvoudig te verbeteren.

**Doorgevoerd op 2026-08-11**: twee verschillende woorden uit een woordenlijst van 50 (was 10) + een 5-cijferig getal (was 4) + 1 van 10 symbolen (was 6) ≈ 2,3 miljard combinaties (was ~540.000). Gebruikt nu ook `crypto.getRandomValues()` (cryptografisch veilige willekeur) in plaats van `Math.random()` (niet cryptografisch veilig).

## 2. Geen tweefactorauthenticatie (2FA/MFA)
**Type:** 🔧 Bouwwerk (deels) + ⚙️ Instelling · **Prioriteit:** Middel · **Status:** Open

Alleen wachtwoord-gebaseerd op dit moment. Supabase Auth ondersteunt ingebouwde MFA — te overwegen, met name verplicht voor de rol Beheerder.

## 3. Toegang tot het Supabase Dashboard zelf
**Type:** ⚙️ Instelling · **Prioriteit:** Hoog · **Status:** Open

De rollen in de tool (Beheerder/Manager/Gebruiker) gelden alleen binnen de applicatie. Iedereen met Supabase Dashboard-toegang (Project → Settings → Team) heeft volledige, RLS-omzeilende toegang tot alle data. Review wie hier toegang heeft en beperk tot het minimaal noodzakelijke.

## 4. Volledige RLS-audit
**Type:** 🔧 Bouwwerk (analyse) · **Prioriteit:** Hoog · **Status:** ✅ Afgerond

Door de vele iteraties op dit project is niet met zekerheid te zeggen dat elke tabel een even sluitend RLS-beleid heeft. Systematisch nalopen: kan een ingelogde gebruiker ooit meer zien/muteren dan bedoeld, per tabel?

**Bevindingen (2026-08-11)**, op basis van de daadwerkelijke, actuele policies in de database:

- 🔴 **Kritiek — opgelost**: de UPDATE-policy op `users` voor gewone gebruikers controleerde alleen *welke rij* iemand mag wijzigen (de eigen), niet *welke kolommen*. Een gebruiker kon daardoor, buiten de tool-interface om (rechtstreeks via de Supabase API), zijn eigen rol naar `admin` zetten of zijn organisatie wijzigen. **Doorgevoerd op 2026-08-11**: `sql/voorkom-zelf-promotie-setup.sql` toegevoegd — een trigger die dit op databaseniveau blokkeert voor niet-beheerders, ongeacht welke policy de update verder toestaat.
- 🟠 **Belangrijk — opgelost**: op `flow_nodes` stond een losse, extra policy *"Gebruikers mogen flow nodes updaten"* met als voorwaarde altijd `true` — elke ingelogde gebruiker (ook rol Gebruiker) kon daardoor ongelimiteerd de koppeling tussen scenario's en flows wijzigen. Gecontroleerd: het slepen/bewerken van flow-nodes is in de interface overal al admin-only (`window.isFlowAdmin`), dus geen functie leunt hierop voor gewone gebruikers. **Doorgevoerd op 2026-08-11**: `sql/flow-nodes-policy-verscherpen.sql` toegevoegd — verwijdert deze te ruime policy; de bestaande admin-only policy dekt alle legitieme behoefte.
- 🟡 **Aandachtspunt — opgelost**: op `users` stond een brede `SELECT: true`-policy — elke ingelogde gebruiker kon de volledige gebruikerslijst opvragen (namen, e-mailadressen, rollen, organisaties van iedereen). Raakt rechtstreeks backlog-punt 9. Gecontroleerd waar dit nodig is: alleen Beheer → Gebruikers en het Dashboard (tonen wie een resultaat invulde), beide al beheerder/manager-only. **Doorgevoerd op 2026-08-11**: `sql/users-leesrechten-aanscherpen.sql` toegevoegd — iedereen leest nog het eigen profiel, alleen beheerder/manager zien nog alle profielen.
- ⚪ **Klein — opgelost**: geen DELETE-policy op `bevindingen`. **Doorgevoerd op 2026-08-11**: `sql/bevindingen-delete-policy-setup.sql` toegevoegd — admin-only DELETE.
- ⚪ **Klein — opgelost**: 6 (deels overlappende/dubbele) policies op `notification_definitions`. **Doorgevoerd op 2026-08-11**: `sql/notification-definitions-policies-opschonen.sql` toegevoegd — overbodige policies verwijderd, functioneel ongewijzigd.
- ℹ️ **Opgehelderd, geen actie nodig**: `gast.html` gebruikt geen directe tabeltoegang, maar een aparte databasefunctie (`get_guest_ketentest_data`) die zelf de gastlink-token controleert en gecureerde data teruggeeft — een ander, prima veilig patroon. Geen policy voor rol `anon` nodig.

## 5. CORS op de Edge Function beperken
**Type:** 🔧 Bouwwerk · **Prioriteit:** Middel · **Status:** ✅ Afgerond

De functie `reset-user-password` staat nu open voor alle origins (`Access-Control-Allow-Origin: *`). Beperken tot alleen het eigen Vercel-domein.

**Doorgevoerd op 2026-08-11**: CORS beperkt tot `https://ketentest-bemiddelingsregister.vercel.app` (in plaats van `*`), via een allowlist die desgewenst uit te breiden is (bijv. voor preview-omgevingen). **Vereist herdeployen** van de Edge Function met de nieuwe code — zie `sql/reset-user-password-edge-function.md`.

## 6. Beveiligingsheaders op de website
**Type:** 🔧 Bouwwerk · **Prioriteit:** Middel · **Status:** ✅ Afgerond

Geen expliciete headers ingesteld (Content-Security-Policy, X-Frame-Options, etc.). Toe te voegen via `vercel.json` — extra laag tegen bijvoorbeeld clickjacking.

**Doorgevoerd op 2026-08-11**: `vercel.json` toegevoegd met `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, en een `Content-Security-Policy` die alleen de daadwerkelijk gebruikte externe bronnen toestaat (jsDelivr voor de bibliotheken, Google Fonts, het eigen Supabase-project) en framing door andere sites volledig blokkeert (`frame-ancestors 'none'`).

**Eerlijke kanttekening**: de CSP staat `'unsafe-inline'` toe voor scripts én stijlen. Dat is nodig omdat de hele tool is opgebouwd met inline `<script>`-blokken en `style="..."`-attributen door de hele codebase heen — zonder `unsafe-inline` zou de tool niet meer werken. Dit betekent dat de CSP wél bescherming biedt tegen bijvoorbeeld het laden van scripts vanaf onbekende, externe domeinen, maar **niet** de sterkste vorm van bescherming tegen cross-site scripting (XSS) binnen de pagina zelf. Een striktere CSP zou een grote herstructurering vereisen (alle inline code naar losse bestanden verplaatsen) — dat is een aparte, grotere overweging als dit ooit verder aangescherpt moet worden.

Wordt automatisch actief bij de eerstvolgende Vercel-deployment, geen aparte instelling nodig.

## 7. Toegang tot de GitHub-repository
**Type:** ⚙️ Instelling · **Prioriteit:** Middel · **Status:** Open

Wie kan code wijzigen en (via Vercel) live zetten? Niet direct een databasekwestie, maar wel onderdeel van de beveiligingsketen — review wie push-toegang heeft.

## 8. Auditlogboek uitbreiden naar login-pogingen
**Type:** 🔧 Bouwwerk · **Prioriteit:** Laag · **Status:** Open

Er is al een logboek van datamutaties, maar (mislukte) inlogpogingen worden niet apart bijgehouden. Nuttig bij het detecteren van bijv. brute-force-pogingen.

---

## 9. Inloggen met inlognaam in plaats van e-mailadres
**Type:** 🔧 Bouwwerk (grotere impact) · **Prioriteit:** Middel · **Status:** ✅ Afgerond

Momenteel wordt ingelogd met een e-mailadres, wat betekent dat er (mogelijk herleidbare) mailadressen in de database staan. Doel: inloggen met een gekozen inlognaam, zodat echte e-mailadressen niet meer opgeslagen hoeven te worden.

**Gekozen aanpak** (na overleg): één overstapmoment, geen langdurige periode met twee inlogmethodes tegelijk in de code.

**Doorgevoerd op 2026-08-11 (fase 1)**: `sql/inlognaam-fase1-setup.sql` — voegt het `username`-veld toe en genereert het voor bestaande gebruikers. `admin.html` uitgebreid met het inlognaam-veld (aanmaken/bewerken) en een kolom in het overzicht.

**Doorgevoerd op 2026-08-11 (fase 3, voorbereidend)**: Edge Function `migrate-to-username-login` + migratiepaneel in Beheer → Gebruikers, waarmee alle bestaande gebruikers zijn gemigreerd (echte e-mailadressen vervangen door `<inlognaam>@ketentest.invalid`, wachtwoorden ongewijzigd) — bevestigd 100% succesvol.

**Doorgevoerd op 2026-08-11 (fase 3, afronding)**: de inlogpagina (`index.html`) zelf is omgezet — het veld heet nu "Inlognaam" i.p.v. "E-mailadres", en de ingevoerde inlognaam wordt automatisch omgezet naar het schijn-adres bij het inloggen. De e-mail-gebaseerde "Wachtwoord vergeten"-link (die na de omschakeling toch niet meer zou werken) is vervangen door een verwijzing naar de beheerder — die kan via Beheer → Gebruikers → "Nieuw tijdelijk wachtwoord instellen" een nieuw wachtwoord zetten.

**Resultaat**: er staan geen echte, herleidbare e-mailadressen meer in de database. Gebruikers loggen voortaan in met hun inlognaam (`voornaam.achternaam`).

---

## Al geregeld (ter referentie, geen actie nodig)
- Row Level Security (RLS) op databaseniveau, niet alleen in de interface
- Service-role-sleutel nooit in browser-code, alleen server-side in de Edge Function
- Verplichte wachtwoordwijziging bij eerste login
- TLS/HTTPS overal, versleuteling op schijfniveau (AES-256)
- EU-hosting (West EU, Ierland — AWS eu-west-1)
- Rolgebaseerde rechten, ook afgedwongen in de database

---

# Backlog: functionele wensen

Losse lijst met functionele verbeterpunten (geen beveiliging) — zelfde format als hierboven.

## 1. Inhoudelijke informatie toevoegen aan onderling uit te voeren testscenario's
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** ✅ Afgerond (bevestigd getest op 2026-08-14)

Mogelijkheid toevoegen om bij testscenario's die tussen organisaties onderling worden uitgevoerd, extra inhoudelijke informatie/context toe te voegen.

**Wat er uiteindelijk is gebouwd** (afwijkend van de oorspronkelijke uitvraag hieronder, na voortschrijdend inzicht tijdens het testen):

- Drie vaste groepen: **Algemeen** (Clientnaam, BSN, Verantwoordelijk Zorgkantoor — hoort bij het startscenario van een flow, elders alleen-lezen), **Toewijzing** en **Regierol** (beide herhaalbare blokken, bijv. "Toewijzing 1", "Toewijzing 2", met een tijdlijn-visualisatie).
- Kenmerken **stromen mee door een flow**: vult een gebruiker iets in bij het startscenario, dan "erft" het volgende scenario in de flow dat automatisch. Past de gebruiker daar iets aan, dan ontstaat een eigen kopie (fork) vanaf dat punt — het scenario waar het vandaan kwam blijft ongewijzigd.
- Rechten: alleen betrokken organisaties (verantwoordelijke/acceptant) + de beheerder mogen zien/bewerken.
- Kenmerk-definities (welke velden bestaan, met welk type/validatie) zijn beheerder-configureerbaar bij Beheer → Functionele kenmerken.

**Bekende, inmiddels opgeloste bug**: `flow_edges.from_id/to_id` bleken (ondanks de naam) scenario-ID's te bevatten i.p.v. node-ID's, waardoor het "doorstromen" door de flow eerst niet werkte. Gefixt op 2026-08-14 — wacht nog op bevestiging van test.

<details>
<summary>Oorspronkelijke uitvraag (2026-08-12) — deels achterhaald door bovenstaande</summary>

- **Niveau**: twee velden, geen één. Eén veld op **flow-niveau** (geldt voor de hele flow) én één veld op **scenario-niveau** (specifiek voor dat scenario binnen de flow). Zichtbaar/bewerkbaar zowel bij de flow-weergave als bij het scenario zelf.
- **Wie mag bewerken**: alleen de bij die flow/dat scenario **betrokken organisaties** (verantwoordelijke/acceptant) — niet elke ingelogde gebruiker, en niet uitsluitend de beheerder.
- **Wie mag lezen**: dezelfde betrokken organisaties (rol gebruiker én manager) plus de beheerder. Niet-betrokken organisaties zien het niet.
- **Structuur**: één **gedeeld** veld per flow en één gedeeld veld per scenario — dus niet apart per organisatie en niet als los gespreks-/opmerkingenlog (zoals bij bevindingen), maar één plek waar beide betrokken organisaties gezamenlijk de informatie bijhouden.
- **Inhoud**: geen vrije tekst alleen, maar **losse, gestructureerde velden** met aanvullende functionele gegevens die relevant zijn voor het Bemiddelingsregister-domein.

</details>

## 2. Waarschuwing bij lang openstaande activiteiten
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Als een activiteit langere tijd (bijv. 5 werkdagen, instelbaar) op "open" blijft staan zonder resultaat, een signalering richting de verantwoordelijke organisatie — bijv. een badge in de tool, mogelijk aangevuld met een e-mail. Nu moet iedereen zelf actief de tool checken; dit maakt vastlopende scenario's eerder zichtbaar.

## 3. Doorlooptijd-statistieken
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Inzicht in de gemiddelde tijd tussen het moment dat een activiteit vrijkomt (vorige activiteit op OK) en het moment dat er zelf een resultaat op wordt gezet, per organisatie. Helpt bottlenecks in de keten vroegtijdig herkennen in plaats van pas achteraf via de NOK-opvolging.

## 4. Ketentest expliciet afsluiten/archiveren met eindrapport
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** 🧪 In test — afsluiten/heropenen + RLS-afdwinging gebouwd, eindrapport nog niet

Een duidelijke "afgerond"-status voor een hele ketentest, met een overzichtelijk eindrapport (aantal geslaagde scenario's, aantal NOK's, doorlooptijden). Nuttig voor evaluatie achteraf en om aan te tonen richting Zorginstituut Nederland dat een ketentest volledig en correct is doorlopen.

**Uitgewerkt voorstel (2026-08-14) — goedgekeurd, nog te bouwen:**

- **Status op de ketentest**: actief → afgesloten. Alleen de beheerder kan afsluiten (en zo nodig weer heropenen, met bevestiging).
- **Bij afsluiten**: vooraf een samenvattend overzicht met eventuele waarschuwingen (bijv. nog openstaande scenario's/bevindingen) — puur informatief, blokkeert het afsluiten niet.
- **Na afsluiten**: de ketentest wordt alleen-lezen (geen OK/NOK, geen functionele kenmerken, geen nieuwe bevindingen meer) — afgedwongen via RLS, niet alleen in de interface. Duidelijk zichtbaar label "Afgesloten" (bijv. in de ketentest-kiezer).
- **Eindrapport, inhoud**: aantal scenario's (totaal/OK/NOK/open), aantal bevindingen per status, doorlooptijd (start- tot afsluitdatum), betrokken organisaties en hun deelname. Downloadbaar als PDF en/of Excel, aansluitend bij de bestaande export bij Deelname.
- **Waar**: knop "Ketentest afsluiten" bij Beheer → Ketentesten. Het eindrapport is ook al vóór het afsluiten te bekijken/downloaden, als tussentijdse rapportage.
- **Wie mag het eindrapport bekijken/downloaden**: de beheerder + managers van de betrokken organisaties (niet de reguliere gebruikersrol, en niet organisaties die geen deel uitmaken van de ketentest).

## 5. Ketentest dupliceren als sjabloon
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Een nieuwe ketentest kunnen starten op basis van een eerdere (scenario's, activiteiten, flows overnemen), zodat bij een volgende testronde niet alles opnieuw handmatig ingevoerd hoeft te worden.

## 6. Notitie toevoegen bij een OK
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** ✅ Afgerond (bleek al te bestaan, bevestigd getest op 2026-08-14)

Blijkt al te werken: het notitie-icoontje naast de OK/NOK-knoppen is niet gekoppeld aan de resultaatstatus — een opmerking kan bij elke activiteit worden toegevoegd, ongeacht of die op OK, NOK of nog open staat. Geen wijziging nodig geweest.

## 7. Bulk OK/NOK zetten
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Meerdere gelijksoortige activiteiten in één keer op OK (of NOK) kunnen zetten, in plaats van dat één voor één te moeten doen.

## 8. Ketentestplan inzichtelijk maken via de monitor
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Het (voorafgaand vastgestelde) ketentestplan zelf inzichtelijk maken in de tool — nog nader te specificeren wat dit precies moet omvatten (bijv. een document/overzicht van de opzet en scope van de ketentest, planning/tijdlijn, betrokken organisaties en scenario's) en waar/voor wie dit zichtbaar moet zijn.

## 9. Bemiddelingsregister fase 2: inrichten functionele lijsten
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Functionele lijsten inrichten voor de ketentest Bemiddelingsregister fase 2 — nog nader te specificeren wat dit precies omvat.

---

# Backlog: technische schuld

Structurele verbeterpunten aan de codebase zelf (geen zichtbare functionaliteit voor gebruikers, wel belangrijk voor onderhoudbaarheid en betrouwbaarheid) — zelfde format als hierboven.

## 1. Geen gedeelde sjabloon voor header/footer/navigatie
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Elke pagina (12 stuks) heeft een eigen kopie van de navigatiebalk en footer. Elke wijziging daaraan moet handmatig in alle bestanden worden doorgevoerd — foutgevoelig, en de directe oorzaak van een eerdere bug (de organisatienaam die op een deel van de pagina's ontbrak).

## 2. Cache-versienummer handmatig bijgewerkt
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Bij elke wijziging aan `js/supabase-config.js` moet het cache-busting versienummer (`?v=NN`) handmatig in alle 12 bestanden worden bijgewerkt. Makkelijk te vergeten, en meermaals de oorzaak geweest van "het werkt bij mij niet"-meldingen na een deploy.

## 3. Gedupliceerde JS-logica tussen pagina's
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Functionaliteit die niet in het gedeelde bestand staat (bijv. wachtwoord-generatie, delen van de navigatie-rendering) bestaat los per pagina, met risico op onderlinge drift.

## 4. Geen overzicht van uitgevoerde SQL-migraties
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Er zijn inmiddels tientallen losse SQL-migratiebestanden. Of een script al is uitgevoerd, wordt nu alleen bijgehouden via geheugen of handmatige vlaggen (zoals `wanneer_activiteit_toegevoegd`). Een simpele migraties-tabel die bijhoudt wat al is uitgevoerd, zou dit soort verwarring voorkomen.

## 5. Tabel `scenario_participation` is legacy
**Type:** 🔧 Bouwwerk (opruimen) · **Prioriteit:** Laag · **Status:** Open

Deze tabel is vervangen door `flow_participation`, maar staat nog in de database. Op te ruimen zodra bevestigd is dat niets er meer op leunt.

## 6. Geen geautomatiseerde tests
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Elke wijziging wordt nu alleen op syntax gecontroleerd, niet functioneel getest. Een regressie kan onopgemerkt blijven tot een gebruiker 'm tegenkomt.

## 7. Volledig handmatig deploy-proces, geen preview-omgeving
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Zip downloaden → naar GitHub uploaden → hopen dat Vercel deployt, zonder tussenstap om te controleren of een wijziging daadwerkelijk live staat. Een preview-deployment (Vercel biedt dit standaard bij pull requests) zou dit type verwarring voorkomen.

## 8. Geen foutmonitoring
**Type:** 🔧 Bouwwerk · **Prioriteit:** Nog te bepalen · **Status:** Open

Problemen worden nu alleen ontdekt via een gebruikersmelding, niet automatisch gesignaleerd (bijv. via een dienst als Sentry).

---

# Scenario-correcties

Inhoudelijke correcties aan scenario-data zelf (teksten, gekoppelde zorgkantoren, notificaties) staan niet in deze backlog, maar in een apart bestand: **`SCENARIO-CORRECTIES.md`**. Dat zijn aanpassingen die je zelf doorvoert in Beheer → Testscenario's, geen wijzigingen aan de tool.
