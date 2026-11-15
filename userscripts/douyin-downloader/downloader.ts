import {
  MAIN_EXTRACT_SNIPPET,
  normalizeDouyinMedia,
  type DouyinMedia,
  type RawVideoInfo,
} from './extractor.ts';

const MODAL_ID = 'douyin-pure-downloader-modal';

const ICONS = {
  copy: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  download:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>',
  refresh:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
  check:
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34C759" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>',
};

interface UnsafeDouyinWindow extends Window {
  __douyinDownloaderExtract?: () => RawVideoInfo | null;
  eval?: (code: string) => unknown;
}

function injectMainWorldBridge(): void {
  try {
    const s = document.createElement('script');
    s.textContent = `window.__douyinDownloaderExtract = () => ${MAIN_EXTRACT_SNIPPET};`;
    (document.head || document.documentElement).appendChild(s);
    s.remove();
  } catch {
    // 忽略受限页面注入异常
  }
}

export function extractActiveDouyinVideo(): DouyinMedia | null {
  let res: RawVideoInfo | null = null;
  try {
    const win =
      typeof unsafeWindow !== 'undefined'
        ? (unsafeWindow as UnsafeDouyinWindow)
        : undefined;
    if (win) {
      if (typeof win.__douyinDownloaderExtract !== 'function') {
        injectMainWorldBridge();
      }
      res =
        win.__douyinDownloaderExtract?.() ||
        ((win.eval ? win.eval(MAIN_EXTRACT_SNIPPET) : null) as RawVideoInfo | null);
    }
  } catch {
    // 忽略主世界执行异常
  }
  return normalizeDouyinMedia(res, document.title);
}

export interface DownloadActionDeps {
  getMedia: () => DouyinMedia | null;
  btnDownload: { disabled: boolean };
  onSuccess: () => void;
  gmDownload?: typeof GM_download;
  doc?: Document;
  notify?: (msg: string) => void;
}

export function createDownloadAction(deps: DownloadActionDeps) {
  let isDownloading = false;

  const trigger = () => {
    const current = deps.getMedia();
    if (!current?.url || isDownloading) return;

    const mediaToDownload = { ...current };
    isDownloading = true;
    deps.btnDownload.disabled = true;
    let settled = false;

    const release = () => {
      if (settled) return false;
      settled = true;
      isDownloading = false;
      deps.btnDownload.disabled = false;
      return true;
    };

    const onOk = () => {
      if (!release()) return;
      deps.onSuccess();
    };

    const doc = deps.doc ?? document;
    const notify = deps.notify ?? ((msg: string) => alert(msg));

    const fallbackSave = () => {
      if (!release()) return;
      try {
        const a = doc.createElement('a');
        a.href = mediaToDownload.url;
        a.download = mediaToDownload.filename;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        doc.body.appendChild(a);
        try {
          a.click();
        } finally {
          a.remove();
        }
        notify('已尝试在新标签页打开视频链接；若未自动下载，请右键另存为。');
      } catch {
        notify('下载失败，请复制链接后手动下载。');
      }
    };

    if (typeof deps.gmDownload === 'function') {
      try {
        deps.gmDownload({
          url: mediaToDownload.url,
          name: mediaToDownload.filename,
          saveAs: false,
          onload: onOk,
          onerror: fallbackSave,
          ontimeout: () => {
            if (!release()) return;
            notify('下载超时，请重试或复制链接手动下载。');
          },
        });
      } catch {
        fallbackSave();
      }
    } else {
      fallbackSave();
    }
  };

  return {
    trigger,
    isDownloading: () => isDownloading,
  };
}

let activeRefreshFn: (() => void) | null = null;
let wheelHandler: (() => void) | null = null;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;
let mediaHandler: ((e: Event) => void) | null = null;
let autoDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function cleanupListeners(): void {
  if (autoDebounceTimer) {
    clearTimeout(autoDebounceTimer);
    autoDebounceTimer = null;
  }
  if (wheelHandler) {
    window.removeEventListener('wheel', wheelHandler);
    wheelHandler = null;
  }
  if (keyHandler) {
    window.removeEventListener('keydown', keyHandler, true);
    keyHandler = null;
  }
  if (mediaHandler) {
    window.removeEventListener('playing', mediaHandler, true);
    window.removeEventListener('play', mediaHandler, true);
    mediaHandler = null;
  }
}

export function closeModal(): void {
  cleanupListeners();
  const el = document.getElementById(MODAL_ID);
  if (el) el.remove();
  activeRefreshFn = null;
}

