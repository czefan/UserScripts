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
const bilibili = read('bilibili/bilibili-ip-display.user.js');

function biliFixture() {
    const observers = [];
    class Observer {
        constructor(callback) { this.callback = callback; observers.push(this); }
        observe(target) { this.target = target; }
        disconnect() { this.target = null; }
    }
    const c = {
        document: { createElement: () => ({ style: {}, textContent: '', remove() { this.removed = true; if (this.anchor) this.anchor.nextSibling = null; } }) },
        Node: { ELEMENT_NODE: 1 }, MutationObserver: Observer
    };
    vm.createContext(c);
    vm.runInContext(between(bilibili, '  const labels =', '  // 截获新组件'), c);
    const dateNode = () => ({ nodeType: 1, nextSibling: null, after(label) { this.nextSibling = label; label.anchor = this; } });
    return { c, observers, dateNode };
}

test('Bilibili delayed data can render label, update it, and remove stale location', () => {
    const { c, observers, dateNode } = biliFixture();
    const date = dateNode();
    const shadow = { host: {}, getElementById: () => date, querySelectorAll: () => [] };
    c.watchShadow(shadow);
    assert.equal(date.nextSibling, null);
    shadow.host.data = { reply_control: { location: 'IP属地：北京' } };
    observers[0].callback([]);
    const label = date.nextSibling;
    assert.equal(label.textContent, 'IP属地：北京');
    assert.equal(label.style.marginLeft, undefined);
    assert.equal(label.style.marginRight, undefined);
    shadow.host.data.reply_control.location = 'IP属地：江苏';
    observers[0].callback([]);
    assert.equal(date.nextSibling, label);
    assert.equal(label.textContent, 'IP属地：江苏');
    shadow.host.data.reply_control.location = '';
    observers[0].callback([]);
    assert.equal(date.nextSibling, null);
});

test('Bilibili reconnects Vue observer after comment container replacement', () => {
    let container = { name: 'first' };
    const observations = [];
    const c = {
        document: { getElementById: () => container, querySelector: () => null },
        commentObserver: { disconnect() {}, observe: node => observations.push(node) },
        checkVueNodes() {}, scanShadowHosts() {}
    };
    vm.createContext(c);
    vm.runInContext('let commentApp = null;\n' + between(bilibili, '  function bindCommentApp()', '  const globalObserver'), c);
    c.bindCommentApp(); container = { name: 'second' }; c.bindCommentApp(); c.bindCommentApp();
    assert.deepEqual(observations.map(x => x.name), ['first', 'second']);
});

test('Bilibili removes the old label when a component replaces its time node', () => {
    const { c, observers, dateNode } = biliFixture();
    let date = dateNode();
    const shadow = {
        host: { data: { reply_control: { location: 'IP属地：北京' } } },
        getElementById: () => date, querySelectorAll: () => []
    };
    c.watchShadow(shadow);
    const oldLabel = date.nextSibling;
    date = dateNode();
    shadow.host.data.reply_control.location = 'IP属地：江苏';
    observers[0].callback([]);
    assert.equal(oldLabel.removed, true);
    assert.equal(date.nextSibling.textContent, 'IP属地：江苏');
    const latestLabel = date.nextSibling;
    date = null;
    observers[0].callback([]);
    assert.equal(latestLabel.removed, true);
});


test('Bilibili collapses duplicate and nested added nodes into one scan root', () => {
    const { c } = biliFixture();
    const parent = { nodeType: 1, parentNode: null };
    const child = { nodeType: 1, parentNode: parent };
    const roots = c.addedRoots([
        { addedNodes: [parent, child] }, { addedNodes: [child, parent] }
    ]);
    assert.equal(roots.length, 1);
    assert.equal(roots[0], parent);
});

test('Bilibili skips document queries for 100 unrelated updates with a live container', () => {
    const { c, observers } = biliFixture();
    let container = { isConnected: true, nodeType: 1, matches: () => false, querySelectorAll: () => [] };
    let queries = 0;
    c.document.getElementById = () => { queries++; return container; };
    c.document.querySelector = () => { queries++; return null; };
    vm.runInContext(between(bilibili, '  let commentApp =', '  const globalObserver'), c);
    c.bindCommentApp();
    queries = 0;
    for (let i = 0; i < 100; i++) c.onDocumentMutations([]);
    assert.equal(queries, 0);
    container.isConnected = false;
    container = { ...container, isConnected: true };
    c.onDocumentMutations([]);
    assert.equal(queries, 1);
    assert.equal(observers[0].target, container);
});

test('Bilibili scans a new Vue subtree once per batch without rescanning its parent', () => {
    const { c, observers } = biliFixture();
    vm.runInContext(between(bilibili, '  let commentApp =', '  const globalObserver'), c);
    let scans = 0;
    const root = { nodeType: 1, matches: () => false, querySelectorAll: () => { scans++; return []; } };
    const target = { nodeType: 1, closest: () => null, querySelectorAll: () => assert.fail('Parent rescanned') };
    observers[0].callback(Array.from({ length: 100 }, () => ({ target, addedNodes: [root] })));
    assert.equal(scans, 1);
});

test('Bilibili updates a changed Vue time node without scanning siblings', () => {
    const { c, observers, dateNode } = biliFixture();
    const date = dateNode();
    date.matches = () => true;
    date.closest = () => date;
    date.__vueParentComponent = { props: { reply: { reply_control: { location: 'IP属地：北京' } } } };
    vm.runInContext(between(bilibili, '  let commentApp =', '  const globalObserver'), c);
    observers[0].callback([{ target: date, addedNodes: [] }]);
    assert.equal(date.nextSibling.textContent, 'IP属地：北京');
    date.__vueParentComponent.props.reply.reply_control.location = 'IP属地：江苏';
    observers[0].callback([{ target: { nodeType: 3, parentElement: date }, addedNodes: [] }]);
    assert.equal(date.nextSibling.textContent, 'IP属地：江苏');
});

test('Bilibili still discovers pre-existing nested comment shadow roots', () => {
    const { c, observers, dateNode } = biliFixture();
    const date = dateNode();
    const inner = {
        host: { data: { reply_control: { location: 'IP属地：北京' } } },
        getElementById: () => date, querySelectorAll: () => assert.fail('Leaf scanned')
    };
    const host = { tagName: 'BILI-COMMENT-ACTION-BUTTONS-RENDERER', shadowRoot: inner };
    const outer = { host: {}, getElementById: () => null, firstElementChild: host, querySelectorAll: () => [host] };
    c.watchShadow(outer);
    assert.equal(observers.length, 2);
    assert.equal(date.nextSibling.textContent, 'IP属地：北京');
});


test('Bilibili discovers a newly inserted container after unrelated updates', () => {
    const { c, observers } = biliFixture();
    let queries = 0;
    const container = { nodeType: 1, isConnected: true, matches: () => false, querySelectorAll: () => [] };
    c.document.getElementById = () => { queries++; return container; };
    vm.runInContext(between(bilibili, '  let commentApp =', '  const globalObserver'), c);
    const unrelated = { nodeType: 1, matches: () => false, querySelector: () => null };
    c.onDocumentMutations([{ addedNodes: [unrelated] }]);
    assert.equal(queries, 0);
    const wrapper = { nodeType: 1, matches: () => false, querySelector: () => container };
    c.onDocumentMutations([{ addedNodes: [wrapper] }]);
    assert.equal(queries, 1);
    assert.equal(observers[0].target, container);
});
