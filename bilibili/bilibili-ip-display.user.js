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
// @updateURL    https://raw.githubusercontent.com/czefan/UserScripts/main/bilibili/bilibili-ip-display.user.js
// @downloadURL  https://raw.githubusercontent.com/czefan/UserScripts/main/bilibili/bilibili-ip-display.user.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // 标签与时间节点关联；组件复用节点时更新已有标签。
  const labels = new WeakMap();

  function handleNode(node, item, className) {
    const location = item?.reply_control?.location;
    let label = labels.get(node);
    if (!location) {
      label?.remove();
      labels.delete(node);
      return;
    }
    if (!label) {
      label = document.createElement("span");
      label.className = `reply-location ${className}`;
      labels.set(node, label);
    }
    if (label.textContent !== location) label.textContent = location;
    if (node.nextSibling !== label) node.after(label);
  }

  // 增量解析 Vue3 评论节点
  function checkVueNodes(addedNodes) {
    const selector = ".reply-time, .sub-reply-time";
    for (const rootNode of addedNodes) {
      if (rootNode.nodeType !== Node.ELEMENT_NODE) continue;

      const nodes = rootNode.matches(selector) ? [rootNode] : rootNode.querySelectorAll(selector);
      for (const node of nodes) {
        const vueComp = node.__vueParentComponent;
        const item = vueComp?.props?.reply || vueComp?.props?.subReply;
        if (item) {
          handleNode(node, item, "vue-style");
        }
      }
    }
  }

  const shadowWatchers = new WeakMap();

  // 同一批变更只扫描最外层新增子树，避免父子节点重复遍历。
  function addedRoots(mutations) {
    const roots = new Set();
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) roots.add(node);
      }
    }
    return [...roots].filter(node => {
      for (let parent = node.parentNode; parent; parent = parent.parentNode) {
        if (roots.has(parent)) return false;
      }
      return true;
    });
  }

  function scanShadowHosts(root) {
    const visit = node => {
      if (/^BILI-(COMMENT|REPLY)/i.test(node.tagName) && node.shadowRoot) {
        watchShadow(node.shadowRoot);
      }
    };
    visit(root);
    if (root.firstElementChild) {
      for (const node of root.querySelectorAll("*")) visit(node);
    }
  }

  function watchShadow(shadow) {
    const existing = shadowWatchers.get(shadow);
    if (existing) { existing(); return; }
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
    const observer = new MutationObserver(mutations => {
      update();
      for (const node of addedRoots(mutations)) scanShadowHosts(node);
    });
    observer.observe(shadow, { childList: true, characterData: true, subtree: true });
    update();
    scanShadowHosts(shadow);
  }

  // 截获新组件，并补扫注入前已创建的 open Shadow Root。
  const origAttach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (options) {
    const shadow = origAttach.call(this, options);
    if (/^BILI-(COMMENT|REPLY)/i.test(this.tagName)) watchShadow(shadow);
    return shadow;
  };

  // 注入全局评论区样式
  (document.head || document.documentElement).appendChild(
    Object.assign(document.createElement("style"), {
      textContent: `
        .reply-location {
          color: #9499A0;
          font-size: 13px;
          margin-right: 20px;
        }
        .reply-location.vue-style { margin-left: 8px; }
      `,
    })
  );

  // 评论内部由专用观察器处理，文档观察器只负责发现/替换评论容器。
  let commentApp = null;
  const commentObserver = new MutationObserver(mutations => {
    const changedTimes = new Set();
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === Node.ELEMENT_NODE
        ? mutation.target : mutation.target.parentElement;
      const time = target?.closest(".reply-time, .sub-reply-time");
      if (time) changedTimes.add(time);
    }
    // 更新已有时间节点时只处理该节点，不扫描整个评论列表。
    checkVueNodes(changedTimes);
    const roots = addedRoots(mutations);
    checkVueNodes(roots);
    for (const node of roots) scanShadowHosts(node);
  });

  function bindCommentApp() {
    const next = document.getElementById("comment") || document.querySelector("bili-comments");
    if (next === commentApp) return;
    commentObserver.disconnect();
    commentApp = next;
    if (commentApp) {
      commentObserver.observe(commentApp, { childList: true, characterData: true, subtree: true });
      checkVueNodes([commentApp]);
      scanShadowHosts(commentApp);
    }
  }

  function onDocumentMutations(mutations) {
    // 评论容器仍在页面中时，无关页面更新无需再次查询文档。
    if (commentApp?.isConnected) return;
    // 已有容器被移除，或新增子树包含评论容器时，才重新定位。
    if (commentApp || addedRoots(mutations).some(node =>
      node.matches("#comment, bili-comments") || node.querySelector("#comment, bili-comments")
    )) {
      bindCommentApp();
    }
  }

  const globalObserver = new MutationObserver(onDocumentMutations);
  globalObserver.observe(document.documentElement, { childList: true, subtree: true });
  bindCommentApp();
  scanShadowHosts(document.documentElement);
})();
