// Sprint 1 preview shell. DOM only: textContent / createElement.
// Sample fixtures load with a dynamic import after the localhost gate.
// This file does not call the network.

import { loadShellData } from './dataSource.js';
import { applyNav, planClick } from './navPlan.js';
import { sampleFixturesAllowed } from './previewGate.js';
import { hrefFor, parseLocation, safeId } from './router.js';
import { buildView, viewerFromUser } from './viewModel.js';

const main = document.getElementById('shellMain');
const banner = document.getElementById('s1Banner');
const stale = document.getElementById('s1Stale');
const sheet = document.getElementById('matchSheet');
const sheetBody = document.getElementById('sheetBody');
const sheetTitle = document.getElementById('sheetTitle');

let sampleModule = null;
let returnMatchId = null;
let careerChart = null;
let lastSheetOpen = false;

function zone() {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function gateOpen() {
    return sampleFixturesAllowed({
        hostname: location.hostname,
        search: location.search,
        preview: document.documentElement.getAttribute('data-tw-preview'),
    });
}

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = text;
    return node;
}

function button(className, text, action, data) {
    const node = el('button', className, text);
    node.type = 'button';
    node.dataset.action = action;
    if (data) {
        Object.keys(data).forEach((key) => {
            node.dataset[key] = data[key];
        });
    }
    return node;
}

function link(className, text, href, nav) {
    const node = el('a', className, text);
    node.href = href;
    node.dataset.nav = nav;
    return node;
}

function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
}

function currentRoute() {
    const route = parseLocation(location.pathname, location.search);
    route.pushed = Boolean(history.state && history.state.pushed);
    return route;
}

function viewerFor(allowed, route) {
    if (allowed && route.session === 'sample') {
        const follows = sampleModule ? sampleModule.SAMPLE_FOLLOWS : [];
        return {
            signedIn: true,
            displayName: 'Sample Member',
            follows: follows.map((favorite) => ({ ...favorite })),
            sampleSession: true,
        };
    }
    const user = window.TW && window.TW.auth ? window.TW.auth.user : null;
    return viewerFromUser(user);
}

async function ensureSample(allowed) {
    if (!allowed) return null;
    if (!sampleModule) sampleModule = await import('./fixtures.js');
    return sampleModule;
}

function historyApi() {
    return {
        getScroll: () => main.scrollTop,
        setScroll: (y) => { main.scrollTop = y; },
        getState: () => history.state,
        commitScroll: (y) => {
            const state = history.state;
            if (state && state.tw) history.replaceState({ ...state, scrollY: y }, '');
        },
        pushState: (state, href) => history.pushState(state, '', href),
        replaceState: (state, href) => history.replaceState(state, '', href),
        back: () => history.back(),
    };
}

function go(target) {
    const route = currentRoute();
    const plan = planClick(route, target);
    if (plan.method !== 'back') plan.href = hrefFor(plan.route, location.pathname);
    if (target.kind === 'sheet') returnMatchId = target.matchId;
    applyNav(historyApi(), plan);
    if (plan.method !== 'back') paint();
}

function renderSkeleton() {
    clear(main);
    const wrap = el('div', 's1-skeleton');
    wrap.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i += 1) {
        const block = el('div', 'skeleton-block s1-skel-card');
        wrap.appendChild(block);
    }
    main.appendChild(wrap);
    main.setAttribute('aria-busy', 'true');
}

function renderBanner(model) {
    clear(banner);
    banner.appendChild(el('strong', 's1-banner-kicker', model.sample ? 'Sample data' : 'Preview off'));
    banner.appendChild(el('p', 's1-banner-copy', model.banner));
}

function renderStale(model) {
    clear(stale);
    if (!model.stale && !model.error) {
        stale.hidden = true;
        return;
    }
    stale.hidden = false;
    if (model.error) stale.appendChild(el('span', 's1-stale-msg', model.error));
    if (model.stale) stale.appendChild(el('span', 's1-stale-msg', `Showing stored sample copy ${model.stale}.`));
    const retry = button('error-retry-btn s1-hit', 'Try again', 'retry');
    stale.appendChild(retry);
}

