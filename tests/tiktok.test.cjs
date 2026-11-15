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

const tiktok = read('tiktok/tiktok-enhanced.user.js');

function createTikTokContext(overrides = {}) {
    const storage = new Map();
    const timers = [];
    const clearedTimers = [];
    const windowListeners = new Map();

    class FakeEvent {
        constructor(type, init = {}) {
            this.type = type;
            Object.assign(this, init);
        }
    }

    const context = {
        window: {
            top: null,
            innerHeight: 1000,
            addEventListener(type, fn) {
                if (!windowListeners.has(type)) windowListeners.set(type, []);
                windowListeners.get(type).push(fn);
            }
        },
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => []
        },
        localStorage: {
            getItem: k => (storage.has(k) ? storage.get(k) : null),
            setItem: (k, v) => storage.set(k, String(v))
        },
        MutationObserver: class {
            constructor(cb) { this.cb = cb; }
            observe() {}
            disconnect() {}
        },
        Event: FakeEvent,
        MouseEvent: FakeEvent,
        PointerEvent: FakeEvent,
        setTimeout: (fn, ms) => {
            const id = timers.length + 1;
            timers.push({ id, fn, ms });
            return id;
        },
        clearTimeout: id => clearedTimers.push(id),
        WeakSet,
        ...overrides
    };
    if (!context.window.top) context.window.top = context.window;

    vm.createContext(context);
    vm.runInContext(
        between(tiktok, '    // ==================== 1. 自动折叠侧边栏 ====================', '    initAutoCollapseSidebar();'),
        context
    );
    return { context, storage, timers, clearedTimers, windowListeners };
}

test('TikTok sidebar auto-collapse clicks toggle once and disconnects', () => {
    const observers = [];
    let clicks = 0;
    let btn = null;
    const { context, timers } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: sel => (sel.includes('DivToggleTrigger') ? btn : null),
            querySelectorAll: () => []
        },
        MutationObserver: class {
            constructor(cb) { this.cb = cb; this.disconnected = false; observers.push(this); }
            observe(target, opts) { this.target = target; this.opts = opts; }
            disconnect() { this.disconnected = true; }
        }
    });

    context.initAutoCollapseSidebar();
    assert.equal(observers.length, 1);
    observers[0].cb();
    assert.equal(clicks, 0);
    assert.equal(observers[0].disconnected, false);

    btn = { click() { clicks++; } };
    observers[0].cb();
    assert.equal(clicks, 1);
    assert.equal(observers[0].disconnected, true);

    timers[0].fn();
    assert.equal(observers[0].disconnected, true);
});

test('TikTok volume shortcuts recognize Shift+/Shift- and ignore inputs or wrong modifiers', () => {
    const { context } = createTikTokContext();

    assert.equal(context.getVolumeDirection({ shiftKey: true, code: 'Equal', key: '+' }), 1);
    assert.equal(context.getVolumeDirection({ shiftKey: true, code: 'NumpadAdd', key: '+' }), 1);
    assert.equal(context.getVolumeDirection({ shiftKey: true, code: 'Minus', key: '_' }), -1);
    assert.equal(context.getVolumeDirection({ shiftKey: true, code: 'NumpadSubtract', key: '-' }), -1);

    assert.equal(context.getVolumeDirection({ shiftKey: false, code: 'Equal', key: '=' }), 0);
    assert.equal(context.getVolumeDirection({ shiftKey: true, ctrlKey: true, code: 'Equal', key: '+' }), 0);
    assert.equal(context.getVolumeDirection({ shiftKey: true, altKey: true, code: 'Minus', key: '_' }), 0);

    assert.equal(context.isEditableTarget({ tagName: 'INPUT' }), true);
    assert.equal(context.isEditableTarget({ tagName: 'TEXTAREA' }), true);
    assert.equal(context.isEditableTarget({ tagName: 'DIV', isContentEditable: true }), true);
    assert.equal(context.isEditableTarget({ tagName: 'DIV', isContentEditable: false }), false);
});

