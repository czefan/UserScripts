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
const douyin = read('douyin/douyin-downloader.user.js');

function extractVideo(fiber, src = 'blob:test') {
    const v = { paused: false, duration: 10, __reactFiberTest: fiber, currentSrc: src, src, parentElement: null };
    const c = { document: { querySelectorAll: () => [v], body: {} }, window: { innerHeight: 1000 } };
    vm.createContext(c);
    vm.runInContext(between(douyin, '    const MAIN_EXTRACT_SNIPPET', '    function injectMainWorldBridge') +
        ';globalThis.result = eval(MAIN_EXTRACT_SNIPPET);', c);
    return c.result;
}

test('Douyin keeps child-fiber URL when parent supplies title and author', () => {
    const fiber = {
        memoizedProps: { xgplayerConfig: { url: 'https://example.com/child.mp4' } },
        return: { memoizedProps: { awemeInfo: { desc: 'title', author: { nickname: 'author' } } }, return: null }
    };
    const result = extractVideo(fiber);
    assert.equal(result.url, 'https://example.com/child.mp4');
    assert.equal(result.title, 'title');
    assert.equal(result.author, 'author');
});

test('Douyin supports direct-source fallback and rejects blob-only videos', () => {
    assert.equal(extractVideo(null, 'https://example.com/direct.mp4').url, 'https://example.com/direct.mp4');
    assert.equal(extractVideo(null), null);
});

function downloadFixture(download) {
    let click, options;
    const links = [], notices = [];
    const c = {
        currentMedia: { url: 'https://example.com/first.mp4', filename: 'first.mp4' }, isDownloading: false,
        btnDownload: { disabled: false, addEventListener: (type, fn) => { click = fn; } },
        GM_download: opt => { options = opt; if (download) download(opt); },
        document: { createElement: () => ({ click() { links.push(this.href); }, remove() {} }), body: { appendChild() {} } },
        flashSuccess: () => { c.successes++; }, successes: 0, ICONS: { download: '' }, alert: msg => notices.push(msg)
    };
    vm.createContext(c);
    vm.runInContext(between(douyin, "            btnDownload.addEventListener('click'", "            shadow.getElementById('btn-close')"), c);
    return { c, click: () => click(), options: () => options, links, notices };
}

test('Douyin download timeout releases button and allows retry', () => {
    const f = downloadFixture();
    f.click(); assert.equal(f.c.btnDownload.disabled, true);
    f.options().ontimeout();
    assert.equal(f.c.isDownloading, false);
    assert.equal(f.c.btnDownload.disabled, false);
    f.click(); assert.equal(f.c.isDownloading, true);
});

test('Douyin error fallback uses clicked video, does not claim download success', () => {
    const f = downloadFixture(); f.click();
    f.c.currentMedia = { url: 'https://example.com/next.mp4', filename: 'next.mp4' };
    f.options().onerror();
    assert.deepEqual(f.links, ['https://example.com/first.mp4']);
    assert.equal(f.c.successes, 0);
    assert.equal(f.c.isDownloading, false);
});

test('Douyin ignores duplicate terminal callback from an earlier download', () => {
    const f = downloadFixture(); f.click();
    const old = f.options();
    old.ontimeout();
    f.click();
    old.onerror();
    assert.equal(f.c.isDownloading, true);
    assert.equal(f.c.btnDownload.disabled, true);
    assert.equal(f.links.length, 0);
    f.options().onload();
    assert.equal(f.c.isDownloading, false);
    assert.equal(f.c.successes, 1);
});

test('Douyin synchronous download errors release state and offer fallback', () => {
    const f = downloadFixture(() => { throw new Error('disabled'); });
    f.click();
    assert.equal(f.c.isDownloading, false);
    assert.equal(f.links.length, 1);
});
