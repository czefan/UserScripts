// ==UserScript==
// @name         TikTok 增强
// @namespace    https://github.com/czefan/UserScripts
// @version      0.1.2
// @description  自动折叠 TikTok 侧边栏，支持 Shift + ↑ / ↓ 快捷键调节音量并同步官方音量条
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
  var REVEAL_DURATION = 1400;
  var CHROME_BRIGHT_ATTR = "data-tt-chrome-bright";
  var MEDIA_CARD_SELECTOR = '[data-e2e="feed-video"], [data-e2e="recommend-list-item-container"], [class*="SectionMediaCardContainer"], article, section';
  var VOLUME_TRIGGER_SELECTOR = '[data-e2e="cinema-playback-control-volume"], [data-cinema-playback-control="volume"]';
  var PLAYBACK_CHROME_SELECTOR = '[data-e2e="anchoring-playback-chrome"]';
  function clampVolume(value) {
    return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
  }
  function isEditableTarget(target) {
    if (!target || typeof target !== "object") return false;
    const el = target;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(el.isContentEditable);
  }
  function getVolumeDirection(e) {
    if (!e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return 0;
    if (e.code === "ArrowUp" || e.key === "ArrowUp") return 1;
    if (e.code === "ArrowDown" || e.key === "ArrowDown") return -1;
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
  function createTikTokEnhancer(deps = {}) {
    const doc = deps.doc ?? document;
    const win = deps.win ?? window;
    const Observer = deps.Observer ?? MutationObserver;
    const PointerEventCtor = deps.PointerEventCtor ?? (typeof PointerEvent !== "undefined" ? PointerEvent : void 0);
    const setTimer = deps.setTimer ?? setTimeout;
    const clearTimer = deps.clearTimer ?? clearTimeout;
    let revealedTrigger = null;
    let hideRevealTimer = null;
    let chromeBrightStyleReady = false;
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
    function getMediaVisualBox(media) {
      if (!media) return null;
      return media.tagName === "AUDIO" ? media.closest?.(MEDIA_CARD_SELECTOR) || media.parentElement || media : media;
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
    function dispatchHoverEvents(target, entering) {
      if (!target || !PointerEventCtor) return;
      const events = entering ? [
        ["pointerenter", false],
        ["pointerover", true]
      ] : [
        ["pointerleave", false],
        ["pointerout", true]
      ];
      for (const [type, bubbles] of events) {
        try {
          target.dispatchEvent(
            new PointerEventCtor(type, {
              bubbles,
              cancelable: true,
              pointerType: "mouse",
              view: typeof window !== "undefined" ? window : void 0
            })
          );
        } catch {
        }
      }
    }
    function setPlaybackChromeBright(enabled) {
      const root = doc.documentElement;
      if (!root?.setAttribute || !root?.removeAttribute) return;
      if (enabled) {
        if (!chromeBrightStyleReady && doc.createElement) {
          const container = doc.head || root;
          if (container?.appendChild) {
            const style = doc.createElement("style");
            style.textContent = `html[${CHROME_BRIGHT_ATTR}="1"] ${PLAYBACK_CHROME_SELECTOR}[data-clean="idle"] > * { opacity: 1 !important; }`;
            container.appendChild(style);
            chromeBrightStyleReady = true;
          }
        }
        root.setAttribute(CHROME_BRIGHT_ATTR, "1");
      } else {
        root.removeAttribute(CHROME_BRIGHT_ATTR);
      }
    }
    function revealNativeVolumeBar(trigger) {
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
        if (revealedTrigger && !revealedTrigger.matches?.(":hover")) {
          dispatchHoverEvents(revealedTrigger, false);
        }
        revealedTrigger = null;
        setPlaybackChromeBright(false);
      }, REVEAL_DURATION);
    }
    function findOnVolumeChange(trigger) {
      if (!trigger) return null;
      const fiberKey = Object.keys(trigger).find(
        (k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance")
      );
      if (!fiberKey) return null;
      let fiber = trigger[fiberKey];
      for (let depth = 0; fiber && depth < 15; depth++) {
        const handler = fiber.memoizedProps?.onVolumeChange;
        if (typeof handler === "function") return handler;
        fiber = fiber.return;
      }
      return null;
    }
    function applyVolumeToVideo(video, volume, muted) {
      const trigger = doc.querySelector?.(VOLUME_TRIGGER_SELECTOR) || null;
      const changed = volume !== clampVolume(video.volume) || muted !== Boolean(video.muted);
      if (changed) {
        const onVolumeChange = findOnVolumeChange(trigger);
        try {
          onVolumeChange?.(volume);
        } catch {
        }
        if (video.volume !== volume) video.volume = volume;
        if (video.muted !== muted) video.muted = muted;
      }
      if (trigger) revealNativeVolumeBar(trigger);
    }
    function handleKeyDown(e) {
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
    function initVolumeControl() {
      win.addEventListener("keydown", handleKeyDown, true);
    }
    function init() {
      initAutoCollapseSidebar();
      initVolumeControl();
    }
    return {
      initAutoCollapseSidebar,
      initVolumeControl,
      handleKeyDown,
      init
    };
  }

  // userscripts/tiktok-enhanced/index.ts
  if (window.top === window) {
    createTikTokEnhancer().init();
  }
})();
