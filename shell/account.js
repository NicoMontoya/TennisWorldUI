// DOM for /me and /picks. User strings are assigned with textContent only.

import { PICK_SEGMENTS, PICKS_COPY } from './picks.js';
import { GATE_COPY, guestLine } from './viewModel.js';

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null && text !== '') node.textContent = text;
    return node;
}

function field(id, label, type, value, autocomplete, maxLength) {
    const wrap = el('div', 's1-field');
    const lab = el('label', 's1-label', label);
    lab.htmlFor = id;
    const input = document.createElement('input');
    input.id = id;
    input.className = 's1-input';
    input.type = type;
    input.value = value || '';
    input.autocomplete = autocomplete;
    if (maxLength) input.maxLength = maxLength;
    wrap.appendChild(lab);
    wrap.appendChild(input);
    return { wrap, input };
}

function errorLine(message) {
    if (!message) return null;
    const node = el('p', 's1-error', message);
    node.setAttribute('role', 'alert');
    return node;
}

function countdownLine(seconds) {
    if (!seconds) return null;
    const node = el('p', 's1-countdown', `Try again in ${seconds}s`);
    node.id = 's1Cooldown';
    return node;
}

function submitButton(label, model) {
    const button = el('button', 's1-pick s1-hit s1-auth-submit', label);
    button.type = 'submit';
    if (model.submitting) {
        const spin = el('span', 's1-spinner');
        spin.setAttribute('aria-hidden', 'true');
        button.appendChild(spin);
        button.setAttribute('aria-busy', 'true');
    }
    button.disabled = Boolean(model.submitting) || Number(model.cooldown) > 0;
    return button;
}

function bindInput(input, fn) {
    if (!fn) return;
    input.addEventListener('input', () => fn(input.value));
}

export function renderMe(host, model, actions = {}) {
    const state = model || {};
    host.appendChild(el('h1', 's1-title', GATE_COPY.meTitle));
    if (state.sampleNote) host.appendChild(el('p', 's1-kicker', state.sampleNote));

    if (state.pending && state.status === 'member') {
        const pending = el('div', 's1-account');
        pending.setAttribute('aria-busy', 'true');
        if (state.record) pending.appendChild(el('p', 's1-note', state.record));
        host.appendChild(pending);
        return;
    }

    if (state.status === 'guest') renderGuest(host, state, actions);
    else if (state.status === 'member' && !state.pending) renderMember(host, state, actions);
    else renderSignedOut(host, state, actions);
}

function renderSignedOut(host, model, actions) {
    const card = el('section', 's1-account');
    const tabs = el('div', 's1-auth-tabs');
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Account');
    const inviteTab = tabButton(GATE_COPY.tabInvite, model.tab !== 'signin', () => actions.onTab && actions.onTab('invite'));
    const signTab = tabButton(GATE_COPY.tabSignIn, model.tab === 'signin', () => actions.onTab && actions.onTab('signin'));
    tabs.appendChild(inviteTab);
    tabs.appendChild(signTab);
    card.appendChild(tabs);

    if (model.tab === 'signin') card.appendChild(signInForm(model, actions));
    else card.appendChild(inviteForm(model, actions));
    host.appendChild(card);
}

function tabButton(label, selected, onClick) {
    const button = el('button', 's1-auth-tab s1-hit', label);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) button.className += ' is-active';
    button.addEventListener('click', onClick);
    return button;
}

function inviteForm(model, actions) {
    const form = el('form', 's1-auth-form');
    form.noValidate = true;
    const fields = model.fields || {};
    const code = field('s1InviteCode', 'Invite code', 'text', fields.inviteCode, 'off', 80);
    const first = field('s1FirstName', 'First name', 'text', fields.firstName, 'given-name', 80);
    const email = field('s1Email', 'Email', 'email', fields.email, 'email', 254);
    const password = field('s1Password', 'Password', 'password', fields.password, 'new-password', 200);
    [code, first, email, password].forEach((item) => form.appendChild(item.wrap));
    bindInput(code.input, (value) => actions.onField && actions.onField('inviteCode', value));
    bindInput(first.input, (value) => actions.onField && actions.onField('firstName', value));
    bindInput(email.input, (value) => actions.onField && actions.onField('email', value));
    bindInput(password.input, (value) => actions.onField && actions.onField('password', value));
    const err = errorLine(model.error);
    if (err) form.appendChild(err);
    const count = countdownLine(model.cooldown);
    if (count) form.appendChild(count);
    form.appendChild(submitButton(GATE_COPY.join, model));
    form.appendChild(el('p', 's1-fine', GATE_COPY.inviteOnly));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!actions.onJoin || model.submitting || model.cooldown > 0) return;
        actions.onJoin({
            inviteCode: code.input.value,
            firstName: first.input.value,
            email: email.input.value,
            password: password.input.value,
        });
    });
    return form;
}

