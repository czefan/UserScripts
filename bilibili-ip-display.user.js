// ==UserScript==
// @name         B站评论区开盒
// @namespace    https://github.com/czefan/UserScripts
// @version      0.1.1
// @description  在 B 站评论区显示用户 IP 属地
// @author       czefan
// @license      GPL-3.0
// @icon         https://www.bilibili.com/favicon.ico
// @homepageURL  https://github.com/czefan/UserScripts
// @supportURL   https://github.com/czefan/UserScripts/issues
// @match        *://*.bilibili.com/*
// @exclude      *://member.bilibili.com*
// @updateURL    https://raw.githubusercontent.com/czefan/UserScripts/release/bilibili-ip-display.meta.js
// @downloadURL  https://raw.githubusercontent.com/czefan/UserScripts/release/bilibili-ip-display.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

"use strict";
(() => {
  // shared/dom.ts
  function injectStyle(css, options = {}) {
    const doc = options.doc ?? document;
    if (options.id) {
      const existing = doc.getElementById(options.id);
      if (existing instanceof HTMLStyleElement) {
        return existing;
      }
    }
    const style = doc.createElement("style");
    if (options.id) {
      style.id = options.id;
    }
    style.textContent = css;
    (doc.head || doc.documentElement).appendChild(style);
    return style;
  }

  // userscripts/bilibili-ip-display/ip-display.ts
  var BILI_STYLE = `
        .reply-location {
          color: #9499A0;
          font-size: 13px;
          margin-right: 20px;
        }
        .reply-location.vue-style { margin-left: 8px; }
      `;
  var ELEMENT_NODE = 1;
  var BILI_TAG_PATTERN = /^BILI-(COMMENT|REPLY)/i;
  var VUE_TIME_SELECTOR = ".reply-time, .sub-reply-time";
  var COMMENT_ROOT_SELECTOR = "#comment, bili-comments";
  function addedRoots(mutations) {
    const roots = /* @__PURE__ */ new Set();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === ELEMENT_NODE) {
          roots.add(node);
        }
      }
    }
    return [...roots].filter((node) => {
      for (let parent = node.parentNode; parent; parent = parent.parentNode) {
        if (roots.has(parent)) return false;
      }
      return true;
    });
  }
  function createIpDisplayController(deps = {}) {
    const doc = deps.doc ?? document;
    const Observer = deps.Observer ?? MutationObserver;
    const labels = /* @__PURE__ */ new WeakMap();
    const shadowWatchers = /* @__PURE__ */ new WeakMap();
    let commentApp = null;
    function handleNode(node, item, className) {
      const location = item?.reply_control?.location;
      let label = labels.get(node);
      if (!location) {
        label?.remove();
        labels.delete(node);
        return;
      }
      if (!label) {
        label = doc.createElement("span");
        label.className = `reply-location ${className ?? ""}`;
        labels.set(node, label);
      }
      if (label.textContent !== location) label.textContent = location;
      if (node.nextSibling !== label) node.after(label);
    }
    function checkVueNodes(addedNodes) {
      for (const rootNode of addedNodes) {
        if (rootNode.nodeType !== ELEMENT_NODE) continue;
        const rootEl = rootNode;
        const nodes = rootEl.matches(VUE_TIME_SELECTOR) ? [rootEl] : rootEl.querySelectorAll(VUE_TIME_SELECTOR);
        for (const node of nodes) {
          const vueComp = node.__vueParentComponent;
          const item = vueComp?.props?.reply || vueComp?.props?.subReply;
          if (item) {
            handleNode(node, item, "vue-style");
          }
        }
      }
    }
    function scanShadowHosts(root) {
      const visit = (node) => {
        if (BILI_TAG_PATTERN.test(node.tagName) && node.shadowRoot) {
          watchShadow(node.shadowRoot);
        }
      };
      if ("tagName" in root) {
        visit(root);
      }
      if (root.firstElementChild) {
        for (const node of root.querySelectorAll("*")) {
          visit(node);
        }
      }
    }
    function watchShadow(shadow) {
      const existing = shadowWatchers.get(shadow);
      if (existing) {
        existing();
        return;
      }
      let previousPubdate = null;
      const update = () => {
        const pubdate = shadow.getElementById("pubdate");
        if (previousPubdate && previousPubdate !== pubdate) {
          handleNode(previousPubdate, null);
        }
        previousPubdate = pubdate;
        const item = shadow.host?.data;
        if (pubdate && item) handleNode(pubdate, item, "lit-style");
      };
      shadowWatchers.set(shadow, update);
      const observer = new Observer((mutations) => {
        update();
        for (const node of addedRoots(mutations)) {
          scanShadowHosts(node);
        }
      });
      observer.observe(shadow, {
        childList: true,
        characterData: true,
        subtree: true
      });
      update();
      scanShadowHosts(shadow);
    }
    const commentObserver = new Observer((mutations) => {
      const changedTimes = /* @__PURE__ */ new Set();
      for (const mutation of mutations) {
        const target = mutation.target.nodeType === ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        const time = target?.closest(VUE_TIME_SELECTOR);
        if (time) changedTimes.add(time);
      }
      checkVueNodes(changedTimes);
      const roots = addedRoots(mutations);
      checkVueNodes(roots);
      for (const node of roots) scanShadowHosts(node);
    });
    function bindCommentApp() {
      const next = doc.getElementById("comment") || doc.querySelector("bili-comments");
      if (next === commentApp) return;
      commentObserver.disconnect();
      commentApp = next;
      if (commentApp) {
        commentObserver.observe(commentApp, {
          childList: true,
          characterData: true,
          subtree: true
        });
        checkVueNodes([commentApp]);
        scanShadowHosts(commentApp);
      }
    }
    function onDocumentMutations(mutations) {
      if (commentApp?.isConnected) return;
      if (commentApp || addedRoots(mutations).some(
        (node) => node.matches(COMMENT_ROOT_SELECTOR) || Boolean(node.querySelector(COMMENT_ROOT_SELECTOR))
      )) {
        bindCommentApp();
      }
    }
    return {
      handleNode,
      checkVueNodes,
      scanShadowHosts,
      watchShadow,
      bindCommentApp,
      onDocumentMutations,
      commentObserver
    };
  }
  function initIpDisplay(doc = document) {
    const controller = createIpDisplayController({ doc });
    const origAttach = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(options) {
      const shadow = origAttach.call(this, options);
      if (BILI_TAG_PATTERN.test(this.tagName)) {
        controller.watchShadow(shadow);
      }
      return shadow;
    };
    injectStyle(BILI_STYLE, { doc });
    const globalObserver = new MutationObserver(
      (mutations) => controller.onDocumentMutations(mutations)
    );
    globalObserver.observe(doc.documentElement, {
      childList: true,
      subtree: true
    });
    controller.bindCommentApp();
    controller.scanShadowHosts(doc.documentElement);
  }

  // userscripts/bilibili-ip-display/index.ts
  initIpDisplay();
})();
