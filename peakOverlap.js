// ===================================
// TennisWorld — Peak Overlap (v0)
// ===================================
// Client-side peak windows from ranking history (preferred) or vintage
// curves (fallback). No new API endpoint. Deep-link ids are digits only.

(function (root) {
    'use strict';

    function parseOverlapQuery(raw) {
        if (raw == null) return [];
        const seen = new Set();
        const ids = [];
        String(raw).split(/[,]+/).forEach(part => {
            const id = String(part).trim();
            if (!/^\d+$/.test(id) || seen.has(id)) return;
            seen.add(id);
            ids.push(id);
        });
        return ids;
    }

    function yearFromDate(value) {
        const s = String(value == null ? '' : value).trim();
        const y = Number(s.slice(0, 4));
        return y >= 1968 && y <= 2100 ? y : null;
    }

    function peakWindowFromHistory(history) {
        const pts = (Array.isArray(history) ? history : [])
            .map(e => {
                const rank = Number(e && e.rank);
                const date = e && e.date != null ? String(e.date).slice(0, 10) : '';
                const year = yearFromDate(date);
                if (!date || !year || !(rank > 0)) return null;
                return { date, rank, year };
            })
            .filter(Boolean)
            .sort((a, b) => a.date.localeCompare(b.date));
        if (!pts.length) return null;

        const bestRank = Math.min.apply(null, pts.map(p => p.rank));
        const threshold = bestRank <= 10 ? Math.max(bestRank + 4, 10) : bestRank + 8;
        const inPeak = pts.filter(p => p.rank <= threshold);
        if (!inPeak.length) return null;

        return {
            startDate: inPeak[0].date,
            endDate: inPeak[inPeak.length - 1].date,
            startYear: inPeak[0].year,
            endYear: inPeak[inPeak.length - 1].year,
            bestRank,
            source: 'ranking-history',
        };
    }

    function peakWindowFromVintage(points, birthday) {
        const pts = (Array.isArray(points) ? points : [])
            .filter(p => p && typeof p.age === 'number' && isFinite(p.age));
        if (!pts.length) return null;

        const bornYear = yearFromDate(birthday);
        let prev = 0;
        const incs = pts.map(p => {
            const w = Number(p.w || 0);
            const inc = Math.max(0, w - prev);
            prev = w;
            return { age: p.age, inc };
        });
        const total = incs.reduce((s, x) => s + x.inc, 0);
        let startAge = incs[0].age;
        let endAge = incs[incs.length - 1].age;
        if (total > 0) {
            let cum = 0;
            let started = false;
            for (let i = 0; i < incs.length; i++) {
                cum += incs[i].inc;
                if (!started && cum >= total * 0.2) {
                    startAge = incs[i].age;
                    started = true;
                }
                if (cum >= total * 0.8) {
                    endAge = incs[i].age;
                    break;
                }
            }
        }
        if (bornYear == null) {
            return {
                startAge,
                endAge,
                startYear: null,
                endYear: null,
                startDate: null,
                endDate: null,
                bestRank: null,
                source: 'vintage',
            };
        }
        const startYear = Math.round(bornYear + startAge);
        const endYear = Math.max(startYear, Math.round(bornYear + endAge));
        return {
            startAge,
            endAge,
            startYear,
            endYear,
            startDate: startYear + '-01-01',
            endDate: endYear + '-12-31',
            bestRank: null,
            source: 'vintage',
        };
    }

    function resolvePeakWindow(rankHistory, vintagePoints, birthday) {
        return peakWindowFromHistory(rankHistory && rankHistory.history
            ? rankHistory.history
            : rankHistory) || peakWindowFromVintage(vintagePoints, birthday);
    }

    function intersectWindows(a, b) {
        if (!a || !b) return null;
        const a0 = a.startYear, a1 = a.endYear, b0 = b.startYear, b1 = b.endYear;
        if (a0 == null || a1 == null || b0 == null || b1 == null) return null;
        const startYear = Math.max(a0, b0);
        const endYear = Math.min(a1, b1);
        if (endYear < startYear) return null;
        return { startYear, endYear, years: endYear - startYear + 1 };
    }

    function intersectAll(windows) {
        const list = (windows || []).filter(w => w && w.startYear != null && w.endYear != null);
        if (list.length < 2) return null;
        let acc = { startYear: list[0].startYear, endYear: list[0].endYear };
        for (let i = 1; i < list.length; i++) {
            acc = intersectWindows(acc, list[i]);
            if (!acc) return null;
        }
        return acc;
    }

    function suggestEraTwins(focusWindow, candidates, limit) {
        const cap = limit == null ? 6 : limit;
        if (!focusWindow) return [];
        return (candidates || [])
            .map(c => {
                const hit = intersectWindows(focusWindow, c && c.window);
                if (!hit) return null;
                return {
                    id: String(c.id),
                    name: c.name == null ? '' : String(c.name),
                    years: hit.years,
                    startYear: hit.startYear,
                    endYear: hit.endYear,
                };
            })
            .filter(Boolean)
            .sort((a, b) => b.years - a.years || a.name.localeCompare(b.name))
            .slice(0, cap);
    }

    function overlapCaption(players, intersection) {
        const names = (players || []).map(p => p && p.name).filter(Boolean);
        if (names.length < 2) return 'Add at least two players to see peak overlap.';
        if (!intersection) {
            return names.slice(0, 2).join(' and ') + ' have no overlapping peak years.';
        }
        const span = intersection.startYear === intersection.endYear
            ? String(intersection.startYear)
            : intersection.startYear + '–' + intersection.endYear;
        const who = names.length === 2
            ? names[0] + ' and ' + names[1]
            : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
        const n = intersection.years;
        return who + ' overlapped ' + span + ' (' + n + ' year' + (n === 1 ? '' : 's') + ').';
    }

    const api = {
        parseOverlapQuery,
        yearFromDate,
        peakWindowFromHistory,
        peakWindowFromVintage,
        resolvePeakWindow,
        intersectWindows,
        intersectAll,
        suggestEraTwins,
        overlapCaption,
    };

    root.TW = root.TW || {};
    root.TW.PeakOverlap = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : globalThis));