function renderTour(host, model) {
    const group = el('div', 's1-segment');
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', 'Tour');
    ['ATP', 'WTA'].forEach((tour) => {
        const node = button('s1-segment-btn s1-hit', tour, 'tour', { tour });
        node.setAttribute('aria-pressed', String(model.tour === tour));
        if (model.tour === tour) node.classList.add('is-active');
        group.appendChild(node);
    });
    host.appendChild(group);
}

function renderMatch(row, sample) {
    const item = el('article', 's1-match');
    item.dataset.phase = row.phase;
    if (sample) item.appendChild(el('p', 's1-kicker', 'Sample'));
    const open = link('s1-match-open s1-hit', '', row.href, 'sheet');
    open.dataset.matchId = row.id;
    open.appendChild(el('span', 's1-match-names', `${row.p1.name} vs ${row.p2.name}`));
    const meta = el('span', 's1-match-meta');
    if (row.p1.seed || row.p2.seed) {
        meta.appendChild(el('span', null, `Seeds ${row.p1.seed || '–'} / ${row.p2.seed || '–'}`));
    }
    meta.appendChild(el('span', null, row.round));
    meta.appendChild(el('span', `s1-chip s1-chip-${row.phase}`, row.chip));
    open.appendChild(meta);
    open.appendChild(el('span', 's1-match-primary', row.primary));
    if (row.p1.rank || row.p2.rank) {
        open.appendChild(el('span', 's1-match-ranks', `${row.p1.rank} · ${row.p2.rank}`));
    }
    item.appendChild(open);
    return item;
}

function renderToday(host, model) {
    const today = model.today;
    host.appendChild(el('h1', 's1-title', 'Today'));
    renderTour(host, model);
    host.appendChild(el('h2', 's1-sub', 'Live now'));
    if (today.emptyLive) {
        host.appendChild(el('p', 's1-empty', today.emptyLiveText));
        if (today.nextScheduled) {
            host.appendChild(el('p', 's1-note', 'Next scheduled match'));
            host.appendChild(renderMatch(today.nextScheduled, model.sample));
        }
    } else {
        today.live.forEach((row) => host.appendChild(renderMatch(row, model.sample)));
    }
    host.appendChild(el('h2', 's1-sub', 'Up next today'));
    if (!today.upNext.length) host.appendChild(el('p', 's1-empty', 'Nothing else is scheduled later today.'));
    today.upNext.forEach((row) => host.appendChild(renderMatch(row, model.sample)));
    host.appendChild(el('h2', 's1-sub', 'Followed players'));
    if (today.followsNote) host.appendChild(el('p', 's1-note', today.followsNote));
    if (!today.follows.length && !today.followsNote) host.appendChild(el('p', 's1-empty', 'No followed players.'));
    today.follows.forEach((favorite) => {
        const row = el('div', 's1-follow');
        if (favorite.href) row.appendChild(link('s1-hit', favorite.name, favorite.href, 'view'));
        else row.appendChild(el('span', null, favorite.name));
        if (favorite.detail) row.appendChild(el('span', 's1-note', favorite.detail));
        host.appendChild(row);
    });
}

function renderSchedule(host, model) {
    const schedule = model.schedule;
    host.appendChild(el('h1', 's1-title', 'Schedule'));
    renderTour(host, model);
    const segments = el('div', 's1-segment');
    segments.setAttribute('role', 'tablist');
    segments.setAttribute('aria-label', 'Schedule range');
    schedule.segments.forEach((segment) => {
        const node = button('s1-segment-btn s1-hit', segment.label, 'segment', { segment: segment.id });
        node.setAttribute('role', 'tab');
        node.setAttribute('aria-selected', String(schedule.segment === segment.id));
        if (schedule.segment === segment.id) node.classList.add('is-active');
        segments.appendChild(node);
    });
    host.appendChild(segments);
    const months = el('div', 's1-months');
    months.tabIndex = 0;
    months.setAttribute('aria-label', 'Months');
    months.appendChild(button('s1-month s1-hit', 'All', 'month', { month: '' }));
    schedule.months.forEach((month) => {
        const node = button('s1-month s1-hit', month.label, 'month', { month: month.key });
        if (month.active) node.classList.add('is-active');
        months.appendChild(node);
    });
    host.appendChild(months);
    if (schedule.empty) host.appendChild(el('p', 's1-empty', schedule.empty));
    const grid = el('div', 's1-cards');
    schedule.cards.forEach((card) => grid.appendChild(renderCard(card, model.sample)));
    host.appendChild(grid);
}

