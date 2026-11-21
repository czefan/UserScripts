const VOLUME_STEP = 0.05;
const UNMUTE_START_VOLUME = 0.1;
const REVEAL_DURATION = 1400;
const CHROME_BRIGHT_ATTR = 'data-tt-chrome-bright';

const MEDIA_CARD_SELECTOR =
  '[data-e2e="feed-video"], [data-e2e="recommend-list-item-container"], [class*="SectionMediaCardContainer"], article, section';
const VOLUME_TRIGGER_SELECTOR =
  '[data-e2e="cinema-playback-control-volume"], [data-cinema-playback-control="volume"]';
const PLAYBACK_CHROME_SELECTOR = '[data-e2e="anchoring-playback-chrome"]';

export interface VolumeState {
  volume: number;
  muted: boolean;
}

export function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export function isEditableTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(el.isContentEditable)
  );
}

export function getVolumeDirection(e: {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
  code?: string;
  key?: string;
}): -1 | 0 | 1 {
  if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return 0;
  if (e.code === 'ArrowUp' || e.key === 'ArrowUp') return 1;
  if (e.code === 'ArrowDown' || e.key === 'ArrowDown') return -1;
  return 0;
}

export function computeNextVolumeState(
  currentVolume: number,
  currentMuted: boolean,
  direction: -1 | 0 | 1,
): VolumeState {
  if (currentMuted) {
    return direction > 0
      ? { volume: UNMUTE_START_VOLUME, muted: false }
      : { volume: 0, muted: true };
  }
  const base = clampVolume(
    typeof currentVolume === 'number' && !Number.isNaN(currentVolume)
      ? currentVolume
      : 1,
  );
  if (direction > 0) {
    return { volume: clampVolume(base + VOLUME_STEP), muted: false };
  }
  const nextVol = clampVolume(base - VOLUME_STEP);
  return { volume: nextVol, muted: nextVol <= 0 };
}

