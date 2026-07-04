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