test('TikTok volume step avoids float drift, starts at 10% from muted, and mutes at zero', () => {
    const { context } = createTikTokContext();

    const up = context.computeNextVolumeState(0.1, false, 1);
    assert.equal(up.volume, 0.15);
    assert.equal(up.muted, false);

    // 即使静音前记录有 0.4 音量，静音状态按 Shift + 仍从 0 起步直接加到 10%，后续再 +5%
    const unmuted = context.computeNextVolumeState(0.4, true, 1);
    assert.equal(unmuted.volume, 0.1);
    assert.equal(unmuted.muted, false);

    const nextUp = context.computeNextVolumeState(unmuted.volume, unmuted.muted, 1);
    assert.equal(nextUp.volume, 0.15);
    assert.equal(nextUp.muted, false);

    const unmutedFromZero = context.computeNextVolumeState(0, true, 1);
    assert.equal(unmutedFromZero.volume, 0.1);
    assert.equal(unmutedFromZero.muted, false);

    const mutedDown = context.computeNextVolumeState(0.4, true, -1);
    assert.equal(mutedDown.volume, 0);
    assert.equal(mutedDown.muted, true);

    const clampedMax = context.computeNextVolumeState(0.98, false, 1);
    assert.equal(clampedMax.volume, 1);
    assert.equal(clampedMax.muted, false);

    const mutedAtZero = context.computeNextVolumeState(0.05, false, -1);
    assert.equal(mutedAtZero.volume, 0);
    assert.equal(mutedAtZero.muted, true);
});

test('TikTok shortcut reveals native trigger, falls back to video volume cleanly, and hides after timeout', () => {
    const triggerEvents = [];
    const trigger = {
        matches: () => false,
        closest: () => trigger,
        dispatchEvent: e => triggerEvents.push(e.type)
    };
    const container = {
        parentElement: null,
        querySelector: sel => (sel.includes('video-sound') ? trigger : null)
    };
    const video = {
        tagName: 'VIDEO',
        paused: false,
        duration: 30,
        volume: 0.5,
        muted: false,
        parentElement: container,
        getBoundingClientRect: () => ({ top: 100, bottom: 900 })
    };

    const { context, storage, timers } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [video]
        }
    });

    let prevented = false;
    let stopped = false;
    context.handleKeyDown({
        shiftKey: true,
        code: 'Equal',
        key: '+',
        target: { tagName: 'BODY' },
        preventDefault() { prevented = true; },
        stopPropagation() { stopped = true; }
    });

    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(video.volume, 0.55);
    assert.equal(video.muted, false);
    assert.deepEqual(triggerEvents.slice(0, 2), ['mouseenter', 'mouseover']);
    assert.deepEqual(JSON.parse(storage.get('tiktok_enhanced_volume')), { volume: 0.55, muted: false });

    timers[0].fn();
    assert.deepEqual(triggerEvents.slice(2), ['mouseleave', 'mouseout']);
});

test('TikTok persists manual volume changes and syncs saved volume to new videos', () => {
    const video1 = { tagName: 'VIDEO', paused: false, duration: 15, volume: 0.3, muted: false };
    const video2 = { tagName: 'VIDEO', paused: false, duration: 20, volume: 1, muted: false };
    let activeVideo = video1;

    const { context, storage } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [activeVideo]
        }
    });

    // 首次加载未调整过音量：不覆盖 video1，标记为已同步
    context.handleMediaActivation({ target: video1 });
    assert.equal(video1.volume, 0.3);

    // 用户手动拖动官方音量条
    video1.volume = 0.7;
    video1.muted = false;
    context.handleVolumeChange({ target: video1 });
    assert.deepEqual(JSON.parse(storage.get('tiktok_enhanced_volume')), { volume: 0.7, muted: false });

    // 切换到新视频 video2 时自动同步用户记忆的音量，且不会被 video2 初始默认音量的 volumechange 污染
    activeVideo = video2;
    context.handleVolumeChange({ target: video2 });
    assert.deepEqual(JSON.parse(storage.get('tiktok_enhanced_volume')), { volume: 0.7, muted: false });

    context.handleMediaActivation({ target: video2 });
    assert.equal(video2.volume, 0.7);
    assert.equal(video2.muted, false);
});

test('TikTok falls back silently to video.volume when native controls are absent', () => {
    const video = {
        tagName: 'VIDEO',
        paused: false,
        duration: 12,
        volume: 0.25,
        muted: false,
        parentElement: { parentElement: null, querySelector: () => null }
    };
    const { context } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [video]
        }
    });

    context.handleKeyDown({
        shiftKey: true,
        code: 'Minus',
        key: '_',
        target: { tagName: 'BODY' },
        preventDefault() {},
        stopPropagation() {}
    });

    assert.equal(video.volume, 0.2);
    assert.equal(video.muted, false);
});

