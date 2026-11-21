# Commander Werkstatt

Statische Website für MTG-Commander-Decks – ohne Server, ohne Build-Schritt.

## Funktionen

**Deck analysieren**
- Deckliste einfügen (Moxfield-, Archidekt-, MTGA- und MTGO-Format, Commander per `Commander`-Abschnitt oder `*CMDR*`)
- Statistiken: Länder, Rampe, Kartenvorteil, Interaktion, Board Wipes, Manakurve, Deckpreis
- Bracket-Einschätzung (Game Changer, Extra-Züge, Massen-Landzerstörung, Tutoren) gegen dein Ziel-Bracket
- Regelprüfung: Deckgröße, Farbidentität, Bannliste, Singleton
- **Cuts** mit Begründung (wenig gespielt, hohe Manakosten, passt nicht zum Theme, über Bracket/Budget …)
- **Adds** nach fehlenden Kategorien plus Synergie-Karten für deinen Commander
- **Budget**: Preisgrenze pro Karte und günstigere Alternativen für teure Karten
- Adds/Cuts abhaken → angepasste Liste kopieren oder übernehmen

**Precons**
- Alle 200 Commander-Precons (MTGJSON) durchsuchen – nach Name, Commander, Set und Farben
- Pro Precon: Statistiken, Bracket, automatisch erkannte Themes, Cuts & Adds
- **Schnelles Upgrade-Paket**: 5/10/15 Tausche im gewählten Budget inkl. Gesamtkosten, Einkaufsliste und upgedateter Liste
- **Umbau-Ideen**: alternative Commander (aus dem Deck selbst, ähnliche laut EDHREC, passend zu den Themes) mit Angabe, wie viele Karten spielbar bleiben – per Klick als Umbau analysieren

**Neue Commander**
- Alle neu gedruckten Commander (keine Reprints) live von Scryfall – aus Sets, Commander-Precons und **Secret Lair** Drops, inklusive bereits angekündigter Karten
- Zeitraum 30 Tage bis 1 Jahr, gruppiert nach Set und Erscheinungsdatum
- Filter: Quelle (Secret Lair / Precons / Sets / nur angekündigt), Farben, Textsuche; Sortierung nach Erscheinen, Beliebtheit, Preis oder Name
- Pro Commander: „Deck bauen“ (direkt im Deck-Assistenten) und Link zu EDHREC

**Life Counter**
- 2–6 Spieler, Startleben 20/30/40; jedes Feld zum Spieler am Tisch gedreht (Hoch- und Querformat)
- Tippen ±1, gedrückt halten ±10, Delta-Pille der letzten Änderung
- **Commander-Hintergründe**: jeder Commander als randloses Wallpaper mit langsamer Kamerafahrt – Suche, beliebte Commander, Zufall und Auswahl aller Artworks; das Auswahlfenster öffnet sich zum jeweiligen Spieler gedreht
- **Animationen**: Einflug + Hochzählen beim Start, rollende Zahlen, Tipp-Wellen, grüner/roter Blitz, pulsierende Warnung bei wenig Leben, Sieg mit Krone und Konfetti, W20 mit Kritisch/Patzer; abschaltbar (respektiert „Bewegung reduzieren“)
- **Zahlenschriften**: Kantig (Big Shoulders Display), Rund (Unbounded), Episch (Cinzel), Clean (Inter) – lokal eingebunden, offline verfügbar
- Pro Spieler: Commander-Schaden je Gegner (zieht Leben ab, 21 = raus), Gift, Commander-Steuer, Energie, Erfahrung, Name, Farbe
- Menü: Spielzeit, W20/W6/Münze, zufälliger Startspieler, Verlauf, Neustart, Vollbild
- Bildschirm bleibt an, Spielstand wird automatisch gespeichert; direkt aufrufbar über `#life`

**Als App (PWA)**
- Installierbar auf iPhone/Android/PC (Manifest, Icons, Service Worker), startet im Vollbild
- Offline nutzbar: App-Dateien, Precon-Listen, Schriften und geladene Kartenbilder werden zwischengespeichert
- Bei Änderungen an App-Dateien `VERSION` in `sw.js` und die `?v=`-Parameter in `index.html` erhöhen

**Deck-Assistent**
1. Lieblingsfarben (genau oder als Obergrenze)
2. Bracket 1–5
3. Deckziel / Themes (Mill, Voltron, Tokens, Aristocrats, +1/+1-Marken, Spellslinger, Reanimator, Landfall, Artefakte, Enchantress, Lebenspunkte, Blink, Superfriends, Wheels, Group Hug, Stax, Burn, Kontrolle, Typal …)
4. Budget-Stufe
5. Optional: eigener Commander

→ Commander-Vorschläge → komplettes 100-Karten-Deck (Rampe/Draw/Interaktion/Wipes/Theme/Länder, Basics nach Farbsymbolen verteilt), als Text kopierbar oder als `.txt` speicherbar.

## Datenquellen

- [Scryfall API](https://scryfall.com/docs/api) – Kartendaten, Preise (EUR/USD), Popularität (`edhrec_rank`), Game-Changer-Flag
- [MTGJSON](https://mtgjson.com) – Precon-Decklisten, gebündelt in `data/precons.js` (aktualisieren: `NODE_USE_ENV_PROXY=1 node tools/build-precons.js`)
- [EDHREC](https://edhrec.com) JSON – Spielhäufigkeit und Synergie pro Commander. Das ist **keine offizielle API**; ist sie nicht erreichbar (z. B. wegen CORS), arbeitet die Seite automatisch nur mit Scryfall-Daten weiter.

## Starten

`index.html` direkt im Browser öffnen – oder lokal servieren:

```bash
python3 -m http.server 8000
# http://localhost:8000
```

Zum Veröffentlichen eignet sich GitHub Pages (Settings → Pages → Branch wählen, Ordner `/`).

## Tests

```bash
node test/parser.test.js          # Parser & Kartenkategorien
node test/smoke.js                # UI-Durchlauf mit gemockten APIs (Playwright)
node test/smoke.js --edhrec       # dasselbe mit gemockten EDHREC-Daten
node test/live.js                 # kompletter Durchlauf gegen die echten APIs (Netz nötig)
node test/live-new.js             # Tab „Neue Commander“ gegen Scryfall
node test/life.js                 # Life Counter + App/Offline (lokaler Server)
node test/live-life.js            # Commander-Hintergründe, Schriften, Animationen (Netz nötig)
```

## Struktur

```
index.html
css/style.css
data/precons.js  Precon-Listen (generiert)
tools/build-precons.js
js/data.js     Themes, Brackets, Budgets, Richtwerte
js/api.js      Scryfall- & EDHREC-Zugriff (Rate-Limit, Cache)
js/cards.js    Parser, Kategorien, Preise
js/engine.js   Analyse, Adds/Cuts, Commander-Vorschläge, Deck-Generator
js/app.js      Oberfläche
js/life.js     Life Counter
sw.js          Service Worker (Offline/App)
manifest.webmanifest, icons/  App-Manifest und Icons (tools/make-icons.js)
fonts/         Lokale Schriften (SIL OFL, siehe fonts/LICENSE.md)
```

Inoffizielles Fan-Projekt, nicht mit Wizards of the Coast verbunden.
