// ==UserScript==
// @name         TikTok 增强
// @namespace    https://github.com/czefan/UserScripts
// @version      0.1.0
// @description  自动折叠 TikTok 侧边栏，支持 Shift + / Shift - 快捷键调节音量并同步官方音量条
// @author       czefan
// @license      GPL-3.0
// @icon         https://www.google.com/s2/favicons?sz=64&domain=tiktok.com
// @homepageURL  https://github.com/czefan/UserScripts
// @supportURL   https://github.com/czefan/UserScripts/issues
// @match        https://www.tiktok.com/
// @updateURL    https://raw.githubusercontent.com/czefan/UserScripts/release/tiktok-enhanced.meta.js
// @downloadURL  https://raw.githubusercontent.com/czefan/UserScripts/release/tiktok-enhanced.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // userscripts/tiktok-enhanced/enhanced.ts
  var VOLUME_STEP = 0.05;
  var UNMUTE_START_VOLUME = 0.1;
  var STORAGE_KEY = "tiktok_enhanced_volume";
  var REVEAL_DURATION = 1400;
  var FOCUS_GUARD_ATTR = "data-tt-shift-focus-guard";
  var MEDIA_CARD_SELECTOR = '[data-e2e="feed-video"], [data-e2e="recommend-list-item-container"], [class*="SectionMediaCardContainer"], article, section';
  var VOLUME_CONTAINER_SELECTOR = '[class*="VolumeControlContainer"], [class*="VoiceControl"], [class*="SoundControl"], [class*="VolumeControl"]';
  var VOLUME_BUTTON_SELECTOR = '[data-e2e="video-sound"], [data-e2e="video-volume"], button[aria-label*="Volume" i], button[aria-label*="音量"], [aria-label*="Mute" i]';
  function clampVolume(value) {
    return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
  }
  function isMediaElement(el) {
    return Boolean(
      el && typeof el === "object" && (el.tagName === "VIDEO" || el.tagName === "AUDIO")
    );
  }
  function isEditableTarget(target) {
    if (!target || typeof target !== "object") return false;
    const el = target;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(el.isContentEditable);
  }
  function getVolumeDirection(e) {
    if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return 0;
    if (e.code === "Equal" || e.code === "NumpadAdd" || e.key === "+") return 1;
    if (e.code === "Minus" || e.code === "NumpadSubtract" || e.key === "_" || e.key === "-") {
      return -1;
    }
    return 0;
  }
  function computeNextVolumeState(currentVolume, currentMuted, direction) {
    if (currentMuted) {
      return direction > 0 ? { volume: UNMUTE_START_VOLUME, muted: false } : { volume: 0, muted: true };
    }
    const base = clampVolume(
      typeof currentVolume === "number" && !Number.isNaN(currentVolume) ? currentVolume : 1
    );
    if (direction > 0) {
      return { volume: clampVolume(base + VOLUME_STEP), muted: false };
    }
    const nextVol = clampVolume(base - VOLUME_STEP);
    return { volume: nextVol, muted: nextVol <= 0 };
  }
  function isReactVolumeApi(obj) {
    if (!obj || typeof obj !== "object") return false;
    const candidate = obj;
    return typeof candidate.setVolume === "function" && (typeof candidate.setMute === "function" || typeof candidate.setIsMute === "function");
  }
  function createTikTokEnhancer(deps = {}) {
    const doc = deps.doc ?? document;
    const win = deps.win ?? window;
    const storage = deps.storage ?? localStorage;
    const Observer = deps.Observer ?? MutationObserver;
    const MouseEventCtor = deps.MouseEventCtor ?? MouseEvent;
    const setTimer = deps.setTimer ?? setTimeout;
    const clearTimer = deps.clearTimer ?? clearTimeout;
    let savedState = loadVolumeState();
    let isApplyingVolume = false;
    let suppressVolumeChangeUntil = 0;
    const syncedVideos = /* @__PURE__ */ new WeakSet();
    let revealedTrigger = null;
    let hideRevealTimer = null;
    let focusGuardStyleReady = false;
    function loadVolumeState() {
      try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (typeof parsed?.volume !== "number" || Number.isNaN(parsed.volume)) {
          return null;
        }
        return {
          volume: clampVolume(parsed.volume),
          muted: Boolean(parsed.muted)
        };
      } catch {
        return null;
      }
    }
    function saveVolumeState(volume, muted) {
      savedState = {
        volume: clampVolume(volume),
        muted: Boolean(muted)
      };
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(savedState));
      } catch {
      }
    }
    function initAutoCollapseSidebar() {
      const obs = new Observer(() => {
        const btn = doc.querySelector(
          '[class*="DivToggleTrigger"], [class*="e1hzmt9p0"]'
        );
        if (!btn) return;
        const label = btn.getAttribute?.("aria-label") || "";
        if (!/expand|展开/i.test(label)) btn.click();
        obs.disconnect();
      });
      obs.observe(doc.documentElement, { childList: true, subtree: true });
      setTimer(() => obs.disconnect(), 15e3);
    }
    function getMediaCard(media) {
      return media?.closest?.(MEDIA_CARD_SELECTOR) || null;
    }
    function getMediaVisualBox(media) {
      if (!media) return null;
      return media.tagName === "AUDIO" ? getMediaCard(media) || media.parentElement || media : media;
    }
    function getActiveVideo() {
      const all = doc.querySelectorAll("video, audio");
      if (!all.length) return null;
      for (const m of all) {
        if (!m.paused && m.duration > 0) return m;
      }
      const cy = win.innerHeight / 2;
      let best = null;
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
    function findVolumeTrigger(video) {
      const resolveInScope = (root) => {
        if (!root?.querySelector) return null;
        const containerEl = root.querySelector(VOLUME_CONTAINER_SELECTOR);
        if (containerEl) return containerEl;
        const buttonEl = root.querySelector(VOLUME_BUTTON_SELECTOR);
        return buttonEl?.closest?.(VOLUME_CONTAINER_SELECTOR) || buttonEl || null;
      };
      const card = getMediaCard(video);
      if (card) return resolveInScope(card);
      let scope = video?.parentElement || null;
      for (let depth = 0; scope && depth < 14; depth++) {
        const found = resolveInScope(scope);
        if (found) return found;
        scope = scope.parentElement;
      }
      return null;
    }
    function dispatchHoverEvents(target, entering) {
      if (!target) return;
      const types = entering ? ["mouseenter", "mouseover"] : ["mouseleave", "mouseout"];
      for (const type of types) {
        try {
          const bubbles = type === "mouseover" || type === "mouseout";
          target.dispatchEvent(
            new MouseEventCtor(type, {
              bubbles,
              cancelable: true,
              view: typeof window !== "undefined" ? window : void 0
            })
          );
        } catch {
        }
      }
    }
    function revealNativeVolumeBar(trigger) {
      if (!trigger) return;
      if (revealedTrigger && revealedTrigger !== trigger) {
        dispatchHoverEvents(revealedTrigger, false);
      }
      revealedTrigger = trigger;
      dispatchHoverEvents(trigger, true);
      if (hideRevealTimer) clearTimer(hideRevealTimer);
      hideRevealTimer = setTimer(() => {
        hideRevealTimer = null;
        if (revealedTrigger && !revealedTrigger.matches?.(":hover")) {
          dispatchHoverEvents(revealedTrigger, false);
        }
        revealedTrigger = null;
      }, REVEAL_DURATION);
    }
    function findReactVolumeController(video, trigger) {
      const roots = [trigger, video].filter((x) => Boolean(x));
      for (const el of roots) {
        const fiberKey = Object.keys(el).find(
          (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
        );
        if (!fiberKey) continue;
        let fiber = el[fiberKey];
        for (let depth = 0; fiber && depth < 25; depth++) {
          if (isReactVolumeApi(fiber.memoizedProps)) {
            return fiber.memoizedProps;
          }
          for (let hook = fiber.memoizedState, count = 0; hook && count < 50; hook = hook.next, count++) {
            const candidate = Array.isArray(hook.memoizedState) ? hook.memoizedState[0] : hook.memoizedState;
            if (isReactVolumeApi(candidate)) {
              return candidate;
            }
          }
          fiber = fiber.return;
        }
      }
      return null;
    }
    function applyReactVolume(reactCtrl, volume, muted) {
      const setMute = reactCtrl.setMute || reactCtrl.setIsMute;
      const currentMute = typeof reactCtrl.getStaticBasicPlayerState === "function" ? reactCtrl.getStaticBasicPlayerState()?.mute : reactCtrl.isMute;
      if (muted) {
        reactCtrl.setVolume(volume);
        if (currentMute !== true) setMute?.(true);
      } else {
        if (currentMute !== false) setMute?.(false);
        reactCtrl.setVolume(volume);
      }
    }
    function runWithVolumeLock(video, volume, muted, beforeSync) {
      isApplyingVolume = true;
      suppressVolumeChangeUntil = Date.now() + 50;
      try {
        try {
          beforeSync?.();
        } catch {
        }
        syncedVideos.add(video);
        if (video.volume !== volume) video.volume = volume;
        if (video.muted !== muted) video.muted = muted;
      } finally {
        isApplyingVolume = false;
      }
    }
    function applyVolumeToVideo(video, volume, muted, syncNativeUI) {
      if (!video) return;
      const trigger = findVolumeTrigger(video);
      const reactCtrl = findReactVolumeController(video, trigger);
      runWithVolumeLock(
        video,
        volume,
        muted,
        reactCtrl ? () => applyReactVolume(reactCtrl, volume, muted) : null
      );
      if (syncNativeUI && trigger) revealNativeVolumeBar(trigger);
    }
    function ensureFocusGuardStyle() {
      if (focusGuardStyleReady || !doc.createElement) return;
      const container = doc.head || doc.documentElement;
      if (!container?.appendChild) return;
      const style = doc.createElement("style");
      style.textContent = `html[${FOCUS_GUARD_ATTR}="1"] :focus-visible { outline: none !important; box-shadow: none !important; }`;
      container.appendChild(style);
      focusGuardStyleReady = true;
    }
    function getNonEditableActiveElement() {
      const active = doc.activeElement;
      if (!active || active === doc.body || active === doc.documentElement) {
        return null;
      }
      if (isEditableTarget(active)) return null;
      return active;
    }
    function clearNonEditableFocus() {
      getNonEditableActiveElement()?.blur?.();
    }
    function setShiftFocusGuard(enabled) {
      const root = doc.documentElement;
      if (!root?.setAttribute || !root?.removeAttribute) return;
      if (enabled) {
        ensureFocusGuardStyle();
        root.setAttribute(FOCUS_GUARD_ATTR, "1");
      } else {
        root.removeAttribute(FOCUS_GUARD_ATTR);
      }
    }
    function isShiftKeyEvent(e) {
      return e.key === "Shift" || e.code === "ShiftLeft" || e.code === "ShiftRight";
    }
    function handleKeyDown(e) {
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
    function handleKeyUp(e) {
      if (isShiftKeyEvent(e)) {
        setShiftFocusGuard(false);
      }
    }
    function handleMediaActivation(e) {
      const media = e.target;
      if (!isMediaElement(media)) return;
      if (savedState && (clampVolume(media.volume) !== savedState.volume || Boolean(media.muted) !== savedState.muted)) {
        applyVolumeToVideo(media, savedState.volume, savedState.muted, false);
      } else {
        syncedVideos.add(media);
      }
    }
    function handleVolumeChange(e) {
      if (isApplyingVolume || Date.now() < suppressVolumeChangeUntil) return;
      const media = e.target;
      if (!isMediaElement(media) || !syncedVideos.has(media)) return;
      if (media !== getActiveVideo()) return;
      saveVolumeState(media.volume, media.muted);
    }
    function initVolumeControl() {
      win.addEventListener("keydown", handleKeyDown, true);
      win.addEventListener("keyup", handleKeyUp, true);
      win.addEventListener("blur", () => setShiftFocusGuard(false));
      win.addEventListener(
        "play",
        handleMediaActivation,
        true
      );
      win.addEventListener(
        "playing",
        handleMediaActivation,
        true
      );
      win.addEventListener(
        "loadedmetadata",
        handleMediaActivation,
        true
      );
      win.addEventListener(
        "volumechange",
        handleVolumeChange,
        true
      );
    }
    function init() {
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
      init
    };
  }

  // userscripts/tiktok-enhanced/index.ts
  if (window.top === window) {
    createTikTokEnhancer().init();
  }
})();