test('TikTok updates React Fiber setVolume/setIsMute synchronously without clicking track', () => {
    const triggerEvents = [];
    const trackEvents = [];
    let reactVolume = 0.4;
    let reactMuted = true;
    const fiberProps = {
        get volume() { return reactVolume; },
        get isMute() { return reactMuted; },
        setVolume(v) { reactVolume = v; video.volume = v; },
        setIsMute(m) { reactMuted = m; video.muted = m; }
    };
    const trigger = {
        matches: () => false,
        __reactFiberTest: { memoizedProps: {}, return: { memoizedProps: fiberProps, return: null } },
        dispatchEvent: e => triggerEvents.push(e.type)
    };
    const track = {
        tagName: 'DIV',
        dispatchEvent: e => trackEvents.push(e.type)
    };
    const card = {
        querySelector(sel) {
            if (sel.includes('VolumeControlContainer')) return trigger;
            if (sel.includes('VolumeSliderTrack')) return track;
            return null;
        }
    };
    const video = {
        tagName: 'VIDEO',
        paused: false,
        duration: 20,
        volume: 0.4,
        muted: true,
        closest: () => card
    };

    const { context } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [video]
        }
    });

    context.handleKeyDown({
        shiftKey: true,
        code: 'Equal',
        key: '+',
        target: { tagName: 'BODY' },
        preventDefault() {},
        stopPropagation() {}
    });

    assert.equal(reactVolume, 0.1);
    assert.equal(reactMuted, false);
    assert.equal(video.volume, 0.1);
    assert.equal(video.muted, false);
    assert.deepEqual(triggerEvents, ['mouseenter', 'mouseover']);
    assert.equal(trackEvents.length, 0);
});

test('TikTok updates React Fiber memoizedState hook API (setVolume/setMute) before revealing slider', () => {
    const timeline = [];
    let reactVolume = 0.4;
    let reactMuted = true;
    const playerApi = {
        setVolume(v) {
            reactVolume = v;
            video.volume = v;
            timeline.push(`setVolume:${v}`);
        },
        setMute(m) {
            reactMuted = m;
            video.muted = m;
            timeline.push(`setMute:${m}`);
        },
        getStaticBasicPlayerState() {
            return { volume: reactVolume, mute: reactMuted };
        }
    };
    const trigger = {
        matches: () => false,
        __reactFiberTest: {
            memoizedProps: {},
            memoizedState: null,
            return: {
                memoizedProps: {},
                memoizedState: {
                    memoizedState: 0.4,
                    next: {
                        memoizedState: [playerApi, [0, 1]],
                        next: null
                    }
                },
                return: null
            }
        },
        dispatchEvent: e => timeline.push(`trigger:${e.type}`)
    };
    const track = {
        tagName: 'DIV',
        dispatchEvent: e => timeline.push(`track:${e.type}`)
    };
    const card = {
        querySelector(sel) {
            if (sel.includes('VolumeControlContainer')) return trigger;
            if (sel.includes('VolumeSliderTrack')) return track;
            return null;
        }
    };
    const video = {
        tagName: 'VIDEO',
        paused: false,
        duration: 20,
        volume: 0.4,
        muted: true,
        closest: () => card
    };

    const { context } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [video]
        }
    });

    context.handleKeyDown({
        shiftKey: true,
        code: 'Equal',
        key: '+',
        target: { tagName: 'BODY' },
        preventDefault() {},
        stopPropagation() {}
    });

    assert.equal(reactVolume, 0.1);
    assert.equal(reactMuted, false);
    assert.deepEqual(timeline, [
        'setMute:false',
        'setVolume:0.1',
        'trigger:mouseenter',
        'trigger:mouseover'
    ]);

    timeline.length = 0;
    video.volume = 0.05;
    reactVolume = 0.05;
    context.handleKeyDown({
        shiftKey: true,
        code: 'Minus',
        key: '_',
        target: { tagName: 'BODY' },
        preventDefault() {},
        stopPropagation() {}
    });

    assert.equal(reactVolume, 0);
    assert.equal(reactMuted, true);
    assert.deepEqual(timeline, [
        'setVolume:0',
        'setMute:true',
        'trigger:mouseenter',
        'trigger:mouseover'
    ]);
});

