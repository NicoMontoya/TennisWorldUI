// TennisWorld — Static bracket draw orders
// Keyed by tournament name keyword + year + tour.
// Each entry is an array of 64 [p1, p2] pairs in top-to-bottom bracket order.
// Pair index i corresponds to R128 match i; winner advances to slot i>>1 in R64.
//
// Add a new entry each Grand Slam / Masters draw day from the official draw sheet.
// Names use the last-name (or compound last-name) portion — matched case-insensitively
// against the API player name as a substring.
// ─────────────────────────────────────────────────────────────────────────────────

window.TW = window.TW || {};

TW.BRACKET_SLOTS = {

    // ── US Open 2026 ATP (128 draw) ─────────────────────
    // Source: en.wikipedia.org 2026 US Open Men's singles (?action=raw)
    //   Sections 1-8 (top->bottom) RD1 team order. Cross-validated 64/64 against
    //   the RapidAPI fixtures feed (every match mapped uniquely, no collisions).
    // API returns 'U.S. Open - New York'; the 'us open' key matches via substring.
    'us open|2026|ATP': [
        /* 00 */ ['Zverev',               'Sonego'],
        /* 01 */ ['Halys',                'Diaz Acosta'],
        /* 02 */ ['Dimitrov',             'Popyrin'],
        /* 03 */ ['Hanfmann',             'Tabilo'],
        /* 04 */ ['Darderi',              'Wendelken'],
        /* 05 */ ['Svrcina',              'Royer'],
        /* 06 */ ['Sweeny',               'Moutet'],
        /* 07 */ ['Fery',                 'Musetti'],
        /* 08 */ ['Jodar',                'Kokkinakis'],
        /* 09 */ ['Marozsan',             'Zheng'],
        /* 10 */ ['Svajda',               'Altmaier'],
        /* 11 */ ['Cerundolo',            'Ruud'],
        /* 12 */ ['Bergs',                'Taberner'],
        /* 13 */ ['de Jong',              'Passaro'],
        /* 14 */ ['Choinski',             'van de Zandschulp'],
        /* 15 */ ['Guerrieri',            'de Minaur'],
        /* 16 */ ['Auger-Aliassime',      'Hijikata'],
        /* 17 */ ['Burruchaga',           'Khachanov'],
        /* 18 */ ['Molcan',               'Bonzi'],
        /* 19 */ ['Giron',                'Buse'],
        /* 20 */ ['Mensik',               'Mochizuki'],
        /* 21 */ ['Rodionov',             'Mpetshi Perricard'],
        /* 22 */ ['Vallejo',              'Monfils'],
        /* 23 */ ['Borges',               'Tien'],
        /* 24 */ ['Fritz',                'Dar Blanch'],
        /* 25 */ ['Bellucci',             'Piros'],
        /* 26 */ ['Ugo Carabelli',        'Struff'],
        /* 27 */ ['Misolic',              'Cerundolo'],
        /* 28 */ ['Blockx',               'Barrios Vera'],
        /* 29 */ ['Shang',                'Trungelliti'],
        /* 30 */ ['Basavareddy',          'Schoolkate'],
        /* 31 */ ['Comesana',             'Cobolli'],
        /* 32 */ ['Medvedev',             'Gaston'],
        /* 33 */ ['Gorzny',               'Collignon'],
        /* 34 */ ['Munar',                'Atmane'],
        /* 35 */ ['Shimabukuro',          'Rinderknech'],
        /* 36 */ ['Vacherot',             'Kovacevic'],
        /* 37 */ ['Majchrzak',            'Medjedovic'],
        /* 38 */ ['Vukic',                'Sakamoto'],
        /* 39 */ ['Damm',                 'Tiafoe'],
        /* 40 */ ['Nakashima',            'Baez'],
        /* 41 */ ['Michelsen',            'Cina'],
        /* 42 */ ['Merida',               'Fucsovics'],
        /* 43 */ ['Cilic',                'Rublev'],
        /* 44 */ ['Etcheverry',           'Kopriva'],
        /* 45 */ ['Landaluce',            'Fearnley'],
        /* 46 */ ['Berrettini',           'Wawrinka'],
        /* 47 */ ['Navone',               'Djokovic'],
        /* 48 */ ['Shelton',              'Griekspoor'],
        /* 49 */ ['Dzumhur',              'Hurkacz'],
        /* 50 */ ['Kecmanovic',           'Shapovalov'],
        /* 51 */ ['Van Assche',           'Norrie'],
        /* 52 */ ['Lehecka',              'Carreno Busta'],
        /* 53 */ ['Samuel',               'Machac'],
        /* 54 */ ['Harris',               'Kennedy'],
        /* 55 */ ['Tsitsipas',            'Fils'],
        /* 56 */ ['Bublik',               'Wolf'],
        /* 57 */ ['Tirante',              'Mannarino'],
        /* 58 */ ['Prizmic',              'Shevchenko'],
        /* 59 */ ['Wong',                 'Paul'],
        /* 60 */ ['Arnaldi',              'Duckworth'],
        /* 61 */ ['Wu',                   'Walton'],
        /* 62 */ ['Faria',                'Brooksby'],
        /* 63 */ ['Safiullin',            'Alcaraz'],
    ],

    // ── Citi Open / Washington 2026 ATP (32 draw) ───────────────────────────────
    // Source: en.wikipedia.org/wiki/2026_Mubadala_Citi_DC_Open_–_Men's_singles
    //   raw wikitext (?action=raw) RD1-team order, cross-validated against the
    //   RapidAPI fixtures feed (11/16 matchups confirmed; 5 were qualifier slots).
    // API returns "Citi Open - Washington"; the 'washington' key matches via substring.
    // NB: two different Svajdas — Trevor (Q, slot 4) and Zachary (LL, slot 11);
    //     each pair's partner (Mensik / Vukic) disambiguates the match.
    'washington|2026|ATP': [
        /* 00 */ ['De Minaur',   'Tsitsipas'],
        /* 01 */ ['Giron',       'Hewitt'],
        /* 02 */ ['Nakashima',   'Etcheverry'],
        /* 03 */ ['Svajda',      'Mensik'],
        /* 04 */ ['Fritz',       'Bergs'],
        /* 05 */ ['Majchrzak',   'Paul'],
        /* 06 */ ['Michelsen',   'Draper'],
        /* 07 */ ['Mannarino',   'Tien'],
        /* 08 */ ['Fils',        'Jodar'],
        /* 09 */ ['Nishikori',   'Shang'],
        /* 10 */ ['Vukic',       'Svajda'],
        /* 11 */ ['Arnaldi',     'Musetti'],
        /* 12 */ ['Tiafoe',      'Atmane'],
        /* 13 */ ['Tabilo',      'Griekspoor'],
        /* 14 */ ['Humbert',     'Martin'],
        /* 15 */ ['Damm',        'Shelton'],
    ],

    // ── Wimbledon 2026 ATP ─────────────────────────────────────────────────────
    // Source: www.wimbledon.com/en_GB/draws/gentlemens-singles/1 (official draw order).
    // API returns "Wimbledon - London"; the 'wimbledon' key matches via substring.
    'wimbledon|2026|ATP': [
        /* 00 */ ['Sinner',             'Kecmanovic'],
        /* 01 */ ['Borges',             'Boyer'],
        /* 02 */ ['Vukic',              'Brooksby'],
        /* 03 */ ['Nava',               'Buse'],
        /* 04 */ ['Jodar',              'Gill'],
        /* 05 */ ['Shapovalov',         'Carreno Busta'],
        /* 06 */ ['Mochizuki',          'Basing'],
        /* 07 */ ['Quinn',              'Darderi'],
        /* 08 */ ['Ruud',               'Hurkacz'],
        /* 09 */ ['Medjedovic',         'Ofner'],
        /* 10 */ ['Kwon',               'Landaluce'],
        /* 11 */ ['Muller',             'Paul'],
        /* 12 */ ['Nakashima',          'Pinnington Jones'],
        /* 13 */ ['Struff',             'Baez'],
        /* 14 */ ['Ugo Carabelli',      'Merida'],
        /* 15 */ ['Cilic',              'Medvedev'],
        /* 16 */ ['Auger-Aliassime',    'Shevchenko'],
        /* 17 */ ['Walton',             'Prizmic'],
        /* 18 */ ['Vallejo',            'Mejia'],
        /* 19 */ ['Zheng',              'Norrie'],
        /* 20 */ ['Davidovich Fokina',  'Cerundolo'],
        /* 21 */ ['Tirante',            'Marozsan'],
        /* 22 */ ['Van Assche',         'Fucsovics'],
        /* 23 */ ['Svrcina',            'Tien'],
        /* 24 */ ['Rublev',             'Safiullin'],
        /* 25 */ ['Kovacevic',          'van de Zandschulp'],
        /* 26 */ ['de Jong',            'Hijikata'],
        /* 27 */ ['Bautista Agut',      'Fonseca'],
        /* 28 */ ['Rinderknech',        'Tarvet'],
        /* 29 */ ['Trungelliti',        'Damm'],
        /* 30 */ ['Gaston',             'Tsitsipas'],
        /* 31 */ ['Wu',                 'Djokovic'],
        /* 32 */ ['de Minaur',          'Burruchaga'],
        /* 33 */ ['Mannarino',          'Droguet'],
        /* 34 */ ['Llamas Ruiz',        'Svajda'],
        /* 35 */ ['Majchrzak',          'Tabilo'],
        /* 36 */ ['Khachanov',          'Harris'],
        /* 37 */ ['Hanfmann',           'Mpetshi Perricard'],
        /* 38 */ ['Griekspoor',         'Duckworth'],
        /* 39 */ ['Navone',             'Cobolli'],
        /* 40 */ ['Mensik',             'Samuel'],
        /* 41 */ ['Sweeny',             'Dimitrov'],
        /* 42 */ ['Wawrinka',           'Berrettini'],
        /* 43 */ ['Collignon',          'Fils'],
        /* 44 */ ['Humbert',            'Bergs'],
        /* 45 */ ['Shimabukuro',        'Faria'],
        /* 46 */ ['Dzumhur',            'Fery'],
        /* 47 */ ['Virtanen',           'Shelton'],
        /* 48 */ ['Fritz',              'Lajovic'],
        /* 49 */ ['Kypson',             'McDonald'],
        /* 50 */ ['Bonzi',              'Diallo'],
        /* 51 */ ['Sonego',             'Etcheverry'],
        /* 52 */ ['Tiafoe',             'Atmane'],
        /* 53 */ ['Kopriva',            'Choinski'],
        /* 54 */ ['Jacquet',            'Gaubas'],
        /* 55 */ ['Kokkinakis',         'Bublik'],
        /* 56 */ ['Lehecka',            'Popyrin'],
        /* 57 */ ['Molcan',             'Altmaier'],
        /* 58 */ ['Michelsen',          'Fearnley'],
        /* 59 */ ['Munar',              'Cerundolo'],
        /* 60 */ ['Arnaldi',            'Halys'],
        /* 61 */ ['Moutet',             'Giron'],
        /* 62 */ ['Royer',              'Wendelken'],
        /* 63 */ ['Blockx',             'Zverev'],
    ],

    // ── Roland Garros 2026 ATP ────────────────────────────────────────────────
    // Source: served.bracket.tennis/tournaments/roland-garros-2026/atp
    // API returns "French Open – Paris"; both keys resolve to the same pairs.
    'french open|2026|ATP': [
        //  ── First quarter ──────────────────────────────────────────────────
        /* 00 */ ['Sinner',         'Tabur'],
        /* 01 */ ['Fearnley',       'Cerundolo J'],   // Juan Manuel Cerundolo
        /* 02 */ ['Landaluce',      'Prado Angelo'],
        /* 03 */ ['Kopriva',        'Moutet'],
        /* 04 */ ['Rinderknech',    'Rodionov'],
        /* 05 */ ['Fucsovics',      'Berrettini'],
        /* 06 */ ['Quinn',          'Comesana'],
        /* 07 */ ['Ofner',          'Darderi'],
        /* 08 */ ['Bublik',         'Struff'],
        /* 09 */ ['Faria',          'Shapovalov'],
        /* 10 */ ['Munar',          'Hurkacz'],
        /* 11 */ ['Spizzirri',      'Tiafoe'],
        /* 12 */ ['Griekspoor',     'Arnaldi'],
        /* 13 */ ['Muller',         'Tsitsipas'],
        /* 14 */ ['Collignon',      'Vukic'],
        /* 15 */ ['Merida',         'Shelton'],
        //  ── Second quarter ─────────────────────────────────────────────────
        /* 16 */ ['Auger Aliassime','Altmaier'],
        /* 17 */ ['Baez',           'Burruchaga'],
        /* 18 */ ['Van Assche',     'Kypson'],
        /* 19 */ ['Bautista Agut',  'Nakashima'],
        /* 20 */ ['Norrie',         'Vallejo'],
        /* 21 */ ['Cilic',          'Kouame'],
        /* 22 */ ['Tabilo',         'Majchrzak'],
        /* 23 */ ['Faurel',         'Vacherot'],
        /* 24 */ ['Cobolli',        'Pellegrino'],
        /* 25 */ ['Wu',             'Giron'],          // Wu Yubing
        /* 26 */ ['Diaz Acosta',    'Zhang'],
        /* 27 */ ['Garin',          'Tien'],
        /* 28 */ ['Cerundolo F',    'Van De Zandschulp'], // Francisco Cerundolo (25)
        /* 29 */ ['Gaston',         'Monfils'],
        /* 30 */ ['Popyrin',        'Svajda'],
        /* 31 */ ['Walton',         'Medvedev'],
        //  ── Third quarter ──────────────────────────────────────────────────
        /* 32 */ ['De Minaur',      'Samuel'],
        /* 33 */ ['Blockx',         'Wong'],
        /* 34 */ ['Navone',         'Brooksby'],
        /* 35 */ ['Droguet',        'Mensik'],
        /* 36 */ ['Etcheverry',     'Borges'],
        /* 37 */ ['Kecmanovic',     'Marozsan'],
        /* 38 */ ['Nava',           'Ugo Carabelli'],
        /* 39 */ ['Buse',           'Rublev'],
        /* 40 */ ['Ruud',           'Safiullin'],
        /* 41 */ ['Medjedovic',     'Hanfmann'],
        /* 42 */ ['Sonego',         'Herbert'],
        /* 43 */ ['Hijikata',       'Paul'],
        /* 44 */ ['Fonseca',        'Pavlovic'],
        /* 45 */ ['Zheng',          'Prizmic'],
        /* 46 */ ['Dellien',        'Royer'],
        /* 47 */ ['Mpetshi Perricard', 'Djokovic'],
        //  ── Fourth quarter ─────────────────────────────────────────────────
        /* 48 */ ['Fritz',          'Basavareddy'],
        /* 49 */ ['Shevchenko',     'Michelsen'],
        /* 50 */ ['Duckworth',      'Diallo'],
        /* 51 */ ['Kovacevic',      'Jodar'],
        /* 52 */ ['Davidovich Fokina', 'Dzumhur'],
        /* 53 */ ['Llamas Ruiz',    'Tirante'],
        /* 54 */ ['Kokkinakis',     'Atmane'],
        /* 55 */ ['Carreno Busta',  'Lehecka'],
        /* 56 */ ['Khachanov',      'Gea'],
        /* 57 */ ['Jacquet',        'Trungelliti'],
        /* 58 */ ['Cina',           'Opelka'],
        /* 59 */ ['Wawrinka',       'De Jong'],
        /* 60 */ ['Humbert',        'Mannarino'],
        /* 61 */ ['Halys',          'Bellucci'],
        /* 62 */ ['Machac',         'Bergs'],
        /* 63 */ ['Bonzi',          'Zverev'],
    ],

};

// Aliases: some APIs use different names for the same tournament.
TW.BRACKET_SLOTS['roland garros|2026|ATP'] = TW.BRACKET_SLOTS['french open|2026|ATP'];

// ── Lookup function ─────────────────────────────────────────────────────────
// Returns an array of [p1, p2] pairs for the given tournament, or null.
// Name matching strips all non-letter characters so "Roland-Garros",
// "Roland Garros", and "RolandGarros" all resolve to the same key.
TW.getBracketSlots = function (tournamentName, year, tour) {
    const lettersOnly = s => (s || '').toLowerCase().replace(/[^a-z]/g, '');
    const name = lettersOnly(tournamentName);
    const yr   = String(year || '');
    const t    = (tour || '').toUpperCase();

    for (const [key, pairs] of Object.entries(TW.BRACKET_SLOTS)) {
        const [kName, kYear, kTour] = key.split('|');
        if (name.includes(lettersOnly(kName)) && yr === kYear && t === kTour) return pairs;
    }
    return null;
};
