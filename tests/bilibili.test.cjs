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
    assert.equal(label.style.marginLeft, '20px');
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
