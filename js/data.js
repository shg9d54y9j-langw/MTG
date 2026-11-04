/* Statische Daten: Themes, Brackets, Budgets, Zielwerte */
window.MTG = window.MTG || {};

MTG.data = {
  COLORS: [
    { k: 'w', name: 'Weiß' },
    { k: 'u', name: 'Blau' },
    { k: 'b', name: 'Schwarz' },
    { k: 'r', name: 'Rot' },
    { k: 'g', name: 'Grün' },
  ],

  // q  = Scryfall-Suchfragment, rx = Erkennung im Oracle-Text, edh = EDHREC-Theme-Slug
  THEMES: [
    { id: 'mill', name: 'Mill', edh: 'mill',
      q: '(o:mill OR o:"into their graveyard")',
      rx: /\bmills?\b|into (their|that player's|its owner's) graveyard/i },
    { id: 'voltron', name: 'Voltron', edh: 'voltron',
      q: '(t:equipment OR (t:aura o:"enchanted creature") OR o:"equipped creature" OR o:"double strike")',
      rx: /equipped creature|enchanted creature (gets|has)|\bequip\b|double strike|commander damage/i },
    { id: 'tokens', name: 'Tokens / Go Wide', edh: 'tokens',
      q: '(o:create o:token)',
      rx: /create[^.]*token|tokens? you control|creatures you control get \+/i },
    { id: 'aristocrats', name: 'Aristocrats', edh: 'aristocrats',
      q: '(o:"sacrifice a creature" OR o:"sacrifice another creature" OR o:"creature you control dies" OR o:"another creature you control dies")',
      rx: /sacrifice (a|another) creature|creatures? you control dies?|whenever (a|another) creature (you control )?dies/i },
    { id: 'counters', name: '+1/+1-Marken', edh: 'plus-1-plus-1-counters',
      q: '(o:"+1/+1 counter" OR o:proliferate)',
      rx: /\+1\/\+1 counter|proliferate/i },
    { id: 'spellslinger', name: 'Spellslinger', edh: 'spellslinger',
      q: '(o:"instant or sorcery" OR o:"noncreature spell" OR o:magecraft)',
      rx: /instant or sorcery|noncreature spell|magecraft|copy target (instant|sorcery)/i },
    { id: 'reanimator', name: 'Reanimator', edh: 'reanimator',
      q: '(o:"from a graveyard onto the battlefield" OR o:"from your graveyard onto the battlefield" OR o:"return target creature card from your graveyard")',
      rx: /graveyard (on)?to the battlefield|from (a|your) graveyard onto the battlefield|return target creature card from your graveyard/i },
    { id: 'landfall', name: 'Landfall', edh: 'landfall',
      q: '(o:landfall OR o:"land enters" OR o:"additional land")',
      rx: /landfall|whenever a land (you control )?enters|play an additional land|land cards? from your graveyard/i },
    { id: 'artifacts', name: 'Artefakte', edh: 'artifacts',
      q: '(o:"artifact you control" OR o:"artifacts you control" OR o:"artifact spell" OR o:"artifact enters")',
      rx: /artifacts? you control|artifact spell|artifact enters|affinity for artifacts|improvise/i },
    { id: 'enchantress', name: 'Enchantress', edh: 'enchantress',
      q: '(o:"enchantment spell" OR o:constellation OR o:"enchantments you control")',
      rx: /enchantment spell|constellation|enchantments? you control|aura spell/i },
    { id: 'lifegain', name: 'Lebenspunkte', edh: 'lifegain',
      q: '(o:"gain life" OR o:"you gain life" OR o:lifelink)',
      rx: /gains? (\d+ |x |that much )?life|lifelink|whenever you gain life/i },
    { id: 'blink', name: 'Blink / Flicker', edh: 'blink',
      q: '(o:"return it to the battlefield" OR o:"return that card to the battlefield" OR o:"return those cards to the battlefield")',
      rx: /exile[^.]*(return|returns) (it|that card|them|those cards) to the battlefield/i },
    { id: 'superfriends', name: 'Superfriends', edh: 'superfriends',
      q: '(t:planeswalker OR o:proliferate OR o:loyalty)',
      rx: /planeswalker|loyalty|proliferate/i },
    { id: 'wheels', name: 'Wheels', edh: 'wheels',
      q: '(o:"discards their hand" OR o:"each player discards" OR o:"whenever an opponent draws")',
      rx: /discards? (their|his or her|your) hand|each player (discards|draws)|whenever an opponent draws/i },
    { id: 'grouphug', name: 'Group Hug', edh: 'group-hug',
      q: '(o:"each player draws" OR o:"each player may put" OR o:"each player creates" OR o:"target player draws")',
      rx: /each player (draws|may|creates|adds)|target player draws/i },
    { id: 'stax', name: 'Stax', edh: 'stax',
      q: '(o:"can\'t cast more than" OR o:"don\'t untap" OR o:"enter the battlefield tapped" OR o:"spells cost")',
      rx: /can't cast more than|spells (your opponents cast )?cost \{|don't untap|doesn't untap|enter (the battlefield )?tapped/i },
    { id: 'burn', name: 'Burn / Pinger', edh: 'burn',
      q: '(o:"damage to each opponent" OR o:"damage to target player" OR o:"damage to any target")',
      rx: /damage to (each opponent|target player|any target|each player)/i },
    { id: 'control', name: 'Kontrolle', edh: 'control',
      q: '(o:"counter target" OR o:"destroy target" OR o:"exile target")',
      rx: /counter target|destroy target|exile target|return target [^.]* owner's hand/i },
    { id: 'typal', name: 'Typal (Kreaturentyp)', edh: null, q: null, rx: null },
  ],

  BRACKETS: [
    { n: 1, name: 'Exhibition', desc: 'Ultra-casual, Thema vor Stärke. Keine Game Changer.', maxGC: 0, extraTurns: false, mld: false, maxTutors: 1 },
    { n: 2, name: 'Core', desc: 'Precon-Niveau. Keine Game Changer, keine Massen-Landzerstörung.', maxGC: 0, extraTurns: false, mld: false, maxTutors: 2 },
    { n: 3, name: 'Upgraded', desc: 'Stärker als Precons, bis zu 3 Game Changer.', maxGC: 3, extraTurns: true, mld: false, maxTutors: 4 },
    { n: 4, name: 'Optimized', desc: 'Hohe Stärke, keine Einschränkungen.', maxGC: Infinity, extraTurns: true, mld: true, maxTutors: Infinity },
    { n: 5, name: 'cEDH', desc: 'Kompetitiv, maximale Effizienz.', maxGC: Infinity, extraTurns: true, mld: true, maxTutors: Infinity },
  ],

  // Budget-Stufen für den Deck-Assistenten (in gewählter Währung)
  BUDGETS: [
    { id: 'low', name: 'Sparsam', perCard: 1, total: 100, desc: '≤ 1 pro Karte · ~100 gesamt' },
    { id: 'mid', name: 'Mittel', perCard: 5, total: 250, desc: '≤ 5 pro Karte · ~250 gesamt' },
    { id: 'high', name: 'Hoch', perCard: 20, total: 700, desc: '≤ 20 pro Karte · ~700 gesamt' },
    { id: 'none', name: 'Unbegrenzt', perCard: Infinity, total: Infinity, desc: 'Keine Preisgrenze' },
  ],

  // Budget-Grenze pro Karte für den Analyzer
  CARD_CAPS: [Infinity, 0.5, 1, 2, 5, 10, 20, 50],

  // Richtwerte (Command-Zone-Template)
  TARGETS: { lands: 37, ramp: 10, draw: 10, interaction: 9, wipe: 3 },

  CATEGORY_NAMES: {
    land: 'Länder', ramp: 'Rampe', draw: 'Kartenvorteil', removal: 'Removal',
    counter: 'Counterspells', wipe: 'Board Wipes', tutor: 'Tutoren', theme: 'Theme / Synergie',
    creature: 'Kreaturen', other: 'Sonstiges',
  },

  // Scryfall-Suchfragmente für Kategorien
  CATEGORY_QUERIES: {
    ramp: '-t:land (o:"add {" OR o:"basic land card" OR o:"treasure token" OR o:"land card onto the battlefield")',
    draw: '(o:"draw two cards" OR o:"draw three cards" OR o:"draw a card for each" OR o:"draw cards equal" OR o:"draws a card" OR o:"draw a card")',
    interaction: '-t:land (o:"destroy target" OR o:"exile target" OR o:"counter target" OR o:"return target nonland permanent")',
    wipe: '(o:"destroy all" OR o:"exile all" OR o:"all creatures get -" OR o:"damage to each creature")',
    lands: 't:land -t:basic',
  },

  // Fallback, falls Scryfall das Feld game_changer nicht liefert
  GAME_CHANGERS: [
    'Ad Nauseam', 'Ancient Tomb', 'Aura Shards', 'Biorhythm', "Bolas's Citadel", 'Braids, Cabal Minion',
    'Chrome Mox', 'Coalition Victory', 'Consecrated Sphinx', 'Crop Rotation', 'Cyclonic Rift',
    'Demonic Tutor', 'Drannith Magistrate', 'Enlightened Tutor', 'Field of the Dead', 'Fierce Guardianship',
    'Food Chain', 'Force of Will', "Gaea's Cradle", 'Gamble', 'Gifts Ungiven', 'Glacial Chasm',
    'Grand Arbiter Augustin IV', 'Grim Monolith', 'Humility', 'Imperial Seal', 'Intuition',
    "Jeska's Will", "Lion's Eye Diamond", 'Mana Vault', "Mishra's Workshop", 'Mox Diamond',
    'Mystical Tutor', 'Narset, Parter of Veils', 'Natural Order', 'Necropotence', 'Notion Thief',
    'Opposition Agent', 'Orcish Bowmasters', 'Panoptic Mirror', 'Rhystic Study', 'Seedborn Muse',
    "Serra's Sanctum", 'Smothering Tithe', 'Survival of the Fittest', "Teferi's Protection",
    'Tergrid, God of Fright', "Thassa's Oracle", 'The One Ring', 'The Tabernacle at Pendrell Vale',
    'Underworld Breach', 'Vampiric Tutor', 'Worldly Tutor',
  ],

  BASICS: { w: 'Plains', u: 'Island', b: 'Swamp', r: 'Mountain', g: 'Forest', c: 'Wastes' },
};