test('TikTok blurs non-editable focused element only on volume shortcut to avoid focus-visible ring', () => {
    let blurCount = 0;
    let stopImmediateCount = 0;
    const focusedSection = {
        tagName: 'SECTION',
        isContentEditable: false,
        blur() { blurCount += 1; }
    };
    const video = {
        tagName: 'VIDEO',
        paused: false,
        duration: 20,
        volume: 0.5,
        muted: false
    };
    const doc = {
        documentElement: {},
        body: { tagName: 'BODY' },
        activeElement: focusedSection,
        querySelector: () => null,
        querySelectorAll: () => [video]
    };

    const { context } = createTikTokContext({ document: doc });

    // 其他快捷键不会触发 blur
    context.handleKeyDown({
        shiftKey: false,
        code: 'KeyM',
        key: 'm',
        target: focusedSection,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() { stopImmediateCount += 1; }
    });
    assert.equal(blurCount, 0);
    assert.equal(stopImmediateCount, 0);

    // 按下 Shift + 时会清除非可编辑元素焦点并阻止同级监听器继续传播
    context.handleKeyDown({
        shiftKey: true,
        code: 'Equal',
        key: '+',
        target: focusedSection,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() { stopImmediateCount += 1; }
    });
    assert.equal(blurCount, 1);
    assert.equal(stopImmediateCount, 1);
});

test('TikTok suppresses focus-visible while Shift is held and restores on keyup', () => {
    const attrs = new Map();
    const styles = [];
    const focusedButton = {
        tagName: 'BUTTON',
        isContentEditable: false,
        blur() { doc.activeElement = doc.body; }
    };
    const inputEl = {
        tagName: 'INPUT',
        isContentEditable: false,
        blur() {}
    };
    const video = {
        tagName: 'VIDEO',
        paused: false,
        duration: 20,
        volume: 0.5,
        muted: false
    };
    const doc = {
        body: { tagName: 'BODY' },
        head: { appendChild(el) { styles.push(el); } },
        documentElement: {
            setAttribute(k, v) { attrs.set(k, v); },
            removeAttribute(k) { attrs.delete(k); }
        },
        activeElement: focusedButton,
        createElement(tag) { return { tagName: tag.toUpperCase(), textContent: '' }; },
        querySelector: () => null,
        querySelectorAll: () => [video]
    };

    const { context } = createTikTokContext({ document: doc });

    // 先按下 Shift 时立即启用聚焦框保护，防止按下 + 前红框闪现
    context.handleKeyDown({
        key: 'Shift',
        code: 'ShiftLeft',
        shiftKey: true,
        target: focusedButton
    });
    assert.equal(attrs.get('data-tt-shift-focus-guard'), '1');
    assert.equal(styles.length, 1);
    assert.match(styles[0].textContent, /:focus-visible/);

    // 按下 + 时清除焦点并松开 Shift 后立即解除保护
    context.handleKeyDown({
        key: '+',
        code: 'Equal',
        shiftKey: true,
        target: focusedButton,
        preventDefault() {},
        stopPropagation() {},
        stopImmediatePropagation() {}
    });
    assert.equal(doc.activeElement, doc.body);

    context.handleKeyUp({ key: 'Shift', code: 'ShiftLeft' });
    assert.equal(attrs.has('data-tt-shift-focus-guard'), false);

    // 输入框聚焦时按 Shift 不触发保护
    doc.activeElement = inputEl;
    context.handleKeyDown({
        key: 'Shift',
        code: 'ShiftLeft',
        shiftKey: true,
        target: inputEl
    });
    assert.equal(attrs.has('data-tt-shift-focus-guard'), false);
});

test('TikTok supports Photo Mode <audio> posts (paused or playing) with native volume UI sync', () => {
    const events = [];
    let reactVolume = 0.5;
    let reactMuted = false;
    const playerApi = {
        setVolume(v) { reactVolume = v; photoAudio.volume = v; },
        setMute(m) { reactMuted = m; photoAudio.muted = m; },
        getStaticBasicPlayerState() { return { volume: reactVolume, mute: reactMuted }; }
    };
    const trigger = {
        matches: () => false,
        __reactFiberTest: {
            memoizedProps: {},
            memoizedState: { memoizedState: [playerApi, []], next: null },
            return: null
        },
        dispatchEvent: e => events.push(e.type)
    };
    const offscreenVideoCard = {
        offsetWidth: 400,
        offsetHeight: 700,
        getBoundingClientRect: () => ({ top: -900, bottom: -200 })
    };
    const offscreenVideo = {
        tagName: 'VIDEO',
        paused: true,
        duration: 20,
        offsetWidth: 400,
        offsetHeight: 700,
        volume: 0.5,
        muted: false,
        closest: () => offscreenVideoCard,
        getBoundingClientRect: () => ({ top: -900, bottom: -200 })
    };
    const photoCard = {
        offsetWidth: 420,
        offsetHeight: 720,
        getBoundingClientRect: () => ({ top: 140, bottom: 860 }),
        querySelector: sel => (sel.includes('VolumeControlContainer') ? trigger : null)
    };
    const photoAudio = {
        tagName: 'AUDIO',
        paused: true,
        duration: 15,
        offsetWidth: 0,
        offsetHeight: 0,
        volume: 0.5,
        muted: false,
        closest: () => photoCard
    };

    const { context, storage } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: sel => (sel.includes('audio') ? [offscreenVideo, photoAudio] : [offscreenVideo])
        }
    });

    context.handleKeyDown({
        shiftKey: true,
        code: 'Equal',
        key: '+',
        target: { tagName: 'BODY' },
        preventDefault() {},
        stopPropagation() {}
    });

    assert.equal(photoAudio.volume, 0.55);
    assert.equal(reactVolume, 0.55);
    assert.equal(offscreenVideo.volume, 0.5);
    assert.deepEqual(events, ['mouseenter', 'mouseover']);
    assert.deepEqual(JSON.parse(storage.get('tiktok_enhanced_volume')), { volume: 0.55, muted: false });

    // 新切换的图文贴音频激活时同样应用已保存的音量
    const nextAudio = {
        tagName: 'AUDIO',
        paused: false,
        duration: 18,
        volume: 1,
        muted: false,
        closest: () => photoCard
    };
    context.handleMediaActivation({ target: nextAudio });
    assert.equal(nextAudio.volume, 0.55);
});

