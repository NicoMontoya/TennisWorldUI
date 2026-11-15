// Navigation decisions for the Sprint 1 shell.
// Push a view, preserve scroll when opening the match sheet, and let Back
// return to the stored scroll. Filters replace the current history entry.

export function planClick(current, target) {
    if (!target || !target.kind) throw new Error('unknown nav target');
    if (target.kind === 'sheet') {
        return {
            method: 'push',
            preserveScroll: true,
            sheet: true,
            pushed: true,
            route: { ...current, matchId: target.matchId },
        };
    }
    if (target.kind === 'view') {
        return {
            method: 'push',
            preserveScroll: false,
            sheet: false,
            pushed: false,
            route: { ...target.route, matchId: null },
        };
    }
    if (target.kind === 'filter') {
        return {
            method: 'replace',
            preserveScroll: true,
            sheet: Boolean(current.matchId),
            pushed: Boolean(current.pushed),
            route: { ...current, ...target.patch },
        };
    }
    if (target.kind === 'close-sheet') {
        return {
            method: target.pushed ? 'back' : 'replace',
            preserveScroll: true,
            sheet: false,
            pushed: false,
            route: { ...current, matchId: null },
        };
    }
    if (target.kind === 'back') {
        return {
            method: 'back',
            preserveScroll: true,
            sheet: false,
            pushed: false,
            route: current,
        };
    }
    throw new Error('unknown nav target');
}

export function applyNav(api, plan) {
    const scrollBefore = api.getScroll();
    const previous = api.getState() || {};
    const state = {
        tw: true,
        scrollY: plan.preserveScroll ? scrollBefore : 0,
        sheet: Boolean(plan.sheet),
        pushed: Boolean(plan.pushed),
        navDepth: plan.method === 'push' ? Number(previous.navDepth || 0) + 1 : Number(previous.navDepth || 0),
    };
    if (plan.method === 'push') {
        api.commitScroll(scrollBefore);
        api.pushState(state, plan.href);
        if (!plan.preserveScroll) api.setScroll(0);
        return;
    }
    if (plan.method === 'replace') {
        api.replaceState(state, plan.href);
        if (!plan.preserveScroll) api.setScroll(0);
        return;
    }
    if (plan.method === 'back') api.back();
}
