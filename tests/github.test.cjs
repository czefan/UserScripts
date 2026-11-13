'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const between = (source, start, end) => {
    const a = source.indexOf(start), b = source.indexOf(end, a);
    assert.ok(a >= 0 && b > a, `Missing source boundary: ${start}`);
    return source.slice(a, b);
};
const github = read('github/github-username-checker.user.js');

const ui = () => ({ style: {}, innerText: '', value: '', disabled: false });
function githubFixture(fetch) {
    const saved = new Map();
    const dialog = new EventTarget();
    dialog.open = true;
    const input = { isConnected: true, value: 'original-user', closest: selector => selector === 'dialog' ? dialog : ac };
    const ac = {
        getAttribute: key => ({ src: '/account/rename_check?suggest_usernames=true', csrf: 'test-token' })[key] || null,
        querySelector: () => null
    };
    const c = {
        fetch, URL, FormData, AbortController, setTimeout, clearTimeout,
        CHECK_TIMEOUT: 20, CHECK_INTERVAL: 0, RATE_LIMIT_COOL: 1,
        location: new URL('https://github.com/settings/admin'),
        document: { querySelector: () => input },
        localStorage: {
            getItem: k => saved.get(k) ?? null,
            setItem: (k, v) => saved.set(k, String(v)), removeItem: k => saved.delete(k)
        },
        SK: { LIST: 'list' }, USERNAME_RE: /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i,
        isRunning: false, activeRun: null, currentIndex: 0, targetList: [], confirmedList: [],
        iptList: { ...ui(), value: 'aaa,bbb' }, btnGo: ui(), lblTotal: ui(), txtWin: ui(), lblWc: ui(),
        setStatus: text => { c.status = text; }, logToPanel() {}, playSound() {},
        updateProgress: (i, total) => { c.progress = [i, total]; }, resetUI: () => { c.iptList.disabled = false; },
        confirm: () => true, alert() {}
    };
    vm.createContext(c);
    vm.runInContext(
        between(github, '    const sleep =', '    // ==================== 安全锁') +
        between(github, '    function syncListState()', '    // ==================== 面板挂载') +
        between(github, '    async function checkUsername(', '    // ==================== 开始/停止按钮'), c);
    return { c, saved, input, ac, dialog };
}

test('GitHub cache preserves order and normalizes case', () => {
    const { c } = githubFixture();
    assert.notEqual(c.getListKey(['aaa', 'bbb']), c.getListKey(['bbb', 'aaa']));
    assert.equal(vm.runInContext("parseList('AAA, aaa，BBB').join(',')", c), 'aaa,bbb');
    assert.notEqual(c.getListKey(['aa', 'bb']), c.getListKey(['bb', 'aa']));
});

test('GitHub only confirms successful checks, retains the real rename input', async () => {
    let count = 0;
    const { c, input } = githubFixture(async (url, options) => {
        assert.equal(url.pathname, '/account/rename_check');
        assert.equal(url.searchParams.get('suggest_usernames'), 'true');
        assert.equal(options.body.get('authenticity_token'), 'test-token');
        assert.equal(options.body.get('value'), count === 0 ? 'aaa' : 'bbb');
        assert.equal(options.redirect, 'error');
        return ++count === 1 ? { ok: true } : { ok: false, status: 422 };
    });
    await c.startChecking();
    assert.equal(c.confirmedList.join(','), 'aaa');
    assert.equal(c.currentIndex, 2);
    assert.equal(input.value, 'original-user');
    assert.equal(c.isRunning, false);
});

test('GitHub timeout pauses without false winners or skipping the pending name', async () => {
    const { c } = githubFixture((url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    await c.startChecking();
    assert.equal(c.confirmedList.length, 0);
    assert.equal(c.currentIndex, 0);
    assert.equal(c.isRunning, false);
    assert.match(c.status, /未确认/);
});

test('GitHub authentication/server errors remain unconfirmed', async () => {
    for (const status of [403, 500, 502]) {
        const { c } = githubFixture(async () => ({ ok: false, status }));
        await c.startChecking();
        assert.equal(c.currentIndex, 0);
        assert.equal(c.confirmedList.length, 0);
    }
});

test('GitHub retries a rate-limited name before advancing', async () => {
    const names = [];
    const { c } = githubFixture(async (url, options) => {
        names.push(options.body.get('value'));
        return names.length === 1 ? { ok: false, status: 429 } : { ok: true };
    });
    await c.startChecking();
    assert.deepEqual(names, ['aaa', 'aaa', 'bbb']);
    assert.equal(c.confirmedList.join(','), 'aaa,bbb');
});

test('GitHub reset/restart ignores late success from the previous run', async () => {
    let resolveOld, calls = 0;
    const { c, saved } = githubFixture(async () => {
        if (++calls === 1) return new Promise(resolve => { resolveOld = resolve; });
        return { ok: true };
    });
    const old = c.startChecking();
    c.btnRst = new EventTarget();
    vm.runInContext(between(github, '    btnRst.addEventListener', '    // ==================== 初始化'), c);
    c.btnRst.dispatchEvent(new Event('click'));
    assert.equal(saved.has('gh_check_index_' + c.getListKey(['aaa', 'bbb'])), false);
    c.iptList.value = 'ccc';
    const next = c.startChecking();
    resolveOld({ ok: true });
    await Promise.all([old, next]);
    assert.equal(c.confirmedList.join(','), 'ccc');
    assert.equal(c.targetList.join(','), 'ccc');
    assert.equal(c.currentIndex, 1);
    assert.equal(c.isRunning, false);
});

test('GitHub dialog close cancels checks even when input remains connected', async () => {
    let resolveRequest;
    const { c, input, dialog } = githubFixture(() => new Promise(resolve => { resolveRequest = resolve; }));
    const pending = c.startChecking();
    dialog.open = false;
    dialog.dispatchEvent(new Event('close'));
    assert.equal(input.isConnected, true);
    assert.equal(c.isRunning, false);
    resolveRequest({ ok: true });
    await pending;
    assert.equal(c.confirmedList.length, 0);
    assert.equal(c.currentIndex, 0);
});

test('GitHub ignores response after input detaches without a close event', async () => {
    let finish;
    const { c, input } = githubFixture(() => new Promise(resolve => { finish = resolve; }));
    const pending = c.startChecking();
    input.isConnected = false;
    finish({ ok: true });
    await pending;
    assert.equal(c.confirmedList.length, 0);
    assert.equal(c.isRunning, false);
});

test('GitHub will not start checks in a closed dialog', async () => {
    const { c, dialog } = githubFixture(() => assert.fail('Unexpected request'));
    dialog.open = false;
    await c.startChecking();
    assert.equal(c.isRunning, false);
});

test('GitHub rejects unexpected endpoints before making requests', async () => {
    const { c, ac } = githubFixture(() => assert.fail('Unexpected request'));
    ac.getAttribute = key => key === 'src' ? '/account/rename' : 'test-token';
    await c.startChecking();
    assert.equal(c.currentIndex, 0);
    assert.equal(c.confirmedList.length, 0);
});
