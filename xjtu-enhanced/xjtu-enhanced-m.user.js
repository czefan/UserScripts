// ==UserScript==
// @name         XJTU-Enhanced-Mobile
// @namespace    https://github.com/czefan/UserScripts
// @version      0.0.1
// @description  优化 xjtu 网站（Mobile 版）
// @author       czefan
// @match        *://jwxt.xjtu.edu.cn/*
// @match        *://dean.xjtu.edu.cn/*
// @match        *://jwc.xjtu.edu.cn/*
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

    // 1. 针对本科教务系统 (jwxt.xjtu.edu.cn)
    if (host.includes('jwxt.xjtu.edu.cn')) {
        injectStyle(`
            .mbsz-sc-panel-thingNoImg-1-title {
                white-space: normal !important;
                width: auto !important;
            }
        `);
    }

    // 2. 针对教务处网站 (dean.xjtu.edu.cn, jwc.xjtu.edu.cn)
    if (host.includes('dean.xjtu.edu.cn') || host.includes('jwc.xjtu.edu.cn')) {
        // 2.1 全局抹平延迟显示与滑动动画 (完全按 PC 版的写法)
        injectStyle(`
            .wow, .animated {
                visibility: visible !important;
                opacity: 1 !important;
                animation: none !important;
            }
        `);

        // 2.2 针对教学通知相关页面 (/jxxx/*) 生效专属移动端优化
        if (path.includes('/jxxx/')) {
            // 2.2.1 注入教学通知移动端专属重构 CSS
            injectStyle(`
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
            `);

            // 2.2.2 动态生成移动端双列分类切换菜单
            const initDropdown = () => {
                const titleSpan = document.querySelector('.nav2 > span');
                const parentLink = document.querySelector('.nav-dh li.on > a');
                if (!titleSpan || !parentLink) return;

                const linksHtml = [
                    `<a href="${parentLink.href}" class="${location.pathname.includes('/jxtz2/') ? '' : 'curr-active'}">全部</a>`,
                    ...Array.from(document.querySelectorAll('.nav-dh li.on ul li a'), link =>
                        `<a href="${link.href}" class="${location.href.includes(link.getAttribute('href')) ? 'curr-active' : ''}">${link.textContent.trim()}</a>`
                    )
                ].join('');

                titleSpan.insertAdjacentHTML('beforeend', `
                    <div class="mobile-dropdown-wrapper" style="position: relative; display: inline-block; margin-left: 8px;">
                        <button class="mobile-dropdown-btn">分类 ▾</button>
                        <div class="mobile-dropdown-menu">${linksHtml}</div>
                    </div>
                `);

                const menu = titleSpan.querySelector('.mobile-dropdown-menu');
                menu.previousElementSibling.onclick = (e) => {
                    e.stopPropagation();
                    menu.classList.toggle('show');
                };
                document.addEventListener('click', () => menu.classList.remove('show'));
            };

            // 2.2.3 考虑 document-start 时机，挂载生命周期监听
            document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', initDropdown) : initDropdown();
        }
    }
})();