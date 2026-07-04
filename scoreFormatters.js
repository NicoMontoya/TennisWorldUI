// ===================================
// Tennis Score Formatting Utilities
// ===================================
// Pure functions — no DOM dependencies.
// Imported by shared.js and consumed by tests.

// Format a single set: "6-1", or "7-6(5)" when there was a tiebreak.
// The parenthetical is always the *loser's* tiebreak score (tennis convention).
export function formatSetScore(s) {
    if (!s) return '–';
    const base = `${s.p1}-${s.p2}`;
    if (s.tiebreak) {
        const loserTb = Math.min(s.tiebreak.p1, s.tiebreak.p2);
        return `${base}(${loserTb})`;
    }
    return base;
}

// Format all sets as a comma-separated string: "6-1, 7-6(3), 6-4"
export function formatSetScores(setScores) {
    if (!setScores || !setScores.length) return '';
    return setScores.map(formatSetScore).join(', ');
}

// Format the current in-game point score.
// API returns "30 - 15"; renders as "30–15".
// Also handles "Deuce", "Advantage - 0", "0 - Advantage".
export function formatGameScore(raw) {
    if (!raw) return '';
    return raw.replace(' - ', '–');
}