function signInForm(model, actions) {
    const form = el('form', 's1-auth-form');
    form.noValidate = true;
    const fields = model.fields || {};
    const email = field('s1SignEmail', 'Email', 'email', fields.email, 'username', 254);
    const password = field('s1SignPassword', 'Password', 'password', fields.password, 'current-password', 200);
    form.appendChild(email.wrap);
    form.appendChild(password.wrap);
    bindInput(email.input, (value) => actions.onField && actions.onField('email', value));
    bindInput(password.input, (value) => actions.onField && actions.onField('password', value));
    const err = errorLine(model.error);
    if (err) form.appendChild(err);
    const count = countdownLine(model.cooldown);
    if (count) form.appendChild(count);
    form.appendChild(submitButton(GATE_COPY.tabSignIn, model));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!actions.onLogin || model.submitting || model.cooldown > 0) return;
        actions.onLogin({
            email: email.input.value,
            password: password.input.value,
        });
    });
    return form;
}

function renderGuest(host, model, actions) {
    const card = el('section', 's1-account');
    card.appendChild(el('p', 's1-note', guestLine(model.displayName)));
    const form = el('form', 's1-auth-form');
    form.noValidate = true;
    const fields = model.fields || {};
    const code = field('s1RedeemCode', 'Invite code', 'text', fields.redeemCode, 'off', 80);
    form.appendChild(code.wrap);
    bindInput(code.input, (value) => actions.onField && actions.onField('redeemCode', value));
    const err = errorLine(model.error);
    if (err) form.appendChild(err);
    const count = countdownLine(model.cooldown);
    if (count) form.appendChild(count);
    form.appendChild(submitButton(GATE_COPY.redeem, model));
    form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (!actions.onRedeem || model.submitting || model.cooldown > 0) return;
        actions.onRedeem({ inviteCode: code.input.value });
    });
    card.appendChild(form);
    host.appendChild(card);
}

function renderMember(host, model, actions) {
    const card = el('section', 's1-account');
    if (model.editing) {
        const form = el('form', 's1-auth-form');
        form.noValidate = true;
        const draft = model.draft != null ? model.draft : model.displayName;
        const name = field('s1DisplayNameInput', 'Display name', 'text', draft, 'nickname', 24);
        form.appendChild(name.wrap);
        const counter = el('p', 's1-counter', `${String(name.input.value).length}/24`);
        counter.id = 's1NameCount';
        form.appendChild(counter);
        name.input.addEventListener('input', () => {
            counter.textContent = `${name.input.value.length}/24`;
            if (actions.onDraft) actions.onDraft(name.input.value);
        });
        const err = errorLine(model.error);
        if (err) form.appendChild(err);
        const row = el('div', 's1-auth-row');
        const save = submitButton('Save', model);
        const cancel = el('button', 's1-secondary s1-hit', 'Cancel');
        cancel.type = 'button';
        cancel.addEventListener('click', () => actions.onCancelEdit && actions.onCancelEdit());
        row.appendChild(save);
        row.appendChild(cancel);
        form.appendChild(row);
        form.addEventListener('submit', (event) => {
            event.preventDefault();
            if (!actions.onSaveName || model.submitting) return;
            actions.onSaveName(name.input.value);
        });
        card.appendChild(form);
    } else {
        const row = el('div', 's1-name-row');
        const name = el('p', 's1-identity', model.displayName || '');
        name.id = 's1DisplayName';
        const edit = el('button', 's1-secondary s1-hit', GATE_COPY.edit);
        edit.type = 'button';
        edit.addEventListener('click', () => actions.onEdit && actions.onEdit());
        row.appendChild(name);
        row.appendChild(edit);
        card.appendChild(row);
    }

    card.appendChild(el('h2', 's1-sub', GATE_COPY.followed));
    const follows = Array.isArray(model.follows) ? model.follows : [];
    if (!follows.length) card.appendChild(el('p', 's1-empty', 'No followed players.'));
    follows.forEach((favorite) => {
        card.appendChild(el('p', 's1-follow', favorite.name || ''));
    });
    if (model.record) card.appendChild(el('p', 's1-note', model.record));
    const signOut = el('button', 's1-secondary s1-hit', GATE_COPY.signOut);
    signOut.type = 'button';
    signOut.disabled = Boolean(model.submitting);
    signOut.addEventListener('click', () => actions.onSignOut && actions.onSignOut());
    card.appendChild(signOut);
    host.appendChild(card);
}

