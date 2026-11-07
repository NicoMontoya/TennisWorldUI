// Status and clock formatting for the Sprint 1 shell.
// Match phase is derived from startsAtUtc, a strict isLive boolean, and winnerId.
// A status string on the object is ignored.

const ROUND_LABELS = {
    4: 'R128',
    5: 'R64',
    6: 'R32',
    7: 'R16',
    9: 'QF',
    10: 'SF',
    12: 'F',
};

export function roundLabel(roundId) {
    return ROUND_LABELS[Number(roundId)] || 'Round';
}

export function localDateISO(now, timeZone) {
    const date = now instanceof Date ? now : new Date(now);
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

export function formatCalendarDate(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
    if (!match) return '';
    const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    }).format(utc);
}

export function formatCalendarRange(startDate, endDate) {
    const start = formatCalendarDate(startDate);
    const end = formatCalendarDate(endDate);
    if (start && end && start !== end) return `${start} – ${end}`;
    return start || end || '';
}

export function formatStartLocal(iso, timeZone) {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    const time = `${get('hour')}:${get('minute')} ${get('dayPeriod')}`.trim();
    const zone = get('timeZoneName');
    return {
        date: `${get('month')} ${get('day')}`.trim(),
        time,
        zone,
        label: `${time} ${zone}`.trim(),
    };
}

export function formatAsOf(iso, timeZone) {
    const local = formatStartLocal(iso, timeZone);
    if (!local) return '';
    return `as of ${local.date}, ${local.time} ${local.zone}`;
}

export function isSameLocalDay(iso, now, timeZone) {
    return localDateISO(iso, timeZone) === localDateISO(now, timeZone);
}

export function deriveMatchPhase(match, now) {
    if (!match || match.startsAtUtc == null) return 'unknown';
    const start = Date.parse(match.startsAtUtc);
    if (Number.isNaN(start)) return 'unknown';
    const clock = now instanceof Date ? now.getTime() : Number(now);
    const winner = match.winnerId != null && String(match.winnerId) !== '';
    if (winner) return 'final';
    if (match.isLive === true) return 'live';
    if (start > clock) return 'upcoming';
    return 'unconfirmed';
}

export function tournamentBucket(tournament, matches, now, timeZone) {
    const phases = (matches || []).map((match) => deriveMatchPhase(match, now));
    if (phases.includes('live')) return 'now';
    const today = localDateISO(now, timeZone);
    if (tournament.endDate < today) return 'past';
    if (tournament.startDate > today) return 'upnext';
    return 'now';
}

export function defaultSegment(buckets) {
    if (buckets.includes('now')) return 'now';
    if (buckets.includes('upnext')) return 'upnext';
    return 'past';
}

export function tournamentChip(tournament, matches, now, timeZone) {
    const list = matches || [];
    const phases = list.map((match) => deriveMatchPhase(match, now));
    if (phases.includes('live')) return { kind: 'live', text: 'Live' };
    const bucket = tournamentBucket(tournament, list, now, timeZone);
    const allFinal = list.length > 0 && phases.every((phase) => phase === 'final');
    if (allFinal || bucket === 'past') return { kind: 'final', text: 'Final' };
    if (bucket === 'upnext') {
        return { kind: 'starts', text: `Starts ${formatCalendarDate(tournament.startDate)}` };
    }
    return { kind: 'none', text: '' };
}

export function rankMoveLabel(move) {
    const n = Number(move);
    if (!Number.isInteger(n) || n === 0) return { glyph: '–', text: 'No move', dir: 'flat' };
    if (n > 0) return { glyph: '↑', text: `Up ${n}`, dir: 'up' };
    return { glyph: '↓', text: `Down ${Math.abs(n)}`, dir: 'down' };
}

export function scoreLine(match) {
    if (!match || !Array.isArray(match.setScores) || !match.setScores.length) return '';
    return match.setScores.map((set) => String(set)).join(' ');
}
