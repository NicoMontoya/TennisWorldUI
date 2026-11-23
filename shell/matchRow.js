// Match row DOM. Names, scores, and chip copy are assigned with textContent
// or createTextNode. The Live aria-label is set with setAttribute.

export function chipModifier(kind) {
    if (kind === 'live') return 'live';
    if (kind === 'delayed') return 'delayed';
    if (kind === 'scheduled') return 'scheduled';
    if (kind === 'final' || kind === 'walkover' || kind === 'cancelled') return 'final';
    return 'none';
}

function nameSpan(doc, player, winner) {
    const span = doc.createElement('span');
    span.className = winner ? 's1-name s1-name-winner' : 's1-name';
    span.textContent = player && player.name ? player.name : 'Player';
    return span;
}

function slotNode(doc, row) {
    if (row && row.slotKind === 'time') {
        const time = doc.createElement('span');
        time.className = 's1-slot s1-slot-time';
        time.textContent = row.timeText || '';
        return time;
    }
    const chip = doc.createElement('span');
    const kind = row && row.slotKind;
    chip.className = `s1-slot s1-chip s1-chip-${chipModifier(kind)}`;
    if (kind === 'live') {
        const dot = doc.createElement('span');
        dot.className = 's1-live-dot';
        dot.setAttribute('aria-hidden', 'true');
        chip.appendChild(dot);
    }
    if (row && row.slot) chip.appendChild(doc.createTextNode(row.slot));
    return chip;
}

export function buildMatchRow(doc, row) {
    const item = doc.createElement('article');
    item.className = 's1-match';
    if (row && row.status) item.setAttribute('data-status', row.status);
    const open = doc.createElement('a');
    open.className = 's1-match-open s1-hit';
    if (row && row.href) open.setAttribute('href', row.href);
    open.setAttribute('data-nav', 'sheet');
    if (row && row.id) open.setAttribute('data-match-id', row.id);
    if (row && row.liveLabel) open.setAttribute('aria-label', row.liveLabel);

    const main = doc.createElement('span');
    main.className = 's1-match-main';
    const names = doc.createElement('span');
    names.className = 's1-match-names';
    names.appendChild(nameSpan(doc, row && row.p1, row && row.winnerSide === 'p1'));
    const vs = doc.createElement('span');
    vs.className = 's1-vs';
    vs.textContent = ' vs ';
    names.appendChild(vs);
    names.appendChild(nameSpan(doc, row && row.p2, row && row.winnerSide === 'p2'));
    main.appendChild(names);
    if (row && row.detail) {
        const detail = doc.createElement('span');
        detail.className = row.slotKind === 'scheduled' ? 's1-match-detail s1-time-muted' : 's1-match-detail';
        detail.textContent = row.detail;
        main.appendChild(detail);
    }
    open.appendChild(main);
    open.appendChild(slotNode(doc, row));
    item.appendChild(open);
    return item;
}
