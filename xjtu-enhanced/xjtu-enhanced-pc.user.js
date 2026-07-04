// ==UserScript==
// @name         XJTU-Enhanced-PC
// @namespace    https://github.com/czefan/UserScripts
// @version      0.0.1
// @description  优化 xjtu 网站（PC 版）
// @author       czefan
// @match        *://dean.xjtu.edu.cn/*
// @match        *://jwc.xjtu.edu.cn/*
// @match        *://jwxt.xjtu.edu.cn/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const host = window.location.hostname;
    const path = window.location.pathname;

    // 注入样式的辅助函数
    const injectStyle = (css) => {
        const style = document.createElement("style");
        style.textContent = css;
        document.documentElement.appendChild(style);
    };

    // 1. 针对教务处网站：抹平全站过渡与延迟动画
    if (host.includes('dean.xjtu.edu.cn') || host.includes('jwc.xjtu.edu.cn')) {
        injectStyle(`
            .wow, .animated {
                visibility: visible !important;
                opacity: 1 !important;
                animation: none !important;
            }
        `);
    }

    // 2. 针对本科教务系统：解除卡片标题 text-overflow 限制
    if (host.includes('jwxt.xjtu.edu.cn')) {
        injectStyle(`
            .mbsz-sc-panel-thingNoImg-1-title {
                white-space: normal !important;
                width: auto !important;
            }
        `);
    }
})();