function renderCard(card, sample) {
    const surface = card.surface === 'clay' || card.surface === 'grass' ? card.surface : 'hard';
    const node = link(`s1-card cal-t-card surface-${surface}${card.chipKind === 'live' ? ' is-live' : ''}`, '', card.href, 'view');
    node.dataset.surface = surface;
    if (sample) node.appendChild(el('p', 's1-kicker', 'Sample'));
    const top = el('div', 'cal-card-top');
    top.appendChild(el('span', 's1-tier', card.tier));
    if (card.chip) {
        const chipClass = card.chipKind === 'live'
            ? 'cal-card-status-live'
            : card.chipKind === 'final'
                ? 'cal-card-status-done'
                : 'cal-card-status-upcoming';
        top.appendChild(el('span', chipClass, card.chip));
    }
    node.appendChild(top);
    node.appendChild(el('span', 'cal-card-city', card.name));
    node.appendChild(el('span', 'cal-card-dates', card.dates));
    node.appendChild(el('span', `surface-pill ${surface}`, surface));
    if (card.nextLabel) node.appendChild(el('span', 's1-note', card.nextLabel));
    return node;
}

function renderTournament(host, model) {
    const tournament = model.tournament;
    host.appendChild(button('s1-back s1-hit', 'Back', 'back'));
    if (!tournament || tournament.missing) {
        host.appendChild(el('h1', 's1-title', 'Tournament'));
        host.appendChild(el('p', 's1-empty', 'No sample tournament for that link.'));
        return;
    }
    if (model.sample) host.appendChild(el('p', 's1-kicker', 'Sample'));
    host.appendChild(el('h1', 's1-title', tournament.name));
    host.appendChild(el('p', 's1-note', `${tournament.tier} · ${tournament.surface} · ${tournament.dates}`));
    if (tournament.chip) host.appendChild(el('p', `s1-chip s1-chip-${tournament.chipKind}`, tournament.chip));
    const tabs = el('div', 's1-segment');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Tournament');
    tournament.tabs.forEach((tab) => {
        const node = button('s1-segment-btn s1-hit', tab.label, 'tab', { tab: tab.id });
        node.setAttribute('role', 'tab');
        node.setAttribute('aria-selected', String(tournament.tab === tab.id));
        if (tournament.tab === tab.id) node.classList.add('is-active');
        tabs.appendChild(node);
    });
    host.appendChild(tabs);
    if (tournament.tab !== 'draw') {
        const rounds = el('div', 's1-months');
        rounds.setAttribute('aria-label', 'Rounds');
        tournament.rounds.forEach((round) => {
            const node = button('s1-month s1-hit', round.label, 'round', { round: round.id });
            if (tournament.round === round.id) node.classList.add('is-active');
            rounds.appendChild(node);
        });
        host.appendChild(rounds);
        if (tournament.empty) host.appendChild(el('p', 's1-empty', tournament.empty));
        tournament.matches.forEach((row) => host.appendChild(renderMatch(row, model.sample)));
        return;
    }
    const drawHost = el('div', 's1-draw');
    drawHost.id = 's1Draw';
    host.appendChild(drawHost);
}

function renderForm(host, label, form) {
    const wrap = el('div', 's1-form');
    wrap.appendChild(el('span', 's1-note', label));
    const strip = el('div', 's1-form-strip');
    (form || []).forEach((mark) => {
        const pill = el('span', mark === 'L' ? 's1-loss' : 's1-win', mark);
        pill.setAttribute('aria-label', mark === 'L' ? 'Sample loss' : 'Sample win');
        strip.appendChild(pill);
    });
    wrap.appendChild(strip);
    host.appendChild(wrap);
}

