import type { ScriptMeta } from '../../tools/meta.ts';

const meta: ScriptMeta = {
  name: '__SCRIPT_NAME__',
  version: '0.1.0',
  description: '',
  match: ['https://example.com/*'],
  'run-at': 'document-idle',
  grant: 'none',
};

export default meta;
