// Status and clock formatting for the Sprint 1 shell.
// Match phase is derived from startsAtUtc, a strict isLive boolean, and winnerId.
// deriveMatchPhase ignores a status string so a stray label cannot move the phase.
// resolveMatchStatus honors the fixtures enum when it is present and falls back
// to isLive / winner / scores when the current payload omits those fields.
// A missing start is Time TBA, never a clock invented from the date or time fields.

export const SCHEDULE_UPDATING = 'Schedule is updating. Check back soon.';
export const SCORES_BEHIND = 'Scores may be a few minutes behind.';
export const STATUS_STALE_MS = 10 * 60 * 1000;
export const LOWER_TIER_HEADING = 'Challengers & ITF';

const MATCH_STATUSES = new Set([
    'Not Started',
    'Live',
    'Delayed',
    'Finished',
    'Walkover',
    'Cancelled',
]);

const ROUND_LABELS = {
    4: 'R128',
    5: 'R64',
    6: 'R32',
    7: 'R16',
    9: 'QF',
    10: 'SF',
    12: 'F',
};

const TOUR_ROUND_NAMES = {
    4: 'Round of 128',
    5: 'Round of 64',
    6: 'Round of 32',
    7: 'Round of 16',
    9: 'Quarterfinals',
    10: 'Semifinals',
    12: 'Final',
};

const FULL_FROM_TEXT = {
    'round of 128': 'Round of 128',
    r128: 'Round of 128',
    'round of 64': 'Round of 64',
    r64: 'Round of 64',
    'round of 32': 'Round of 32',
    r32: 'Round of 32',
    'round of 16': 'Round of 16',
    r16: 'Round of 16',
    quarterfinals: 'Quarterfinals',
    quarterfinal: 'Quarterfinals',
    'quarter-finals': 'Quarterfinals',
    '1/4-finals': 'Quarterfinals',
    qf: 'Quarterfinals',
    semifinals: 'Semifinals',
    semifinal: 'Semifinals',
    'semi-finals': 'Semifinals',
    '1/2-finals': 'Semifinals',
    sf: 'Semifinals',
    final: 'Final',
    finals: 'Final',
};

const TIER_VALUES = new Set(['tour', 'challenger', 'itf']);

// Grouping uses the fixtures `tier` field only. Names and eventType never
// decide tour vs challenger vs ITF. Missing or unknown values are not tour.
export function readTier(row) {
    const explicit = String(row && row.tier == null ? '' : row.tier).trim().toLowerCase();
    return TIER_VALUES.has(explicit) ? explicit : '';
}

export function roundLabel(roundId, context) {
    const id = Number(roundId);
    const tier = context && context.tier;
    if ((tier === 'challenger' || tier === 'itf') && id === 4) return 'R1';
    if (tier === 'tour') {
        const text = String(context && context.round || '').trim();
        const mapped = FULL_FROM_TEXT[text.toLowerCase()];
        if (mapped) return mapped;
        if (text) return text;
        return TOUR_ROUND_NAMES[id] || 'Round';
    }
    if (tier === 'challenger' || tier === 'itf') {
        const text = String(context && context.round || '').trim();
        if (text) return text;
    }
    return ROUND_LABELS[id] || 'Round';
}

// 1970-01-01 is the upstream sentinel for "no fetch time", not a real stamp.
export function isIgnoredFetchedAt(value) {
    if (value == null || value === '') return true;
    let parsed;
    if (value instanceof Date) parsed = value.getTime();
    else if (typeof value === 'number') parsed = value;
    else parsed = Date.parse(value);
    if (Number.isNaN(parsed)) return true;
    return parsed < Date.UTC(1980, 0, 1);
}

export function chooseFetchedAt(candidates, fetchTimeMs) {
    const list = Array.isArray(candidates) ? candidates : [candidates];
    for (let i = 0; i < list.length; i += 1) {
        if (!isIgnoredFetchedAt(list[i])) return new Date(Date.parse(list[i])).toISOString();
    }
    if (!isIgnoredFetchedAt(fetchTimeMs)) return new Date(fetchTimeMs).toISOString();
    return null;
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
    if (iso == null || iso === '') return null;
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
    if (isIgnoredFetchedAt(iso)) return '';
    const local = formatStartLocal(iso, timeZone);
    if (!local) return '';
    return `as of ${local.date}, ${local.time} ${local.zone}`;
}

export function formatTbaLabel(dateValue, timeZone) {
    const day = dayLabel(dateValue, timeZone);
    return day ? `${day} · Time TBA` : 'Time TBA';
}