function setAttrs(node, attrs) {
    Object.keys(attrs).forEach((name) => node.setAttribute(name, attrs[name]));
}

function playerAria(player, locked) {
    if (locked) return `Locked, ${player.name}`;
    if (player.picked) return `Picked ${player.name}`;
    return `Pick ${player.name}`;
}

function renderSegments(segment) {
    const tabs = el('div', 's1-segment');
    setAttrs(tabs, { role: 'tablist', 'aria-label': 'Picks' });
    PICK_SEGMENTS.forEach((item) => {
        const selected = item.id === segment;
        const button = el('button', selected ? 's1-segment-btn s1-hit is-active' : 's1-segment-btn s1-hit', item.label);
        button.type = 'button';
        setAttrs(button, {
            role: 'tab',
            'aria-selected': selected ? 'true' : 'false',
            'data-action': 'board',
            'data-board': item.id,
        });
        tabs.appendChild(button);
    });
    return tabs;
}

function renderOpen(host, model) {
    if (model.loading) return;
    if (model.loadError) {
        host.appendChild(el('p', 's1-error', model.loadError));
        return;
    }
    if (!model.groups || !model.groups.length) {
        host.appendChild(el('p', 's1-empty', model.emptyOpen || PICKS_COPY.emptyOpen));
        return;
    }
    (model.groups || []).forEach((group) => {
        host.appendChild(el('h2', 's1-group-title', group.name || ''));
        (group.matches || []).forEach((match) => host.appendChild(renderMatchCard(match)));
    });
}

function renderMatchCard(match) {
    const card = el('article', match.locked ? 's1-pick-card is-locked' : 's1-pick-card');
    setAttrs(card, { 'data-match-key': match.matchKey });
    const halves = el('div', 's1-pick-halves');
    (match.players || []).forEach((player) => halves.appendChild(renderHalf(match, player)));
    card.appendChild(halves);
    if (match.subline) card.appendChild(el('p', 's1-pick-meta', match.subline));
    if (match.lockText) card.appendChild(el('p', 's1-pick-lock', match.lockText));
    if (match.error) {
        const error = el('p', 's1-error', match.error);
        error.setAttribute('role', 'alert');
        card.appendChild(error);
    }
    return card;
}

function renderHalf(match, player) {
    const picked = Boolean(player.picked);
    const button = el('button', picked ? 's1-pick-half s1-hit is-picked' : 's1-pick-half s1-hit');
    button.type = 'button';
    button.disabled = Boolean(match.locked);
    setAttrs(button, {
        'data-action': 'pick',
        'data-match-key': match.matchKey,
        'data-player-key': player.key,
        'aria-label': playerAria(player, match.locked),
        'aria-pressed': picked ? 'true' : 'false',
    });
    if (match.locked) button.setAttribute('aria-disabled', 'true');
    button.appendChild(el('span', 's1-pick-name', player.name || ''));
    if (picked) {
        const mark = el('span', 's1-pick-mark', PICKS_COPY.check);
        mark.setAttribute('aria-hidden', 'true');
        button.appendChild(mark);
    }
    return button;
}

