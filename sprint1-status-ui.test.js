import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMatchRow } from './shell/matchRow.js';
import {
    SCHEDULE_UPDATING,
    SCORES_BEHIND,
    STATUS_STALE_MS,
    compareStatusOrder,
    formatClock,
    formatScheduleHeader,
    matchCalendarDay,
    presentMatch,
    scoresBehindNote,
} from './shell/derive.js';
import { parseLocation } from './shell/router.js';
import { buildView } from './shell/viewModel.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const NOW = Date.parse('2026-11-15T18:00:00.000Z');
const PHOENIX = 'America/Phoenix';
const LONDON = 'Europe/London';

const ORDER = [
    'live',
    'up-early',
    'up-late',
    'tba',
    'delayed',
    'wo',
    'cancel',
    'final-new',
    'final-old',
];

function viewer() {
    return { signedIn: false, displayName: '', follows: [], sampleSession: false };
}

function players() {
    return [
        { id: 'p1', name: '<script>', tour: 'ATP', country: '', rank: 1, rankMove: 0, age: 20, recentResults: [], surfaces: null, career: [] },
        { id: 'p2', name: 'Bob', tour: 'ATP', country: '', rank: 2, rankMove: 0, age: 21, recentResults: [], surfaces: null, career: [] },
        { id: 'p3', name: 'Cara', tour: 'WTA', country: '', rank: 3, rankMove: 0, age: 22, recentResults: [], surfaces: null, career: [] },
        { id: 'p4', name: 'Dee', tour: 'WTA', country: '', rank: 4, rankMove: 0, age: 23, recentResults: [], surfaces: null, career: [] },
    ];
}

function tournaments() {
    return [
        { id: 't-atp', tour: 'ATP', name: 'ATP Finals', tier: 'ATP', tierClass: 'tour', surface: 'hard', startDate: '2026-11-14', endDate: '2026-11-22' },
        { id: 't-wta', tour: 'WTA', name: 'WTA Finals', tier: 'WTA', tierClass: 'tour', surface: 'hard', startDate: '2026-11-14', endDate: '2026-11-22' },
        { id: 't-ch', tour: 'ATP', name: 'Challenger Lyon', tier: 'Challenger', tierClass: 'challenger', surface: 'hard', startDate: '2026-11-14', endDate: '2026-11-22' },
    ];
}

function match(spec) {
    return {
        id: spec.id,
        tournamentId: spec.tournamentId,
        roundId: 12,
        roundName: 'Final',
        player1Id: spec.p1 || 'p1',
        player2Id: spec.p2 || 'p2',
        player1Seed: '',
        player2Seed: '',
        startsAtUtc: Object.prototype.hasOwnProperty.call(spec, 'startsAtUtc') ? spec.startsAtUtc : '',
        date: spec.date || '',
        isLive: spec.isLive === true,
        winnerId: spec.winnerId || null,
        finished: spec.finished === true,
        setScores: spec.setScores || [],
        ...(spec.status ? { status: spec.status } : {}),
        tierClass: 'tour',
    };
}