function renderPlayer(host, model) {
    const player = model.player;
    host.appendChild(button('s1-back s1-hit', 'Back', 'back'));
    if (!player || player.missing) {
        host.appendChild(el('h1', 's1-title', 'Player'));
        host.appendChild(el('p', 's1-empty', 'No sample player for that link.'));
        return;
    }
    if (model.sample) host.appendChild(el('p', 's1-kicker', 'Sample'));
    host.appendChild(el('h1', 's1-title', player.name));
    const move = el('p', `s1-move s1-move-${player.move.dir}`);
    move.appendChild(el('span', 's1-move-glyph', player.move.glyph));
    move.appendChild(document.createTextNode(` ${player.rank} · ${player.move.text}`));
    host.appendChild(move);
    host.appendChild(el('p', 's1-note', `${player.age} · ${player.country}`));
    if (player.next) {
        host.appendChild(el('h2', 's1-sub', 'Next match'));
        host.appendChild(renderMatch(player.next, model.sample));
    } else {
        host.appendChild(el('p', 's1-empty', 'No sample match is scheduled next.'));
    }
    renderForm(host, 'Sample form, last 10', player.form);
    host.appendChild(el('h2', 's1-sub', 'Sample surface record'));
    player.surfaces.forEach((line) => host.appendChild(el('p', 's1-record', line)));
    host.appendChild(el('h2', 's1-sub', 'Sample career curve'));
    host.appendChild(el('p', 's1-note', 'Sample career curve. Not a real player.'));
    const canvas = document.createElement('canvas');
    canvas.id = 's1Career';
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Sample career curve of cumulative wins by age');
    host.appendChild(canvas);
    const table = el('table', 'rankings-table s1-career-table');
    const head = el('tr');
    head.appendChild(el('th', null, 'Age'));
    head.appendChild(el('th', null, 'Sample wins'));
    const thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const body = el('tbody');
    player.career.forEach((point) => {
        const tr = el('tr');
        tr.appendChild(el('td', null, String(point.age)));
        tr.appendChild(el('td', null, String(point.wins)));
        body.appendChild(tr);
    });
    table.appendChild(body);
    host.appendChild(table);
    host.appendChild(el('h2', 's1-sub', 'Recent sample results'));
    if (!player.recent.length) host.appendChild(el('p', 's1-empty', 'No sample results yet.'));
    player.recent.forEach((result) => host.appendChild(el('p', 's1-record', result.text)));
    host.appendChild(el('h2', 's1-sub', 'Sample head-to-head'));
    const h2h = el('div', 's1-h2h');
    h2h.id = 's1PlayerH2h';
    host.appendChild(h2h);
}

function renderRankings(host, model) {
    host.appendChild(el('h1', 's1-title', 'Rankings'));
    renderTour(host, model);
    if (model.sample) host.appendChild(el('p', 's1-kicker', 'Sample rankings'));
    if (model.rankings.empty) {
        host.appendChild(el('p', 's1-empty', model.rankings.empty));
        return;
    }
    const table = el('table', 'rankings-table');
    const head = el('tr');
    ['Rank', 'Move', 'Player', 'Age'].forEach((label) => head.appendChild(el('th', null, label)));
    const thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    const body = el('tbody');
    model.rankings.rows.forEach((row) => {
        const tr = el('tr', 's1-rank-row');
        tr.appendChild(el('td', 'rank-num', row.rank));
        const move = el('td', `s1-move-${row.move.dir}`);
        move.textContent = row.move.dir === 'flat' ? '–' : `${row.move.glyph} ${row.move.text.split(' ').pop()}`;
        move.setAttribute('aria-label', row.move.text);
        tr.appendChild(move);
        const name = el('td');
        const anchor = link('s1-hit s1-rank-link', row.name, row.href, 'view');
        name.appendChild(anchor);
        name.appendChild(el('span', 's1-note', ` ${row.country}`));
        tr.appendChild(name);
        tr.appendChild(el('td', null, row.age));
        body.appendChild(tr);
    });
    table.appendChild(body);
    host.appendChild(table);
}

function renderPicks(host, model) {
    host.appendChild(el('h1', 's1-title', 'Picks'));
    if (model.sample) host.appendChild(el('p', 's1-kicker', 'Sample'));
    host.appendChild(el('p', 's1-note', model.picks.note));
    const disabled = button('s1-pick s1-hit', model.picks.label, 'noop');
    disabled.disabled = true;
    disabled.setAttribute('aria-disabled', 'true');
    host.appendChild(disabled);
}

