const VOLUME_STEP = 0.05;
const UNMUTE_START_VOLUME = 0.1;
const STORAGE_KEY = 'tiktok_enhanced_volume';
const REVEAL_DURATION = 1400;
const FOCUS_GUARD_ATTR = 'data-tt-shift-focus-guard';

const MEDIA_CARD_SELECTOR =
  '[data-e2e="feed-video"], [data-e2e="recommend-list-item-container"], [class*="SectionMediaCardContainer"], article, section';
const VOLUME_CONTAINER_SELECTOR =
  '[class*="VolumeControlContainer"], [class*="VoiceControl"], [class*="SoundControl"], [class*="VolumeControl"]';
const VOLUME_BUTTON_SELECTOR =
  '[data-e2e="video-sound"], [data-e2e="video-volume"], button[aria-label*="Volume" i], button[aria-label*="音量"], [aria-label*="Mute" i]';

export interface VolumeState {
  volume: number;
  muted: boolean;
}

export interface ReactVolumeApi {
  setVolume: (volume: number) => void;
  setMute?: (muted: boolean) => void;
  setIsMute?: (muted: boolean) => void;
  getStaticBasicPlayerState?: () => { volume?: number; mute?: boolean } | null;
  isMute?: boolean;
}

export function clampVolume(value: number): number {
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export function isMediaElement(el: unknown): el is HTMLMediaElement {
  return Boolean(
    el &&
      typeof el === 'object' &&
      ((el as Element).tagName === 'VIDEO' ||
        (el as Element).tagName === 'AUDIO'),
  );
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
  if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') return 1;
  if (
    e.code === 'Minus' ||
    e.code === 'NumpadSubtract' ||
    e.key === '_' ||
    e.key === '-'
  ) {
    return -1;
  }
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

export function isReactVolumeApi(obj: unknown): obj is ReactVolumeApi {
  if (!obj || typeof obj !== 'object') return false;
  const candidate = obj as Partial<ReactVolumeApi>;
  return (
    typeof candidate.setVolume === 'function' &&
    (typeof candidate.setMute === 'function' ||
      typeof candidate.setIsMute === 'function')
  );
}

export interface TikTokEnhancerDeps {
  doc?: Document;
  win?: Pick<Window, 'innerHeight' | 'addEventListener'>;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  Observer?: typeof MutationObserver;
  MouseEventCtor?: typeof MouseEvent;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

export function createTikTokEnhancer(deps: TikTokEnhancerDeps = {}) {
  const doc = deps.doc ?? document;
  const win = deps.win ?? window;
  const storage = deps.storage ?? localStorage;
  const Observer = deps.Observer ?? MutationObserver;
  const MouseEventCtor = deps.MouseEventCtor ?? MouseEvent;
  const setTimer = deps.setTimer ?? setTimeout;
  const clearTimer = deps.clearTimer ?? clearTimeout;

  let savedState: VolumeState | null = loadVolumeState();
  let isApplyingVolume = false;
  let suppressVolumeChangeUntil = 0;
  const syncedVideos = new WeakSet<HTMLMediaElement>();
  let revealedTrigger: Element | null = null;
  let hideRevealTimer: ReturnType<typeof setTimeout> | null = null;
  let focusGuardStyleReady = false;

  function loadVolumeState(): VolumeState | null {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { volume?: unknown; muted?: unknown };
      if (typeof parsed?.volume !== 'number' || Number.isNaN(parsed.volume)) {
        return null;
      }
      return {
        volume: clampVolume(parsed.volume),
        muted: Boolean(parsed.muted),
      };
    } catch {
      return null;
    }
  }

  function saveVolumeState(volume: number, muted: boolean): void {
    savedState = {
      volume: clampVolume(volume),
      muted: Boolean(muted),
    };
    try {
      storage.setItem(STORAGE_KEY, JSON.stringify(savedState));
    } catch {
      // 忽略隐私模式或存储受限异常
    }
  }

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

  function getMediaCard(media: Element | null): Element | null {
    return media?.closest?.(MEDIA_CARD_SELECTOR) || null;
  }

  function getMediaVisualBox(
    media: HTMLMediaElement | null,
  ): HTMLElement | null {
    if (!media) return null;
    // 图文贴使用 <audio> 播放且自身宽高为 0，需借助外层卡片计算可见性与视口位置
    return media.tagName === 'AUDIO'
      ? ((getMediaCard(media) || media.parentElement || media) as HTMLElement)
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

  function findVolumeTrigger(video: Element | null): Element | null {
    const resolveInScope = (root: Element | null): Element | null => {
      if (!root?.querySelector) return null;
      const containerEl = root.querySelector(VOLUME_CONTAINER_SELECTOR);
      if (containerEl) return containerEl;
      const buttonEl = root.querySelector(VOLUME_BUTTON_SELECTOR);
      return buttonEl?.closest?.(VOLUME_CONTAINER_SELECTOR) || buttonEl || null;
    };

    const card = getMediaCard(video);
    if (card) return resolveInScope(card);

    let scope: Element | null = video?.parentElement || null;
    for (let depth = 0; scope && depth < 14; depth++) {
      const found = resolveInScope(scope);
      if (found) return found;
      scope = scope.parentElement;
    }
    return null;
  }

  function dispatchHoverEvents(target: Element | null, entering: boolean): void {
    if (!target) return;
    // 仅派发 MouseEvent（mouseover 冒泡触发容器悬停），派发 PointerEvent 会阻碍音量条展开
    const types = entering
      ? ['mouseenter', 'mouseover']
      : ['mouseleave', 'mouseout'];
    for (const type of types) {
      try {
        const bubbles = type === 'mouseover' || type === 'mouseout';
        target.dispatchEvent(
          new MouseEventCtor(type, {
            bubbles,
            cancelable: true,
            view: typeof window !== 'undefined' ? window : undefined,
          }),
        );
      } catch {
        // 忽略测试环境或受限环境下的事件构造差异
      }
    }
  }

  function revealNativeVolumeBar(trigger: Element | null): void {
    if (!trigger) return;
    if (revealedTrigger && revealedTrigger !== trigger) {
      dispatchHoverEvents(revealedTrigger, false);
    }
    revealedTrigger = trigger;
    dispatchHoverEvents(trigger, true);

    if (hideRevealTimer) clearTimer(hideRevealTimer);
    hideRevealTimer = setTimer(() => {
      hideRevealTimer = null;
      if (revealedTrigger && !revealedTrigger.matches?.(':hover')) {
        dispatchHoverEvents(revealedTrigger, false);
      }
      revealedTrigger = null;
    }, REVEAL_DURATION);
  }

  // TikTok 将播放器控制 API（setVolume/setMute 等）存放在外层组件 Hook 中；先写入再触发悬停可让音量条直接以目标状态弹出
  function findReactVolumeController(
    video: Element | null,
    trigger: Element | null,
  ): ReactVolumeApi | null {
    const roots = [trigger, video].filter((x): x is Element => Boolean(x));
    for (const el of roots) {
      const fiberKey = Object.keys(el).find(
        (k) =>
          k.startsWith('__reactFiber') ||
          k.startsWith('__reactInternalInstance'),
      );
      if (!fiberKey) continue;
      let fiber = (el as unknown as Record<string, any>)[fiberKey];
      for (let depth = 0; fiber && depth < 25; depth++) {
        if (isReactVolumeApi(fiber.memoizedProps)) {
          return fiber.memoizedProps;
        }
        for (
          let hook = fiber.memoizedState, count = 0;
          hook && count < 50;
          hook = hook.next, count++
        ) {
          const candidate = Array.isArray(hook.memoizedState)
            ? hook.memoizedState[0]
            : hook.memoizedState;
          if (isReactVolumeApi(candidate)) {
            return candidate;
          }
        }
        fiber = fiber.return;
      }
    }
    return null;
  }

  function applyReactVolume(
    reactCtrl: ReactVolumeApi,
    volume: number,
    muted: boolean,
  ): void {
    const setMute = reactCtrl.setMute || reactCtrl.setIsMute;
    const currentMute =
      typeof reactCtrl.getStaticBasicPlayerState === 'function'
        ? reactCtrl.getStaticBasicPlayerState()?.mute
        : reactCtrl.isMute;

    if (muted) {
      reactCtrl.setVolume(volume);
      if (currentMute !== true) setMute?.(true);
    } else {
      if (currentMute !== false) setMute?.(false);
      reactCtrl.setVolume(volume);
    }
  }

  function runWithVolumeLock(
    video: HTMLMediaElement,
    volume: number,
    muted: boolean,
    beforeSync: (() => void) | null,
  ): void {
    // volumechange 事件可能异步触发，短暂静默窗口可避免脚本写入被误判为用户手动调节
    isApplyingVolume = true;
    suppressVolumeChangeUntil = Date.now() + 50;
    try {
      try {
        beforeSync?.();
      } catch {
        // 播放器 Hook 异常时仍继续同步原生媒体音量，避免阻塞按键调节
      }
      syncedVideos.add(video);
      if (video.volume !== volume) video.volume = volume;
      if (video.muted !== muted) video.muted = muted;
    } finally {
      isApplyingVolume = false;
    }
  }

  function applyVolumeToVideo(
    video: HTMLMediaElement | null,
    volume: number,
    muted: boolean,
    syncNativeUI: boolean,
  ): void {
    if (!video) return;
    const trigger = findVolumeTrigger(video);
    const reactCtrl = findReactVolumeController(video, trigger);

    runWithVolumeLock(
      video,
      volume,
      muted,
      reactCtrl ? () => applyReactVolume(reactCtrl, volume, muted) : null,
    );
    if (syncNativeUI && trigger) revealNativeVolumeBar(trigger);
  }

  // 点击视频等非输入元素后先按下 Shift 就会触发 Chromium 的 :focus-visible 外框；按 Shift 期间临时压制并在快捷键命中时失焦，避免红框闪烁
  function ensureFocusGuardStyle(): void {
    if (focusGuardStyleReady || !doc.createElement) return;
    const container = doc.head || doc.documentElement;
    if (!container?.appendChild) return;
    const style = doc.createElement('style');
    style.textContent = `html[${FOCUS_GUARD_ATTR}="1"] :focus-visible { outline: none !important; box-shadow: none !important; }`;
    container.appendChild(style);
    focusGuardStyleReady = true;
  }

  function getNonEditableActiveElement(): HTMLElement | null {
    const active = doc.activeElement as HTMLElement | null;
    if (!active || active === doc.body || active === doc.documentElement) {
      return null;
    }
    if (isEditableTarget(active)) return null;
    return active;
  }

  function clearNonEditableFocus(): void {
    getNonEditableActiveElement()?.blur?.();
  }

  function setShiftFocusGuard(enabled: boolean): void {
    const root = doc.documentElement;
    if (!root?.setAttribute || !root?.removeAttribute) return;
    if (enabled) {
      ensureFocusGuardStyle();
      root.setAttribute(FOCUS_GUARD_ATTR, '1');
    } else {
      root.removeAttribute(FOCUS_GUARD_ATTR);
    }
  }

  function isShiftKeyEvent(e: { key?: string; code?: string }): boolean {
    return (
      e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight'
    );
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (isShiftKeyEvent(e) && !e.repeat && !e.altKey && !e.ctrlKey && !e.metaKey) {
      if (getNonEditableActiveElement()) setShiftFocusGuard(true);
      return;
    }

    const direction = getVolumeDirection(e);
    if (!direction) return;

    const target = e.composedPath?.()[0] || e.target;
    if (isEditableTarget(target)) return;

    const video = getActiveVideo();
    if (!video) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation?.();
    clearNonEditableFocus();

    const next = computeNextVolumeState(video.volume, video.muted, direction);
    saveVolumeState(next.volume, next.muted);
    applyVolumeToVideo(video, next.volume, next.muted, true);
  }

  function handleKeyUp(e: { key?: string; code?: string }): void {
    if (isShiftKeyEvent(e)) {
      setShiftFocusGuard(false);
    }
  }

  function handleMediaActivation(e: { target: unknown }): void {
    const media = e.target;
    if (!isMediaElement(media)) return;

    if (
      savedState &&
      (clampVolume(media.volume) !== savedState.volume ||
        Boolean(media.muted) !== savedState.muted)
    ) {
      applyVolumeToVideo(media, savedState.volume, savedState.muted, false);
    } else {
      syncedVideos.add(media);
    }
  }

  function handleVolumeChange(e: { target: unknown }): void {
    if (isApplyingVolume || Date.now() < suppressVolumeChangeUntil) return;
    const media = e.target;
    if (!isMediaElement(media) || !syncedVideos.has(media)) return;
    if (media !== getActiveVideo()) return;

    saveVolumeState(media.volume, media.muted);
  }

  function initVolumeControl(): void {
    win.addEventListener('keydown', handleKeyDown as EventListener, true);
    win.addEventListener('keyup', handleKeyUp as EventListener, true);
    win.addEventListener('blur', () => setShiftFocusGuard(false));
    win.addEventListener(
      'play',
      handleMediaActivation as unknown as EventListener,
      true,
    );
    win.addEventListener(
      'playing',
      handleMediaActivation as unknown as EventListener,
      true,
    );
    win.addEventListener(
      'loadedmetadata',
      handleMediaActivation as unknown as EventListener,
      true,
    );
    win.addEventListener(
      'volumechange',
      handleVolumeChange as unknown as EventListener,
      true,
    );
  }

  function init(): void {
    initAutoCollapseSidebar();
    initVolumeControl();
  }

  return {
    initAutoCollapseSidebar,
    initVolumeControl,
    handleKeyDown,
    handleKeyUp,
    handleMediaActivation,
    handleVolumeChange,
    init,
  };
}