function slate() {
    return [
        match({ id: 'final-old', tournamentId: 't-atp', status: 'Finished', startsAtUtc: '2026-11-15T16:00:00.000Z', setScores: ['6-4', '6-2'], winnerId: 'p1' }),
        match({ id: 'tba', tournamentId: 't-atp', status: 'Not Started', startsAtUtc: '', date: '2026-11-15' }),
        match({ id: 'delayed', tournamentId: 't-atp', status: 'Delayed', startsAtUtc: '2026-11-15T19:00:00.000Z' }),
        match({ id: 'up-late', tournamentId: 't-atp', status: 'Not Started', startsAtUtc: '2026-11-15T23:00:00.000Z' }),
        match({ id: 'live', tournamentId: 't-atp', status: 'Live', isLive: true, startsAtUtc: '2026-11-15T17:00:00.000Z', setScores: ['6-4', '3-2'] }),
        match({ id: 'up-early', tournamentId: 't-atp', status: 'Not Started', startsAtUtc: '2026-11-15T19:30:00.000Z' }),
        match({ id: 'wo', tournamentId: 't-atp', status: 'Walkover', startsAtUtc: '2026-11-15T21:00:00.000Z', winnerId: 'p2', setScores: ['6-0'] }),
        match({ id: 'cancel', tournamentId: 't-atp', status: 'Cancelled', startsAtUtc: '2026-11-15T20:30:00.000Z' }),
        match({ id: 'final-new', tournamentId: 't-atp', status: 'Finished', startsAtUtc: '2026-11-15T20:00:00.000Z', setScores: ['7-6', '6-4'], winnerId: 'p1' }),
        match({ id: 'cross', tournamentId: 't-atp', status: 'Not Started', startsAtUtc: '2026-11-16T01:30:00.000Z', date: '2026-11-16' }),
        match({ id: 'tba-later', tournamentId: 't-atp', status: 'Not Started', startsAtUtc: '', date: '2026-11-18' }),
        match({ id: 'wta-1', tournamentId: 't-wta', status: 'Not Started', startsAtUtc: '2026-11-15T20:15:00.000Z', p1: 'p3', p2: 'p4' }),
        match({ id: 'ch-1', tournamentId: 't-ch', status: 'Not Started', startsAtUtc: '2026-11-15T18:15:00.000Z' }),
    ];
}

function viewAt(path, timeZone, statusAsOf, rows) {
    return buildView({
        data: {
            mode: 'live',
            now: NOW,
            fetchedAt: '2026-11-15T18:00:00.000Z',
            statusAsOf,
            stale: false,
            error: null,
            neverHadData: false,
            callsNetwork: true,
            tournaments: tournaments(),
            matches: rows || slate(),
            players: players(),
            meetings: [],
            gates: [],
        },
        route: parseLocation(path, ''),
        now: NOW,
        timeZone,
        viewer: viewer(),
    });
}

function rowById(groups, id) {
    for (let i = 0; i < groups.length; i += 1) {
        const found = groups[i].rows.find((row) => row.id === id);
        if (found) return found;
    }
    return null;
}

function createDoc() {
    const innerWrites = [];
    function make(tag) {
        return {
            tag,
            className: '',
            children: [],
            attrs: {},
            _text: '',
            set textContent(value) { this._text = String(value); },
            get textContent() { return this._text; },
            set innerHTML(value) {
                innerWrites.push(value);
                throw new Error('innerHTML');
            },
            get innerHTML() {
                throw new Error('innerHTML');
            },
            setAttribute(name, value) { this.attrs[name] = String(value); },
            appendChild(child) { this.children.push(child); return child; },
        };
    }
    return {
        innerWrites,
        createElement: (tag) => make(tag),
        createTextNode: (text) => ({ text: String(text), children: [] }),
    };
}

function find(node, className) {
    if (!node) return null;
    if (typeof node.className === 'string' && node.className.split(/\s+/).includes(className)) return node;
    const children = node.children || [];
    for (let i = 0; i < children.length; i += 1) {
        const hit = find(children[i], className);
        if (hit) return hit;
    }
    return null;
}

function findAll(node, className, acc = []) {
    if (!node) return acc;
    if (typeof node.className === 'string' && node.className.split(/\s+/).includes(className)) acc.push(node);
    (node.children || []).forEach((child) => findAll(child, className, acc));
    return acc;
}