function flashSuccess(btn: HTMLElement, origSvg: string): void {
  btn.innerHTML = ICONS.check;
  btn.style.background = 'rgba(52, 199, 89, 0.16)';
  setTimeout(() => {
    btn.innerHTML = origSvg;
    btn.style.background = '';
  }, 1200);
}

export function openModal(): void {
  try {
    if (document.getElementById(MODAL_ID)) {
      if (typeof activeRefreshFn === 'function') activeRefreshFn();
      return;
    }

    const media = extractActiveDouyinVideo();
    if (
      !media?.url ||
      (media.url.startsWith('blob:') && !media.url.includes('http'))
    ) {
      alert('未能捕获到当前正在播放的视频，请先播放视频后再试！');
      return;
    }

    let currentMedia = media;

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

    const btnCopy = shadow.getElementById('btn-copy') as HTMLButtonElement;
    const btnDownload = shadow.getElementById('btn-download') as HTMLButtonElement;
    const btnRefresh = shadow.getElementById('btn-refresh') as HTMLButtonElement;
    const cell = shadow.getElementById('ios-cell') as HTMLElement;
    const cellTitle = shadow.getElementById('cell-title') as HTMLElement;
    const cellAuthor = shadow.getElementById('cell-author') as HTMLElement;
    const cellUrl = shadow.getElementById('cell-url') as HTMLElement;

    const renderData = (data: DouyinMedia) => {
      cellTitle.textContent = data.title;
      cellAuthor.textContent = `@${data.author}`;
      cellUrl.textContent = data.url;
      cellUrl.title = data.url;
    };
    renderData(currentMedia);

    btnCopy.addEventListener('click', async () => {
      if (!currentMedia?.url) return;
      try {
        if (typeof GM_setClipboard === 'function') {
          GM_setClipboard(currentMedia.url);
        } else {
          await navigator.clipboard.writeText(currentMedia.url);
        }
        flashSuccess(btnCopy, ICONS.copy);
      } catch {
        alert('复制失败，请手动复制链接。');
      }
    });

    const downloadAction = createDownloadAction({
      getMedia: () => currentMedia,
      btnDownload,
      onSuccess: () => flashSuccess(btnDownload, ICONS.download),
      gmDownload: typeof GM_download === 'function' ? GM_download : undefined,
    });
    btnDownload.addEventListener('click', downloadAction.trigger);

    shadow.getElementById('btn-close')!.addEventListener('click', closeModal);

    const applyMediaUpdate = (
      newMedia: DouyinMedia | null,
      isManual = false,
    ) => {
      if (!newMedia?.url) {
        if (isManual) alert('未能捕获到当前正在播放的视频，请先播放视频后再试！');
        return;
      }
      if (
        !isManual &&
        newMedia.url === currentMedia?.url &&
        newMedia.title === currentMedia?.title
      ) {
        return;
      }

      currentMedia = newMedia;
      renderData(currentMedia);
      cell.style.transition = 'background-color 0.25s ease';
      cell.style.backgroundColor = '#EBF5FF';
      setTimeout(() => {
        cell.style.backgroundColor = '#FFFFFF';
      }, 280);
    };

    activeRefreshFn = () => {
      btnRefresh.style.transform = 'rotate(360deg)';
      setTimeout(() => {
        btnRefresh.style.transform = '';
      }, 350);
      applyMediaUpdate(extractActiveDouyinVideo(), true);
    };
    btnRefresh.addEventListener('click', activeRefreshFn);

    const triggerAutoUpdate = () => {
      if (autoDebounceTimer) clearTimeout(autoDebounceTimer);
      autoDebounceTimer = setTimeout(() => {
        autoDebounceTimer = null;
        const m = extractActiveDouyinVideo();
        if (m?.url) applyMediaUpdate(m, false);
      }, 220);
    };

    wheelHandler = () => triggerAutoUpdate();
    keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) {
        return;
      }
      if (
        [
          'ArrowDown',
          'ArrowUp',
          'PageDown',
          'PageUp',
          'j',
          'k',
          's',
          'w',
        ].includes(e.key)
      ) {
        triggerAutoUpdate();
      }
    };
    mediaHandler = (e: Event) => {
      if ((e.target as HTMLElement | null)?.tagName === 'VIDEO') {
        triggerAutoUpdate();
      }
    };

    window.addEventListener('wheel', wheelHandler, { passive: true });
    window.addEventListener('keydown', keyHandler, true);
    window.addEventListener('playing', mediaHandler, true);
    window.addEventListener('play', mediaHandler, true);

    (document.body || document.documentElement).appendChild(container);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Douyin Downloader] 错误:', err);
    alert(`提取失败: ${message}`);
  }
}