export interface TikTokEnhancerDeps {
  doc?: Document;
  win?: Pick<Window, 'innerHeight' | 'addEventListener'>;
  Observer?: typeof MutationObserver;
  PointerEventCtor?: typeof PointerEvent;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export function createTikTokEnhancer(deps: TikTokEnhancerDeps = {}) {
  const doc = deps.doc ?? document;
  const win = deps.win ?? window;
  const Observer = deps.Observer ?? MutationObserver;
  const PointerEventCtor =
    deps.PointerEventCtor ??
    (typeof PointerEvent !== 'undefined' ? PointerEvent : undefined);
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;

  let revealedTrigger: Element | null = null;
  let hideRevealTimer: ReturnType<typeof setTimeout> | null = null;
  let chromeBrightStyleReady = false;

  function initAutoCollapseSidebar(): void {
    // TikTok 侧边栏折叠态不会挂载 DivToggleTrigger，仅展开态存在且 aria-label 为 Collapse sidebar
    const obs = new Observer(() => {
      const btn = doc.querySelector<HTMLElement>(
        '[class*="DivToggleTrigger"], [class*="e1hzmt9p0"]',
      );
      if (!btn) return;
      const label = btn.getAttribute?.('aria-label') || '';
      if (!/expand|展开/i.test(label)) btn.click();
      obs.disconnect();
    });
    obs.observe(doc.documentElement, { childList: true, subtree: true });
    setTimer(() => obs.disconnect(), 15000);
  }

  function getMediaVisualBox(
    media: HTMLMediaElement | null,
  ): HTMLElement | null {
    if (!media) return null;
    // 图文贴使用 <audio> 播放且自身宽高为 0，需借助外层卡片计算可见性与视口位置
    return media.tagName === 'AUDIO'
      ? ((media.closest?.(MEDIA_CARD_SELECTOR) ||
          media.parentElement ||
          media) as HTMLElement)
      : media;
  }

  function getActiveVideo(): HTMLMediaElement | null {
    const all = doc.querySelectorAll<HTMLMediaElement>('video, audio');
    if (!all.length) return null;

    for (const m of all) {
      if (!m.paused && m.duration > 0) return m;
    }

    const cy = win.innerHeight / 2;
    let best: HTMLMediaElement | null = null;
    let bestDist = Infinity;
    for (const m of all) {
      const box = getMediaVisualBox(m);
      if (!(box && box.offsetWidth > 60 && box.offsetHeight > 60)) continue;
      const rect = box.getBoundingClientRect?.();
      if (!rect) return best || m;
      const dist = Math.abs((rect.top + rect.bottom) / 2 - cy);
      if (dist < bestDist) {
        best = m;
        bestDist = dist;
      }
    }
    return best;
  }

  function dispatchHoverEvents(target: Element | null, entering: boolean): void {
    if (!target || !PointerEventCtor) return;
    const events: Array<[string, boolean]> = entering
      ? [
          ['pointerenter', false],
          ['pointerover', true],
        ]
      : [
          ['pointerleave', false],
          ['pointerout', true],
        ];
    for (const [type, bubbles] of events) {
      try {
        target.dispatchEvent(
          new PointerEventCtor(type, {
            bubbles,
            cancelable: true,
            pointerType: 'mouse',
            view: typeof window !== 'undefined' ? window : undefined,
          }),
        );
      } catch {
        // 忽略测试环境或受限环境下的事件构造差异
      }
    }
  }

  // 通过根节点标记与静态 CSS 维持底栏亮态，避免改写 React 管理的 data-clean 属性
  function setPlaybackChromeBright(enabled: boolean): void {
    const root = doc.documentElement;
    if (!root?.setAttribute || !root?.removeAttribute) return;
    if (enabled) {
      if (!chromeBrightStyleReady && doc.createElement) {
        const container = doc.head || root;
        if (container?.appendChild) {
          const style = doc.createElement('style');
          style.textContent = `html[${CHROME_BRIGHT_ATTR}="1"] ${PLAYBACK_CHROME_SELECTOR}[data-clean="idle"] > * { opacity: 1 !important; }`;
          container.appendChild(style);
          chromeBrightStyleReady = true;
        }
      }
      root.setAttribute(CHROME_BRIGHT_ATTR, '1');
    } else {
      root.removeAttribute(CHROME_BRIGHT_ATTR);
    }
  }

  function revealNativeVolumeBar(trigger: Element | null): void {
    if (!trigger) return;
    if (revealedTrigger && revealedTrigger !== trigger) {
      dispatchHoverEvents(revealedTrigger, false);
    }
    revealedTrigger = trigger;
    setPlaybackChromeBright(true);
    dispatchHoverEvents(trigger, true);

    if (hideRevealTimer) clearTimer(hideRevealTimer);
    hideRevealTimer = setTimer(() => {
      hideRevealTimer = null;
      if (revealedTrigger && !revealedTrigger.matches?.(':hover')) {
        dispatchHoverEvents(revealedTrigger, false);
      }
      revealedTrigger = null;
      setPlaybackChromeBright(false);
    }, REVEAL_DURATION);
  }

  // 通过音量栏上层 Fiber props.onVolumeChange 触发官方状态更新（含自动解静音/归零静音与刷新持久化）
  function findOnVolumeChange(
    trigger: Element | null,
  ): ((volume: number) => void) | null {
    if (!trigger) return null;
    const fiberKey = Object.keys(trigger).find(
      (k) =>
        k.startsWith('__reactFiber') ||
        k.startsWith('__reactInternalInstance'),
    );
    if (!fiberKey) return null;

    let fiber = (trigger as unknown as Record<string, any>)[fiberKey];
    for (let depth = 0; fiber && depth < 15; depth++) {
      const handler = fiber.memoizedProps?.onVolumeChange;
      if (typeof handler === 'function') return handler;
      fiber = fiber.return;
    }
    return null;
  }

  function applyVolumeToVideo(
    video: HTMLMediaElement,
    volume: number,
    muted: boolean,
  ): void {
    const trigger = doc.querySelector?.(VOLUME_TRIGGER_SELECTOR) || null;
    const changed =
      volume !== clampVolume(video.volume) || muted !== Boolean(video.muted);

    if (changed) {
      const onVolumeChange = findOnVolumeChange(trigger);
      try {
        onVolumeChange?.(volume);
      } catch {
        // 官方回调异常时仍继续同步原生媒体音量，避免阻塞按键调节
      }
      if (video.volume !== volume) video.volume = volume;
      if (video.muted !== muted) video.muted = muted;
    }
    if (trigger) revealNativeVolumeBar(trigger);
  }

  function handleKeyDown(e: KeyboardEvent): void {
    const direction = getVolumeDirection(e);
    if (!direction) return;

    const target = e.composedPath?.()[0] || e.target;
    if (isEditableTarget(target)) return;

    const video = getActiveVideo();
    if (!video) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();

    const next = computeNextVolumeState(video.volume, video.muted, direction);
    applyVolumeToVideo(video, next.volume, next.muted);
  }

  function initVolumeControl(): void {
    win.addEventListener('keydown', handleKeyDown as EventListener, true);
  }

  function init(): void {
    initAutoCollapseSidebar();
    initVolumeControl();
  }

  return {
    initAutoCollapseSidebar,
    initVolumeControl,
    handleKeyDown,
    init,
  };
}