describe('row order inside a tournament group', () => {
    it('sorts Live, upcoming timed, Time TBA, Delayed, then recent results', () => {
        const rows = slate().filter((item) => ORDER.includes(item.id));
        const ordered = rows.slice().sort((a, b) => compareStatusOrder(a, b));
        expect(ordered.map((item) => item.id)).toEqual(ORDER);
        const today = viewAt('/today', PHOENIX, '');
        expect(today.today.groups.map((group) => group.id)).toEqual(['t-atp']);
        expect(today.today.lowerGroups.map((group) => group.id)).toEqual(['t-ch']);
        const ids = today.today.groups[0].rows.map((row) => row.id);
        expect(ids.indexOf('live')).toBe(0);
        expect(ids.indexOf('up-early')).toBeLessThan(ids.indexOf('up-late'));
        expect(ids.indexOf('up-late')).toBeLessThan(ids.indexOf('tba'));
        expect(ids.indexOf('tba')).toBeLessThan(ids.indexOf('delayed'));
        expect(ids.indexOf('delayed')).toBeLessThan(ids.indexOf('wo'));
        expect(ids.slice(ids.indexOf('wo'))).toEqual(['wo', 'cancel', 'final-new', 'final-old']);
        const schedule = viewAt('/schedule', PHOENIX, '');
        const day = schedule.schedule.days.find((item) => item.date === '2026-11-15');
        expect(day.groups.map((group) => group.id)).toEqual(['t-atp', 't-wta']);
        expect(schedule.schedule.lowerDays.some((item) => item.groups.some((group) => group.id === 't-ch'))).toBe(true);
        expect(day.groups[0].rows.map((row) => row.id).filter((id) => ORDER.includes(id)).slice(0, 5))
            .toEqual(['live', 'up-early', 'up-late', 'tba', 'delayed']);
    });
});

describe('local time in America/Phoenix and Europe/London', () => {
    it('formats the clock and the schedule date in the viewer zone', () => {
        expect(formatClock('2026-11-15T19:30:00.000Z', PHOENIX)).toBe('12:30 PM');
        expect(formatClock('2026-11-15T19:30:00.000Z', LONDON)).toBe('7:30 PM');
        expect(formatClock('2026-11-16T01:30:00.000Z', PHOENIX)).toBe('6:30 PM');
        expect(formatClock('2026-11-16T01:30:00.000Z', LONDON)).toBe('1:30 AM');
        expect(matchCalendarDay({ startsAtUtc: '2026-11-16T01:30:00.000Z', date: '2026-11-16' }, PHOENIX)).toBe('2026-11-15');
        expect(matchCalendarDay({ startsAtUtc: '2026-11-16T01:30:00.000Z', date: '2026-11-16' }, LONDON)).toBe('2026-11-16');
        expect(matchCalendarDay({ startsAtUtc: '', date: '2026-11-18' }, PHOENIX)).toBe('2026-11-18');
        expect(matchCalendarDay({ startsAtUtc: '', date: '2026-11-18' }, LONDON)).toBe('2026-11-18');
        expect(formatScheduleHeader('2026-11-15')).toBe('Sun, Nov 15');
        expect(formatScheduleHeader('2026-11-18')).toBe('Wed, Nov 18');

        const phoenix = viewAt('/schedule', PHOENIX, '');
        const london = viewAt('/schedule', LONDON, '');
        const phoenixDay = phoenix.schedule.days.find((item) => item.date === '2026-11-15');
        const londonLater = london.schedule.days.find((item) => item.date === '2026-11-16');
        const phoenixRow = rowById(phoenixDay.groups, 'up-early');
        const londonRow = rowById(london.schedule.days.find((item) => item.date === '2026-11-15').groups, 'up-early');
        expect(phoenixRow.timeText).toBe('12:30 PM');
        expect(phoenixRow.slot).toBe('');
        expect(londonRow.timeText).toBe('7:30 PM');
        expect(rowById(phoenixDay.groups, 'cross').timeText).toBe('6:30 PM');
        expect(london.schedule.days.find((item) => item.date === '2026-11-15').groups[0].rows.map((row) => row.id)).not.toContain('cross');
        expect(rowById(londonLater.groups, 'cross').timeText).toBe('1:30 AM');
        expect(phoenix.schedule.days.find((item) => item.date === '2026-11-18').label).toBe('Wed, Nov 18');
        expect(london.schedule.days.find((item) => item.date === '2026-11-18').label).toBe('Wed, Nov 18');
        expect(rowById(phoenixDay.groups, 'delayed').detail).toBe('12:00 PM');
        expect(rowById(phoenixDay.groups, 'delayed').slot).toBe('Delayed');
    });

    it('uses the exact chip copy and degrades when the new fields are absent', () => {
        const phoenix = viewAt('/today', PHOENIX, '');
        const rows = phoenix.today.groups[0].rows;
        const live = rows.find((row) => row.id === 'live');
        const tba = rows.find((row) => row.id === 'tba');
        const delayed = rows.find((row) => row.id === 'delayed');
        const finalRow = rows.find((row) => row.id === 'final-new');
        const wo = rows.find((row) => row.id === 'wo');
        const cancel = rows.find((row) => row.id === 'cancel');
        expect(live.slot).toBe('Live');
        expect(live.detail).toBe('6-4 3-2');
        expect(live.liveLabel).toBe('Live, <script> vs Bob, 6-4 3-2');
        expect(tba.slot).toBe('Scheduled');
        expect(tba.detail).toBe('Time TBA');
        expect(delayed.slot).toBe('Delayed');
        expect(finalRow.slot).toBe('Final');
        expect(finalRow.detail).toBe('7-6 6-4');
        expect(finalRow.winnerSide).toBe('p1');
        expect(wo.slot).toBe('W/O');
        expect(wo.detail).toBe('');
        expect(wo.winnerSide).toBe('p2');
        expect(cancel.slot).toBe('Cancelled');
        expect(cancel.detail).toBe('');
        expect(presentMatch({}).detail).toBe('Time TBA');
        expect(presentMatch({}).slot).toBe('Scheduled');
        expect(presentMatch({ startsAtUtc: '2026-11-15T19:30:00.000Z' }, LONDON).timeText).toBe('7:30 PM');
        expect(presentMatch({ startsAtUtc: '2026-11-15T19:30:00.000Z' }, LONDON).slot).toBe('');
        expect(presentMatch({ isLive: true, setScores: ['1-1'] }).slot).toBe('Live');
        expect(presentMatch({ status: 'Not Started', isLive: true, setScores: ['1-1'] }).slot).toBe('Live');
        expect(presentMatch({ winnerId: 'p1' }).slot).toBe('W/O');
        expect(presentMatch({ winner: 'p9', setScores: ['6-4'] }).slot).toBe('Final');
        expect(presentMatch({ status: 'Walkover', winnerId: 'p2', setScores: ['6-1'] }).detail).toBe('');
    });
});

