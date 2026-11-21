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

class FakePointerEvent {
  type: string;
  constructor(type: string, init: Record<string, unknown> = {}) {
    this.type = type;
    Object.assign(this, init);
  }
}

function createTikTokFixture(overrides: TikTokEnhancerDeps = {}) {
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
    Observer: class {
      observe() {}
      disconnect() {}
    } as unknown as typeof MutationObserver,
    PointerEventCtor: FakePointerEvent as unknown as typeof PointerEvent,
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

  return { enhancer, timers, clearedTimers };
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
      closest: () => null,
      dispatchEvent: (e: Event) => triggerEvents.push(e.type),
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 30,
      volume: 0.5,
      muted: false,
      getBoundingClientRect: () => ({ top: 100, bottom: 900 }),
    };

    const { enhancer, timers } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: (sel: string) =>
          sel.includes('cinema-playback-control-volume') ? trigger : null,
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
    expect(triggerEvents.slice(0, 2)).toEqual(['pointerenter', 'pointerover']);

    timers[0].fn();
    expect(triggerEvents.slice(2)).toEqual(['pointerleave', 'pointerout']);
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

  it('调用音量栏 Fiber props.onVolumeChange，并在边界无变化时跳过重复调用', () => {
    const timeline: string[] = [];
    let reactVolume = 0.7;
    let reactMuted = true;
    const propsObj = {
      onVolumeChange(v: number) {
        reactVolume = v;
        reactMuted = v <= 0;
        video.volume = v;
        video.muted = reactMuted;
        timeline.push(`onVolumeChange:${v}`);
      },
      onToggleMute() {
        timeline.push('onToggleMute:unexpected');
      },
    };
    const trigger = {
      matches: () => false,
      __reactFiberTest: {
        memoizedProps: {},
        return: {
          memoizedProps: propsObj,
          return: null,
        },
      },
      dispatchEvent: (e: Event) => timeline.push(`trigger:${e.type}`),
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.7,
      muted: true,
    };

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: (sel: string) =>
          sel.includes('cinema-playback-control-volume') ? trigger : null,
        querySelectorAll: () => [video],
      } as unknown as Document,
    });

    // 静音状态下（原音量 70%）按 Shift + ↑：仅调用 onVolumeChange(0.1) 从 10% 起步，绝不调用 onToggleMute
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
      'onVolumeChange:0.1',
      'trigger:pointerenter',
      'trigger:pointerover',
    ]);

    // 降至 0% 时同样仅调用 onVolumeChange(0)
    timeline.length = 0;
    video.volume = 0.05;
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
      'onVolumeChange:0',
      'trigger:pointerenter',
      'trigger:pointerover',
    ]);

    // 已在静音边界（0%，muted=true）继续按 Shift + ↓：跳过重复 onVolumeChange，但仍刷新悬停展示
    timeline.length = 0;
    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowDown',
      key: 'ArrowDown',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);
    expect(timeline).toEqual(['trigger:pointerenter', 'trigger:pointerover']);

    // 已在 100% 边界继续按 Shift + ↑：同样跳过重复 onVolumeChange
    timeline.length = 0;
    video.volume = 1;
    video.muted = false;
    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: { tagName: 'BODY' },
      preventDefault() {},
      stopPropagation() {},
    } as unknown as KeyboardEvent);
    expect(timeline).toEqual(['trigger:pointerenter', 'trigger:pointerover']);
  });

  it('仅在命中音量快捷键时拦截 stopImmediatePropagation', () => {
    let stopImmediateCount = 0;
    const bodyTarget = { tagName: 'BODY', isContentEditable: false };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.5,
      muted: false,
    };
    const doc = {
      documentElement: {},
      querySelector: () => null,
      querySelectorAll: () => [video],
    } as unknown as Document;

    const { enhancer } = createTikTokFixture({ doc });

    enhancer.handleKeyDown({
      shiftKey: false,
      code: 'KeyM',
      key: 'm',
      target: bodyTarget,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {
        stopImmediateCount += 1;
      },
    } as unknown as KeyboardEvent);
    expect(stopImmediateCount).toBe(0);

    enhancer.handleKeyDown({
      shiftKey: true,
      code: 'ArrowUp',
      key: 'ArrowUp',
      target: bodyTarget,
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {
        stopImmediateCount += 1;
      },
    } as unknown as KeyboardEvent);
    expect(stopImmediateCount).toBe(1);
  });

  it('支持图文模式 <audio> 贴子的音量调节与 UI 同步', () => {
    const events: string[] = [];
    let reactVolume = 0.5;

    const photoCard = {
      offsetWidth: 420,
      offsetHeight: 720,
      getBoundingClientRect: () => ({ top: 140, bottom: 860 }),
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
    const trigger = {
      matches: () => false,
      __reactFiberTest: {
        memoizedProps: {
          onVolumeChange(v: number) {
            reactVolume = v;
            photoAudio.volume = v;
          },
        },
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

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: (sel: string) =>
          sel.includes('cinema-playback-control-volume') ? trigger : null,
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
    expect(events).toEqual(['pointerenter', 'pointerover']);
  });

  it('React 音量回调抛错时仍正常降级修改原生媒体音量', () => {
    const trigger = {
      matches: () => false,
      __reactFiberTest: {
        memoizedProps: {
          onVolumeChange() {
            throw new Error('stale callback');
          },
        },
        return: null,
      },
      dispatchEvent() {},
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 20,
      volume: 0.4,
      muted: true,
    };

    const { enhancer } = createTikTokFixture({
      doc: {
        documentElement: {},
        querySelector: (sel: string) =>
          sel.includes('cinema-playback-control-volume') ? trigger : null,
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

  it('调节音量期间通过根节点标记与静态 CSS 保持底栏常亮并在超时后移除', () => {
    const rootAttrs = new Map<string, string>();
    const styles: Array<{ textContent: string }> = [];
    const cinemaVolBox = {
      matches: () => false,
      dispatchEvent() {},
    };
    const video = {
      tagName: 'VIDEO',
      paused: false,
      duration: 30,
      volume: 0.5,
      muted: false,
    };

    const { enhancer, timers } = createTikTokFixture({
      doc: {
        head: {
          appendChild(el: { textContent: string }) {
            styles.push(el);
          },
        },
        documentElement: {
          setAttribute(k: string, v: string) {
            rootAttrs.set(k, v);
          },
          removeAttribute(k: string) {
            rootAttrs.delete(k);
          },
        },
        createElement(tag: string) {
          return { tagName: tag.toUpperCase(), textContent: '' };
        },
        querySelector: (sel: string) =>
          sel.includes('cinema-playback-control-volume') ? cinemaVolBox : null,
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

    expect(rootAttrs.get('data-tt-chrome-bright')).toBe('1');
    expect(styles).toHaveLength(1);
    expect(styles[0].textContent).toContain('anchoring-playback-chrome');
    expect(styles[0].textContent).toContain('opacity: 1 !important');

    // 音量条展示超时结束后移除标记，样式标签仅注入一次
    timers[0].fn();
    expect(rootAttrs.has('data-tt-chrome-bright')).toBe(false);
    expect(styles).toHaveLength(1);
  });
});
