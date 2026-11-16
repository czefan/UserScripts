import { describe, expect, it } from 'vitest';
import {
  computeNextVolumeState,
  createTikTokEnhancer,
  getVolumeDirection,
  isEditableTarget,
  type TikTokEnhancerDeps,
} from './enhanced.ts';

interface TimerEntry {
  id: number;
  fn: () => void;
  ms: number;
}

class FakeMouseEvent {
  type: string;
  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

function createTikTokFixture(overrides: TikTokEnhancerDeps = {}) {
  const storageMap = new Map<string, string>();
  const timers: TimerEntry[] = [];
  const clearedTimers: number[] = [];

  const enhancer = createTikTokEnhancer({
    win: {
      innerHeight: 1000,
      addEventListener: () => {},
    },
    doc: {
      documentElement: {},
      querySelector: () => null,
      querySelectorAll: () => [],
    } as unknown as Document,
    storage: {
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => {
        storageMap.set(k, String(v));
      },
    },
    Observer: class {
      observe() {}
      disconnect() {}
    } as unknown as typeof MutationObserver,
    MouseEventCtor: FakeMouseEvent as unknown as typeof MouseEvent,
    setTimer: ((fn: () => void, ms: number) => {
      const id = timers.length + 1;
      timers.push({ id, fn, ms });
      return id;
    }) as unknown as typeof setTimeout,
    clearTimer: ((id: number) => {
      clearedTimers.push(id);
    }) as unknown as typeof clearTimeout,
    ...overrides,
  });

  return { enhancer, storageMap, timers, clearedTimers };
}

describe('tiktok-enhanced', () => {
  it('自动折叠侧边栏点击一次开关后即断开观察', () => {
    const observers: Array<{ cb: MutationCallback; disconnected: boolean }> =
      [];
    let clicks = 0;
    let btn: { click(): void } | null = null;

    const { enhancer, timers } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: (sel: string) =>
          sel.includes('DivToggleTrigger') ? btn : null,
        querySelectorAll: () => [],
      } as unknown as Document,
      Observer: class {
        cb: MutationCallback;
        disconnected = false;
        constructor(cb: MutationCallback) {
          this.cb = cb;
          observers.push(this);
        }
        observe() {}
        disconnect() {
          this.disconnected = true;
        }
      } as unknown as typeof MutationObserver,
    });

    enhancer.initAutoCollapseSidebar();
    expect(observers).toHaveLength(1);
    observers[0].cb([], observers[0] as unknown as MutationObserver);
    expect(clicks).toBe(0);
    expect(observers[0].disconnected).toBe(false);

    btn = {
      click() {
        clicks++;
      },
    };
    observers[0].cb([], observers[0] as unknown as MutationObserver);
    expect(clicks).toBe(1);
    expect(observers[0].disconnected).toBe(true);

    timers[0].fn();
    expect(observers[0].disconnected).toBe(true);
  });

  it('识别 Shift + ↑ / ↓ 快捷键并放行单按方向键、输入框或非预期修饰键', () => {
    expect(
      getVolumeDirection({ shiftKey: true, code: 'ArrowUp', key: 'ArrowUp' }),
    ).toBe(1);
    expect(
      getVolumeDirection({ shiftKey: true, code: 'Numpad8', key: 'ArrowUp' }),
    ).toBe(1);
    expect(
      getVolumeDirection({
        shiftKey: true,
        code: 'ArrowDown',
        key: 'ArrowDown',
      }),
    ).toBe(-1);
    expect(
      getVolumeDirection({ shiftKey: true, code: 'Numpad2', key: 'ArrowDown' }),
    ).toBe(-1);

    expect(
      getVolumeDirection({ shiftKey: false, code: 'ArrowUp', key: 'ArrowUp' }),
    ).toBe(0);
    expect(
      getVolumeDirection({
        shiftKey: false,
        code: 'ArrowDown',
        key: 'ArrowDown',
      }),
    ).toBe(0);
    expect(
      getVolumeDirection({ shiftKey: true, code: 'Equal', key: '+' }),
    ).toBe(0);
    expect(
      getVolumeDirection({ shiftKey: true, code: 'Minus', key: '_' }),
    ).toBe(0);
    expect(
      getVolumeDirection({
        shiftKey: true,
        ctrlKey: true,
        code: 'ArrowUp',
        key: 'ArrowUp',
      }),
    ).toBe(0);
    expect(
      getVolumeDirection({
        shiftKey: true,
        altKey: true,
        code: 'ArrowDown',
        key: 'ArrowDown',
      }),
    ).toBe(0);

    expect(isEditableTarget({ tagName: 'INPUT' })).toBe(true);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(
      true,
    );
    expect(
      isEditableTarget({ tagName: 'DIV', isContentEditable: false }),
    ).toBe(false);
  });

  it('音量步进避免浮点漂移，静音恢复从 10% 起步，归零自动静音', () => {
    expect(computeNextVolumeState(0.1, false, 1)).toEqual({
      volume: 0.15,
      muted: false,
    });

    // 即使静音前记录有 0.4 音量，静音状态按 Shift + ↑ 仍从 0 起步直接加到 10%
    const unmuted = computeNextVolumeState(0.4, true, 1);
    expect(unmuted).toEqual({ volume: 0.1, muted: false });

    expect(computeNextVolumeState(unmuted.volume, unmuted.muted, 1)).toEqual({
      volume: 0.15,
      muted: false,
    });
    expect(computeNextVolumeState(0, true, 1)).toEqual({
      volume: 0.1,
      muted: false,
    });
    expect(computeNextVolumeState(0.4, true, -1)).toEqual({
      volume: 0,
      muted: true,
    });
    expect(computeNextVolumeState(0.98, false, 1)).toEqual({
      volume: 1,
      muted: false,
    });
    expect(computeNextVolumeState(0.05, false, -1)).toEqual({
      volume: 0,
      muted: true,
    });
  });

  it('快捷键调音触发原生音量按钮悬停展示并在超时后隐藏', () => {
    const triggerEvents: string[] = [];
    const trigger = {
      matches: () => false,
      closest: () => trigger,
      dispatchEvent: (e: Event) => triggerEvents.push(e.type),
    };
    const container = {
      parentElement: null,
      querySelector: (sel: string) =>
        sel.includes('video-sound') ? trigger : null,
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 30,
      volume: 0.5,
      muted: false,
      parentElement: container,
      getBoundingClientRect: () => ({ top: 100, bottom: 900 }),
    };

    const { enhancer, storageMap, timers } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: () => [video],
      } as unknown as Document,
    });

    let prevented = false;
    let stopped = false;
    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    } as unknown as KeyboardEvent);

    expect(prevented).toBe(true);
    expect(stopped).toBe(true);
    expect(video.volume).toBe(0.55);
    expect(video.muted).toBe(false);
    expect(triggerEvents.slice(0, 2)).toEqual(['mouseenter', 'mouseover']);
    expect(JSON.parse(storageMap.get('tiktok_enhanced_volume')!)).toEqual({
      volume: 0.55,
      muted: false,
    });

    timers[0].fn();
    expect(triggerEvents.slice(2)).toEqual(['mouseleave', 'mouseout']);
  });

  it('持久化手动音量改动并同步记忆音量到后续新视频', () => {
    const video1 = {
      tagName: 'VIDEO',
      paused: false,
      duration: 15,
      volume: 0.3,
      muted: false,
    };
    const video2 = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 1,
      muted: false,
    };
    let activeVideo = video1;

    const { enhancer, storageMap } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: () => [activeVideo],
      } as unknown as Document,
    });

    enhancer.handleMediaActivation({ target: video1 });
    expect(video1.volume).toBe(0.3);

    video1.volume = 0.7;
    video1.muted = false;
    enhancer.handleVolumeChange({ target: video1 });
    expect(JSON.parse(storageMap.get('tiktok_enhanced_volume')!)).toEqual({
      volume: 0.7,
      muted: false,
    });

    activeVideo = video2;
    enhancer.handleVolumeChange({ target: video2 });
    expect(JSON.parse(storageMap.get('tiktok_enhanced_volume')!)).toEqual({
      volume: 0.7,
      muted: false,
    });

    enhancer.handleMediaActivation({ target: video2 });
    expect(video2.volume).toBe(0.7);
    expect(video2.muted).toBe(false);
  });

  it('未找到原生音量控件时静默回退到直接修改 video.volume', () => {
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 12,
      volume: 0.25,
      muted: false,
      parentElement: { parentElement: null, querySelector: () => null },
    };

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: () => [video],
      } as unknown as Document,
    });

    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowDown',
      key: 'ArrowDown',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);

    expect(video.volume).toBe(0.2);
    expect(video.muted).toBe(false);
  });

  it('通过 React Fiber memoizedProps 同步调用 setVolume/setIsMute', () => {
    const triggerEvents: string[] = [];
    const trackEvents: string[] = [];
    let reactVolume = 0.4;
    let reactMuted = true;
    const fiberProps = {
      get volume() {
        return reactVolume;
      },
      get isMute() {
        return reactMuted;
      },
      setVolume(v: number) {
        reactVolume = v;
        video.volume = v;
      },
      setIsMute(m: boolean) {
        reactMuted = m;
        video.muted = m;
      },
    };
    const trigger = {
      matches: () => false,
      __reactFiberTest: {
        memoizedProps: {},
        return: { memoizedProps: fiberProps, return: null },
      },
      dispatchEvent: (e: Event) => triggerEvents.push(e.type),
    };
    const track = {
      tagName: 'DIV',
      dispatchEvent: (e: Event) => trackEvents.push(e.type),
    };
    const card = {
      querySelector(sel: string) {
        if (sel.includes('VolumeControlContainer')) return trigger;
        if (sel.includes('VolumeSliderTrack')) return track;
        return null;
      },
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.4,
      muted: true,
      closest: () => card,
    };

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: () => [video],
      } as unknown as Document,
    });

    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);

    expect(reactVolume).toBe(0.1);
    expect(reactMuted).toBe(false);
    expect(video.volume).toBe(0.1);
    expect(video.muted).toBe(false);
    expect(triggerEvents).toEqual(['mouseenter', 'mouseover']);
    expect(trackEvents).toHaveLength(0);
  });

  it('在展开音量条前按正确顺序更新 React Fiber memoizedState Hook API', () => {
    const timeline: string[] = [];
    let reactVolume = 0.4;
    let reactMuted = true;
    const playerApi = {
      setVolume(v: number) {
        reactVolume = v;
        video.volume = v;
        timeline.push(`setVolume:${v}`);
      },
      setMute(m: boolean) {
        reactMuted = m;
        video.muted = m;
        timeline.push(`setMute:${m}`);
      },
      getStaticBasicPlayerState() {
        return { volume: reactVolume, mute: reactMuted };
      },
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
              next: null,
            },
          },
          return: null,
        },
      },
      dispatchEvent: (e: Event) => timeline.push(`trigger:${e.type}`),
    };
    const card = {
      querySelector(sel: string) {
        if (sel.includes('VolumeControlContainer')) return trigger;
        return null;
      },
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.4,
      muted: true,
      closest: () => card,
    };

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: () => [video],
      } as unknown as Document,
    });

    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);

    expect(reactVolume).toBe(0.1);
    expect(reactMuted).toBe(false);
    expect(timeline).toEqual([
      'setMute:false',
      'setVolume:0.1',
      'trigger:mouseenter',
      'trigger:mouseover',
    ]);

    timeline.length = 0;
    video.volume = 0.05;
    reactVolume = 0.05;
    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowDown',
      key: 'ArrowDown',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);

    expect(reactVolume).toBe(0);
    expect(reactMuted).toBe(true);
    expect(timeline).toEqual([
      'setVolume:0',
      'setMute:true',
      'trigger:mouseenter',
      'trigger:mouseover',
    ]);
  });

  it('仅在命中音量快捷键时清除非可编辑元素焦点以防聚焦环闪现', () => {
    let blurCount = 0;
    let stopImmediateCount = 0;
    const focusedSection = {
      tagName: 'SECTION',
      isContentEditable: false,
      blur() {
        blurCount += 1;
      },
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.5,
      muted: false,
    };
    const doc = {
      documentElement: {},
      body: { tagName: 'BODY' },
      activeElement: focusedSection,
      querySelector: () => null,
      querySelectorAll: () => [video],
    } as unknown as Document;

    const { enhancer } = createTikTokFixture({ doc });

    enhancer.handleKeyDown({
      shiftKey: false,
      code: 'KeyM',
      key: 'm',
      target: focusedSection,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {
        stopImmediateCount += 1;
      },
    } as unknown as KeyboardEvent);
    expect(blurCount).toBe(0);
    expect(stopImmediateCount).toBe(0);

    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: focusedSection,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {
        stopImmediateCount += 1;
      },
    } as unknown as KeyboardEvent);
    expect(blurCount).toBe(1);
    expect(stopImmediateCount).toBe(1);
  });

  it('按住 Shift 期间压制 focus-visible 并在松开后恢复', () => {
    const attrs = new Map<string, string>();
    const styles: Array<{ textContent: string }> = [];
    const doc = {
      body: { tagName: 'BODY' },
      head: {
        appendChild(el: { textContent: string }) {
          styles.push(el);
        },
      },
      documentElement: {
        setAttribute(k: string, v: string) {
          attrs.set(k, v);
        },
        removeAttribute(k: string) {
          attrs.delete(k);
        },
      },
      activeElement: null as unknown,
      createElement(tag: string) {
        return { tagName: tag.toUpperCase(), textContent: '' };
      },
      querySelector: () => null,
      querySelectorAll: () => [
        {
          tagName: 'VIDEO',
          paused: false,
          duration: 20,
          volume: 0.5,
          muted: false,
        },
      ],
    };

    const focusedButton = {
      tagName: 'BUTTON',
      isContentEditable: false,
      blur() {
        doc.activeElement = doc.body;
      },
    };
    const inputEl = {
      tagName: 'INPUT',
      isContentEditable: false,
      blur() {},
    };
    doc.activeElement = focusedButton;

    const { enhancer } = createTikTokFixture({
      doc: doc as unknown as Document,
    });

    enhancer.handleKeyDown({
      key: 'Shift',
      code: 'ShiftLeft',
      shiftKey: true,
      target: focusedButton,
    } as unknown as KeyboardEvent);
    expect(attrs.get('data-tt-shift-focus-guard')).toBe('1');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toMatch(/:focus-visible/);

    enhancer.handleKeyDown({
      key: 'ArrowUp',
      code: 'ArrowUp',
      shiftKey: true,
      target: focusedButton,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
    } as unknown as KeyboardEvent);
    expect(doc.activeElement).toBe(doc.body);

    enhancer.handleKeyUp({ key: 'Shift', code: 'ShiftLeft' });
    expect(attrs.has('data-tt-shift-focus-guard')).toBe(false);

    doc.activeElement = inputEl;
    enhancer.handleKeyDown({
      key: 'Shift',
      code: 'ShiftLeft',
      shiftKey: true,
      target: inputEl,
    } as unknown as KeyboardEvent);
    expect(attrs.has('data-tt-shift-focus-guard')).toBe(false);
  });

  it('支持图文模式 <audio> 贴子的音量调节与 UI 同步', () => {
    const events: string[] = [];
    let reactVolume = 0.5;
    let reactMuted = false;

    const photoCard = {
      offsetWidth: 420,
      offsetHeight: 720,
      getBoundingClientRect: () => ({ top: 140, bottom: 860 }),
      querySelector: (sel: string) =>
        sel.includes('VolumeControlContainer') ? trigger : null,
    };
    const photoAudio = {
      tagName: 'AUDIO',
      paused: true,
      duration: 15,
      offsetWidth: 0,
      offsetHeight: 0,
      volume: 0.5,
      muted: false,
      closest: () => photoCard,
    };
    const playerApi = {
      setVolume(v: number) {
        reactVolume = v;
        photoAudio.volume = v;
      },
      setMute(m: boolean) {
        reactMuted = m;
        photoAudio.muted = m;
      },
      getStaticBasicPlayerState() {
        return { volume: reactVolume, mute: reactMuted };
      },
    };
    const trigger = {
      matches: () => false,
      __reactFiberTest: {
        memoizedProps: {},
        memoizedState: { memoizedState: [playerApi, []], next: null },
        return: null,
      },
      dispatchEvent: (e: Event) => events.push(e.type),
    };
    const offscreenVideoCard = {
      offsetWidth: 400,
      offsetHeight: 700,
      getBoundingClientRect: () => ({ top: -900, bottom: -200 }),
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
      getBoundingClientRect: () => ({ top: -900, bottom: -200 }),
    };

    const { enhancer, storageMap } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: (sel: string) =>
          sel.includes('audio')
            ? [offscreenVideo, photoAudio]
            : [offscreenVideo],
      } as unknown as Document,
    });

    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);

    expect(photoAudio.volume).toBe(0.55);
    expect(reactVolume).toBe(0.55);
    expect(offscreenVideo.volume).toBe(0.5);
    expect(events).toEqual(['mouseenter', 'mouseover']);
    expect(JSON.parse(storageMap.get('tiktok_enhanced_volume')!)).toEqual({
      volume: 0.55,
      muted: false,
    });

    const nextAudio = {
      tagName: 'AUDIO',
      paused: false,
      duration: 18,
      volume: 1,
      muted: false,
      closest: () => photoCard,
    };
    enhancer.handleMediaActivation({ target: nextAudio });
    expect(nextAudio.volume).toBe(0.55);
  });

  it('切回已访问视频时将最新全局音量重新同步到该视频', () => {
    const videoA = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.2,
      muted: false,
    };
    const videoB = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.2,
      muted: false,
    };
    let activeVideo = videoA;

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: () => [activeVideo],
      } as unknown as Document,
    });

    enhancer.handleMediaActivation({ target: videoA });
    expect(videoA.volume).toBe(0.2);

    activeVideo = videoB;
    enhancer.handleMediaActivation({ target: videoB });
    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);
    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);
    expect(videoB.volume).toBe(0.3);

    activeVideo = videoA;
    enhancer.handleMediaActivation({ target: videoA });
    expect(videoA.volume).toBe(0.3);
    expect(videoA.muted).toBe(false);
  });

  it('React 播放器 Hook 抛错时仍正常降级修改原生媒体音量', () => {
    const brokenApi = {
      setVolume() {
        throw new Error('stale hook');
      },
      setMute() {
        throw new Error('stale hook');
      },
    };
    const trigger = {
      matches: () => false,
      __reactFiberTest: {
        memoizedProps: {},
        memoizedState: { memoizedState: [brokenApi, []], next: null },
        return: null,
      },
      dispatchEvent() {},
    };
    const card = {
      querySelector: (sel: string) =>
        sel.includes('VolumeControlContainer') ? trigger : null,
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.4,
      muted: true,
      closest: () => card,
    };

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: () => null,
        querySelectorAll: () => [video],
      } as unknown as Document,
    });

    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);

    expect(video.volume).toBe(0.1);
    expect(video.muted).toBe(false);
  });

  it('侧边栏按钮已处于展开提示（已折叠态）时跳过点击直接断开监听', () => {
    const observers: Array<{ cb: MutationCallback; disconnected: boolean }> =
      [];
    let clicks = 0;
    const expandBtn = {
      getAttribute: (name: string) =>
        name === 'aria-label' ? 'Expand sidebar' : null,
      click() {
        clicks++;
      },
    };

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: (sel: string) =>
          sel.includes('DivToggleTrigger') ? expandBtn : null,
        querySelectorAll: () => [],
      } as unknown as Document,
      Observer: class {
        cb: MutationCallback;
        disconnected = false;
        constructor(cb: MutationCallback) {
          this.cb = cb;
          observers.push(this);
        }
        observe() {}
        disconnect() {
          this.disconnected = true;
        }
      } as unknown as typeof MutationObserver,
    });

    enhancer.initAutoCollapseSidebar();
    observers[0].cb([], observers[0] as unknown as MutationObserver);
    expect(clicks).toBe(0);
    expect(observers[0].disconnected).toBe(true);
  });
});
