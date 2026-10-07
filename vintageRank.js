// TennisWorld — rank-by-age for Career Trajectories
// Pure helpers for the Rank metric. No DOM writes except paintText, which
// sets textContent only. Tooltip strings are plain text for the canvas tooltip.
//
// Data: GET /api/vintage-rank-by-age (same playerKey as /api/player-vintage).
// years is sparse. A missing age is a gap (y null, spanGaps false). Never 0.

(function (root) {
    'use strict';

    var NOTE_BLANK = 'Blank years mean outside the ATP Top 200 (or fewer than 13 ranked weeks).';
    var NOTE_PRE1973 = 'ATP rankings start in 1973, so earlier years are blank.';
    var NOTE_WTA = 'WTA ranking history coming soon';
    var NOTE_EMPTY = 'No career curves available.';
    var Y_TITLE = 'ATP rank (Top 200)';
    var Y_MIN = 1;
    var Y_MAX = 200;
    var RANK_TICKS = [1, 5, 10, 20, 50, 100, 200];
    var GUIDE_RANKS = [1, 10];
    var MIN_RANKED_WEEKS = 13;
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function tooltipName(name) {
        var s = String(name == null ? '' : name).trim();
        if (!s) return '';
        var parts = s.split(/\s+/);
        return parts[parts.length - 1];
    }

    // Calendar date from YYYY-MM-DD digits. Never parse through Date
    // (that shifts the day in time zones behind UTC).
    function formatAsOf(asOf) {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(asOf == null ? '' : asOf));
        if (!m) return '';
        var month = MONTHS[Number(m[2]) - 1];
        var day = Number(m[3]);
        if (!month || day < 1 || day > 31) return '';
        return month + ' ' + day + ', ' + m[1];
    }

    function roundWeeks(n) {
        return Math.round(Number(n));
    }

    function formatRankTooltip(point) {
        var p = point || {};
        var name = tooltipName(p.name);
        var weeks = roundWeeks(p.weeksAtRank);
        var ranked = roundWeeks(p.rankedWeeks);
        var text = (name ? name + ' · ' : '')
            + 'age ' + p.age
            + ' · No. ' + p.rank
            + ' · held ' + weeks + ' of ' + ranked + ' ranked weeks';
        if (p.partial === true) {
            var when = formatAsOf(p.asOf);
            if (when) text += ' · through ' + when;
        }
        return text;
    }

    function plottableYear(year) {
        if (!year || typeof year !== 'object') return false;
        var age = Number(year.age);
        var rank = Number(year.rank);
        var rankedWeeks = Number(year.rankedWeeks);
        if (!Number.isInteger(age)) return false;
        if (!Number.isFinite(rank) || rank < 1 || rank > Y_MAX) return false;
        if (!Number.isFinite(rankedWeeks) || rankedWeeks < MIN_RANKED_WEEKS) return false;
        return true;
    }

    // Sparse years → points with a null at every missing integer age so the
    // line breaks (spanGaps false). Null is a gap. Rank 0 is never emitted.
    function seriesPoints(years) {
        var rows = (Array.isArray(years) ? years : []).filter(plottableYear)
            .slice()
            .sort(function (a, b) { return Number(a.age) - Number(b.age); });
        var dedup = [];
        rows.forEach(function (row) {
            if (dedup.length && Number(dedup[dedup.length - 1].age) === Number(row.age)) return;
            dedup.push(row);
        });
        var out = [];
        dedup.forEach(function (row, i) {
            if (i > 0) {
                var prev = Number(dedup[i - 1].age);
                var curr = Number(row.age);
                for (var age = prev + 1; age < curr; age++) {
                    out.push({ x: age, y: null });
                }
            }
            out.push({
                x: Number(row.age),
                y: Number(row.rank),
                weeksAtRank: Number(row.weeksAtRank),
                rankedWeeks: Number(row.rankedWeeks),
                partial: row.partial === true,
            });
        });
        return out;
    }

    function hasGap(points) {
        var ages = [];
        (points || []).forEach(function (p) {
            if (p && p.y != null) ages.push(p.x);
        });
        for (var i = 1; i < ages.length; i++) {
            if (ages[i] - ages[i - 1] > 1) return true;
        }
        return false;
    }

    function gapsAreBroken(points) {
        var list = points || [];
        for (var i = 1; i < list.length; i++) {
            var a = list[i - 1];
            var b = list[i];
            if (a && b && a.y != null && b.y != null && (b.x - a.x) > 1) return false;
        }
        return true;
    }

    function showPre1973(ageAtRankingsStart, visibleAges) {
        if (ageAtRankingsStart == null || ageAtRankingsStart === '') return false;
        var threshold = Number(ageAtRankingsStart);
        if (!Number.isFinite(threshold)) return false;
        return (visibleAges || []).some(function (age) {
            return Number.isFinite(Number(age)) && Number(age) < threshold;
        });
    }

    function ageDomain(ages) {
        var nums = (ages || []).map(Number).filter(function (n) { return Number.isFinite(n); });
        if (!nums.length) return null;
        var min = nums[0];
        var max = nums[0];
        for (var i = 1; i < nums.length; i++) {
            if (nums[i] < min) min = nums[i];
            if (nums[i] > max) max = nums[i];
        }
        return { min: Math.floor(min), max: Math.ceil(max) };
    }

    function visibleAxisAges(ages) {
        var domain = ageDomain(ages);
        if (!domain) return [];
        var out = [];
        for (var age = domain.min; age <= domain.max; age++) out.push(age);
        return out;
    }

    function finiteOrNull(n) {
        if (n == null || n === '') return null;
        var v = Number(n);
        return Number.isFinite(v) ? v : null;
    }

    function classify(data) {
        if (!data || typeof data !== 'object') {
            return {
                available: false, quiet: true, wta: false, reason: '', name: '',
                asOf: null, ageAtRankingsStart: null, points: [], hasGap: false, error: null,
            };
        }
        var tour = String(data.tour || '').toUpperCase();
        var reason = typeof data.reason === 'string' ? data.reason : '';
        var name = typeof data.name === 'string' ? data.name : '';
        var asOf = typeof data.asOf === 'string' ? data.asOf : null;
        var ageAt = finiteOrNull(data.ageAtRankingsStart);
        if (tour === 'WTA' || reason === 'wta-ranking-history-not-loaded') {
            return {
                available: false, quiet: false, wta: true,
                reason: reason || 'wta-ranking-history-not-loaded',
                name: name, asOf: null, ageAtRankingsStart: null,
                points: [], hasGap: false, error: null,
            };
        }
        if (data.available === false) {
            return {
                available: false, quiet: false, wta: false, reason: reason,
                name: name, chipName: '', asOf: asOf, ageAtRankingsStart: ageAt,
                points: [], hasGap: false, error: null,
            };
        }
        var points = seriesPoints(data.years);
        return {
            available: true, quiet: false, wta: false, reason: reason,
            name: name, asOf: asOf, ageAtRankingsStart: ageAt,
            points: points, hasGap: hasGap(points), error: null,
        };
    }

    function failureFromStatus(status) {
        var quiet = status === 404 || status === 429 || status == null;
        return {
            available: false,
            quiet: quiet,
            wta: false,
            reason: '',
            name: '',
            asOf: null,
            ageAtRankingsStart: null,
            points: [],
            hasGap: false,
            error: quiet ? null : 'fetch-failed',
            httpStatus: status == null ? null : status,
        };
    }

    function failureFromError(err) {
        var msg = err && err.message ? String(err.message) : '';
        var m = /^HTTP (\d+)$/.exec(msg);
        if (m) return failureFromStatus(Number(m[1]));
        if (!err || err.name === 'TypeError' || /Failed to fetch|NetworkError|network/i.test(msg)) {
            return failureFromStatus(null);
        }
        return failureFromStatus(-1);
    }

    function hasDrawable(states) {
        return (states || []).some(function (s) {
            return s && (s.points || []).some(function (p) { return p && p.y != null; });
        });
    }

    function missingRankNote(names) {
        var list = (names || []).filter(function (name) { return !!name; });
        if (!list.length) return '';
        return 'No ranking history yet for ' + list.join(', ') + '.';
    }

    function isNotLoaded(state) {
        return !!state && state.available === false
            && (state.reason === 'not-loaded' || state.reason === 'rankings-not-loaded');
    }

    // The roster/chip label, never the API name. A miss can send name: null.
    function chipLabel(state) {
        if (!state || typeof state.chipName !== 'string') return '';
        return state.chipName;
    }

    function notesFor(states, visibleAges) {
        var wta = false;
        var blank = false;
        var pre = false;
        var noHist = [];
        var noBday = [];
        var failed = [];
        var notLoaded = [];
        (states || []).forEach(function (s) {
            if (!s || s.quiet) return;
            if (s.wta) { wta = true; return; }
            if (isNotLoaded(s)) {
                var label = chipLabel(s);
                if (label) notLoaded.push(label);
                return;
            }
            if (s.reason === 'no-birthday') {
                if (s.name) noBday.push(s.name);
                return;
            }
            if (s.error === 'fetch-failed') {
                if (s.name) failed.push(s.name);
                return;
            }
            if (s.available === false) return;
            var plotted = (s.points || []).some(function (p) { return p && p.y != null; });
            if (!plotted || s.reason === 'no-ranking-history') {
                if (s.name) noHist.push(s.name);
                return;
            }
            if (s.hasGap || hasGap(s.points)) blank = true;
            if (showPre1973(s.ageAtRankingsStart, visibleAges)) pre = true;
        });
        var notes = [];
        if (wta) notes.push(NOTE_WTA);
        var missing = missingRankNote(notLoaded);
        if (missing) notes.push(missing);
        if (noBday.length) notes.push('No birthdate data for ' + noBday.join(', ') + ' — skipped.');
        if (noHist.length) notes.push('No ATP ranking history for ' + noHist.join(', ') + '.');
        if (failed.length) notes.push("Couldn't load " + failed.join(', ') + '.');
        if (blank) notes.push(NOTE_BLANK);
        if (pre) notes.push(NOTE_PRE1973);
        return notes;
    }

    // Rank is the only metric that shows the not-loaded note. Other metrics
    // keep their own copy, so switching away clears this sentence.
    function noteForMetric(metric, view) {
        if (metric !== 'rk' || !view) return '';
        return view.note || '';
    }

    function viewState(states, visibleAges) {
        var notes = notesFor(states, visibleAges);
        var drawable = hasDrawable(states);
        var empty = '';
        if (!drawable && !notes.length) empty = NOTE_EMPTY;
        return {
            notes: notes,
            note: notes.join(' '),
            empty: empty,
            drawable: drawable,
        };
    }

    function paintText(el, text) {
        if (!el) return;
        el.textContent = text == null ? '' : String(text);
    }

    function tickLabel(value) {
        var n = Number(value);
        return RANK_TICKS.indexOf(n) >= 0 ? String(n) : '';
    }

    function applyRankTicks(scale) {
        if (!scale) return;
        scale.ticks = RANK_TICKS.map(function (value) { return { value: value, major: true }; });
    }

    function pointRadius(ctx) {
        var raw = ctx && ctx.raw;
        if (!raw || raw.y == null) return 0;
        return 3;
    }

    function pointBackground(ctx, color) {
        var raw = ctx && ctx.raw;
        if (raw && raw.partial === true) return 'transparent';
        return color;
    }

    function rankDataset(state, color, label) {
        var name = (state && state.name) || label || '';
        return {
            label: label || name,
            playerName: name,
            asOf: (state && state.asOf) || '',
            data: (state && state.points) || [],
            spanGaps: false,
            tension: 0,
            borderColor: color,
            backgroundColor: color,
            borderWidth: 2,
            pointRadius: pointRadius,
            pointHoverRadius: function (ctx) { return pointRadius(ctx) ? 5 : 0; },
            pointBackgroundColor: function (ctx) { return pointBackground(ctx, color); },
            pointHoverBackgroundColor: function (ctx) { return pointBackground(ctx, color); },
            pointBorderColor: color,
            pointHoverBorderColor: color,
            pointBorderWidth: 2,
            pointHitRadius: 8,
            fill: false,
        };
    }

    root.TW = root.TW || {};
    root.TW.VintageRank = {
        NOTE_BLANK: NOTE_BLANK,
        NOTE_PRE1973: NOTE_PRE1973,
        NOTE_WTA: NOTE_WTA,
        NOTE_EMPTY: NOTE_EMPTY,
        Y_TITLE: Y_TITLE,
        Y_MIN: Y_MIN,
        Y_MAX: Y_MAX,
        RANK_TICKS: RANK_TICKS,
        GUIDE_RANKS: GUIDE_RANKS,
        tooltipName: tooltipName,
        formatAsOf: formatAsOf,
        roundWeeks: roundWeeks,
        formatRankTooltip: formatRankTooltip,
        seriesPoints: seriesPoints,
        hasGap: hasGap,
        gapsAreBroken: gapsAreBroken,
        showPre1973: showPre1973,
        ageDomain: ageDomain,
        visibleAxisAges: visibleAxisAges,
        classify: classify,
        failureFromStatus: failureFromStatus,
        failureFromError: failureFromError,
        missingRankNote: missingRankNote,
        isNotLoaded: isNotLoaded,
        notesFor: notesFor,
        noteForMetric: noteForMetric,
        viewState: viewState,
        paintText: paintText,
        tickLabel: tickLabel,
        applyRankTicks: applyRankTicks,
        pointRadius: pointRadius,
        pointBackground: pointBackground,
        rankDataset: rankDataset,
    };
})(typeof window !== 'undefined' ? window : globalThis);