describe('stale score footnote', () => {
    it('appears only after statusAsOf is older than 10 minutes', () => {
        const older = new Date(NOW - STATUS_STALE_MS - 1).toISOString();
        const exact = new Date(NOW - STATUS_STALE_MS).toISOString();
        const fresher = new Date(NOW - STATUS_STALE_MS + 1).toISOString();
        expect(scoresBehindNote(older, NOW)).toBe(SCORES_BEHIND);
        expect(scoresBehindNote(exact, NOW)).toBe('');
        expect(scoresBehindNote(fresher, NOW)).toBe('');
        expect(scoresBehindNote('', NOW)).toBe('');
        expect(scoresBehindNote(undefined, NOW)).toBe('');
        expect(scoresBehindNote('not-a-date', NOW)).toBe('');
        expect(viewAt('/today', PHOENIX, older).today.scoresNote).toBe('Scores may be a few minutes behind.');
        expect(viewAt('/today', LONDON, exact).today.scoresNote).toBe('');
        expect(viewAt('/today', PHOENIX, '').today.scoresNote).toBe('');
        expect(viewAt('/today', PHOENIX, fresher).banner).not.toContain(SCORES_BEHIND);
        const schedule = viewAt('/schedule', PHOENIX, older);
        expect(JSON.stringify(schedule.schedule)).not.toContain(SCORES_BEHIND);
        expect(SCHEDULE_UPDATING).toBe('Schedule is updating. Check back soon.');
    });
});

