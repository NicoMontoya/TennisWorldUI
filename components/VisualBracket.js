// ===================================
// TennisWorld — VisualBracket component
// ===================================
// Renders a connected tournament bracket.
//
// TW.VisualBracket(rounds) → HTML string
//   rounds — API draw response: [{ round, matches }]
//
// Algorithm:
//   1. Build binary tree by tracing winners backward from the Final.
//      Each Final player must have appeared in a Semi; each Semi player in a QF, etc.
//   2. Lay out the tree with DFS: leaf nodes get sequential Y slots,
//      parents are vertically centered between their two children.
//   3. Draw SVG connectors along explicit tree edges (not guessed pairs).
//
// This produces an accurate bracket for any data the API provides.
// Seed ordering (1 top, 2 bottom) is not available from the API.

window.TW = window.TW || {};

TW.VisualBracket = (function () {

    // ── Layout constants ──────────────────────────────────────────────────────
    const BOX_H   = 72;   // match box height px
    const BOX_W   = 230;  // match box width px
    const CON_W   = 44;   // connector column width px
    const LABEL_H = 48;   // round label strip height px
    const SLOT_H  = 88;   // minimum vertical slot per leaf match

    // ── Round metadata ────────────────────────────────────────────────────────
    const LABEL_MAP = {
        'final':'Final','finals':'Final',
        '1/2-finals':'Semifinals','semi-finals':'Semifinals','semifinal':'Semifinals','semifinals':'Semifinals',
        '1/4-finals':'Quarterfinals','quarter-finals':'Quarterfinals','quarterfinal':'Quarterfinals','quarterfinals':'Quarterfinals',
        '1/8-finals':'R16','round of 16':'R16',
        '1/16-finals':'R32','round of 32':'R32',
        '1/32-finals':'R64','round of 64':'R64',
        '1/64-finals':'R128','round of 128':'R128',
    };

    const RANK = {
        'R128':0,'R64':1,'R32':2,'R16':3,'Quarterfinals':4,'Semifinals':5,'Final':6,
    };

    function cleanRound(r) {
        if (!r) return '';
        const parts = r.split(' - ');
        const raw = (parts[parts.length - 1] || r).trim();
        return LABEL_MAP[raw.toLowerCase()] || raw;
    }

    // ── Match status / winner ─────────────────────────────────────────────────
    function matchStatus(m) {
        if (m.isLive || m.status === '1') return 'live';
        if (m.status === 'Finished')      return 'finished';
        if (m.status === 'Cancelled')     return 'cancelled';
        return 'upcoming';
    }

    function matchWinner(m) {
        if (m.winner === 'player1' || m.winner === 'First Player')  return 'p1';
        if (m.winner === 'player2' || m.winner === 'Second Player') return 'p2';
        return null;
    }

    // ── Score rendering ───────────────────────────────────────────────────────
    // setScores can be either:
    //   - strings like "6-2" (new API: "6-2 5-7 6-4".split(' '))
    //   - objects like {p1:6, p2:2, tiebreak:{p1:3,p2:7}} (old API)
    function playerScore(m, player, st) {
        if ((st === 'finished' || st === 'live') && m.setScores && m.setScores.length) {
            return m.setScores.map(function (s) {
                if (typeof s === 'string') {
                    // "6-2", "7-6(3)" formats
                    const parts = s.split('-');
                    const val   = player === 'p1' ? parts[0] : (parts[1] || '');
                    // tiebreak suffix like "7-6(3)" — keep it on the score as-is
                    return '<span class="vb-set">' + (player === 'p1' ? parts[0] : parts.slice(1).join('-')) + '</span>';
                }
                // object format
                const val = player === 'p1' ? s.p1 : s.p2;
                if (st === 'finished' && s.tiebreak) {
                    const loser = Math.min(s.tiebreak.p1, s.tiebreak.p2);
                    return '<span class="vb-set">' + val + '<sup>' + loser + '</sup></span>';
                }
                return '<span class="vb-set">' + val + '</span>';
            }).join('');
        }
        return '';
    }

    function livePoints(m, player, st) {
        if (st !== 'live' || !m.currentGame) return '';
        const parts = m.currentGame.split(' - ');
        if (parts.length !== 2) return '';
        const val = player === 'p1' ? parts[0].trim() : parts[1].trim();
        return '<span class="vb-pts">' + val + '</span>';
    }

    function playerRow(m, player, st, w, isFinal) {
        const name    = (player === 'p1' ? m.player1Name : m.player2Name) || 'TBD';
        const rank    = player === 'p1' ? m.player1Rank  : m.player2Rank;
        const won     = w === player;
        const done    = st === 'finished';
        const isChamp = isFinal && won;

        const cls = 'vb-player'
            + (won          ? ' vb-w'        : '')
            + (done && !won ? ' vb-l'        : '')
            + (isChamp      ? ' vb-champion' : '');

        const score   = playerScore(m, player, st);
        const pts     = livePoints(m, player, st);
        const trophy  = isChamp ? '<span class="vb-trophy" aria-label="Champion">🏆</span>' : '';
        const seedNum = player === 'p1' ? m.player1Seed : m.player2Seed;
        const seed    = seedNum
            ? '<span class="vb-seed">[' + seedNum + ']</span>'
            : (rank && rank <= 16) ? '<span class="vb-seed">[' + rank + ']</span>' : '';

        return '<div class="' + cls + '" data-player="' + name.replace(/"/g, '&quot;') + '">'
            + seed
            + '<span class="vb-pname">' + name + '</span>'
            + trophy
            + (score ? '<span class="vb-pscore">' + score + '</span>' : '')
            + pts
            + '</div>';
    }

    // ── Tree building ─────────────────────────────────────────────────────────
    // Traces backward from the Final: find each player's previous-round match
    // by name, recursively, to form a binary tree of match nodes.
    //
    // Node: { match, roundLabel, ri, topChild, botChild, cy }

    function buildBracketTree(rounds) {
        // Sort rounds earliest → Final
        const sorted = rounds.slice().sort(function (a, b) {
            return (RANK[cleanRound(a.round)] ?? 99) - (RANK[cleanRound(b.round)] ?? 99);
        });

        const roundLabels = sorted.map(function (r) { return cleanRound(r.round); });

        // Lookup: cleaned label → matches array
        const byLabel = {};
        sorted.forEach(function (r) {
            byLabel[cleanRound(r.round)] = r.matches.slice();
        });

        // Prevent any match from appearing twice in the tree
        const usedKeys = new Set();

        function findInRound(playerName, label) {
            if (!playerName || playerName === 'TBD' || !byLabel[label]) return null;
            return byLabel[label].find(function (m) {
                return !usedKeys.has(m.matchKey) &&
                    (m.player1Name === playerName || m.player2Name === playerName);
            }) || null;
        }

        function buildNode(match, roundLabel) {
            if (!match || usedKeys.has(match.matchKey)) return null;
            usedKeys.add(match.matchKey);

            const ri   = roundLabels.indexOf(roundLabel);
            const node = { match: match, roundLabel: roundLabel, ri: ri,
                           topChild: null, botChild: null, cy: 0 };

            if (ri === 0) return node;  // first round — no earlier round to trace

            const prevLabel = roundLabels[ri - 1];
            node.topChild = buildNode(findInRound(match.player1Name, prevLabel), prevLabel);
            node.botChild = buildNode(findInRound(match.player2Name, prevLabel), prevLabel);

            return node;
        }

        const finalLabel   = roundLabels[roundLabels.length - 1];
        const finalMatches = (byLabel[finalLabel] || []).slice();

        // There is exactly one championship Final — the one with the latest date.
        // Any other "Final" entries are qualifying or consolation sub-tournaments
        // that the API labels identically. Use only the latest-dated match as root.
        finalMatches.sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
        const rootMatch = finalMatches[0];
        const roots = rootMatch ? [buildNode(rootMatch, finalLabel)].filter(Boolean) : [];

        return { roots: roots, roundLabels: roundLabels };
    }

    // ── Tree layout ───────────────────────────────────────────────────────────
    // Leaf nodes receive sequential Y slots.
    // Parent nodes are centered between their children.
    // Before recursing, children are ordered so the better-seeded subtree
    // (lower rank number = higher seed) is always placed on top — this makes
    // seed 1's path appear at the top of the bracket, seed 2 at the bottom,
    // matching standard tournament bracket convention.

    function countLeaves(node) {
        if (!node) return 0;
        if (!node.topChild && !node.botChild) return 1;
        return countLeaves(node.topChild) + countLeaves(node.botChild);
    }

    // Returns the best (lowest) rank found anywhere in this subtree.
    // Unranked players contribute Infinity so they sort to the bottom.
    function bestRankInSubtree(node) {
        if (!node) return Infinity;
        const m  = node.match;
        const r1 = (m.player1Rank > 0) ? m.player1Rank : Infinity;
        const r2 = (m.player2Rank > 0) ? m.player2Rank : Infinity;
        return Math.min(r1, r2,
            bestRankInSubtree(node.topChild),
            bestRankInSubtree(node.botChild));
    }

    function layoutNode(node, slotH, counter) {
        if (!node) return;
        if (!node.topChild && !node.botChild) {
            node.cy = (counter.val + 0.5) * slotH;
            counter.val++;
            return;
        }

        // Order children: better seed (lower rank) goes on top
        if (node.topChild && node.botChild) {
            const topBest = bestRankInSubtree(node.topChild);
            const botBest = bestRankInSubtree(node.botChild);
            if (botBest < topBest) {
                const tmp    = node.topChild;
                node.topChild = node.botChild;
                node.botChild = tmp;
            }
        }

        layoutNode(node.topChild, slotH, counter);
        layoutNode(node.botChild, slotH, counter);

        const topCY = node.topChild ? node.topChild.cy : null;
        const botCY = node.botChild ? node.botChild.cy : null;
        if (topCY !== null && botCY !== null) node.cy = (topCY + botCY) / 2;
        else if (topCY !== null)              node.cy = topCY;
        else                                  node.cy = botCY !== null ? botCY : 0;
    }

    function collectByRound(node, map) {
        if (!node) return;
        if (!map[node.ri]) map[node.ri] = [];
        map[node.ri].push(node);
        collectByRound(node.topChild, map);
        collectByRound(node.botChild, map);
    }

    function collectEdges(node, edges) {
        if (!node) return;
        if (node.topChild) { edges.push({ child: node.topChild, parent: node }); collectEdges(node.topChild, edges); }
        if (node.botChild) { edges.push({ child: node.botChild, parent: node }); collectEdges(node.botChild, edges); }
    }

    // ── Main render ───────────────────────────────────────────────────────────
    return function VisualBracket(rounds) {
        if (!rounds || !rounds.length) {
            return '<div class="vb-empty">No draw data available.</div>';
        }

        const tree = buildBracketTree(rounds);
        if (!tree.roots.length) {
            return '<div class="vb-empty">No draw data available.</div>';
        }

        const { roots, roundLabels } = tree;
        const numRounds = roundLabels.length;

        const totalLeaves = Math.max(
            roots.reduce(function (s, r) { return s + countLeaves(r); }, 0), 1
        );
        const slotH      = Math.max(SLOT_H, BOX_H + 16);
        const totalBodyH = totalLeaves * slotH;
        const totalW     = numRounds * (BOX_W + CON_W) - CON_W;
        const totalH     = totalBodyH + LABEL_H;

        const counter = { val: 0 };
        roots.forEach(function (r) { layoutNode(r, slotH, counter); });

        const byRound = {};
        roots.forEach(function (r) { collectByRound(r, byRound); });

        const edges = [];
        roots.forEach(function (r) { collectEdges(r, edges); });

        // ── HTML ──────────────────────────────────────────────────────────────
        let html = '<div class="vb-outer">';

        html += '<div class="vb-legend" aria-label="Bracket legend">'
            + '<span class="vb-lg-item"><span class="vb-lg-live"></span>Live</span>'
            + '<span class="vb-lg-item"><span class="vb-lg-w"></span>Winner</span>'
            + '<span class="vb-lg-item vb-lg-hint">Tap a name to trace the path</span>'
            + '</div>';

        html += '<div class="vb-scroll" role="region" aria-label="Tournament bracket" tabindex="0">';
        html += '<div class="vb-bracket" style="width:' + totalW + 'px;height:' + totalH + 'px;">';

        // SVG connectors (drawn behind match boxes)
        html += '<svg class="vb-svg" xmlns="http://www.w3.org/2000/svg" '
            + 'width="' + totalW + '" height="' + totalH + '" aria-hidden="true">';

        edges.forEach(function (e) {
            const cRight    = e.child.ri  * (BOX_W + CON_W) + BOX_W;
            const pLeft     = e.parent.ri * (BOX_W + CON_W);
            const midX      = cRight + CON_W / 2;
            const cCY       = e.child.cy  + LABEL_H;
            const pCY       = e.parent.cy + LABEL_H;
            html += '<path class="vb-conn" d="M ' + cRight + ' ' + cCY
                + ' H ' + midX + ' V ' + pCY + ' H ' + pLeft + '"/>';
        });

        html += '</svg>';

        // Round labels + scroll anchors
        roundLabels.forEach(function (label, ri) {
            const colLeft = ri * (BOX_W + CON_W);
            const lblCls  = 'vb-round-lbl' + (label === 'Final' ? ' vb-lbl-final' : '');
            html += '<div class="' + lblCls + '" style="left:' + colLeft + 'px;width:' + BOX_W + 'px;height:' + LABEL_H + 'px;">'
                + label + '</div>';
            html += '<div class="vb-col-anchor" data-ri="' + ri
                + '" style="position:absolute;left:' + colLeft + 'px;top:0;width:1px;height:1px;pointer-events:none;"></div>';
        });

        // Match boxes
        const finalRi = numRounds - 1;
        Object.keys(byRound).forEach(function (key) {
            const ri      = parseInt(key, 10);
            const colLeft = ri * (BOX_W + CON_W);
            const isFinal = ri === finalRi;

            byRound[key].forEach(function (node) {
                const m    = node.match;
                const st   = matchStatus(m);
                const w    = matchWinner(m);
                const topY = node.cy + LABEL_H - BOX_H / 2;

                let cls = 'vb-match vb-s-' + st;
                if (isFinal && st === 'finished' && w) cls += ' vb-champion-match';

                html += '<div class="' + cls + '"'
                    + ' style="left:' + colLeft + 'px;top:' + topY + 'px;width:' + BOX_W
                    + 'px;height:' + BOX_H + 'px;display:flex;flex-direction:column;"'
                    + ' data-ri="' + ri + '"'
                    + ' data-p1="' + (m.player1Name || '').replace(/"/g, '&quot;') + '"'
                    + ' data-p2="' + (m.player2Name || '').replace(/"/g, '&quot;') + '"'
                    + '>';

                if (st === 'live') html += '<div class="vb-live-dot" aria-label="Live"></div>';
                html += playerRow(m, 'p1', st, w, isFinal);
                html += '<div class="vb-divider"></div>';
                html += playerRow(m, 'p2', st, w, isFinal);
                html += '</div>';
            });
        });

        html += '</div>';  // .vb-bracket
        html += '</div>';  // .vb-scroll
        html += '</div>';  // .vb-outer

        return html;
    };

})();

// ── initBracket — wire "path to title" interactivity ─────────────────────────
TW.initBracket = function initBracket(container) {
    if (!container) return;

    container.querySelectorAll('.vb-pname').forEach(function (el) {
        el.addEventListener('click', function (e) {
            e.stopPropagation();
            const playerName = el.textContent.trim();
            const alreadyOn  = container.querySelector('.vb-pname.vb-path-name');

            container.querySelectorAll('.vb-match').forEach(function (b) {
                b.classList.remove('vb-path-on', 'vb-path-dim');
            });
            container.querySelectorAll('.vb-pname').forEach(function (n) {
                n.classList.remove('vb-path-name');
            });

            if (alreadyOn && alreadyOn.textContent.trim() === playerName) return;

            container.querySelectorAll('.vb-match').forEach(function (box) {
                if (box.dataset.p1 === playerName || box.dataset.p2 === playerName) {
                    box.classList.add('vb-path-on');
                } else {
                    box.classList.add('vb-path-dim');
                }
            });
            el.classList.add('vb-path-name');
        });
    });

    container.addEventListener('click', function (e) {
        if (!e.target.closest('.vb-pname')) {
            container.querySelectorAll('.vb-match').forEach(function (b) {
                b.classList.remove('vb-path-on', 'vb-path-dim');
            });
            container.querySelectorAll('.vb-pname').forEach(function (n) {
                n.classList.remove('vb-path-name');
            });
        }
    });
};
