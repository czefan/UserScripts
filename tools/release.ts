import {
  appendFile,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';

export interface ReleaseChange {
  id: string;
  from: string | null;
  to: string;
}

export interface SyncReleaseResult {
  added: ReleaseChange[];
  updated: ReleaseChange[];
  removed: string[];
  unchanged: string[];
  hasChanges: boolean;
}

/**
 * 从 `.meta.js` 内容中解析 UserScript 头部块内的 `@version` 值。
 */
export function parseMetaVersion(content: string): string | null {
  const startMatch = /^\/\/ ==UserScript==[ \t]*\r?$/m.exec(content);
  if (!startMatch) return null;

  const rest = content.slice(startMatch.index + startMatch[0].length);
  const endMatch = /^\/\/ ==\/UserScript==[ \t]*\r?$/m.exec(rest);
  if (!endMatch) return null;

  const block = rest.slice(0, endMatch.index);
  const versionMatch = /^\/\/[ \t]*@version[ \t]+([^ \t\r\n][^\r\n]*?)[ \t]*$/m.exec(block);
  return versionMatch ? versionMatch[1].trim() : null;
}

function parseArtifactFilename(
  filename: string,
): { id: string; ext: '.user.js' | '.meta.js' } | null {
  if (filename.endsWith('.user.js')) {
    return { id: filename.slice(0, -'.user.js'.length), ext: '.user.js' };
  }
  if (filename.endsWith('.meta.js')) {
    return { id: filename.slice(0, -'.meta.js'.length), ext: '.meta.js' };
  }
  return null;
}

async function isFile(filePath: string): Promise<boolean> {
  return stat(filePath).then(
    (s) => s.isFile(),
    () => false,
  );
}

async function readMetaVersionIfExists(filePath: string): Promise<string | null> {
  if (!(await isFile(filePath))) return null;
  const content = await readFile(filePath, 'utf8');
  return parseMetaVersion(content);
}

/**
 * 对比 `distDir` 与现有的 `releaseDir`，仅同步新增或 `@version` 发生变化的脚本，
 * 并清理 `distDir` 中已删除的脚本产物。
 */
export async function syncReleaseArtifacts(
  distDir: string,
  releaseDir: string,
): Promise<SyncReleaseResult> {
  await mkdir(releaseDir, { recursive: true });

  const distEntries = await readdir(distDir, { withFileTypes: true });
  const distArtifacts = new Map<string, Set<'.user.js' | '.meta.js'>>();

  for (const entry of distEntries) {
    if (!entry.isFile()) continue;
    const parsed = parseArtifactFilename(entry.name);
    if (!parsed || !parsed.id) continue;
    const exts = distArtifacts.get(parsed.id) ?? new Set<'.user.js' | '.meta.js'>();
    exts.add(parsed.ext);
    distArtifacts.set(parsed.id, exts);
  }

  const sortedIds = [...distArtifacts.keys()].sort();
  if (sortedIds.length === 0) {
    throw new Error(`构建目录中没有找到任何脚本产物: ${distDir}`);
  }

  const added: ReleaseChange[] = [];
  const updated: ReleaseChange[] = [];
  const unchanged: string[] = [];

  for (const id of sortedIds) {
    const exts = distArtifacts.get(id)!;
    if (!exts.has('.user.js') || !exts.has('.meta.js')) {
      throw new Error(`构建产物不完整，脚本 ${id} 缺少 .user.js 或 .meta.js`);
    }

    const distMetaPath = path.join(distDir, `${id}.meta.js`);
    const distUserPath = path.join(distDir, `${id}.user.js`);
    const distVersion = await readMetaVersionIfExists(distMetaPath);
    if (!distVersion) {
      throw new Error(`构建产物缺少有效的 @version: ${distMetaPath}`);
    }

    const releaseMetaPath = path.join(releaseDir, `${id}.meta.js`);
    const releaseUserPath = path.join(releaseDir, `${id}.user.js`);
    const releaseVersion = await readMetaVersionIfExists(releaseMetaPath);
    const hasReleaseUser = await isFile(releaseUserPath);

    if (releaseVersion === distVersion && hasReleaseUser) {
      unchanged.push(id);
      continue;
    }

    await copyFile(distUserPath, releaseUserPath);
    await copyFile(distMetaPath, releaseMetaPath);

    if (releaseVersion === null && !hasReleaseUser) {
      added.push({ id, from: null, to: distVersion });
    } else {
      updated.push({ id, from: releaseVersion, to: distVersion });
    }
  }

  const distIdSet = new Set(sortedIds);
  const removedIds = new Set<string>();
  const releaseEntries = await readdir(releaseDir, { withFileTypes: true });

  for (const entry of releaseEntries) {
    if (!entry.isFile()) continue;
    const parsed = parseArtifactFilename(entry.name);
    if (!parsed || !parsed.id || distIdSet.has(parsed.id)) continue;

    await rm(path.join(releaseDir, entry.name), { force: true });
    removedIds.add(parsed.id);
  }

  const removed = [...removedIds].sort();
  const hasChanges = added.length > 0 || updated.length > 0 || removed.length > 0;

  return { added, updated, removed, unchanged, hasChanges };
}

if (import.meta.main) {
  const [distArg, releaseArg] = process.argv.slice(2);
  if (!distArg || !releaseArg) {
    console.error('用法: node tools/release.ts <dist-dir> <release-dir>');
    process.exit(1);
  }

  const result = await syncReleaseArtifacts(
    path.resolve(distArg),
    path.resolve(releaseArg),
  );

  for (const item of result.added) {
    console.log(`[added] ${item.id}: ${item.to}`);
  }
  for (const item of result.updated) {
    console.log(`[updated] ${item.id}: ${item.from ?? 'missing'} -> ${item.to}`);
  }
  for (const id of result.removed) {
    console.log(`[removed] ${id}`);
  }
  console.log(
    `Release sync summary: +${result.added.length} ~${result.updated.length} -${result.removed.length} =${result.unchanged.length}`,
  );

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    await appendFile(githubOutput, `has_changes=${result.hasChanges}\n`, 'utf8');
  }
}
