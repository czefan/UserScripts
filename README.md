# UserScripts

[![Stars](https://img.shields.io/github/stars/czefan/UserScripts.svg?style=flat-square&label=Star&color=4285dd&logo=github)](https://github.com/czefan/UserScripts)
[![Forks](https://img.shields.io/github/forks/czefan/UserScripts.svg?style=flat-square&label=Fork&color=4285dd&logo=github)](https://github.com/czefan/UserScripts)

Tampermonkey 用户脚本集合，基于 TypeScript、Vitest 与 esbuild 构建，产物自动发布至 `release` 分支。

---

## 脚本列表

> 点击左侧站点图标可进入对应源码目录，右侧安装链接指向 `release` 分支构建产物。

| 站点 | 脚本名称 | 功能说明 | 安装 |
| :--: | :-- | :-- | :--: |
| [<img src="https://www.bilibili.com/favicon.ico" alt="Bilibili" height="16" />](./userscripts/bilibili-ip-display) | **B站评论区开盒** | 在 B 站评论区显示用户 IP 属地。 | [安装](https://raw.githubusercontent.com/czefan/UserScripts/release/bilibili-ip-display.user.js) \| [备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@release/bilibili-ip-display.user.js) |
| [<img src="https://github.githubassets.com/favicons/favicon.svg" alt="GitHub" height="16" />](./userscripts/github-username-checker) | **GitHub 用户名检测** | 批量检测 GitHub 用户名可用性。 | [安装](https://raw.githubusercontent.com/czefan/UserScripts/release/github-username-checker.user.js) \| [备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@release/github-username-checker.user.js) |
| [<img src="https://cdn.simpleicons.org/apifox" alt="Apifox" height="16" />](./userscripts/apifox-optimizer) | **Apifox 界面紧凑优化** | 优化 Apifox Web 端界面布局，压缩顶栏与侧栏，折叠按钮置顶。 | [安装](https://raw.githubusercontent.com/czefan/UserScripts/release/apifox-optimizer.user.js) \| [备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@release/apifox-optimizer.user.js) |
| [<img src="https://www.douyin.com/favicon.ico" alt="Douyin" height="16" />](./userscripts/douyin-downloader) | **抖音下载** | 按需提取抖音当前播放视频的直链并支持下载，无后台常驻消耗。 | [安装](https://raw.githubusercontent.com/czefan/UserScripts/release/douyin-downloader.user.js) \| [备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@release/douyin-downloader.user.js) |
| [<img src="https://www.tiktok.com/favicon.ico" alt="TikTok" height="16" />](./userscripts/tiktok-enhanced) | **TikTok 增强** | 自动折叠 TikTok 侧边栏，支持 `Shift +` / `Shift -` 快捷键调节音量。 | [安装](https://raw.githubusercontent.com/czefan/UserScripts/release/tiktok-enhanced.user.js) \| [备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@release/tiktok-enhanced.user.js) |

---

## 安装与使用

1. 安装 **Tampermonkey** 扩展（[Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkbhmkfjojejmpbldmpobfkfoj) / [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) / [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd?hl=zh-CN)）。
2. 点击上方表格中的 **「安装」** 或 **「备用」**，在弹出的安装页面中确认即可。

> [!NOTE]
>
> - 所有脚本均基于 **Tampermonkey 正式版** 测试。
> - 如需彻底重装某个脚本，请先在 Tampermonkey 的「回收站」中清除同脚本残留后再安装。

### 常见环境排查

- **Chromium 系浏览器脚本不运行（Tampermonkey v5.2.0+）**：在浏览器扩展管理页启用 **「开发者模式」**，并在 Tampermonkey 详情页中启用 **「允许运行用户脚本」**。
- **部分页面样式或注入被拦截（Tampermonkey v5.0.0+）**：在 Tampermonkey 设置中将「配置模式」切换为 **「高级」**，检查 **「安全 → 修改内容安全策略（CSP）头信息」** 配置。

---

## 开发与贡献

有关项目结构、本地调试、测试命令与发布流程，请查阅 [CONTRIBUTING.md](./CONTRIBUTING.md)。

---

## License

本项目基于 [GPL-3.0](./LICENSE) 协议开源。