function dayLabel(dateValue, timeZone) {
    const raw = String(dateValue || '').trim();
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatCalendarDate(raw);
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return '';
    return new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone || 'UTC',
        month: 'short',
        day: 'numeric',
    }).format(new Date(parsed));
}

export function hasStartsAt(match) {
    if (!match || match.startsAtUtc == null || match.startsAtUtc === '') return false;
    return !Number.isNaN(Date.parse(match.startsAtUtc));
}

export function matchCalendarDay(match, timeZone) {
    if (!match) return '';
    if (hasStartsAt(match)) return localDateISO(match.startsAtUtc, timeZone);
    const raw = String(match.date || match.day || '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const prefixed = /^(\d{4}-\d{2}-\d{2})/.exec(raw);
    if (prefixed && !raw.includes('T')) return prefixed[1];
    const parsed = Date.parse(raw);
    if (Number.isNaN(parsed)) return '';
    return localDateISO(parsed, timeZone);
}

export function compareMatchOrder(a, b, timeZone) {
    const dayA = matchCalendarDay(a, timeZone) || '9999-99-99';
    const dayB = matchCalendarDay(b, timeZone) || '9999-99-99';
    if (dayA !== dayB) return dayA < dayB ? -1 : 1;
    const timedA = hasStartsAt(a);
    const timedB = hasStartsAt(b);
    if (timedA !== timedB) return timedA ? -1 : 1;
    if (timedA && timedB) {
        const diff = Date.parse(a.startsAtUtc) - Date.parse(b.startsAtUtc);
        if (diff !== 0) return diff;
    }
    const idA = String((a && (a.id || a.matchKey)) || '');
    const idB = String((b && (b.id || b.matchKey)) || '');
    return idA.localeCompare(idB);
}

export function seasonOverLine(tournament) {
    if (!tournament || !tournament.name) return '';
    const date = formatCalendarDate(tournament.startDate);
    return `Tour season's over, next up: ${tournament.name}${date ? ` ${date}` : ''}`;
}

export function isSameLocalDay(iso, now, timeZone) {
    return localDateISO(iso, timeZone) === localDateISO(now, timeZone);
}

export function deriveMatchPhase(match, now) {
    if (!match) return 'unknown';
    const winner = match.winnerId != null && String(match.winnerId) !== '';
    if (winner || match.finished === true) return 'final';
    if (match.isLive === true) return 'live';
    if (!hasStartsAt(match)) return 'scheduled';
    const start = Date.parse(match.startsAtUtc);
    const clock = now instanceof Date ? now.getTime() : Number(now);
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
    const list = buckets || [];
    if (list.includes('now') || !list.length) return 'now';
    if (list.includes('upnext')) return 'upnext';
    return 'past';
}

export function tournamentChip(tournament, matches, now, timeZone) {
    const list = matches || [];
    const phases = list.map((match) => deriveMatchPhase(match, now));
    if (phases.includes('live')) return { kind: 'live', text: 'Live' };
    const bucket = tournamentBucket(tournament, list, now, timeZone);
    const allFinal = list.length > 0 && phases.every((phase) => phase === 'final');
    if (allFinal || bucket === 'past') return { kind: 'final', text: 'Final' };
    const allScheduled = list.length > 0 && phases.every((phase) => phase === 'scheduled');
    if (allScheduled && bucket !== 'upnext') return { kind: 'scheduled', text: 'Scheduled' };
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

export function formatSetScore(set) {
    if (set == null || set === '') return '';
    if (typeof set === 'string' || typeof set === 'number') return String(set).trim();
    if (typeof set === 'object') {
        const p1 = set.p1 != null ? set.p1 : set.player1;
        const p2 = set.p2 != null ? set.p2 : set.player2;
        if (p1 == null || p2 == null) return '';
        return `${p1}-${p2}`;
    }
    return '';
}

export function scoreLine(match) {
    if (!match || match.setScores == null || match.setScores === '') return '';
    if (typeof match.setScores === 'string') return match.setScores.trim();
    if (!Array.isArray(match.setScores) || !match.setScores.length) return '';
    return match.setScores.map((set) => formatSetScore(set)).filter(Boolean).join(' ');
}

export function knownMatchStatus(value) {
    const text = String(value == null ? '' : value).trim();
    return MATCH_STATUSES.has(text) ? text : '';
}

export function winnerIdOf(match) {
    if (!match) return '';
    if (match.winnerId != null && String(match.winnerId) !== '') return String(match.winnerId);
    const winner = match.winner;
    if (typeof winner !== 'string') return '';
    const text = winner.trim();
    if (!text || text === 'player1' || text === 'player2' || text === 'First Player' || text === 'Second Player') {
        return '';
    }
    return text;
}

// Display status. Live / Delayed / Finished / Walkover / Cancelled on the row
// are authoritative. "Not Started" is not, when isLive or a winner is already
// set — that is the current fixtures payload, which hard-codes Not Started.
export function resolveMatchStatus(match) {
    if (!match) return 'Not Started';
    const explicit = knownMatchStatus(match.status);
    if (explicit === 'Live' || explicit === 'Delayed' || explicit === 'Finished' || explicit === 'Walkover' || explicit === 'Cancelled') {
        return explicit;
    }
    const winner = winnerIdOf(match) !== '';
    const finished = match.finished === true || winner;
    const live = match.isLive === true;
    if (live && !finished) return 'Live';
    if (finished) {
        if (winner && scoreLine(match) === '') return 'Walkover';
        return 'Finished';
    }
    return 'Not Started';
}

export function formatClock(iso, timeZone) {
    if (iso == null || iso === '') return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour: 'numeric',
        minute: '2-digit',
    }).formatToParts(date);
    const get = (type) => parts.find((part) => part.type === type)?.value || '';
    return `${get('hour')}:${get('minute')} ${get('dayPeriod')}`.replace(/\s+/g, ' ').trim();
}

