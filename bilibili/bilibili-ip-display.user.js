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
      if (className === "lit-style") {
        // Shadow DOM 内继承组件主题，只显式补充标签间距。
        label.style.marginLeft = "20px";
        label.style.marginRight = "20px";
      }
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

  function scanShadowHosts(root) {
    const nodes = [root, ...root.querySelectorAll("*")];
    for (const node of nodes) {
      if (/^BILI-(COMMENT|REPLY)/i.test(node.tagName) && node.shadowRoot) {
        watchShadow(node.shadowRoot);
      }
    }
  }

  function watchShadow(shadow) {
    const existing = shadowWatchers.get(shadow);
    if (existing) { existing(); return; }
    let previousPubdate = null;
    const update = () => {
      const pubdate = shadow.getElementById("pubdate");
      if (previousPubdate && previousPubdate !== pubdate) {
        labels.get(previousPubdate)?.remove();
        labels.delete(previousPubdate);
      }
      previousPubdate = pubdate;
      const item = shadow.host?.data;
      if (pubdate && item) handleNode(pubdate, item, "lit-style");
    };
    shadowWatchers.set(shadow, update);
    const observer = new MutationObserver(mutations => {
      update();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) scanShadowHosts(node);
        }
      }
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
    for (const mutation of mutations) {
      const target = mutation.target.nodeType === Node.ELEMENT_NODE
        ? mutation.target : mutation.target.parentElement;
      if (target) checkVueNodes([target]);
      checkVueNodes(mutation.addedNodes);
    }
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

  const globalObserver = new MutationObserver(() => bindCommentApp());
  globalObserver.observe(document.documentElement, { childList: true, subtree: true });
  bindCommentApp();
  scanShadowHosts(document.documentElement);
})();
