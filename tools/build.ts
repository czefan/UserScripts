import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { renderHeader, type ScriptMeta } from './meta.ts';

export async function discoverScriptIds(rootDir: string): Promise<string[]> {
  const scriptsDir = path.join(rootDir, 'userscripts');
  const entries = await readdir(scriptsDir, { withFileTypes: true });
  const ids: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const entryPath = path.join(scriptsDir, entry.name);
    const hasEntry = await stat(path.join(entryPath, 'index.ts')).then(
      (s) => s.isFile(),
      () => false,
    );
    const hasMeta = await stat(path.join(entryPath, 'meta.ts')).then(
      (s) => s.isFile(),
      () => false,
    );

    const missing: string[] = [];
    if (!hasEntry) missing.push('index.ts');
    if (!hasMeta) missing.push('meta.ts');
    if (missing.length > 0) {
      throw new Error(
        `脚本目录 userscripts/${entry.name} 不完整，缺少: ${missing.join(', ')}`,
      );
    }

    ids.push(entry.name);
  }

  return ids.sort();
}

export async function buildAll(rootDir: string = process.cwd()): Promise<string[]> {
  const distDir = path.join(rootDir, 'dist');
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  const ids = await discoverScriptIds(rootDir);

  for (const id of ids) {
    const scriptDir = path.join(rootDir, 'userscripts', id);
    const metaModule = (await import(
      `${pathToFileURL(path.join(scriptDir, 'meta.ts')).href}?t=${Date.now()}`
    )) as { default: ScriptMeta };

    const header = renderHeader(id, metaModule.default);
    const result = await esbuild.build({
      entryPoints: [path.join(scriptDir, 'index.ts')],
      bundle: true,
      format: 'iife',
      target: 'es2022',
      minify: false,
      write: false,
      banner: { js: header },
      charset: 'utf8',
    });

    const userJs = result.outputFiles[0].text.replace(/\r\n/g, '\n');
    await writeFile(path.join(distDir, `${id}.user.js`), userJs, 'utf8');
    await writeFile(path.join(distDir, `${id}.meta.js`), `${header}\n`, 'utf8');
  }

  return ids;
}

if (import.meta.main) {
  const ids = await buildAll(process.cwd());
  console.log(`Built ${ids.length} script(s): ${ids.join(', ')}`);
}