function renderMe(host, model) {
    const me = model.me;
    host.appendChild(el('h1', 's1-title', 'Me'));
    if (me.sampleNote) host.appendChild(el('p', 's1-kicker', me.sampleNote));
    if (!me.signedIn) {
        host.appendChild(el('p', 's1-note', me.signedOutNote));
        host.appendChild(button('s1-pick s1-hit', 'Sign in', 'signin'));
        if (model.sample) {
            host.appendChild(el('p', 's1-note', 'The sample sign-in is a labeled preview of the signed-in layout. It is not an account and it is not saved.'));
            host.appendChild(button('s1-secondary s1-hit', 'Preview sample sign-in', 'session', { session: 'sample' }));
        }
        return;
    }
    host.appendChild(el('p', 's1-identity', me.displayName));
    host.appendChild(el('p', 's1-note', me.recordNote));
    host.appendChild(el('h2', 's1-sub', 'Followed players'));
    if (!me.follows.length) host.appendChild(el('p', 's1-empty', 'No followed players.'));
    me.follows.forEach((favorite) => {
        if (favorite.href) host.appendChild(link('s1-hit s1-follow-link', favorite.name, favorite.href, 'view'));
        else host.appendChild(el('p', null, favorite.name));
    });
    if (me.sampleSession) host.appendChild(button('s1-secondary s1-hit', 'Leave sample sign-in', 'session', { session: '' }));
}

function renderGates(host, model) {
    const details = el('details', 's1-gates');
    details.appendChild(el('summary', null, 'Preview limits'));
    const list = el('ul');
    model.gates.forEach((gate) => list.appendChild(el('li', null, gate)));
    details.appendChild(list);
    host.appendChild(details);
}

function mountH2H(host, payload) {
    if (!host) return;
    clear(host);
    if (!payload) {
        host.appendChild(el('p', 's1-empty', 'No sample head-to-head.'));
        return;
    }
    if (window.TW && window.TW.H2HPresenter) {
        window.TW.H2HPresenter.mount(host, payload);
        return;
    }
    host.appendChild(el('p', null, `${payload.player1.name} vs ${payload.player2.name}`));
}

function mountDraw(model) {
    const host = document.getElementById('s1Draw');
    if (!host || !model.tournament || !model.tournament.draw) return;
    const draw = model.tournament.draw;
    if (window.TW && window.TW.DrawBracket) {
        try {
            const built = window.TW.DrawBracket(draw.rounds, draw.tour, draw.name, draw.year);
            host.appendChild(built.el);
            return;
        } catch (err) {
            host.appendChild(el('p', 's1-empty', 'Sample draw could not be drawn.'));
        }
    }
    model.tournament.matches.forEach((row) => host.appendChild(el('p', null, `${row.p1.name} vs ${row.p2.name}`)));
}

function mountCareer(points) {
    const canvas = document.getElementById('s1Career');
    if (!canvas || !window.Chart || !points || !points.length) return;
    if (careerChart) {
        careerChart.destroy();
        careerChart = null;
    }
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#141414';
    careerChart = new window.Chart(canvas, {
        type: 'line',
        data: {
            datasets: [{
                label: 'Sample wins',
                data: points.map((point) => ({ x: point.age, y: point.wins })),
                borderColor: ink,
                backgroundColor: 'transparent',
                pointRadius: 2,
                tension: 0,
            }],
        },
        options: {
            animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 200 },
            plugins: { legend: { display: false }, tooltip: { enabled: true } },
            scales: {
                x: { type: 'linear', title: { display: true, text: 'Years old', color: ink } },
                y: { title: { display: true, text: 'Sample wins', color: ink }, beginAtZero: true },
            },
        },
    });
}

function renderSheet(model) {
    const open = Boolean(model.sheet);
    sheet.hidden = !open;
    document.body.classList.toggle('s1-sheet-open', open);
    main.inert = open;
    const tabs = document.querySelector('.s1-tabs');
    const nav = document.getElementById('mainNav');
    if (tabs) tabs.inert = open;
    if (nav) nav.inert = open;
    if (!open) {
        if (lastSheetOpen) restoreFocus();
        lastSheetOpen = false;
        return;
    }
    clear(sheetBody);
    const data = model.sheet;
    sheetTitle.textContent = data.title;
    if (model.sample) sheetBody.appendChild(el('p', 's1-kicker', 'Sample'));
    sheetBody.appendChild(el('p', 's1-match-primary', data.primary));
    sheetBody.appendChild(el('p', `s1-chip s1-chip-${data.phase}`, data.chip));
    [data.p1, data.p2].forEach((player, index) => {
        const block = el('div', 's1-sheet-player');
        const name = link('s1-hit s1-sheet-name', `${player.name} ${player.rank}`, player.href, 'view');
        block.appendChild(name);
        if (player.seed) block.appendChild(el('span', 's1-note', `Seed ${player.seed}`));
        renderForm(block, 'Sample form, last 10', index === 0 ? data.form1 : data.form2);
        const record = index === 0 ? data.surface1 : data.surface2;
        if (record) block.appendChild(el('p', 's1-record', record));
        sheetBody.appendChild(block);
    });
    const h2h = el('div', 's1-h2h');
    h2h.id = 's1SheetH2h';
    sheetBody.appendChild(h2h);
    mountH2H(h2h, data.h2h);
    const pick = button('s1-pick s1-hit', data.pickLabel, 'noop');
    pick.disabled = true;
    pick.setAttribute('aria-disabled', 'true');
    sheetBody.appendChild(pick);
    sheetBody.appendChild(el('p', 's1-note', 'Picks stay closed. No estimate is shown.'));
    if (!lastSheetOpen) {
        const close = document.getElementById('sheetClose');
        if (close) close.focus();
    }
    lastSheetOpen = true;
}

