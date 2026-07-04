// ==UserScript==
// @name         B站评论区开盒
// @namespace    https://github.com/czefan/UserScripts
// @version      1.0.0
// @description  在 B 站评论区显示用户 IP 属地
// @author       czefan
// @match        *://*.bilibili.com/*
// @exclude      *://member.bilibili.com*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // 已处理的评论节点记录
  const processedNodes = new WeakSet();

  // 创建并插入 IP 属地标签
  function handleNode(node, item, className) {
    const location = item?.reply_control?.location;
    if (location && !processedNodes.has(node)) {
      processedNodes.add(node);
      node.after(
        Object.assign(document.createElement("span"), {
          className: `reply-location ${className}`,
          textContent: location,
        })
      );
    }
  }

  // 增量解析 Vue3 评论节点
  function checkVueNodes(addedNodes) {
    const selector = ".reply-time, .sub-reply-time";
    for (const rootNode of addedNodes) {
      if (rootNode.nodeType !== Node.ELEMENT_NODE) continue;

      const nodes = rootNode.matches(selector) ? [rootNode] : rootNode.querySelectorAll(selector);
      for (const node of nodes) {
        if (processedNodes.has(node)) continue;
        const vueComp = node.__vueParentComponent;
        const item = vueComp?.props?.reply || vueComp?.props?.subReply;
        if (item) {
          handleNode(node, item, "vue-style");
        }
      }
    }
  }

  // 拦截 Shadow DOM 创建，只观察 B 站评论与回复相关的组件
  const origAttach = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function (options) {
    const shadow = origAttach.call(this, options);

    if (/^(BILI-(COMMENT|REPLY))/i.test(this.tagName)) {
      const observer = new MutationObserver((_, obs) => {
        const pubdate = shadow.getElementById("pubdate");
        if (pubdate) {
          obs.disconnect(); // 渲染完成后立即释放观察器
          const item = shadow.host?.data;
          if (item) {
            handleNode(pubdate, item, "lit-style");
          }
        }
      });
      observer.observe(shadow, { childList: true, subtree: true });
    }
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
        .reply-location.lit-style { margin-left: 20px; }
      `,
    })
  );

  // 动态收窄监听范围，只监听评论容器变动，规避全局弹幕等 DOM 消耗
  let isGlobal = true;
  const globalObserver = new MutationObserver((mutations) => {
    if (isGlobal) {
      const commentApp = document.getElementById("comment") || document.querySelector("bili-comments");
      if (commentApp) {
        isGlobal = false;
        globalObserver.disconnect();
        globalObserver.observe(commentApp, { childList: true, subtree: true });
        checkVueNodes([commentApp]);
        return;
      }
    }

    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        checkVueNodes(mutation.addedNodes);
      }
    }
  });

  // 全局启动监听，用于捕获评论区容器载入
  globalObserver.observe(document.documentElement, { childList: true, subtree: true });
})();
