import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: 'XJTU-Enhanced-Mobile',
  version: '0.1.0',
  description: '优化 xjtu 网站（Mobile 版）',
  icon: 'https://www.xjtu.edu.cn/favicon.ico',
  match: [
    '*://jwxt.xjtu.edu.cn/*',
    '*://dean.xjtu.edu.cn/*',
    '*://jwc.xjtu.edu.cn/*',
  ],
  'run-at': 'document-start',
  grant: 'none',
};

export default meta;