describe('reduced motion and text rendering', () => {
    it('stops the live dot pulse when the viewer prefers reduced motion', () => {
        const css = read('./shell/sprint1.css');
        expect(css).toMatch(/@keyframes s1-live-pulse/);
        expect(css).toMatch(/\.s1-live-dot\s*\{[^}]*animation:\s*s1-live-pulse/);
        expect(css).toMatch(/\.s1-match\s*\{[^}]*height:\s*44px/);
        const queries = css.split('@media').slice(1).join('\n');
        expect(queries).not.toMatch(/\.s1-match\s*\{/);
        const block = css.match(/@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{([\s\S]*?)\n\}/);
        expect(block).toBeTruthy();
        expect(block[1]).toMatch(/\.s1-live-dot\s*\{[^}]*animation:\s*none/);
        const winner = css.match(/\.s1-name-winner\s*\{([^}]*)\}/);
        expect(winner[1]).toMatch(/font-weight:\s*700/);
        expect(winner[1]).not.toMatch(/color/);
        expect(css.match(/\.s1-match-detail\s*\{([^}]*)\}/)[1]).not.toMatch(/line-through/);
        expect(css.match(/\.s1-chip-delayed\s*\{([^}]*)\}/)[1]).not.toMatch(/line-through/);
        const painter = read('./shell/matchRow.js');
        expect(painter).not.toMatch(/setInterval|requestAnimationFrame|matchMedia/);
    });

    it('puts names and scores in textContent and the live label on setAttribute', () => {
        const painter = read('./shell/matchRow.js');
        const view = read('./shell/viewModel.js');
        const page = read('./sprint1.html');
        expect(painter).toMatch(/textContent/);
        expect(painter).toMatch(/createTextNode/);
        expect(painter).toMatch(/setAttribute\(\s*'aria-label'/);
        expect(painter).not.toMatch(/<[^>]*aria-label/);
        expect(painter).not.toMatch(/innerHTML|insertAdjacentHTML|outerHTML|document\.write/);
        expect(view).toMatch(/`Live, \$\{side1\.name\} vs \$\{side2\.name\}, \$\{liveScore\}`/);
        expect(view).not.toMatch(/\.innerHTML|insertAdjacentHTML/);
        expect(page.match(/<script/g)).toHaveLength(6);
        expect(read('./sw.js')).toMatch(/CACHE_VERSION\s*=\s*'tw-v54'/);

        const doc = createDoc();
        const host = doc.createElement('div');
        const live = viewAt('/today', PHOENIX, '').today.groups[0].rows.find((row) => row.id === 'live');
        const node = buildMatchRow(doc, live);
        host.appendChild(node);
        expect(doc.innerWrites).toEqual([]);
        const link = find(node, 's1-match-open');
        expect(link.attrs['aria-label']).toBe('Live, <script> vs Bob, 6-4 3-2');
        const names = findAll(node, 's1-name');
        expect(names.map((item) => item.textContent)).toEqual(['<script>', 'Bob']);
        expect(find(node, 's1-match-detail').textContent).toBe('6-4 3-2');
        expect(find(node, 's1-live-dot').attrs['aria-hidden']).toBe('true');
        const chipText = find(node, 's1-chip').children.find((child) => typeof child.text === 'string');
        expect(chipText.text).toBe('Live');

        const finalRow = viewAt('/today', PHOENIX, '').today.groups[0].rows.find((row) => row.id === 'final-new');
        const finalNode = buildMatchRow(doc, finalRow);
        const winners = findAll(finalNode, 's1-name-winner');
        expect(winners).toHaveLength(1);
        expect(winners[0].textContent).toBe('<script>');
        expect(findAll(finalNode, 's1-name').filter((item) => item.textContent === 'Bob')[0].className).not.toMatch(/winner/);
        expect(finalNode.attrs && finalNode.attrs['aria-label']).toBeUndefined();
    });
});
