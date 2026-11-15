export type RunAt =
  | 'document-start'
  | 'document-body'
  | 'document-end'
  | 'document-idle'
  | 'context-menu';

export interface ScriptMeta {
  name: string;
  version: string;
  description: string;
  match: string | string[];
  grant: string | string[];
  'run-at': RunAt;
  include?: string | string[];
  exclude?: string | string[];
  icon?: string;
  connect?: string | string[];
  require?: string | string[];
  resource?: Record<string, string>;
  'inject-into'?: 'page' | 'content' | 'auto';
  noframes?: boolean;
}

export const SITE_META = {
  namespace: 'https://github.com/czefan/UserScripts',
  author: 'czefan',
  license: 'GPL-3.0',
  homepageURL: 'https://github.com/czefan/UserScripts',
  supportURL: 'https://github.com/czefan/UserScripts/issues',
} as const;

export const DEV_SCRIPT_IDENTITY = {
  name: '[DEV] UserScripts Local',
  namespace: `${SITE_META.namespace}#dev`,
  version: '0.0.0-dev',
} as const;

export const RELEASE_BASE_URL =
  'https://raw.githubusercontent.com/czefan/UserScripts/release';

export function resolveUrls(id: string): { updateURL: string; downloadURL: string } {
  return {
    updateURL: `${RELEASE_BASE_URL}/${id}.meta.js`,
    downloadURL: `${RELEASE_BASE_URL}/${id}.user.js`,
  };
}

function toArray(value?: string | string[]): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function assertSingleLineText(label: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`元数据字段 ${label} 必须为非空字符串`);
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(`元数据字段 ${label} 不能包含换行符`);
  }
  return value;
}

function assertStringList(
  label: string,
  value: string | string[] | undefined,
  required: boolean,
): string[] {
  const items = toArray(value);
  if (required && items.length === 0) {
    throw new Error(`元数据字段 ${label} 至少需要一项`);
  }
  return items.map((item, idx) => assertSingleLineText(`${label}[${idx}]`, item));
}

export function validateMeta(id: string, meta: ScriptMeta): void {
  if (!/^[a-z0-9-]+$/.test(id)) {
    throw new Error(`脚本 ID "${id}" 非法，仅允许小写字母、数字和连字符`);
  }

  assertSingleLineText(`${id}.name`, meta.name);
  const version = assertSingleLineText(`${id}.version`, meta.version);
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`元数据字段 ${id}.version 格式非法: "${version}"`);
  }
  assertSingleLineText(`${id}.description`, meta.description);
  assertSingleLineText(`${id}.run-at`, meta['run-at']);

  assertStringList(`${id}.match`, meta.match, true);
  assertStringList(`${id}.grant`, meta.grant, true);
  assertStringList(`${id}.include`, meta.include, false);
  assertStringList(`${id}.exclude`, meta.exclude, false);
  assertStringList(`${id}.connect`, meta.connect, false);
  assertStringList(`${id}.require`, meta.require, false);

  if (meta.icon !== undefined) {
    assertSingleLineText(`${id}.icon`, meta.icon);
  }
  if (meta['inject-into'] !== undefined) {
    assertSingleLineText(`${id}.inject-into`, meta['inject-into']);
  }
  if (meta.resource !== undefined) {
    for (const [name, url] of Object.entries(meta.resource)) {
      const resourceName = assertSingleLineText(`${id}.resource key`, name);
      if (/\s/.test(resourceName)) {
        throw new Error(`元数据字段 ${id}.resource key "${resourceName}" 不能包含空白字符`);
      }
      assertSingleLineText(`${id}.resource["${name}"]`, url);
    }
  }
}

function formatTag(key: string, value?: string): string {
  return value === undefined ? `// @${key}` : `// @${key.padEnd(13)}${value}`;
}

interface RenderBlockOptions {
  name: string;
  namespace: string;
  version: string;
  description: string;
  meta: ScriptMeta;
  updateURL?: string;
  downloadURL?: string;
  extraRequire?: string;
}

function renderMetadataBlock(options: RenderBlockOptions): string {
  const { meta } = options;
  const lines: string[] = ['// ==UserScript=='];

  const pushScalar = (key: string, value?: string) => {
    if (value) lines.push(formatTag(key, value));
  };
  const pushList = (key: string, value?: string | string[]) => {
    for (const item of toArray(value)) {
      lines.push(formatTag(key, item));
    }
  };

  pushScalar('name', options.name);
  pushScalar('namespace', options.namespace);
  pushScalar('version', options.version);
  pushScalar('description', options.description);
  pushScalar('author', SITE_META.author);
  pushScalar('license', SITE_META.license);
  pushScalar('icon', meta.icon);
  pushScalar('homepageURL', SITE_META.homepageURL);
  pushScalar('supportURL', SITE_META.supportURL);
  pushList('match', meta.match);
  pushList('include', meta.include);
  pushList('exclude', meta.exclude);
  pushScalar('updateURL', options.updateURL);
  pushScalar('downloadURL', options.downloadURL);
  pushScalar('run-at', meta['run-at']);
  pushList('grant', meta.grant);
  pushList('connect', meta.connect);
  pushList('require', meta.require);
  pushScalar('require', options.extraRequire);

  if (meta.resource) {
    for (const [name, url] of Object.entries(meta.resource)) {
      lines.push(formatTag('resource', `${name} ${url}`));
    }
  }

  pushScalar('inject-into', meta['inject-into']);
  if (meta.noframes) {
    lines.push(formatTag('noframes'));
  }

  lines.push('// ==/UserScript==');
  return lines.join('\n');
}

export function renderHeader(id: string, meta: ScriptMeta): string {
  validateMeta(id, meta);
  const { updateURL, downloadURL } = resolveUrls(id);
  return renderMetadataBlock({
    name: meta.name,
    namespace: SITE_META.namespace,
    version: meta.version,
    description: meta.description,
    meta,
    updateURL,
    downloadURL,
  });
}

export function renderDevLoader(
  id: string,
  meta: ScriptMeta,
  bundleUrl: string,
): string {
  validateMeta(id, meta);
  assertSingleLineText(`${id}.bundleUrl`, bundleUrl);

  const header = renderMetadataBlock({
    name: DEV_SCRIPT_IDENTITY.name,
    namespace: DEV_SCRIPT_IDENTITY.namespace,
    version: DEV_SCRIPT_IDENTITY.version,
    description: `[DEV:${id}] ${meta.name} - ${meta.description}`,
    meta,
    extraRequire: bundleUrl,
  });

  return `${header}\n\n// 由本地开发服务通过 @require 加载最新构建产物，无需手动粘贴代码。\n`;
}
