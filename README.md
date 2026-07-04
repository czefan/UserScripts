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
| [<img src="https://www.bilibili.com/favicon.ico" height="16px" />](./bilibili-ip-display) | **B站评论区开盒** | 在 B 站评论区显示用户 IP 属地。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/bilibili-ip-display/bilibili-ip-display.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/bilibili-ip-display/bilibili-ip-display.user.js)** |
| [<img src="https://github.githubassets.com/favicons/favicon.svg" height="16px" />](./github-username-check) | **GitHub 用户名助手 - 精筛版** | 批量检测 GitHub 用户名可用性。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/github-username-check/github-username-finecheck.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/github-username-check/github-username-finecheck.user.js)** |
| [<img src="https://www.xjtu.edu.cn/favicon.ico" height="16px" />](./xjtu-enhanced) | **XJTU-Enhanced-PC** | 优化 XJTU 网站 PC 端的排版与体验。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/xjtu-enhanced/xjtu-enhanced-pc.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/xjtu-enhanced/xjtu-enhanced-pc.user.js)** |
| [<img src="https://www.xjtu.edu.cn/favicon.ico" height="16px" />](./xjtu-enhanced) | **XJTU-Enhanced-Mobile** | 优化 XJTU 网站移动端的排版与体验。 | **[安装](https://raw.githubusercontent.com/czefan/UserScripts/main/xjtu-enhanced/xjtu-enhanced-m.user.js)** \| **[备用](https://cdn.jsdelivr.net/gh/czefan/UserScripts@main/xjtu-enhanced/xjtu-enhanced-m.user.js)** |

---

## 安装与使用

1. 安装 **Tampermonkey** 扩展（[Chrome](https://chromewebstore.google.com/detail/tampermonkey/dhdgffkkbhmkfjojejmpbldmpobfkfoj) / [Firefox](https://addons.mozilla.org/firefox/addon/tampermonkey/) / [Edge](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd?hl=zh-CN)）。
2. 点击上方表格中的 **`[安装]`** 或 **`[备用]`**，在弹出的页面中确认安装。

> [!IMPORTANT]
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
* 在浏览器扩展管理页面，启用 **`开发者模式`**。

### 3. 谷歌系浏览器无法运行脚本
* 在浏览器扩展管理 -> Tampermonkey 详情中，启用 **`允许运行用户脚本`**。

---

## License

本项目基于 [GPL-3.0](LICENSE) 协议开源。
