// ==UserScript==
// @name         XJTU-Enhanced-PC
// @namespace    https://github.com/czefan/UserScripts
// @version      0.1.0
// @description  优化 xjtu 网站（PC 版）
// @author       czefan
// @license      GPL-3.0
// @icon         https://www.xjtu.edu.cn/favicon.ico
// @homepageURL  https://github.com/czefan/UserScripts
// @supportURL   https://github.com/czefan/UserScripts/issues
// @match        *://jwc.xjtu.edu.cn/*
// @match        *://dean.xjtu.edu.cn/*
// @match        *://jwxt.xjtu.edu.cn/*
// @match        *://ehall.xjtu.edu.cn/*
// @match        *://lms.xjtu.edu.cn/*
// @match        *://class.xjtu.edu.cn/*
// @updateURL    https://raw.githubusercontent.com/czefan/UserScripts/release/xjtu-enhanced-pc.meta.js
// @downloadURL  https://raw.githubusercontent.com/czefan/UserScripts/release/xjtu-enhanced-pc.user.js
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

  // userscripts/xjtu-enhanced-pc/enhanced.ts
  var DEAN_STYLE = `
            .wow, .animated {
                visibility: visible !important;
                opacity: 1 !important;
                animation: none !important;
            }
        `;
  var JWXT_STYLE = `
            .mbsz-sc-panel-thingNoImg-1-title {
                white-space: normal !important;
                width: auto !important;
            }
        `;
  function init(doc = document, loc = window.location, openFn = window.open.bind(window)) {
    const host = loc.hostname;
    const path = loc.pathname;
    if (host.includes("dean.xjtu.edu.cn") || host.includes("jwc.xjtu.edu.cn")) {
      injectStyle(DEAN_STYLE, { doc });
    }
    if (host.includes("jwxt.xjtu.edu.cn") || host.includes("ehall.xjtu.edu.cn")) {
      injectStyle(JWXT_STYLE, { doc });
    }
    if ((host.includes("lms.xjtu.edu.cn") || host.includes("class.xjtu.edu.cn")) && path.includes("/lesson")) {
      const courseId = path.match(/\/course\/(\d+)/)?.[1];
      doc.addEventListener(
        "click",
        (e) => {
          if (e.button === 0 && courseId) {
            const target = e.target;
            const item = target?.closest(".learning-activity");
            if (item?.id && target?.closest(".clickable-area")) {
              e.preventDefault();
              e.stopImmediatePropagation();
              const activityId = item.id.split("-").pop();
              openFn(`/course/${courseId}/learning-activity#/${activityId}`, "_blank");
            }
          }
        },
        true
      );
    }
  }

  // userscripts/xjtu-enhanced-pc/index.ts
  init();
})();