function restoreFocus() {
    if (!returnMatchId) return;
    const target = main.querySelector(`[data-match-id="${CSS.escape(returnMatchId)}"]`);
    returnMatchId = null;
    if (target) target.focus();
}

function highlightNav(model) {
    const active = model.view === 'tournament' ? 'schedule' : model.view;
    const route = currentRoute();
    document.querySelectorAll('[data-tab]').forEach((node) => {
        const viewName = node.dataset.tab;
        const on = viewName === active;
        node.href = hrefFor({
            ...route,
            view: viewName,
            entityId: null,
            matchId: null,
            tab: 'matches',
            round: 'all',
            segment: viewName === 'schedule' ? route.segment : null,
            month: viewName === 'schedule' ? route.month : null,
        }, location.pathname);
        node.classList.toggle('active', on);
        node.classList.toggle('is-active', on);
        if (on) node.setAttribute('aria-current', 'page');
        else node.removeAttribute('aria-current');
    });
}

function paint() {
    const allowed = gateOpen();
    const route = currentRoute();
    const dataset = allowed && sampleModule ? sampleModule.buildSampleDataset() : null;
    const now = allowed && sampleModule ? Date.parse(sampleModule.SAMPLE_NOW) : Date.now();
    const data = loadShellData({
        allowed,
        state: allowed ? route.state : 'ready',
        dataset,
        now,
    });
    const model = buildView({
        data,
        route,
        now: data.now,
        timeZone: zone(),
        viewer: viewerFor(allowed, route),
    });
    renderBanner(model);
    renderStale(model);
    if (careerChart) {
        careerChart.destroy();
        careerChart = null;
    }
    clear(main);
    main.removeAttribute('aria-busy');
    const screen = el('div', 's1-screen');
    screen.dataset.screen = model.view;
    if (model.view === 'today') renderToday(screen, model);
    else if (model.view === 'schedule') renderSchedule(screen, model);
    else if (model.view === 'tournament') renderTournament(screen, model);
    else if (model.view === 'player') renderPlayer(screen, model);
    else if (model.view === 'rankings') renderRankings(screen, model);
    else if (model.view === 'picks') renderPicks(screen, model);
    else if (model.view === 'me') renderMe(screen, model);
    renderGates(screen, model);
    main.appendChild(screen);
    if (model.view === 'tournament' && model.tournament && !model.tournament.missing && model.tournament.tab === 'draw') {
        mountDraw(model);
    }
    if (model.view === 'player' && model.player && !model.player.missing) {
        mountCareer(model.player.career);
        mountH2H(document.getElementById('s1PlayerH2h'), model.player.h2h);
    }
    highlightNav(model);
    renderSheet(model);
    document.title = model.sample ? 'TennisWorld — Sample preview' : 'TennisWorld — Preview';
}

