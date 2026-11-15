# 开发与贡献指南

本仓库使用 TypeScript 编写油猴脚本，经由 `esbuild` 打包为单文件 IIFE，并通过 Vitest 进行本地单元测试、元数据校验与构建产物校验。

## 环境要求

- **Node.js**：`>= 26`（直接运行 `tools/*.ts` 脚本依赖原生 TypeScript 支持）
- **pnpm**：`>= 12`（包管理统一使用 `pnpm`）

## 目录结构

```text
.
├── .github/workflows/ci.yml   # PR/main 校验与 release 分支自动发布
├── userscripts/               # 各脚本独立目录（<id>/meta.ts, index.ts, 业务模块与 *.test.ts）
├── shared/                    # 跨脚本共用模块（至少两个脚本实际复用时才提取）
├── templates/userscript/      # 新建脚本模板（meta.ts / index.ts）
├── tools/
│   ├── build.ts               # 遍历 userscripts/* 并输出 dist/<id>.user.js 与 <id>.meta.js
│   ├── dev.ts                 # 监听单个脚本变更并输出本地调试文件 dist/dev.user.js
│   ├── meta.ts                # 元数据校验规则、公共字段注入与 UserScript Header 渲染
│   ├── new.ts                 # 从模板创建新脚本目录的脚手架
│   └── release.ts             # 对比 release 分支版本号并同步新增/变更脚本产物
└── tests/
    ├── meta.test.ts           # 元数据校验、脚本发现与开发模式测试
    ├── release.test.ts        # release 分支增量发布逻辑测试
    └── dist.test.ts           # 构建产物完整性、格式与无残留导入导出检查
```

## 常用命令

```sh
pnpm install      # 安装开发依赖
pnpm new <id>     # 从 templates/userscript/ 创建新脚本目录 userscripts/<id>/
pnpm dev <id>     # 启动监听模式，输出本地调试用 dist/dev.user.js 与 dist/dev.bundle.js
pnpm typecheck    # 运行 TypeScript 严格类型检查
pnpm test         # 运行各脚本单元测试、meta 校验与 release 同步测试
pnpm build        # 打包所有脚本到 dist/
pnpm check:dist   # 运行 tests/dist.test.ts 校验构建产物
```

## 本地调试流程（`file://` 模式）

1. 在仓库根目录执行：

   ```sh
   pnpm dev <id>
   ```

   终端会打印本地调试脚本的 `file:///.../dist/dev.user.js` 地址。
2. 在浏览器扩展管理页中，为 Tampermonkey 临时开启 **「允许访问文件网址」**。
3. 在浏览器地址栏打开上述 `file:///.../dist/dev.user.js` 并确认安装；油猴中只维护这唯一一个固定标识的 `[DEV]` 脚本，切换调试其他脚本时重新打开同一地址覆盖即可。
4. 修改源码保存后，脚本会自动重编到 `dist/dev.bundle.js`，在目标网页刷新即可验证改动。
5. 调试结束不再使用 `pnpm dev` 时，建议在浏览器扩展管理页关闭「允许访问文件网址」权限。

## 工程约束

- **目录与 ID 一致**：`userscripts/` 下的每个子目录名即为脚本 ID 与发布文件名，且必须同时包含 `meta.ts` 和 `index.ts`。
- **独立版本管理**：各脚本在自己的 `meta.ts` 中独立维护 `version`，不使用根目录 `package.json` 统一覆盖；`namespace`、`author`、`license`、`homepageURL`、`supportURL`、`updateURL`、`downloadURL` 由 [tools/meta.ts](./tools/meta.ts) 统一生成。
- **元数据校验**：必填字段、数组项非空及单行（禁止 `\r` / `\n`）校验同时嵌入在渲染阶段，确保测试与打包均无法绕过。
- **就近测试与按需共享**：单元测试紧邻脚本业务模块存放（`*.test.ts`）并直接导入目标函数测试；`shared/` 仅在至少两个脚本存在实际复用需求时再提取。

## CI 与发布流程

- **Pull Request / 推送 `main`**：依次运行 `pnpm typecheck` → `pnpm test` → `pnpm build` → `pnpm check:dist`。
- **推送 `main` 发布**：校验阶段全部通过后，`deploy-release` 任务在发布锁内校验当前提交是否仍为远端 `main` 最新 `HEAD`；确认一致后通过 [tools/release.ts](./tools/release.ts) 逐个比对各脚本 `@version` 与 `release` 分支现有产物，仅同步新增或版本号变更的脚本，并清理源码已删除的脚本（所有脚本版本均未变化或过期构建会自动跳过）。

## 忽略文件与隐私保护

以下本地文件已在 `.gitignore` 中忽略，不会进入版本控制：

- 本地网页参考或诊断快照：`*.html`、`/diagnostics/`
- 依赖与构建输出：`node_modules/`、`dist/`
