用户想调整 Claude Code 的界面外观（Cyberline）。参数：`$ARGUMENTS`

直接用 Bash 执行这一条，不要自己判断参数类型 —— 脚本会自己路由：

```
node ~/.claude/cyberline/cyberline.js apply $ARGUMENTS
```

然后把输出简明转述给用户（不要粘贴 ANSI 转义码）。

参数速查（供你理解输出，不用于分支判断）：
- 主题名 `neon` / `outrun` / `matrix` / `tokyo` — 切主题
- `bg gradient|grid|none` — 切背景；`opacity 0.1-1.0` — 背景浓淡
- `banner auto|compact|minimal` — 启动横幅高度
- `toggle <分段>` / `labels` / `one` / `two` — 状态栏分段与布局
- 空参数 — 列出主题与当前配置
- `reload` — 开新 WT 标签页让终端改动生效

补充说明：

- 状态栏改动**立即生效**；终端配色与背景图由 Windows Terminal 的 profile 提供，
  只在**新建标签页**时加载。脚本在 WT 内会自动开新标签页；不在 WT 内会明确提示。
- 如果用户说「背景没变」，先确认他是不是在经典 PowerShell 窗口（conhost）里 ——
  那里不加载 WT profile。脚本的输出会指出这一点。
- 用户想看效果时才额外跑：`node ~/.claude/cyberline/preview.js <主题>`（状态栏预览）
  或 `node ~/.claude/cyberline/bgpreview.js [--all|--levels]`（背景预览，即时，不用重启）。
- `bgpreview` 报告里灰字对比度低于 4.5:1 要提醒影响可读性。
- `uninstall` 会还原 statusLine 与 Windows Terminal 配置，执行前先向用户确认。