function renderMine(host, model) {
    const mine = model.mine || {};
    if (model.loading) return;
    if (model.loadError) {
        host.appendChild(el('p', 's1-error', model.loadError));
        return;
    }
    if (mine.showRecord) {
        const head = el('div', 's1-record-head');
        head.appendChild(el('p', 's1-record-score', mine.record || ''));
        head.appendChild(el('p', 's1-record-points', mine.points || ''));
        host.appendChild(head);
    }
    if (!mine.rows || !mine.rows.length) {
        host.appendChild(el('p', 's1-empty', mine.empty || PICKS_COPY.emptyMine));
        return;
    }
    const list = el('ul', 's1-mine-list');
    (mine.rows || []).forEach((row) => {
        const item = el('li', `s1-mine-row is-${row.result || 'pending'}`);
        const main = el('div', 's1-mine-main');
        main.appendChild(el('p', 's1-mine-names', row.names || ''));
        if (row.picked) main.appendChild(el('p', 's1-mine-picked', row.picked));
        if (row.meta) main.appendChild(el('p', 's1-note', row.meta));
        item.appendChild(main);
        const status = el('p', 's1-mine-status', row.label || '');
        if (row.mark) {
            const mark = el('span', 's1-mine-mark', ` ${row.mark}`);
            mark.setAttribute('aria-hidden', 'true');
            status.appendChild(mark);
        }
        if (row.extra) status.appendChild(el('span', 's1-mine-extra', ` ${row.extra}`));
        item.appendChild(status);
        list.appendChild(item);
    });
    host.appendChild(list);
}

function fillBoardRow(node, row) {
    node.appendChild(el('span', 's1-board-rank', String(row.rank)));
    node.appendChild(el('span', 's1-board-name', row.displayName || ''));
    const score = el('span', 's1-board-score');
    score.appendChild(el('span', 's1-board-points', row.pointsLabel || `${row.points} pts`));
    if (row.accuracyLabel) score.appendChild(el('span', 's1-board-acc', row.accuracyLabel));
    node.appendChild(score);
}

function renderBoard(host, model) {
    const board = model.board || {};
    if (model.loading) return;
    if (model.loadError) {
        host.appendChild(el('p', 's1-error', model.loadError));
        return;
    }
    if (!board.rows || !board.rows.length) {
        host.appendChild(el('p', 's1-empty', board.empty || PICKS_COPY.emptyBoard));
        return;
    }
    const list = el('ol', 's1-board-list');
    let mine = null;
    (board.rows || []).forEach((row) => {
        const item = el('li', row.mine ? 's1-board-row is-mine' : 's1-board-row');
        if (row.mine) {
            item.setAttribute('data-mine-row', '1');
            mine = row;
        }
        fillBoardRow(item, row);
        list.appendChild(item);
    });
    host.appendChild(list);
    if (mine) {
        const pin = el('div', 's1-board-pin');
        pin.hidden = true;
        setAttrs(pin, { 'data-pin': '1', 'aria-hidden': 'true' });
        fillBoardRow(pin, mine);
        host.appendChild(pin);
    }
}

export function syncMinePin(root, frame) {
    if (!root || typeof root.querySelector !== 'function') return;
    const pin = root.querySelector('[data-pin]');
    if (!pin) return;
    const row = root.querySelector('[data-mine-row]');
    if (!row || !frame || typeof row.getBoundingClientRect !== 'function') {
        pin.hidden = true;
        return;
    }
    const rect = row.getBoundingClientRect();
    const inset = Number(frame.insetBottom) || 0;
    const off = rect.top < frame.top || rect.bottom > frame.bottom - inset;
    pin.hidden = !(rect.height > 0 && off);
}

export function renderPicks(host, model) {
    const state = model || {};
    host.appendChild(el('h1', 's1-title', GATE_COPY.picksTitle));
    if (state.sampleNote) host.appendChild(el('p', 's1-kicker', state.sampleNote));
    if (state.status === 'member') {
        host.appendChild(renderSegments(state.segment || 'open'));
        if ((state.segment || 'open') === 'mine') renderMine(host, state);
        else if (state.segment === 'leaders') renderBoard(host, state);
        else renderOpen(host, state);
        return;
    }
    const card = el('section', 's1-account s1-teaser');
    card.appendChild(el('p', 's1-teaser', GATE_COPY.teaser));
    const link = el('a', 's1-pick s1-hit', GATE_COPY.haveInvite);
    link.href = '/me';
    link.setAttribute('data-nav', 'view');
    card.appendChild(link);
    host.appendChild(card);
}
