// ==UserScript==
// @name         抖音无水印下载
// @namespace    https://github.com/czefan/UserScripts
// @version      0.1.0
// @description  按需提取抖音当前播放视频的无水印直链并支持下载，无后台常驻消耗。
// @author       czefan
// @license      GPL-3.0
// @icon         https://www.douyin.com/favicon.ico
// @homepageURL  https://github.com/czefan/UserScripts
// @supportURL   https://github.com/czefan/UserScripts/issues
// @match        https://www.douyin.com/*
// @match        https://douyin.com/*
// @updateURL    https://raw.githubusercontent.com/czefan/UserScripts/main/douyin/douyin-downloader.user.js
// @downloadURL  https://raw.githubusercontent.com/czefan/UserScripts/main/douyin/douyin-downloader.user.js
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_setClipboard
// @grant        GM_download
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window) return;

    const MODAL_ID = 'douyin-pure-downloader-modal';

    const ICONS = {
        copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        download: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
        refresh: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
        check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
    };

    // ==============================================================
    // Main World 穿透提取核心（直击西瓜播放器配置与 React Fiber）
    // ==============================================================
    const MAIN_EXTRACT_SNIPPET = `(() => {
        try {
            const vids = Array.from(document.querySelectorAll('video')).filter(v => (!v.paused && v.duration > 0) || (v.offsetWidth > 60 && v.offsetHeight > 60));
            if (!vids.length) return null;
            const cy = window.innerHeight / 2;
            const v = vids.find(x => !x.paused && x.duration > 0) || vids.reduce((p, c) => Math.abs((c.getBoundingClientRect().top + c.getBoundingClientRect().bottom)/2 - cy) < Math.abs((p.getBoundingClientRect().top + p.getBoundingClientRect().bottom)/2 - cy) ? c : p);

            let el = v, k = null, cleanUrl = '', title = '', author = '';
            while (el && !(k = Object.keys(el).find(key => key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')))) {
                el = el.parentElement;
            }
            if (el && k) {
                let f = el[k], d = 0;
                while (f && d++ < 60) {
                    const p = f.memoizedProps || f.pendingProps;
                    if (p) {
                        const a = p.awemeInfo || p.itemData;
                        const vid = p.xgplayerConfig?.vid || a?.video?.uri || a?.video?.play_addr?.uri;
                        const xg = p.xgplayerConfig?.url || p.xgplayerConfig?.videoUrl;
                        const xgList = Array.isArray(xg) ? xg.map(i => typeof i === 'string' ? i : i?.src) : (typeof xg === 'string' ? [xg] : []);

                        let playLink = xgList.find(s => s && s.includes('/aweme/v1/play/')) || '';
                        if (!playLink && vid) {
                            playLink = 'https://www.douyin.com/aweme/v1/play/?video_id=' + vid + '&ratio=1080p&line=0';
                        }
                        cleanUrl = playLink || xgList.find(s => s?.startsWith('http') && !s.startsWith('blob:')) || '';

                        if (a) {
                            title = title || a.desc || a.title || '';
                            author = author || a.author?.nickname || a.author?.name || a.authorInfo?.nickname || a.user?.nickname || '';
                            if (!cleanUrl) {
                                const pa = a.video?.playAddr || a.video?.play_addr?.url_list;
                                if (Array.isArray(pa)) cleanUrl = pa.map(i => typeof i === 'string' ? i : i?.src).find(s => s?.startsWith('http') && !s.startsWith('blob:')) || '';
                            }
                        }
                        if (cleanUrl && title && author) break;
                    }
                    f = f.return;
                }
            }
            if (!cleanUrl) cleanUrl = (v.currentSrc?.startsWith('http') && !v.currentSrc.startsWith('blob:')) ? v.currentSrc : (v.src?.startsWith('http') && !v.src.startsWith('blob:')) ? v.src : '';

            let c = v;
            while (c && c !== document.body && (!title || !author)) {
                if (!title) title = c.querySelector?.('[data-e2e="video-desc"], .video-desc, [data-e2e="detail-video-desc"]')?.textContent?.trim() || '';
                if (!author) {
                    const aEl = c.querySelector?.('[data-e2e="video-author-name"], [data-e2e="user-info"], a[href*="/user/"], .author-info');
                    if (aEl) author = aEl.textContent.trim().split(/[\\n·•]/)[0].replace(/^@/, '').trim();
                }
                c = c.parentElement;
            }
            return cleanUrl ? { url: cleanUrl, title, author } : null;
        } catch (e) { return null; }
    })()`;

    function injectMainWorldBridge() {
        try {
            const s = document.createElement('script');
            s.textContent = `window.__douyinDownloaderExtract = () => ${MAIN_EXTRACT_SNIPPET};`;
            (document.head || document.documentElement).appendChild(s);
            s.remove();
        } catch (e) {}
    }

    function extractActiveDouyinVideo() {
        let res = null;
        try {
            if (typeof unsafeWindow !== 'undefined') {
                if (typeof unsafeWindow.__douyinDownloaderExtract !== 'function') injectMainWorldBridge();
                res = unsafeWindow.__douyinDownloaderExtract?.() || (unsafeWindow.eval ? unsafeWindow.eval(MAIN_EXTRACT_SNIPPET) : null);
            }
        } catch (e) {}
        if (!res?.url) return null;

        const url = res.url.replace('playwm', 'play');
        const cleanTitle = (res.title || document.title.replace(/[-_] 抖音.*/, '') || '')
            .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_').trim().substring(0, 60);
        const safeTitle = (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(cleanTitle) ? `_${cleanTitle}` : cleanTitle) || 'douyin_video';
        const safeAuthor = (res.author || '抖音创作者')
            .replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, '_').trim().substring(0, 30) || '抖音创作者';

        return { url, title: safeTitle, author: safeAuthor, filename: `${safeAuthor} - ${safeTitle}.mp4` };
    }

    // ==============================================================
    // 弹窗与交互生命周期
    // ==============================================================
    let activeRefreshFn = null, wheelHandler = null, keyHandler = null, mediaHandler = null, autoDebounceTimer = null;

    function cleanupListeners() {
        if (autoDebounceTimer) { clearTimeout(autoDebounceTimer); autoDebounceTimer = null; }
        if (wheelHandler) { window.removeEventListener('wheel', wheelHandler, { passive: true }); wheelHandler = null; }
        if (keyHandler) { window.removeEventListener('keydown', keyHandler, true); keyHandler = null; }
        if (mediaHandler) {
            window.removeEventListener('playing', mediaHandler, true);
            window.removeEventListener('play', mediaHandler, true);
            mediaHandler = null;
        }
    }

    function closeModal() {
        cleanupListeners();
        const el = document.getElementById(MODAL_ID);
        if (el) el.remove();
        activeRefreshFn = null;
    }

    function flashSuccess(btn, origSvg) {
        btn.innerHTML = ICONS.check;
        btn.style.background = 'rgba(52, 199, 89, 0.16)';
        setTimeout(() => { btn.innerHTML = origSvg; btn.style.background = ''; }, 1200);
    }

    function openModal() {
        try {
            if (document.getElementById(MODAL_ID)) {
                if (typeof activeRefreshFn === 'function') activeRefreshFn();
                return;
            }

            const media = extractActiveDouyinVideo();
            if (!media?.url || (media.url.startsWith('blob:') && !media.url.includes('http'))) {
                alert('未能捕获到当前正在播放的视频，请先播放视频后再试！');
                return;
            }

            let currentMedia = media;
            let isDownloading = false;

            const container = document.createElement('div');
            container.id = MODAL_ID;
            const shadow = container.attachShadow({ mode: 'open' });

            shadow.innerHTML = `
                <style>
                    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-font-smoothing: antialiased; }
                    .ios-sheet {
                        position: fixed; top: 24px; right: 24px; width: 360px;
                        background: rgba(242, 242, 247, 0.88); backdrop-filter: blur(32px) saturate(190%);
                        -webkit-backdrop-filter: blur(32px) saturate(190%); border: 0.5px solid rgba(0, 0, 0, 0.15);
                        border-radius: 20px; padding: 12px 14px;
                        box-shadow: 0 20px 48px rgba(0, 0, 0, 0.18), 0 4px 12px rgba(0, 0, 0, 0.06);
                        z-index: 2147483647; font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", sans-serif;
                        color: #000; animation: iosSpring 0.28s cubic-bezier(0.16, 1, 0.3, 1);
                    }
                    @keyframes iosSpring { from { transform: scale(0.92) translateY(-12px); opacity: 0; } to { transform: scale(1) translateY(0); opacity: 1; } }
                    .ios-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; padding: 0 2px; }
                    .ios-nav-left { display: flex; align-items: center; gap: 8px; }
                    .ios-title { font-size: 14px; font-weight: 600; letter-spacing: -0.3px; color: #000; }
                    .ios-tool-btns { display: flex; align-items: center; gap: 5px; }
                    .ios-icon-btn, .ios-close {
                        width: 26px; height: 26px; border-radius: 50%; background: rgba(118, 118, 128, 0.12);
                        border: none; color: #1c1c1e; display: flex; align-items: center; justify-content: center;
                        cursor: pointer; transition: all 0.15s ease;
                    }
                    .ios-icon-btn:hover, .ios-close:hover { background: rgba(118, 118, 128, 0.22); color: #000; }
                    .ios-icon-btn:active, .ios-close:active { transform: scale(0.9); }
                    .ios-close { color: #8E8E93; font-size: 12px; font-weight: 600; }
                    .ios-cell {
                        background: #FFFFFF; border-radius: 12px; padding: 10px 12px;
                        display: flex; flex-direction: column; gap: 6px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
                    }
                    .ios-cell-title {
                        font-size: 13px; font-weight: 600; color: #1d1d1f; line-height: 1.35;
                        display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
                    }
                    .ios-cell-author { font-size: 12px; color: #8E8E93; }
                    .ios-cell-url {
                        font-size: 11px; color: #8E8E93; font-family: ui-monospace, Menlo, monospace;
                        white-space: nowrap; overflow-x: auto; overflow-y: hidden; background: #f4f4f6;
                        padding: 6px 8px; border-radius: 6px; user-select: text; -webkit-user-select: text;
                        scrollbar-width: thin; scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
                    }
                    .ios-cell-url::-webkit-scrollbar { height: 4px; }
                    .ios-cell-url::-webkit-scrollbar-track { background: transparent; }
                    .ios-cell-url::-webkit-scrollbar-thumb { background: rgba(0, 0, 0, 0.2); border-radius: 4px; }
                    .ios-cell-url::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.36); }
                </style>
                <div class="ios-sheet">
                    <div class="ios-nav">
                        <div class="ios-nav-left">
                            <span class="ios-title">抖音下载</span>
                            <div class="ios-tool-btns">
                                <button class="ios-icon-btn" id="btn-copy" title="复制直链">${ICONS.copy}</button>
                                <button class="ios-icon-btn" id="btn-download" title="下载视频">${ICONS.download}</button>
                                <button class="ios-icon-btn" id="btn-refresh" title="刷新获取">${ICONS.refresh}</button>
                            </div>
                        </div>
                        <button class="ios-close" id="btn-close" title="关闭">✕</button>
                    </div>
                    <div class="ios-cell" id="ios-cell">
                        <div class="ios-cell-title" id="cell-title"></div>
                        <div class="ios-cell-author" id="cell-author"></div>
                        <div class="ios-cell-url" id="cell-url"></div>
                    </div>
                </div>
            `;

            const btnCopy = shadow.getElementById('btn-copy');
            const btnDownload = shadow.getElementById('btn-download');
            const btnRefresh = shadow.getElementById('btn-refresh');
            const cell = shadow.getElementById('ios-cell');
            const cellTitle = shadow.getElementById('cell-title');
            const cellAuthor = shadow.getElementById('cell-author');
            const cellUrl = shadow.getElementById('cell-url');

            function renderData(data) {
                cellTitle.textContent = data.title;
                cellAuthor.textContent = `@${data.author}`;
                cellUrl.textContent = data.url;
                cellUrl.title = data.url;
            }
            renderData(currentMedia);

            btnCopy.addEventListener('click', () => {
                if (!currentMedia?.url) return;
                const onOk = () => flashSuccess(btnCopy, ICONS.copy);
                if (typeof GM_setClipboard === 'function') { GM_setClipboard(currentMedia.url); onOk(); }
                else navigator.clipboard.writeText(currentMedia.url).then(onOk);
            });

            btnDownload.addEventListener('click', () => {
                if (!currentMedia?.url || isDownloading) return;
                isDownloading = true;
                const onOk = () => {
                    flashSuccess(btnDownload, ICONS.download);
                    setTimeout(() => { isDownloading = false; }, 1200);
                };
                const fallbackSave = () => {
                    const a = document.createElement('a');
                    a.href = currentMedia.url;
                    a.download = currentMedia.filename;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    onOk();
                };
                if (typeof GM_download === 'function') {
                    GM_download({
                        url: currentMedia.url,
                        name: currentMedia.filename,
                        saveAs: false,
                        onload: onOk,
                        onerror: () => { isDownloading = false; fallbackSave(); }
                    });
                } else {
                    fallbackSave();
                }
            });

            shadow.getElementById('btn-close').addEventListener('click', closeModal);

            function applyMediaUpdate(newMedia, isManual = false) {
                if (!newMedia?.url) {
                    if (isManual) alert('未能捕获到当前正在播放的视频，请先播放视频后再试！');
                    return;
                }
                if (!isManual && newMedia.url === currentMedia?.url && newMedia.title === currentMedia?.title) return;

                currentMedia = newMedia;
                renderData(currentMedia);
                cell.style.transition = 'background-color 0.25s ease';
                cell.style.backgroundColor = '#EBF5FF';
                setTimeout(() => { cell.style.backgroundColor = '#FFFFFF'; }, 280);
            }

            activeRefreshFn = () => {
                btnRefresh.style.transform = 'rotate(360deg)';
                setTimeout(() => { btnRefresh.style.transform = ''; }, 350);
                applyMediaUpdate(extractActiveDouyinVideo(), true);
            };
            btnRefresh.addEventListener('click', activeRefreshFn);

            function triggerAutoUpdate() {
                if (autoDebounceTimer) clearTimeout(autoDebounceTimer);
                autoDebounceTimer = setTimeout(() => {
                    autoDebounceTimer = null;
                    const m = extractActiveDouyinVideo();
                    if (m?.url) applyMediaUpdate(m, false);
                }, 220);
            }

            wheelHandler = () => triggerAutoUpdate();
            keyHandler = (e) => {
                if (e.key === 'Escape') {
                    closeModal();
                    return;
                }
                const tag = e.target?.tagName;
                if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
                if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'j', 'k', 's', 'w'].includes(e.key)) triggerAutoUpdate();
            };
            mediaHandler = (e) => {
                if (e.target?.tagName === 'VIDEO') triggerAutoUpdate();
            };

            window.addEventListener('wheel', wheelHandler, { passive: true });
            window.addEventListener('keydown', keyHandler, true);
            window.addEventListener('playing', mediaHandler, true);
            window.addEventListener('play', mediaHandler, true);

            (document.body || document.documentElement).appendChild(container);
        } catch (err) {
            console.error('[Douyin Downloader] 错误:', err);
            alert(`提取失败: ${err.message}`);
        }
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('下载', openModal);
    }
})();
