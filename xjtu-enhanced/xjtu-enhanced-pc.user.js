// ==UserScript==
// @name         XJTU-Enhanced-PC
// @namespace    https://github.com/czefan/UserScripts
// @version      0.0.2
// @description  优化 xjtu 网站（PC 版）
// @author       czefan
// @match        *://jwc.xjtu.edu.cn/*
// @match        *://dean.xjtu.edu.cn/*
// @match        *://jwxt.xjtu.edu.cn/*
// @match        *://ehall.xjtu.edu.cn/*
// @match        *://lms.xjtu.edu.cn/*
// @match        *://class.xjtu.edu.cn/*
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
    if (host.includes('jwxt.xjtu.edu.cn') || host.includes('ehall.xjtu.edu.cn')) {
        injectStyle(`
            .mbsz-sc-panel-thingNoImg-1-title {
                white-space: normal !important;
                width: auto !important;
            }
        `);
    }

    // 3. 针对思源学堂 LMS/Class 平台：拦截活动点击，左键前台新标签页打开，Ctrl+键后台静默打开，防止返回刷新丢失大纲状态
    if ((host.includes('lms.xjtu.edu.cn') || host.includes('class.xjtu.edu.cn')) && path.includes('/lesson')) {
        const courseId = path.match(/\/course\/(\d+)/)?.[1];
        document.addEventListener('click', (e) => {
            if (e.button === 0 && courseId) {
                const item = e.target.closest('.learning-activity');
                if (item?.id && e.target.closest('.clickable-area')) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    window.open(`/course/${courseId}/learning-activity#/${item.id.split('-').pop()}`, '_blank');
                }
            }
        }, true);
    }
})();
