import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

const id = process.argv[2];

if (!id || !/^[a-z0-9-]+$/.test(id)) {
  console.error('用法: pnpm new <script-id>（仅允许小写字母、数字和连字符）');
  process.exit(1);
}

const rootDir = process.cwd();
const templateDir = path.join(rootDir, 'templates', 'userscript');
const targetDir = path.join(rootDir, 'userscripts', id);

const exists = await stat(targetDir).then(
  () => true,
  () => false,
);
if (exists) {
  console.error(`目录已存在: userscripts/${id}`);
  process.exit(1);
}

await mkdir(targetDir, { recursive: true });

for (const file of ['meta.ts', 'index.ts']) {
  const content = await readFile(path.join(templateDir, file), 'utf8');
  await writeFile(
    path.join(targetDir, file),
    content.replaceAll('__SCRIPT_NAME__', id),
    'utf8',
  );
}

console.log(`已创建脚本骨架: userscripts/${id}/`);
