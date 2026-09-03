# Phrase Highlighter for Language Reactor

[English](README.md) | [Türkçe](README.tr.md) | [Español](README.es.md) | **简体中文** | [Русский](README.ru.md)

给用 [Language Reactor](https://www.languagereactor.com) 学语言的人准备的 Chrome 扩展。只在 languagereactor.com 上有效。不会在 youtube.com 或 netflix.com 上运行。

打开一课后，点 Phrase Highlighter 图标（Language Reactor 工具栏上的第一个按钮）。右侧会打开侧栏，显示当前这一行的短语释义卡片，不是整部视频或整本书。嵌套短语都会出现，例如 `going to be` 和 `going to`。释义来自页面里 Language Reactor 自己的词典。打开 Language Reactor 网站就够了，不需要 Language Reactor 的 Chrome 扩展。

<img src="docs/screenshot.jpg" alt="Language Reactor 侧栏中的短语卡片">

## 安装

这个扩展不在 Chrome 网上应用店。请用 GitHub Releases 的 zip 安装。

1. 下载 [v1.0.0 zip](https://github.com/official-burak/phrase-highlighter-for-language-reactor/releases/download/v1.0.0/phrase-highlighter-for-language-reactor-1.0.0.zip)。
2. 解压。
3. 在 Chrome 打开 `chrome://extensions`。
4. 打开开发者模式。
5. 点“加载已解压的扩展程序”。
6. 选择含 `manifest.json` 的文件夹。

更新后，先在该页面重新加载扩展，再刷新 languagereactor.com 标签页。

## 怎么用

1. 安装这个 Chrome 扩展（见安装）。
2. 打开 [languagereactor.com](https://www.languagereactor.com)。
3. 打开一课（视频、书、播客或文本）。
4. 点 Language Reactor 工具栏上的 Phrase Highlighter 图标。彩色表示侧栏已打开，灰色表示已关闭，灰色时也可以点。Chrome 会记住你的选择。
5. 看当前这一行的短语卡片。如果这一行没有短语，侧栏会保持打开，并显示扩展图标，等到有短语再换成卡片。

## 看不到图标时

**为什么在 YouTube.com 上看不到？**

需要通过 Language Reactor 观看，而不是直接打开 youtube.com。

**图标不见了。**

打开一课。它在目录、已保存内容、设置和首页上是隐藏的。

它只在 Language Reactor 上运行，不会把课文发到别的服务器。本项目与 Language Reactor 或 Dioco 没有隶属关系。

[Privacy](PRIVACY.md) · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE). Copyright 2026 Burak Keskin.
