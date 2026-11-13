# UserScripts

[![GitHub license](https://img.shields.io/github/license/czefan/UserScripts.svg?style=flat-square&color=4285dd&logo=github)](https://github.com/czefan/UserScripts/)
[![GitHub Star](https://img.shields.io/github/stars/czefan/UserScripts.svg?style=flat-square&label=Star&color=4285dd&logo=github)](https://github.com/czefan/UserScripts/)
[![GitHub Fork](https://img.shields.io/github/forks/czefan/UserScripts.svg?style=flat-square&label=Fork&color=4285dd&logo=github)](https://github.com/czefan/UserScripts/)

🔨 自用的一些油猴脚本

---

## 脚本列表

> _详细的脚本源码与文件结构，可以点击左侧图标进入对应源码文件夹查看。_

| 站点 | 脚本名称 | 脚本功能 | 安装 |
| :----: | :---- | :---- | :----: |
| [<img src="https://www.bilibili.com/favicon.ico" alt="Bilibili" height="16px" />](./bilibili) | **B站评论区开盒** | 在 B 站评论区显示用户 IP 属地。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/bilibili/bilibili-ip-display.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/bilibili/bilibili-ip-display.user.js)** |
| [<img src="https://github.githubassets.com/favicons/favicon.svg" alt="GitHub" height="16px" />](./github) | **GitHub 用户名检测** | 批量检测 GitHub 用户名可用性。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/github/github-username-checker.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/github/github-username-checker.user.js)** |
| [<img src="https://cdn.simpleicons.org/apifox" alt="Apifox" height="16px" />](./apifox) | **Apifox 界面紧凑优化** | 优化 Apifox Web 端界面布局，压缩顶栏与侧栏，折叠按钮置顶。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/apifox/apifox-optimizer.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/apifox/apifox-optimizer.user.js)** |
| [<img src="https://www.douyin.com/favicon.ico" alt="Douyin" height="16px" />](./douyin) | **抖音下载** | 按需提取抖音当前播放视频的直链并支持下载，无后台常驻消耗。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/douyin/douyin-downloader.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/douyin/douyin-downloader.user.js)** |

---

## 安装与使用

1. 安装 **Tampermonkey** 扩展（[Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkbhmkfjojejmpbldmpobfkfoj) / [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) / [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd?hl=zh-CN)）。
2. 点击上方表格中的 **`[安装]`** 或 **`[备用]`**，在弹出的页面中确认安装。

> [!IMPORTANT]
>
> - 仅支持 **Tampermonkey 正式版**。
> - 重装前需在扩展的**回收站中彻底删除**旧脚本。

---

## 常见问题排查

### 1. 脚本在部分网站无法运行 (Tampermonkey v5.0.0+)

1. 打开 Tampermonkey 设置。
2. 将 `配置模式` 改为 **`高级`**。
3. 找到 `安全` -> `修改内容安全策略（CSP）头信息`。
4. 改为 **`全部移除`** 并保存。

### 2. 脚本完全不运行 (Tampermonkey v5.2.0+)

- 在浏览器扩展管理页面，启用 **`开发者模式`**。

### 3. 谷歌系浏览器无法运行脚本

- 在浏览器扩展管理 -> Tampermonkey 详情中，启用 **`允许运行用户脚本`**。

---

## 开发与验证

使用 Node.js 运行无需第三方依赖的回归测试：

```sh
node --test
```

测试按脚本拆分在 `tests/` 下，例如仅测试 GitHub：`node --test tests/github.test.cjs`。

测试覆盖 GitHub 校验结果、取消/重置、限流和续跑，以及抖音链接提取、下载异常和 B 站评论监听。网页兼容性仍需在 Tampermonkey 中实测。

GitHub 检测在请求失败或超时时暂停，重新开始会重试当前用户名。0.1.1 使用新的进度缓存，旧版名单会保留，但旧进度和可用结果需要重新检测，避免沿用超时误报。

本地网页快照可能包含账号信息和令牌，所有 `*.html` 及 `diagnostics/` 已加入 `.gitignore`。

---

## License

本项目基于 [GPL-3.0](LICENSE) 协议开源。
