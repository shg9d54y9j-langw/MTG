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

**Deck-Assistent**
1. Lieblingsfarben (genau oder als Obergrenze)
2. Bracket 1–5
3. Deckziel / Themes (Mill, Voltron, Tokens, Aristocrats, +1/+1-Marken, Spellslinger, Reanimator, Landfall, Artefakte, Enchantress, Lebenspunkte, Blink, Superfriends, Wheels, Group Hug, Stax, Burn, Kontrolle, Typal …)
4. Budget-Stufe
5. Optional: eigener Commander

→ Commander-Vorschläge → komplettes 100-Karten-Deck (Rampe/Draw/Interaktion/Wipes/Theme/Länder, Basics nach Farbsymbolen verteilt), als Text kopierbar oder als `.txt` speicherbar.

## Datenquellen

- [Scryfall API](https://scryfall.com/docs/api) – Kartendaten, Preise (EUR/USD), Popularität (`edhrec_rank`), Game-Changer-Flag
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
```

## Struktur

```
index.html
css/style.css
js/data.js     Themes, Brackets, Budgets, Richtwerte
js/api.js      Scryfall- & EDHREC-Zugriff (Rate-Limit, Cache)
js/cards.js    Parser, Kategorien, Preise
js/engine.js   Analyse, Adds/Cuts, Commander-Vorschläge, Deck-Generator
js/app.js      Oberfläche
```

Inoffizielles Fan-Projekt, nicht mit Wizards of the Coast verbunden.
