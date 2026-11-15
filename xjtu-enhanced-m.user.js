// ==UserScript==
// @name         XJTU-Enhanced-Mobile
// @namespace    https://github.com/czefan/UserScripts
// @version      0.1.0
// @description  优化 xjtu 网站（Mobile 版）
// @author       czefan
// @license      GPL-3.0
// @icon         https://www.xjtu.edu.cn/favicon.ico
// @homepageURL  https://github.com/czefan/UserScripts
// @supportURL   https://github.com/czefan/UserScripts/issues
// @match        *://jwxt.xjtu.edu.cn/*
// @match        *://dean.xjtu.edu.cn/*
// @match        *://jwc.xjtu.edu.cn/*
// @updateURL    https://raw.githubusercontent.com/czefan/UserScripts/release/xjtu-enhanced-m.meta.js
// @downloadURL  https://raw.githubusercontent.com/czefan/UserScripts/release/xjtu-enhanced-m.user.js
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

  // userscripts/xjtu-enhanced-m/enhanced.ts
  var JWXT_MOBILE_STYLE = `
            .mbsz-sc-panel-thingNoImg-1-title {
                white-space: normal !important;
                width: auto !important;
            }
        `;
  var DEAN_MOBILE_BASE_STYLE = `
            .wow, .animated {
                visibility: visible !important;
                opacity: 1 !important;
                animation: none !important;
            }
        `;
  var JXXX_MOBILE_STYLE = `
                /* 2.2.1.1 禁用移动端字号自动缩放，防止排版错乱 */
                html, body, div, p, a, span, i, li {
                    -webkit-text-size-adjust: none !important;
                    text-size-adjust: none !important;
                }

                /* 2.2.1.2 移动端列表条目容器：块级拉伸以对齐日期 */
                .list li {
                    display: block !important;
                    position: relative !important;
                    padding: 12px 58px 2px 10px !important;
                    height: auto !important;
                    border-bottom: 1px solid #eee !important;
                }

                /* 2.2.1.3 列表标题自适应换行 */
                .list li a, .list li a i {
                    display: inline-block !important;
                    white-space: normal !important;
                    word-break: break-all !important;
                    overflow: visible !important;
                    text-overflow: clip !important;
                    line-height: 1.5 !important;
                }

                /* 2.2.1.4 列表日期定位 */
                .list li span {
                    position: absolute !important;
                    right: 10px !important;
                    bottom: 2px !important;
                    width: 42px !important;
                    white-space: normal !important;
                    word-break: break-all !important;
                    text-align: right !important;
                    line-height: 1.2 !important;
                }

                /* 2.2.1.5 自定义移动端双列分类切换菜单样式 */
                .mobile-dropdown-btn {
                    display: inline-block !important;
                    padding: 2px 8px !important;
                    font-size: 13px !important;
                    border-radius: 4px !important;
                    border: 1px solid #ccc !important;
                    background: #fff !important;
                    color: #333 !important;
                    cursor: pointer !important;
                }
                .mobile-dropdown-menu {
                    display: none;
                    position: absolute !important;
                    top: 100% !important;
                    left: 50% !important;
                    transform: translateX(calc(-50% + 2px)) !important;
                    width: 190px !important;
                    z-index: 9999 !important;
                    background: #fff !important;
                    border: 1px solid #ddd !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.15) !important;
                    border-radius: 6px !important;
                    padding: 10px !important;
                    grid-template-columns: 1fr 1fr !important;
                    gap: 10px 15px !important;
                }
                .mobile-dropdown-menu.show {
                    display: grid !important;
                }
                .mobile-dropdown-menu a {
                    display: block !important;
                    font-size: 13px !important;
                    color: #555 !important;
                    padding: 4px 6px !important;
                    margin: 0 !important;
                    height: auto !important;
                    line-height: 1.4 !important;
                    border-bottom: 1px solid #f5f5f5 !important;
                    white-space: nowrap !important;
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    text-decoration: none !important;
                }
                .mobile-dropdown-menu a.curr-active {
                    color: #007bff !important;
                    font-weight: bold !important;
                }

                /* 2.2.1.6 修改移动端标题栏背景颜色为柔雅蓝 */
                .ny-tit span {
                    background-color: #6684c2 !important;
                }
            `;
  function initDropdown(doc = document, loc = window.location) {
    const titleSpan = doc.querySelector(".nav2 > span");
    const parentLink = doc.querySelector(".nav-dh li.on > a");
    if (!titleSpan || !parentLink) return;
    const linksHtml = [
      `<a href="${parentLink.href}" class="${loc.pathname.includes("/jxtz2/") ? "" : "curr-active"}">全部</a>`,
      ...Array.from(
        doc.querySelectorAll(".nav-dh li.on ul li a"),
        (link) => {
          const hrefAttr = link.getAttribute("href") || "";
          const activeClass = hrefAttr && loc.href.includes(hrefAttr) ? "curr-active" : "";
          return `<a href="${link.href}" class="${activeClass}">${(link.textContent || "").trim()}</a>`;
        }
      )
    ].join("");
    titleSpan.insertAdjacentHTML(
      "beforeend",
      `
                    <div class="mobile-dropdown-wrapper" style="position: relative; display: inline-block; margin-left: 8px;">
                        <button class="mobile-dropdown-btn">分类 ▾</button>
                        <div class="mobile-dropdown-menu">${linksHtml}</div>
                    </div>
                `
    );
    const btn = titleSpan.querySelector(".mobile-dropdown-btn");
    const menu = titleSpan.querySelector(".mobile-dropdown-menu");
    if (!btn || !menu) return;
    btn.onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle("show");
    };
    doc.addEventListener("click", () => menu.classList.remove("show"));
  }
  function init(doc = document, loc = window.location) {
    const host = loc.hostname;
    const path = loc.pathname;
    if (host.includes("jwxt.xjtu.edu.cn")) {
      injectStyle(JWXT_MOBILE_STYLE, { doc });
    }
    if (host.includes("dean.xjtu.edu.cn") || host.includes("jwc.xjtu.edu.cn")) {
      injectStyle(DEAN_MOBILE_BASE_STYLE, { doc });
      if (path.includes("/jxxx/")) {
        injectStyle(JXXX_MOBILE_STYLE, { doc });
        if (doc.readyState === "loading") {
          doc.addEventListener("DOMContentLoaded", () => initDropdown(doc, loc));
        } else {
          initDropdown(doc, loc);
        }
      }
    }
  }

  // userscripts/xjtu-enhanced-m/index.ts
  init();
})();
