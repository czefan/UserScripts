import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: 'B站评论区开盒',
  version: '0.1.1',
  description: '在 B 站评论区显示用户 IP 属地',
  icon: 'https://www.bilibili.com/favicon.ico',
  match: '*://*.bilibili.com/*',
  exclude: '*://member.bilibili.com*',
  'run-at': 'document-start',
  grant: 'none',
};

export default meta;
