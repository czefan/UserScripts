import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: 'GitHub 用户名检测',
  version: '0.1.1',
  description: '批量检测 GitHub 用户名可用性',
  icon: 'https://github.githubassets.com/favicons/favicon.svg',
  match: 'https://github.com/settings/admin',
  'run-at': 'document-idle',
  grant: 'none',
};

export default meta;
