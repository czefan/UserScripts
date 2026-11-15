import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: '抖音下载',
  version: '0.1.1',
  description: '按需提取抖音当前播放视频的直链并支持下载，无后台常驻消耗。',
  icon: 'https://www.douyin.com/favicon.ico',
  match: ['https://www.douyin.com/*', 'https://douyin.com/*'],
  'run-at': 'document-start',
  grant: [
    'GM_registerMenuCommand',
    'GM_setClipboard',
    'GM_download',
    'unsafeWindow',
  ],
};

export default meta;
