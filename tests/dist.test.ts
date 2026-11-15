import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverScriptIds } from '../tools/build.ts';
import { renderHeader, resolveUrls, type ScriptMeta } from '../tools/meta.ts';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.join(ROOT_DIR, 'dist');

function extractHeader(content: string): string {
  const endMarker = '// ==/UserScript==';
  const endIndex = content.indexOf(endMarker);
  if (endIndex === -1) return '';
  return content.slice(0, endIndex + endMarker.length);
}

describe('dist 构建产物校验', () => {
  it('每个脚本均生成对应的 .user.js 和 .meta.js，头部与产物格式正确', async () => {
    const ids = await discoverScriptIds(ROOT_DIR);
    expect(ids.length).toBeGreaterThan(0);

    for (const id of ids) {
      const userJsPath = path.join(DIST_DIR, `${id}.user.js`);
      const metaJsPath = path.join(DIST_DIR, `${id}.meta.js`);

      const [userExists, metaExists] = await Promise.all([
        stat(userJsPath).then(
          (s) => s.isFile(),
          () => false,
        ),
        stat(metaJsPath).then(
          (s) => s.isFile(),
          () => false,
        ),
      ]);

      expect(userExists, `缺少构建产物: ${userJsPath}`).toBe(true);
      expect(metaExists, `缺少构建产物: ${metaJsPath}`).toBe(true);

      const [userJs, metaJs] = await Promise.all([
        readFile(userJsPath, 'utf8'),
        readFile(metaJsPath, 'utf8'),
      ]);

      const metaModule = (await import(
        pathToFileURL(path.join(ROOT_DIR, 'userscripts', id, 'meta.ts')).href
      )) as { default: ScriptMeta };
      const expectedHeader = renderHeader(id, metaModule.default);
      const { updateURL, downloadURL } = resolveUrls(id);

      // 头部必须位于首行，且 .meta.js 与 .user.js 完全一致
      expect(userJs.startsWith('// ==UserScript==\n')).toBe(true);
      expect(metaJs.startsWith('// ==UserScript==\n')).toBe(true);
      expect(extractHeader(userJs)).toBe(expectedHeader);
      expect(extractHeader(metaJs)).toBe(expectedHeader);
      expect(metaJs).toBe(`${expectedHeader}\n`);

      // updateURL / downloadURL 与脚本 ID 对应
      expect(expectedHeader).toContain(updateURL);
      expect(expectedHeader).toContain(downloadURL);

      // 构建结果不应为压缩单行，且不应残留顶层模块 import / export 语句
      const body = userJs.slice(expectedHeader.length).trim();
      expect(body.split('\n').length).toBeGreaterThan(5);
      expect(body).not.toMatch(/^\s*(import|export)\s/m);
    }
  });
});
