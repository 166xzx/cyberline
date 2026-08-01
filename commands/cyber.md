---
description: 切换 Cyberline 界面主题与状态栏分段
---

用户想调整 Claude Code 的界面外观（Cyberline）。参数：`$ARGUMENTS`

Cyberline 安装在 `~/.claude/cyberline/`，通过 `cyberline.js` 控制。

请按下列规则处理，用 Bash 执行对应命令，然后把结果简明汇报给用户：

**无参数** — 运行以下两条，展示可用主题与当前配置：
```
node ~/.claude/cyberline/cyberline.js list
node ~/.claude/cyberline/cyberline.js status
```

**参数是主题名**（`neon` / `outrun` / `matrix` / `tokyo`）— 切换主题，然后展示预览：
```
node ~/.claude/cyberline/cyberline.js use <主题>
node ~/.claude/cyberline/preview.js <主题>
```
切换终端配色需要用户**重启 Windows Terminal** 才能看到，请提醒。状态栏是立即生效的。

**参数是 `preview`** — 展示全部主题的渲染效果：
```
node ~/.claude/cyberline/preview.js all
```

**参数形如 `toggle <分段名>`** — 开关某个信息分段。可用分段：`model` `flags` `dir` `git` `context` `cost` `duration` `lines` `rateLimits` `outputStyle` `vim` `agent` `worktree`
```
node ~/.claude/cyberline/cyberline.js toggle <分段>
```

**参数是 `one` 或 `two`** — 切换单行/双行布局：
```
node ~/.claude/cyberline/cyberline.js layout <one|two>
```

**参数是 `labels`** — 切换中文标签的显示/隐藏。显示时每项前有「模型」「目录」「上下文」等说明；隐藏则更紧凑：
```
node ~/.claude/cyberline/cyberline.js labels
```

**参数形如 `bg <风格>`**（`gradient` / `grid` / `none`，也接受 `渐变` / `网格` / `无`）— 切换 Windows Terminal 背景：
```
node ~/.claude/cyberline/cyberline.js bg <风格>
node ~/.claude/cyberline/bgpreview.js <风格>
```
- `gradient` 霓虹渐变图
- `grid` 网格 HUD 图
- `none` 不用背景图，改用亚克力半透明

**参数形如 `opacity <数值>`**（0.1–1.0）— 调背景浓淡。数值越大背景越明显：
```
node ~/.claude/cyberline/cyberline.js opacity <数值>
node ~/.claude/cyberline/bgpreview.js
```

**参数是 `bgpreview`** — 在终端里直接画出当前背景，叠真实文字看可读性，并报告亮度与对比度：
```
node ~/.claude/cyberline/bgpreview.js
```

**参数是 `levels`** — 同一背景在 0.4 / 0.55 / 0.7 / 0.85 / 1.0 五档下横向对比，用来挑数值：
```
node ~/.claude/cyberline/bgpreview.js --levels
```

**参数是 `bgall`** — 三种背景（渐变 / 网格 / 无）并排对比：
```
node ~/.claude/cyberline/bgpreview.js --all
```

**参数形如 `banner <风格>`**（`auto` / `compact` / `minimal`）— 调启动横幅的高度：
```
node ~/.claude/cyberline/cyberline.js banner <风格>
node ~/.claude/cyberline/banner.js
```
- `auto` 按视口高度自选（默认）。窗口够高显示完整 LOGO，太矮时自动收起
- `compact` 始终不显示 LOGO，只留分隔线 + 信息行 + 提示
- `minimal` 只留目录行和提示行，共两行

如果用户反馈「刚打开时欢迎图和输入框之间有一大块空白」，那是首屏放不下导致的：
横幅把光标推低后 Claude Code 的首帧溢出视口，终端滚动，而 Ink 仍按滚动前的坐标
擦改行，擦不到的位置留成空白。让横幅更矮即可（`banner compact` 或把窗口拉高）。

背景改动需**重启 Windows Terminal** 才能看到，请提醒用户。但 `bgpreview.js` 的预览是**即时**的，不用重启就能判断好不好看。

看完预览后，如果用户说太淡/太浓，用 `opacity` 调；如果说图案不喜欢，用 `bg` 换风格。
`bgpreview.js` 报告里「灰字对比度」低于 4.5:1 就要提醒用户会影响可读性。

如果背景图不存在（例如新增主题后），先生成：
```
node ~/.claude/cyberline/make-bg.js all
```

**参数是 `uninstall`** — 卸载前先向用户确认，说明会还原 statusLine（回到 ccline）与 Windows Terminal 配色，确认后执行：
```
node ~/.claude/cyberline/cyberline.js uninstall
```

**其它无法识别的参数** — 展示 `cyberline.js` 的帮助（不带参数运行它），并说明支持哪些用法。

汇报时简洁即可，不要粘贴大段 ANSI 转义码。
