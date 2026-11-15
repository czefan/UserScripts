import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseMetaVersion, syncReleaseArtifacts } from '../tools/release.ts';

function renderScriptFiles(id: string, version: string, body = 'console.log("ok");') {
  const meta = [
    '// ==UserScript==',
    `// @name         ${id}`,
    `// @version      ${version}`,
    '// ==/UserScript==',
    '',
  ].join('\n');

  return {
    meta,
    user: `${meta}${body}\n`,
  };
}

async function writeScriptPair(
  dir: string,
  id: string,
  version: string,
  body?: string,
): Promise<void> {
  const { meta, user } = renderScriptFiles(id, version, body);
  await writeFile(path.join(dir, `${id}.meta.js`), meta, 'utf8');
  await writeFile(path.join(dir, `${id}.user.js`), user, 'utf8');
}

async function exists(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    () => true,
    () => false,
  );
}

describe('release 增量发布同步', () => {
  it('parseMetaVersion 仅解析 UserScript 元数据块内的 @version', () => {
    expect(
      parseMetaVersion('// ==UserScript==\r\n// @version\t1.2.3-beta.1  \r\n// ==/UserScript=='),
    ).toBe('1.2.3-beta.1');
    expect(
      parseMetaVersion('// @version 9.9.9\n// ==UserScript==\n// @name foo\n// ==/UserScript=='),
    ).toBeNull();
    expect(
      parseMetaVersion('// ==UserScript==\n// @version   \n// @name foo\n// ==/UserScript=='),
    ).toBeNull();
  });

  it('首次发布时复制全部脚本并标记 hasChanges 为 true', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'userscripts-release-'));
    try {
      const distDir = path.join(sandbox, 'dist');
      const releaseDir = path.join(sandbox, 'release');
      await mkdir(distDir, { recursive: true });

      await writeScriptPair(distDir, 'script-a', '1.0.0');
      await writeScriptPair(distDir, 'script-b', '0.2.0');

      const result = await syncReleaseArtifacts(distDir, releaseDir);
      expect(result).toEqual({
        added: [
          { id: 'script-a', from: null, to: '1.0.0' },
          { id: 'script-b', from: null, to: '0.2.0' },
        ],
        updated: [],
        removed: [],
        unchanged: [],
        hasChanges: true,
      });
      expect(await readFile(path.join(releaseDir, 'script-a.meta.js'), 'utf8')).toContain(
        '1.0.0',
      );
      expect(await exists(path.join(releaseDir, 'script-b.user.js'))).toBe(true);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('版本未变更时保留 release 原有脚本内容并跳过发布', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'userscripts-release-'));
    try {
      const distDir = path.join(sandbox, 'dist');
      const releaseDir = path.join(sandbox, 'release');
      await mkdir(distDir, { recursive: true });
      await mkdir(releaseDir, { recursive: true });

      await writeScriptPair(releaseDir, 'script-a', '1.0.0', 'console.log("released");');
      await writeScriptPair(distDir, 'script-a', '1.0.0', 'console.log("wip");');

      const result = await syncReleaseArtifacts(distDir, releaseDir);
      expect(result).toEqual({
        added: [],
        updated: [],
        removed: [],
        unchanged: ['script-a'],
        hasChanges: false,
      });
      expect(await readFile(path.join(releaseDir, 'script-a.user.js'), 'utf8')).toContain(
        'released',
      );
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('混合变更时仅更新升版或新增脚本、清理已删脚本并保留未变脚本与辅助文件', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'userscripts-release-'));
    try {
      const distDir = path.join(sandbox, 'dist');
      const releaseDir = path.join(sandbox, 'release');
      await mkdir(distDir, { recursive: true });
      await mkdir(releaseDir, { recursive: true });

      await writeFile(path.join(releaseDir, '.nojekyll'), '', 'utf8');
      await writeScriptPair(releaseDir, 'script-same', '1.0.0', 'console.log("stable");');
      await writeScriptPair(releaseDir, 'script-bump', '1.0.0', 'console.log("v1");');
      await writeScriptPair(releaseDir, 'script-removed', '0.5.0');

      await writeScriptPair(distDir, 'script-same', '1.0.0', 'console.log("wip");');
      await writeScriptPair(distDir, 'script-bump', '1.1.0', 'console.log("v1.1");');
      await writeScriptPair(distDir, 'script-new', '0.1.0', 'console.log("new");');

      const result = await syncReleaseArtifacts(distDir, releaseDir);
      expect(result).toEqual({
        added: [{ id: 'script-new', from: null, to: '0.1.0' }],
        updated: [{ id: 'script-bump', from: '1.0.0', to: '1.1.0' }],
        removed: ['script-removed'],
        unchanged: ['script-same'],
        hasChanges: true,
      });

      expect(await exists(path.join(releaseDir, '.nojekyll'))).toBe(true);
      expect(await readFile(path.join(releaseDir, 'script-same.user.js'), 'utf8')).toContain(
        'stable',
      );
      expect(await readFile(path.join(releaseDir, 'script-bump.user.js'), 'utf8')).toContain(
        'v1.1',
      );
      expect(await exists(path.join(releaseDir, 'script-new.user.js'))).toBe(true);
      expect(await exists(path.join(releaseDir, 'script-removed.user.js'))).toBe(false);
      expect(await exists(path.join(releaseDir, 'script-removed.meta.js'))).toBe(false);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('release 缺少 .user.js 但 .meta.js 版本一致时自动补齐文件', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'userscripts-release-'));
    try {
      const distDir = path.join(sandbox, 'dist');
      const releaseDir = path.join(sandbox, 'release');
      await mkdir(distDir, { recursive: true });
      await mkdir(releaseDir, { recursive: true });

      const { meta } = renderScriptFiles('script-a', '1.0.0');
      await writeFile(path.join(releaseDir, 'script-a.meta.js'), meta, 'utf8');
      await writeScriptPair(distDir, 'script-a', '1.0.0');

      const result = await syncReleaseArtifacts(distDir, releaseDir);
      expect(result.hasChanges).toBe(true);
      expect(result.updated).toEqual([{ id: 'script-a', from: '1.0.0', to: '1.0.0' }]);
      expect(await exists(path.join(releaseDir, 'script-a.user.js'))).toBe(true);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });

  it('构建产物缺失或不完整时直接报错', async () => {
    const sandbox = await mkdtemp(path.join(tmpdir(), 'userscripts-release-'));
    try {
      const distDir = path.join(sandbox, 'dist');
      const releaseDir = path.join(sandbox, 'release');
      await mkdir(distDir, { recursive: true });

      await expect(syncReleaseArtifacts(distDir, releaseDir)).rejects.toThrow(/没有找到/);

      await writeFile(path.join(distDir, 'broken.meta.js'), '// ==UserScript==\n', 'utf8');
      await expect(syncReleaseArtifacts(distDir, releaseDir)).rejects.toThrow(/不完整/);
    } finally {
      await rm(sandbox, { recursive: true, force: true });
    }
  });
});