test('TikTok re-syncs previously visited video when switching back after volume change', () => {
    const videoA = { tagName: 'VIDEO', paused: false, duration: 20, volume: 0.2, muted: false };
    const videoB = { tagName: 'VIDEO', paused: false, duration: 20, volume: 0.2, muted: false };
    let activeVideo = videoA;

    const { context } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [activeVideo]
        }
    });

    // 初次播放 A（20%）并被记录
    context.handleMediaActivation({ target: videoA });
    assert.equal(videoA.volume, 0.2);

    // 切到 B 并用快捷键调高到 30%（0.2 -> 0.25 -> 0.3）
    activeVideo = videoB;
    context.handleMediaActivation({ target: videoB });
    context.handleKeyDown({
        shiftKey: true, code: 'Equal', key: '+',
        target: { tagName: 'BODY' }, preventDefault() {}, stopPropagation() {}
    });
    context.handleKeyDown({
        shiftKey: true, code: 'Equal', key: '+',
        target: { tagName: 'BODY' }, preventDefault() {}, stopPropagation() {}
    });
    assert.equal(videoB.volume, 0.3);

    // 滑回 A 重新激活时，应覆盖 A 的旧音量 0.2 并同步为最新 0.3
    activeVideo = videoA;
    context.handleMediaActivation({ target: videoA });
    assert.equal(videoA.volume, 0.3);
    assert.equal(videoA.muted, false);
});

test('TikTok falls back to native media volume when React controller throws', () => {
    const brokenApi = {
        setVolume() { throw new Error('stale hook'); },
        setMute() { throw new Error('stale hook'); }
    };
    const trigger = {
        matches: () => false,
        __reactFiberTest: {
            memoizedProps: {},
            memoizedState: { memoizedState: [brokenApi, []], next: null },
            return: null
        },
        dispatchEvent() {}
    };
    const card = {
        querySelector: sel => (sel.includes('VolumeControlContainer') ? trigger : null)
    };
    const video = {
        tagName: 'VIDEO',
        paused: false,
        duration: 20,
        volume: 0.4,
        muted: true,
        closest: () => card
    };

    const { context } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: () => null,
            querySelectorAll: () => [video]
        }
    });

    context.handleKeyDown({
        shiftKey: true, code: 'Equal', key: '+',
        target: { tagName: 'BODY' }, preventDefault() {}, stopPropagation() {}
    });

    assert.equal(video.volume, 0.1);
    assert.equal(video.muted, false);
});

test('TikTok sidebar collapse skips clicking if button already indicates expand', () => {
    const observers = [];
    let clicks = 0;
    const expandBtn = {
        getAttribute: name => (name === 'aria-label' ? 'Expand sidebar' : null),
        click() { clicks++; }
    };
    const { context } = createTikTokContext({
        document: {
            documentElement: {},
            querySelector: sel => (sel.includes('DivToggleTrigger') ? expandBtn : null),
            querySelectorAll: () => []
        },
        MutationObserver: class {
            constructor(cb) { this.cb = cb; this.disconnected = false; observers.push(this); }
            observe() {}
            disconnect() { this.disconnected = true; }
        }
    });

    context.initAutoCollapseSidebar();
    observers[0].cb();
    assert.equal(clicks, 0);
    assert.equal(observers[0].disconnected, true);
});