function onClick(event) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const playerNode = event.target.closest('[data-open-player]');
    if (playerNode && safeId(playerNode.dataset.playerKey)) {
        event.preventDefault();
        const route = currentRoute();
        go({
            kind: 'view',
            route: { ...route, view: 'player', entityId: safeId(playerNode.dataset.playerKey), matchId: null },
        });
        return;
    }
    const drawCard = event.target.closest('.db-card[data-match-key]');
    if (drawCard && safeId(drawCard.dataset.matchKey)) {
        event.preventDefault();
        go({ kind: 'sheet', matchId: safeId(drawCard.dataset.matchKey) });
        return;
    }
    const actionNode = event.target.closest('[data-action]');
    const anchor = event.target.closest('a[data-nav]');
    if (!actionNode && !anchor) return;
    if (actionNode && actionNode.disabled) return;
    event.preventDefault();
    const route = currentRoute();
    if (actionNode) {
        const action = actionNode.dataset.action;
        if (action === 'signin') {
            if (window.TW && window.TW.auth) window.TW.auth.openModal('signin');
            return;
        }
        if (action === 'retry') {
            go({ kind: 'filter', patch: { state: 'ready' } });
            return;
        }
        if (action === 'segment') {
            go({ kind: 'filter', patch: { segment: actionNode.dataset.segment } });
            return;
        }
        if (action === 'month') {
            go({ kind: 'filter', patch: { month: actionNode.dataset.month || null } });
            return;
        }
        if (action === 'tab') {
            go({ kind: 'filter', patch: { tab: actionNode.dataset.tab, round: 'all' } });
            return;
        }
        if (action === 'round') {
            go({ kind: 'filter', patch: { round: actionNode.dataset.round || 'all' } });
            return;
        }
        if (action === 'tour') {
            go({ kind: 'filter', patch: { tour: actionNode.dataset.tour } });
            return;
        }
        if (action === 'session') {
            go({ kind: 'filter', patch: { session: actionNode.dataset.session || null } });
            return;
        }
        if (action === 'close-sheet') {
            go({ kind: 'close-sheet', pushed: Boolean(history.state && history.state.pushed) });
            return;
        }
        if (action === 'back') {
            if (history.state && Number(history.state.navDepth) > 0) go({ kind: 'back' });
            else go({ kind: 'view', route: { ...route, view: 'schedule', entityId: null, matchId: null } });
        }
        return;
    }
    const next = parseLocation(new URL(anchor.href).pathname, new URL(anchor.href).search);
    next.fileMode = route.fileMode;
    if (anchor.dataset.nav === 'sheet') {
        go({ kind: 'sheet', matchId: anchor.dataset.matchId || next.matchId });
        return;
    }
    go({ kind: 'view', route: next });
}

function onKeydown(event) {
    const auth = document.getElementById('authModal');
    if (auth && auth.getAttribute('aria-hidden') === 'false') return;
    if (event.key === 'Escape' && !sheet.hidden) {
        event.preventDefault();
        go({ kind: 'close-sheet', pushed: Boolean(history.state && history.state.pushed) });
        return;
    }
    if (event.key !== 'Tab' || sheet.hidden) return;
    const nodes = [...sheet.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        .filter((node) => !node.hasAttribute('disabled'));
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function onTouch() {
    const grab = document.querySelector('.s1-sheet-grab');
    if (!grab) return;
    let startY = null;
    grab.addEventListener('touchstart', (event) => {
        startY = event.touches[0].clientY;
    }, { passive: true });
    grab.addEventListener('touchend', (event) => {
        if (startY == null) return;
        const delta = event.changedTouches[0].clientY - startY;
        startY = null;
        if (delta > 72 && window.innerWidth < 768 && !sheet.hidden) {
            go({ kind: 'close-sheet', pushed: Boolean(history.state && history.state.pushed) });
        }
    }, { passive: true });
}

document.body.addEventListener('click', onClick);
document.addEventListener('keydown', onKeydown);
window.addEventListener('popstate', () => {
    paint();
    const y = history.state && typeof history.state.scrollY === 'number' ? history.state.scrollY : 0;
    main.scrollTop = y;
});
main.addEventListener('scroll', () => {
    const state = history.state;
    if (!state || !state.tw) return;
    history.replaceState({ ...state, scrollY: main.scrollTop }, '');
}, { passive: true });
document.addEventListener('tw:auth-change', () => paint());

async function boot() {
    renderSkeleton();
    const allowed = gateOpen();
    try {
        await ensureSample(allowed);
    } catch (err) {
        sampleModule = null;
    }
    if (!history.state || !history.state.tw) {
        const route = currentRoute();
        history.replaceState({
            tw: true,
            scrollY: 0,
            sheet: Boolean(route.matchId),
            pushed: false,
            navDepth: 0,
        }, '', location.href);
    }
    paint();
    onTouch();
}

boot();
