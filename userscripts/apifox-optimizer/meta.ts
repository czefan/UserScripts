import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: 'Apifox 界面紧凑优化',
  version: '0.1.0',
  description:
    '优化 Apifox Web 端布局：折叠按钮置顶、46px 极窄侧边栏、35px 紧凑顶栏与标签栏高度压缩',
  icon: 'https://apifox.com/favicon.ico',
  match: 'https://app.apifox.com/*',
  'run-at': 'document-start',
  grant: 'none',
};

export default meta;
