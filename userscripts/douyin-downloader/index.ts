import { openModal } from './downloader.ts';

if (window.top === window && typeof GM_registerMenuCommand === 'function') {
  GM_registerMenuCommand('下载', openModal);
}
