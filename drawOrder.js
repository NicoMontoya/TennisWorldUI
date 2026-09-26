// TennisWorld — draw slot-order status
// Pure: no DOM. Chip copy, layout default, and a read-only adjacent-slot check.
//
// slotOrderVerified is read from the /api/draws payload when that field is a
// boolean (API#13). Round flags are the fallback only when the payload omits
// it. Status does not special-case a tour or an event.
//
// A verified chip's title comes from slotOrderVerification when that object
// is present: "Checked against the official ATP draw · Sep 26". checkedAt is
// a plain YYYY-MM-DD, not an instant, so the day does not shift with the
// time zone. Without the object, the title is the draw tour and no date.
// Only ATP and WTA are used. sourceHost is not shown.
//
// Red ("Bracket order wrong") comes from an explicit ops mismatch flag, or
// from a cheap slotIndex check when adjacent winners do not feed the next
// round. The check fails soft: missing indexes, unfinished matches, and
// thrown data stay off red so the draw still renders.

(function (root) {
    'use strict';

    var ELIM_ROUND_IDS = { 4: 0, 5: 1, 6: 2, 7: 3, 9: 4, 10: 5, 12: 6 };

    var LABEL_VERIFIED = 'Draw verified';
    var LABEL_UNCHECKED = 'Order unchecked';
    var LABEL_WRONG = 'Bracket order wrong';
    var BANNER_ADJACENT = 'Bracket order may be wrong. Adjacent slots do not match the next round, so this draw opens as a list.';
    var BANNER_OPS = 'Bracket order may be wrong. This draw opens as a list until the slot order is confirmed.';
    var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    function allowedTour(value) {
        var t = String(value == null ? '' : value).trim().toUpperCase();
        return t === 'ATP' || t === 'WTA' ? t : '';
    }

    // Calendar day from YYYY-MM-DD. The month and day in the copy are the
    // digits in the string. Date.UTC only rejects impossible days (Feb 31);
    // local getters are never used, so the label cannot move across zones.
    function formatCheckedDay(value) {
        var s = String(value == null ? '' : value).trim();
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (!m) return '';
        var year = Number(m[1]);
        var month = Number(m[2]);
        var day = Number(m[3]);
        if (month < 1 || month > 12) return '';
        var utc = new Date(Date.UTC(year, month - 1, day));
        if (utc.getUTCFullYear() !== year || utc.getUTCMonth() !== month - 1 || utc.getUTCDate() !== day) return '';
        return MONTHS[month - 1] + ' ' + String(day);
    }

    function verificationObject(payload) {
        var v = payload && payload.slotOrderVerification;
        if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
        return v;
    }

    function noDateTooltip(tour) {
        return tour ? 'Checked against the official ' + tour + ' draw' : '';
    }

    // Verified only. Host is omitted: the chip copy is tour and, when the
    // check record is usable, the plain date. A tour other than ATP/WTA is
    // ignored and the date goes with it.
    function verifiedTooltip(status, payload, drawTour) {
        if (status !== 'verified') return '';
        var fallback = allowedTour(drawTour) || allowedTour(payload && payload.tour);
        var v = verificationObject(payload);
        if (!v) return noDateTooltip(fallback);
        var tour = allowedTour(v.tour);
        if (!tour) return noDateTooltip(fallback);
        var day = formatCheckedDay(v.checkedAt);
        if (!day) return noDateTooltip(tour);
        return 'Checked against the official ' + tour + ' draw \u00B7 ' + day;
    }

    function isRealKey(k) {
        return k != null && k !== '' && k !== 'null' && k !== 'undefined';
    }

    function readVerified(payload, rounds) {
        if (payload && typeof payload.slotOrderVerified === 'boolean') {
            return payload.slotOrderVerified;
        }
        var flags = [];
        var list = rounds || [];
        for (var i = 0; i < list.length; i++) {
            var round = list[i];
            if (round && typeof round.slotOrderVerified === 'boolean') flags.push(round.slotOrderVerified);
        }
        if (!flags.length) return null;
        return flags.some(Boolean);
    }

    function objectsOf(payload, rounds) {
        var out = [];
        if (payload && typeof payload === 'object') out.push(payload);
        var list = rounds || [];
        for (var i = 0; i < list.length; i++) {
            if (list[i] && typeof list[i] === 'object') out.push(list[i]);
        }
        return out;
    }

    // Explicit ops signal. Absent fields are not a signal.
    function opsMismatch(payload, rounds) {
        var objs = objectsOf(payload, rounds);
        var saysWrong = false;
        var saysOk = false;
        for (var i = 0; i < objs.length; i++) {
            var o = objs[i];
            if (o.slotOrderMismatch === true || o.bracketOrderWrong === true) saysWrong = true;
            if (o.adjacentSlotsOk === false || o.adjacentSlotOk === false) saysWrong = true;
            if (o.slotOrderMismatch === false || o.bracketOrderWrong === false) saysOk = true;
            if (o.adjacentSlotsOk === true || o.adjacentSlotOk === true) saysOk = true;
        }
        if (saysWrong) return 'wrong';
        if (saysOk) return 'ok';
        return null;
    }

    function eliminationRounds(rounds) {
        var out = [];
        var list = rounds || [];
        for (var i = 0; i < list.length; i++) {
            var round = list[i];
            var matches = round && round.matches;
            if (!matches || !matches.length) continue;
            var elim = false;
            for (var j = 0; j < matches.length; j++) {
                if (ELIM_ROUND_IDS[Number(matches[j] && matches[j].roundId)] !== undefined) {
                    elim = true;
                    break;
                }
            }
            if (elim) out.push(round);
        }
        out.sort(function (a, b) {
            var ao = typeof a.order === 'number' ? a.order : null;
            var bo = typeof b.order === 'number' ? b.order : null;
            if (ao != null && bo != null && ao !== bo) return bo - ao;
            var arid = a.matches[0] ? Number(a.matches[0].roundId) : NaN;
            var brid = b.matches[0] ? Number(b.matches[0].roundId) : NaN;
            var ai = ELIM_ROUND_IDS[arid];
            var bi = ELIM_ROUND_IDS[brid];
            if (ai === undefined) ai = 99;
            if (bi === undefined) bi = 99;
            return ai - bi;
        });
        return out;
    }

    function bySlot(matches) {
        if (!matches || !matches.length) return null;
        for (var i = 0; i < matches.length; i++) {
            var idx = matches[i] && matches[i].slotIndex;
            if (idx == null || !isFinite(Number(idx))) return null;
        }
        var arr = [];
        for (var k = 0; k < matches.length; k++) arr[Number(matches[k].slotIndex)] = matches[k];
        return arr;
    }

    function winnerKey(match) {
        if (!match) return null;
        if (match.winner === 'player1' && isRealKey(match.player1Key)) return String(match.player1Key);
        if (match.winner === 'player2' && isRealKey(match.player2Key)) return String(match.player2Key);
        return null;
    }

    // true only when at least one fully keyed parent disagrees with its two
    // slotIndex children. Incomplete or unindexed rounds are not a failure.
    function adjacentOrderFails(rounds) {
        try {
            var elim = eliminationRounds(rounds);
            if (elim.length < 2) return false;
            var compared = 0;
            var failed = 0;
            for (var r = 0; r < elim.length - 1; r++) {
                var earlier = bySlot(elim[r].matches);
                var later = bySlot(elim[r + 1].matches);
                if (!earlier || !later) continue;
                for (var i = 0; i < later.length; i++) {
                    var parent = later[i];
                    var a = earlier[2 * i];
                    var b = earlier[2 * i + 1];
                    if (!parent || !a || !b) continue;
                    var laterKeys = [];
                    if (isRealKey(parent.player1Key)) laterKeys.push(String(parent.player1Key));
                    if (isRealKey(parent.player2Key)) laterKeys.push(String(parent.player2Key));
                    if (laterKeys.length < 2) continue;
                    var feedA = winnerKey(a);
                    var feedB = winnerKey(b);
                    if (!feedA || !feedB) continue;
                    compared++;
                    var hits = 0;
                    if (laterKeys.indexOf(feedA) !== -1) hits++;
                    if (laterKeys.indexOf(feedB) !== -1) hits++;
                    if (hits < 2) failed++;
                }
            }
            return compared > 0 && failed > 0;
        } catch (e) {
            return false;
        }
    }

    function isKnownName(name) {
        var s = String(name == null ? '' : name).trim();
        return s.length > 0 && !/^tbd$/i.test(s);
    }

    // Honest fill of the earliest elimination round. Omitted when every
    // published slot already has two real labels (BYE counts; TBD does not).
    function slotFillLabel(rounds) {
        try {
            var elim = eliminationRounds(rounds);
            if (!elim.length) return '';
            var matches = elim[0].matches || [];
            var total = matches.length;
            if (!total) return '';
            var known = 0;
            for (var i = 0; i < matches.length; i++) {
                var m = matches[i] || {};
                if (isKnownName(m.player1Name) && isKnownName(m.player2Name)) known++;
            }
            if (known >= total) return '';
            return known + ' of ' + total + ' slots';
        } catch (e) {
            return '';
        }
    }

    function displayPlayerName(name) {
        var s = String(name == null ? '' : name).trim();
        if (!s || /^tbd$/i.test(s)) return 'TBD';
        return s;
    }

    function resolve(payload, rounds, drawTour) {
        var verified = null;
        var ops = null;
        var adjacentFail = false;
        try {
            verified = readVerified(payload, rounds);
            ops = opsMismatch(payload, rounds);
            if (ops !== 'ok' && ops !== 'wrong') adjacentFail = adjacentOrderFails(rounds);
        } catch (e) {
            verified = null;
            ops = null;
            adjacentFail = false;
        }

        var status = 'unchecked';
        var banner = '';
        if (ops === 'wrong') {
            status = 'wrong';
            banner = adjacentFail ? BANNER_ADJACENT : BANNER_OPS;
        } else if (adjacentFail) {
            status = 'wrong';
            banner = BANNER_ADJACENT;
        } else if (verified === true) {
            status = 'verified';
        }

        var label = status === 'verified' ? LABEL_VERIFIED
            : status === 'wrong' ? LABEL_WRONG
            : LABEL_UNCHECKED;

        return {
            status: status,
            label: label,
            banner: banner,
            defaultLayout: status === 'wrong' ? 'list' : 'bracket',
            listAvailable: true,
            bracketSecondary: status === 'wrong',
            slotLabel: slotFillLabel(rounds),
            tooltip: verifiedTooltip(status, payload, drawTour),
        };
    }

    root.TW = root.TW || {};
    root.TW.DrawOrder = {
        resolve: resolve,
        displayPlayerName: displayPlayerName,
    };
})(typeof window !== 'undefined' ? window : globalThis);
