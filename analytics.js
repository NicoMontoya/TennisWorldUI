// ===================================
// TennisWorld — Analytics page
// ===================================

document.addEventListener('DOMContentLoaded', () => {

    const playerMomentumData = {
        alcaraz: {
            name: 'Carlos Alcaraz', rank: '#2 ATP', country: '🇪🇸',
            surface: {
                hard:  { w: 28, l: 5,  pct: 85 },
                clay:  { w: 22, l: 4,  pct: 85 },
                grass: { w: 12, l: 2,  pct: 86 }
            },
            data: [
                { month: 'May',  year: "'25", score: 82, event: 'Madrid W',         label: true,  wins: 7, losses: 1 },
                { month: 'Jun',  year: "'25", score: 96, event: 'Roland Garros W',  label: true,  wins: 7, losses: 0 },
                { month: 'Jul',  year: "'25", score: 91, event: 'Wimbledon W',      label: true,  wins: 7, losses: 0 },
                { month: 'Aug',  year: "'25", score: 61, event: 'Cincinnati R3',    label: false, wins: 3, losses: 2 },
                { month: 'Sep',  year: "'25", score: 72, event: 'US Open QF',       label: false, wins: 5, losses: 1 },
                { month: 'Oct',  year: "'25", score: 54, event: 'Shanghai R2',      label: false, wins: 2, losses: 2 },
                { month: 'Nov',  year: "'25", score: 74, event: 'Paris Masters SF', label: false, wins: 4, losses: 1 },
                { month: 'Dec',  year: "'25", score: 63, event: 'Davis Cup',        label: false, wins: 3, losses: 1 },
                { month: 'Jan',  year: "'26", score: 88, event: 'AO Final ●',       label: true,  wins: 6, losses: 1 },
                { month: 'Feb',  year: "'26", score: 69, event: 'Rotterdam SF',     label: false, wins: 4, losses: 1 },
                { month: 'Mar',  year: "'26", score: 79, event: 'Indian Wells W',   label: true,  wins: 6, losses: 0 },
                { month: 'Apr',  year: "'26", score: 83, event: 'Miami Open SF',    label: false, wins: 5, losses: 1 },
            ]
        },
        djokovic: {
            name: 'Novak Djokovic', rank: '#1 ATP', country: '🇷🇸',
            surface: {
                hard:  { w: 24, l: 4,  pct: 86 },
                clay:  { w: 18, l: 5,  pct: 78 },
                grass: { w: 10, l: 2,  pct: 83 }
            },
            data: [
                { month: 'May',  year: "'25", score: 71, event: 'Rome SF',           label: false, wins: 4, losses: 1 },
                { month: 'Jun',  year: "'25", score: 77, event: 'Roland Garros QF',  label: false, wins: 5, losses: 1 },
                { month: 'Jul',  year: "'25", score: 60, event: 'Wimbledon R4',      label: false, wins: 3, losses: 1 },
                { month: 'Aug',  year: "'25", score: 56, event: 'Rogers Cup R2',     label: false, wins: 2, losses: 1 },
                { month: 'Sep',  year: "'25", score: 73, event: 'US Open SF',        label: false, wins: 5, losses: 1 },
                { month: 'Oct',  year: "'25", score: 70, event: 'Beijing W',         label: false, wins: 5, losses: 0 },
                { month: 'Nov',  year: "'25", score: 84, event: 'Paris Masters W',   label: true,  wins: 5, losses: 0 },
                { month: 'Dec',  year: "'25", score: 67, event: 'Davis Cup',         label: false, wins: 3, losses: 1 },
                { month: 'Jan',  year: "'26", score: 90, event: 'AO Final ●',        label: true,  wins: 6, losses: 1 },
                { month: 'Feb',  year: "'26", score: 74, event: 'Rotterdam W',       label: false, wins: 4, losses: 0 },
                { month: 'Mar',  year: "'26", score: 76, event: 'Indian Wells QF',   label: false, wins: 4, losses: 1 },
                { month: 'Apr',  year: "'26", score: 80, event: 'Miami SF',          label: false, wins: 5, losses: 1 },
            ]
        },
        sinner: {
            name: 'Jannik Sinner', rank: '#4 ATP', country: '🇮🇹',
            surface: {
                hard:  { w: 31, l: 5,  pct: 86 },
                clay:  { w: 14, l: 5,  pct: 74 },
                grass: { w: 8,  l: 3,  pct: 73 }
            },
            data: [
                { month: 'May',  year: "'25", score: 67, event: 'Rome R3',           label: false, wins: 3, losses: 1 },
                { month: 'Jun',  year: "'25", score: 72, event: 'Roland Garros SF',  label: false, wins: 5, losses: 1 },
                { month: 'Jul',  year: "'25", score: 64, event: 'Wimbledon QF',      label: false, wins: 4, losses: 1 },
                { month: 'Aug',  year: "'25", score: 89, event: 'Cincinnati W',      label: true,  wins: 6, losses: 0 },
                { month: 'Sep',  year: "'25", score: 95, event: 'US Open W',         label: true,  wins: 7, losses: 0 },
                { month: 'Oct',  year: "'25", score: 81, event: 'Shanghai W',        label: true,  wins: 6, losses: 0 },
                { month: 'Nov',  year: "'25", score: 88, event: 'ATP Finals W',      label: true,  wins: 5, losses: 1 },
                { month: 'Dec',  year: "'25", score: 72, event: 'Davis Cup',         label: false, wins: 4, losses: 1 },
                { month: 'Jan',  year: "'26", score: 79, event: 'AO Semifinal',      label: false, wins: 5, losses: 1 },
                { month: 'Feb',  year: "'26", score: 70, event: 'Doha Final',        label: false, wins: 4, losses: 1 },
                { month: 'Mar',  year: "'26", score: 74, event: 'Indian Wells SF',   label: false, wins: 5, losses: 1 },
                { month: 'Apr',  year: "'26", score: 76, event: 'Miami QF',          label: false, wins: 4, losses: 1 },
            ]
        },
        medvedev: {
            name: 'Daniil Medvedev', rank: '#3 ATP', country: '🇷🇺',
            surface: {
                hard:  { w: 26, l: 7,  pct: 79 },
                clay:  { w: 8,  l: 6,  pct: 57 },
                grass: { w: 5,  l: 4,  pct: 56 }
            },
            data: [
                { month: 'May',  year: "'25", score: 59, event: 'Madrid R2',         label: false, wins: 2, losses: 1 },
                { month: 'Jun',  year: "'25", score: 55, event: 'Roland Garros R3',  label: false, wins: 2, losses: 1 },
                { month: 'Jul',  year: "'25", score: 44, event: 'Wimbledon R2',      label: false, wins: 1, losses: 1 },
                { month: 'Aug',  year: "'25", score: 81, event: 'Rogers Cup W',      label: true,  wins: 5, losses: 0 },
                { month: 'Sep',  year: "'25", score: 84, event: 'US Open Final',     label: true,  wins: 6, losses: 1 },
                { month: 'Oct',  year: "'25", score: 72, event: 'Vienna W',          label: false, wins: 5, losses: 0 },
                { month: 'Nov',  year: "'25", score: 63, event: 'Paris QF',          label: false, wins: 3, losses: 1 },
                { month: 'Dec',  year: "'25", score: 58, event: 'Davis Cup R1',      label: false, wins: 2, losses: 1 },
                { month: 'Jan',  year: "'26", score: 52, event: 'AO Semifinal',      label: false, wins: 4, losses: 1 },
                { month: 'Feb',  year: "'26", score: 74, event: 'Marseille W',       label: false, wins: 4, losses: 0 },
                { month: 'Mar',  year: "'26", score: 65, event: 'Indian Wells R3',   label: false, wins: 2, losses: 1 },
                { month: 'Apr',  year: "'26", score: 62, event: 'Miami R2',          label: false, wins: 1, losses: 1 },
            ]
        }
    };

    function renderMomentumChart(playerKey) {
        const player    = playerMomentumData[playerKey];
        const container = document.getElementById('momentumGraph');
        const tooltip   = document.getElementById('momentumTooltip');
        if (!container || !player) return;

        const W = 560, H = 220;
        const mL = 36, mR = 20, mT = 26, mB = 44;
        const cW = W - mL - mR, cH = H - mT - mB;
        const n = player.data.length;
        const xStep = cW / (n - 1);
        const px = i => mL + i * xStep;
        const py = v => mT + cH - (v / 100) * cH;

        const grid = [25, 50, 75, 100].map(v => {
            const y = py(v).toFixed(1);
            return `<line x1="${mL}" y1="${y}" x2="${W - mR}" y2="${y}"
                        stroke="rgba(17,17,17,${v === 50 ? 0.1 : 0.05})"
                        stroke-width="${v === 50 ? 0.75 : 0.4}"/>
                    <text x="${mL - 6}" y="${y}" text-anchor="end" dominant-baseline="middle"
                        font-family="Inter,sans-serif" font-size="9" fill="#aaa">${v}</text>`;
        }).join('');

        const avgY = py(70).toFixed(1);
        const avgLine = `
            <line x1="${mL}" y1="${avgY}" x2="${W - mR}" y2="${avgY}"
                stroke="rgba(181,69,27,0.45)" stroke-width="0.9" stroke-dasharray="5,3"/>
            <text x="${W - mR + 4}" y="${avgY}" dominant-baseline="middle"
                font-family="Inter,sans-serif" font-size="8" fill="rgba(181,69,27,0.65)">avg</text>`;

        const areaD = [
            `M ${px(0).toFixed(1)},${(mT + cH).toFixed(1)}`,
            ...player.data.map((d, i) => `L ${px(i).toFixed(1)},${py(d.score).toFixed(1)}`),
            `L ${px(n - 1).toFixed(1)},${(mT + cH).toFixed(1)} Z`
        ].join(' ');

        const linePoints = player.data
            .map((d, i) => `${px(i).toFixed(1)},${py(d.score).toFixed(1)}`).join(' ');

        const dots = player.data.map((d, i) => {
            const x = px(i).toFixed(1), y = py(d.score).toFixed(1);
            const above = d.score >= 68;
            const labelY = above ? (parseFloat(y) - 12).toFixed(1) : (parseFloat(y) + 15).toFixed(1);
            return `
                <circle class="m-dot" cx="${x}" cy="${y}" r="3.5"
                    fill="#fffff8" stroke="#111111" stroke-width="1.5"
                    data-score="${d.score}" data-event="${d.event}"
                    data-month="${d.month} ${d.year}"
                    data-wins="${d.wins}" data-losses="${d.losses}"/>
                ${d.label ? `<text x="${x}" y="${labelY}" text-anchor="middle"
                    font-family="Inter,sans-serif" font-size="8" fill="#555"
                    font-style="italic">${d.event}</text>` : ''}`;
        }).join('');

        const xLabels = player.data.map((d, i) => {
            const x = px(i).toFixed(1);
            const baseY = mT + cH + 14;
            const bump = i % 2 === 0 ? 0 : 10;
            return `<text x="${x}" y="${baseY + bump}" text-anchor="middle"
                        font-family="Inter,sans-serif" font-size="8.5" fill="#999">${d.month}</text>
                    <text x="${x}" y="${baseY + bump + 9}" text-anchor="middle"
                        font-family="Inter,sans-serif" font-size="7.5" fill="#bbb">${d.year}</text>`;
        }).join('');

        container.innerHTML = `
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block;overflow:visible" id="momentumSVG">
            <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stop-color="#111111" stop-opacity="0.07"/>
                    <stop offset="100%" stop-color="#111111" stop-opacity="0.01"/>
                </linearGradient>
            </defs>
            ${grid}${avgLine}
            <path d="${areaD}" fill="url(#areaGrad)"/>
            <line x1="${mL}" y1="${mT + cH}" x2="${W - mR}" y2="${mT + cH}"
                stroke="rgba(17,17,17,0.2)" stroke-width="0.75"/>
            <polyline points="${linePoints}" fill="none" stroke="#111111"
                stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
            ${dots}${xLabels}
        </svg>`;

        container.querySelectorAll('.m-dot').forEach(dot => {
            dot.addEventListener('mouseenter', () => {
                const above = parseInt(dot.dataset.score) >= 68;
                tooltip.innerHTML = `<strong>${dot.dataset.month} · ${dot.dataset.event}</strong>Score: ${dot.dataset.score} &nbsp;|&nbsp; W–L: ${dot.dataset.wins}–${dot.dataset.losses}`;
                tooltip.style.display = 'block';
                const cRect = container.getBoundingClientRect();
                const dRect = dot.getBoundingClientRect();
                tooltip.style.left = `${Math.min(dRect.left - cRect.left + 10, cRect.width - 180)}px`;
                tooltip.style.top  = above
                    ? `${dRect.top - cRect.top - 58}px`
                    : `${dRect.top - cRect.top + 12}px`;
            });
            dot.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
        });

        const nameEl = document.getElementById('momentumPlayerName');
        if (nameEl) nameEl.textContent = `${player.country} ${player.name}`;

        const scores = player.data.map(d => d.score);
        const peak   = Math.max(...scores);
        const peakM  = player.data[scores.indexOf(peak)];
        const current = scores[scores.length - 1];
        const trend   = current - scores[scores.length - 2];
        const summaryEl = document.getElementById('momentumSummary');
        if (summaryEl) {
            summaryEl.innerHTML = `
                <span>Peak: <strong>${peak}</strong> (${peakM.month} ${peakM.year})</span>
                <span>Current: <strong>${current}</strong></span>
                <span>Trend: <strong style="color:${trend >= 0 ? 'var(--positive)' : 'var(--negative)'}">${trend >= 0 ? '+' : ''}${trend}</strong></span>`;
        }

        renderSurfaceBreakdown(player);
    }

    function renderSurfaceBreakdown(player) {
        const el = document.getElementById('surfaceBreakdown');
        if (!el || !player.surface) return;
        el.innerHTML = [
            { key: 'hard',  label: 'Hard',  color: '#2563eb' },
            { key: 'clay',  label: 'Clay',  color: 'var(--accent)' },
            { key: 'grass', label: 'Grass', color: 'var(--positive)' },
        ].map(s => {
            const d = player.surface[s.key];
            return `<div class="surface-row">
                <div class="surface-row-header">
                    <span class="surface-label">${s.label}</span>
                    <span class="surface-record">${d.w}W – ${d.l}L</span>
                    <span class="surface-pct">${d.pct}%</span>
                </div>
                <div class="surface-bar-track">
                    <div class="surface-bar-fill" style="width:${d.pct}%;background:${s.color}"></div>
                </div>
            </div>`;
        }).join('');
    }

    renderMomentumChart('alcaraz');
    document.getElementById('momentumPlayerSelect')?.addEventListener('change', e => renderMomentumChart(e.target.value));

});
