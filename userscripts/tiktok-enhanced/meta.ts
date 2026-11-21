import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: 'TikTok 增强',
  version: '0.1.2',
  description:
    '自动折叠 TikTok 侧边栏，支持 Shift + ↑ / ↓ 快捷键调节音量并同步官方音量条',
  icon: 'https://www.google.com/s2/favicons?sz=64&domain=tiktok.com',
  match: 'https://www.tiktok.com/',
  'run-at': 'document-start',
  grant: 'none',
};

export default meta;
