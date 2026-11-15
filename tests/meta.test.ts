import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverScriptIds } from '../tools/build.ts';
import {
  renderHeader,
  resolveUrls,
  validateMeta,
  type ScriptMeta,
} from '../tools/meta.ts';

const ROOT_DIR = process.cwd();

const BASE_META: ScriptMeta = {
  name: '示例脚本',
  version: '0.1.0',
  description: '测试描述',
  match: ['https://example.com/*'],
  'run-at': 'document-idle',
  grant: 'none',
};

describe('userscript 元数据与目录规范', () => {
  it('能够发现至少一个脚本且 ID 合法唯一', async () => {
    const ids = await discoverScriptIds(ROOT_DIR);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);

    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('所有脚本的 meta.ts 通过校验且生成头部一致有效', async () => {
    const ids = await discoverScriptIds(ROOT_DIR);

    for (const id of ids) {
      const metaPath = path.join(ROOT_DIR, 'userscripts', id, 'meta.ts');
      const { default: meta } = (await import(pathToFileURL(metaPath).href)) as {
        default: ScriptMeta;
      };

      expect(() => validateMeta(id, meta)).not.toThrow();

      const urls = resolveUrls(id);
      expect(urls.updateURL).toBe(
        `https://raw.githubusercontent.com/czefan/UserScripts/release/${id}.meta.js`,
      );
      expect(urls.downloadURL).toBe(
        `https://raw.githubusercontent.com/czefan/UserScripts/release/${id}.user.js`,
      );

      const header = renderHeader(id, meta);
      expect(header.startsWith('// ==UserScript==\n')).toBe(true);
      expect(header.endsWith('\n// ==/UserScript==')).toBe(true);
      expect(header).toContain(urls.updateURL);
      expect(header).toContain(urls.downloadURL);
    }
  });

  it('校验拒绝数组空项与包含换行符的元数据', () => {
    expect(() =>
      renderHeader('sample-script', { ...BASE_META, match: [''] }),
    ).toThrow(/match/);
    expect(() =>
      renderHeader('sample-script', { ...BASE_META, grant: ['none', '  '] }),
    ).toThrow(/grant/);
    expect(() =>
      renderHeader('sample-script', {
        ...BASE_META,
        match: ['https://example.com/*\n// @grant unsafeWindow'],
      }),
    ).toThrow(/换行/);
    expect(() =>
      renderHeader('sample-script', {
        ...BASE_META,
        description: '第一行\r\n第二行',
      }),
    ).toThrow(/换行/);
  });

  it('discoverScriptIds 对缺失 index.ts 或 meta.ts 的目录直接报错', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'userscripts-check-'));
    try {
      const missingMetaDir = path.join(sandbox, 'userscripts', 'broken-a');
      await mkdir(missingMetaDir, { recursive: true });
      await writeFile(path.join(missingMetaDir, 'index.ts'), '', 'utf8');

      await expect(discoverScriptIds(sandbox)).rejects.toThrow(/缺少: meta\.ts/);

      const missingIndexDir = path.join(sandbox, 'userscripts', 'broken-b');
      await mkdir(missingIndexDir, { recursive: true });
      await writeFile(path.join(missingIndexDir, 'meta.ts'), '', 'utf8');
      await rm(missingMetaDir, { recursive: true, force: true });

      await expect(discoverScriptIds(sandbox)).rejects.toThrow(/缺少: index\.ts/);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});
