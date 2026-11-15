import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import esbuild from 'esbuild';
import { discoverScriptIds } from './build.ts';
import { renderDevLoader, type ScriptMeta } from './meta.ts';

export interface DevWatchOptions {
  rootDir?: string;
  distDir?: string;
  scriptId: string;
}

export interface DevWatchHandle {
  loaderPath: string;
  loaderUrl: string;
  bundlePath: string;
  bundleUrl: string;
  close: () => Promise<void>;
}

export async function startDevWatch(
  options: DevWatchOptions,
): Promise<DevWatchHandle> {
  const rootDir = options.rootDir ?? process.cwd();
  const availableIds = await discoverScriptIds(rootDir);

  if (!availableIds.includes(options.scriptId)) {
    throw new Error(
      `未找到脚本 "${options.scriptId}"，可用脚本: ${availableIds.join(', ')}`,
    );
  }

  const distDir = options.distDir ?? path.join(rootDir, 'dist');
  await mkdir(distDir, { recursive: true });

  const scriptDir = path.join(rootDir, 'userscripts', options.scriptId);
  const metaPath = path.join(scriptDir, 'meta.ts');
  const entryPath = path.join(scriptDir, 'index.ts');
  const bundlePath = path.join(distDir, 'dev.bundle.js');
  const loaderPath = path.join(distDir, 'dev.user.js');
  const bundleUrl = pathToFileURL(bundlePath).href;
  const loaderUrl = pathToFileURL(loaderPath).href;

  let resolveInitialBuild!: () => void;
  let rejectInitialBuild!: (err: unknown) => void;
  const initialBuildPromise = new Promise<void>((resolve, reject) => {
    resolveInitialBuild = resolve;
    rejectInitialBuild = reject;
  });
  let isFirstBuild = true;

  const ctx = await esbuild.context({
    entryPoints: [entryPath],
    bundle: true,
    format: 'iife',
    target: 'es2022',
    minify: false,
    write: false,
    charset: 'utf8',
    plugins: [
      {
        name: 'userscripts-dev-file',
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length > 0) {
              const errMsg = result.errors.map((e) => e.text).join('\n');
              if (isFirstBuild) {
                isFirstBuild = false;
                rejectInitialBuild(new Error(errMsg));
              }
              return;
            }
            try {
              const output = (result.outputFiles?.[0]?.text ?? '').replace(
                /\r\n/g,
                '\n',
              );
              await writeFile(bundlePath, output, 'utf8');

              const metaModule = (await import(
                `${pathToFileURL(metaPath).href}?t=${Date.now()}`
              )) as { default: ScriptMeta };
              const loader = renderDevLoader(
                options.scriptId,
                metaModule.default,
                bundleUrl,
              );
              await writeFile(loaderPath, loader, 'utf8');

              const time = new Date().toLocaleTimeString('zh-CN', {
                hour12: false,
              });
              console.log(`[${time}] Rebuilt ${options.scriptId}`);
              if (isFirstBuild) {
                isFirstBuild = false;
                resolveInitialBuild();
              }
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err);
              console.error(`[dev] 更新开发产物失败: ${message}`);
              if (isFirstBuild) {
                isFirstBuild = false;
                rejectInitialBuild(err);
              }
            }
          });
        },
      },
    ],
  });

  await ctx.watch();
  await initialBuildPromise;

  return {
    loaderPath,
    loaderUrl,
    bundlePath,
    bundleUrl,
    close: () => ctx.dispose(),
  };
}

if (import.meta.main) {
  const scriptId = process.argv[2];
  const ids = await discoverScriptIds(process.cwd());

  if (!scriptId) {
    console.error('用法: pnpm dev <script-id>');
    console.error(`可用脚本: ${ids.join(', ')}`);
    process.exit(1);
  }

  const handle = await startDevWatch({ scriptId });
  console.log(`\nDev Watch Ready (${scriptId})`);
  console.log(`  安装/切换开发脚本（浏览器打开）: ${handle.loaderUrl}`);
  console.log(`  实时输出产物: ${handle.bundlePath}\n`);

  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
