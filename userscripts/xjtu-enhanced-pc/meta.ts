import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: 'XJTU-Enhanced-PC',
  version: '0.1.0',
  description: '优化 xjtu 网站（PC 版）',
  icon: 'https://www.xjtu.edu.cn/favicon.ico',
  match: [
    '*://jwc.xjtu.edu.cn/*',
    '*://dean.xjtu.edu.cn/*',
    '*://jwxt.xjtu.edu.cn/*',
    '*://ehall.xjtu.edu.cn/*',
    '*://lms.xjtu.edu.cn/*',
    '*://class.xjtu.edu.cn/*',
  ],
  'run-at': 'document-start',
  grant: 'none',
};

export default meta;