export function formatScheduleHeader(isoDate) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate || ''));
    if (!match) return 'Date TBA';
    const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return new Intl.DateTimeFormat('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
    }).format(utc);
}

export function scoresBehindNote(statusAsOf, now) {
    if (statusAsOf == null || statusAsOf === '') return '';
    const parsed = Date.parse(statusAsOf);
    if (Number.isNaN(parsed)) return '';
    const clock = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(clock)) return '';
    if (clock - parsed > STATUS_STALE_MS) return SCORES_BEHIND;
    return '';
}

function statusBucket(match) {
    const status = resolveMatchStatus(match);
    if (status === 'Live') return 0;
    if (status === 'Not Started' && hasStartsAt(match)) return 1;
    if (status === 'Not Started') return 2;
    if (status === 'Delayed') return 3;
    return 4;
}

function startMs(match) {
    if (!hasStartsAt(match)) return null;
    return Date.parse(match.startsAtUtc);
}

// Live, then upcoming timed (ascending), then Time TBA, then Delayed,
// then Final / Walkover / Cancelled (most recent start first).
export function compareStatusOrder(a, b) {
    const bucketA = statusBucket(a);
    const bucketB = statusBucket(b);
    if (bucketA !== bucketB) return bucketA - bucketB;
    const timeA = startMs(a);
    const timeB = startMs(b);
    if (bucketA === 1 || bucketA === 3 || bucketA === 0) {
        const left = timeA == null ? Number.POSITIVE_INFINITY : timeA;
        const right = timeB == null ? Number.POSITIVE_INFINITY : timeB;
        if (left !== right) return left - right;
    } else if (bucketA === 4) {
        const left = timeA == null ? Number.NEGATIVE_INFINITY : timeA;
        const right = timeB == null ? Number.NEGATIVE_INFINITY : timeB;
        if (left !== right) return right - left;
    }
    const idA = String((a && (a.id || a.matchKey)) || '');
    const idB = String((b && (b.id || b.matchKey)) || '');
    return idA.localeCompare(idB);
}

export function presentMatch(match, timeZone) {
    const status = resolveMatchStatus(match);
    const timed = hasStartsAt(match);
    const score = scoreLine(match);
    const clock = timed ? formatClock(match.startsAtUtc, timeZone) : '';
    if (status === 'Live') {
        return { status, slot: 'Live', slotKind: 'live', detail: score, timeText: '' };
    }
    if (status === 'Delayed') {
        return { status, slot: 'Delayed', slotKind: 'delayed', detail: clock, timeText: '' };
    }
    if (status === 'Finished') {
        return { status, slot: 'Final', slotKind: 'final', detail: score, timeText: '' };
    }
    if (status === 'Walkover') {
        return { status, slot: 'W/O', slotKind: 'walkover', detail: '', timeText: '' };
    }
    if (status === 'Cancelled') {
        return { status, slot: 'Cancelled', slotKind: 'cancelled', detail: '', timeText: '' };
    }
    if (!timed) {
        return { status: 'Not Started', slot: 'Scheduled', slotKind: 'scheduled', detail: 'Time TBA', timeText: '' };
    }
    return { status: 'Not Started', slot: '', slotKind: 'time', detail: '', timeText: clock };
}
