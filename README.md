# Cyberline

赛博朋克风格的 [Claude Code](https://claude.com/claude-code) 界面美化套件 —— 状态栏、终端配色、背景图与启动横幅。

**零依赖**：全部用 Node 内置模块实现，连 PNG 编解码都是手写的，`npm install` 都不用跑。

```
模型 Opus 5 │ 模式 high·快速 │ 目录 ~/projects/api │ 分支 main ● │ 上下文 ███░░░░░ 42% 84k
└ 花费 $1.28 │ 用时 1h15m API占40% │ 改动 +247 -63 │ 5时额度 32% │ 7天额度 88%
```

<!-- 截图放这里效果最好，建议补两张：
     docs/statusline.png  — 状态栏特写（终端里放大截，能看清标签和进度条）
     docs/themes.png      — 四套主题并排（跑 `node preview.js all` 后截全屏）
![状态栏](docs/statusline.png)
![四套主题](docs/themes.png)
-->

## 环境要求

| 项目 | 要求 | 说明 |
|---|---|---|
| 系统 | Windows | 终端集成部分依赖 Windows Terminal；状态栏本身跨平台 |
| 终端 | [Windows Terminal](https://aka.ms/terminal) | 配色 / 背景图 / 横幅都由 WT 的 profile 提供 |
| Node | ≥ 18 | 用到了 `matchAll`、可选链等 |
| 字体 | 无需 Nerd Font | 只用通用 Unicode（`│ ◆ ⑂ █ ░`），不会出豆腐块 |

经典 conhost（从资源管理器直接开的 PowerShell 窗口）只能显示状态栏，看不到主题色和横幅。

## 安装

```bash
git clone https://github.com/166xzx/cyberline.git ~/.claude/cyberline
cd ~/.claude/cyberline
node cyberline.js install
```

`install` 做三件事：

1. 把 `statusLine` 写进 `~/.claude/settings.json`（原有配置会备份，卸载时还原）
2. 在 Windows Terminal 建一条名为「Claude Code」的专用 profile，并设为默认
3. 生成 `config.json`（个人配置，不入库）

**完全关闭再打开 Windows Terminal** 后生效 —— WT 的 profile 改动不热加载。

想先看看效果再决定：

```bash
node preview.js all       # 四套主题 × 全场景渲染
node bgpreview.js --all   # 三种背景并排对比
```

### 卸载

```bash
node cyberline.js uninstall
```

还原 `statusLine` 与 Windows Terminal 配置（含 `defaultProfile`）。已验证往返不丢失 `model` / `env` / `mcpServers` 等其它设置。

## 快速使用

装了 slash 命令的话（把 `commands/cyber.md` 复制到 `~/.claude/commands/`）：

```
/cyber              查看主题列表与当前配置
/cyber outrun       切换到合成波主题
/cyber preview      预览全部主题效果
/cyber bg grid      背景换成网格 HUD
/cyber labels       中文标签 显示/隐藏
/cyber toggle git   开关 git 分段
/cyber two          切回双行布局
```

命令行等价操作：

```bash
node cyberline.js apply neon # 统一入口：自动判断参数类型
node cyberline.js list       # 列出主题（带色板预览）
node cyberline.js use neon   # 切换主题
node cyberline.js bg grid    # 切换背景风格
node cyberline.js status     # 当前配置
node cyberline.js reload     # 开新 WT 标签页，让终端改动生效
node preview.js all          # 全主题 × 全场景预览
```

`apply` 会自己判断参数是主题名还是子命令（`apply neon` / `apply bg grid` / `apply opacity 0.6`），
并在切换后自动开一个新的 Windows Terminal 标签页 —— **WT 的 profile 属性只在标签页创建时读取**，
正在运行的会话不会热加载，这是「改了却看不到效果」最常见的原因。

不在 Windows Terminal 里（例如经典 PowerShell / conhost 窗口）时，
`apply` 会明确提示：那种窗口不加载 WT profile，状态栏能显示但看不到配色和背景。

## 四套主题

| 主题 | 风格 | 适用 |
|---|---|---|
| `neon` | 纯黑底 + 青/洋红霓虹 | 默认，冲击力最强 |
| `outrun` | 紫底 + 橙粉合成波 | 80 年代复古感 |
| `matrix` | 单色绿 | 极致终端感 |
| `tokyo` | 深蓝紫低刺激 | 长时间工作护眼 |

切换主题会同时改**状态栏**、**终端配色**和**背景图**（背景图按主题配色生成，会跟着一起换）。
终端相关改动需重启 Windows Terminal 生效；状态栏立即生效。

只改状态栏、不动终端：加 `--no-terminal`。

## 三种背景

```bash
node cyberline.js bg gradient    # 霓虹渐变（默认）— 左上→右下对角渐变 + 暗角
node cyberline.js bg grid        # 网格 HUD — 48px 细线 / 240px 主线
node cyberline.js bg none        # 不用图，改用亚克力半透明（opacity 88）
node cyberline.js opacity 0.55   # 背景浓淡 0.1–1.0，默认 0.7
```

也接受中文别名：`bg 渐变` / `bg 网格` / `bg 无`。

背景图是**纯计算生成**的，克隆下来就能用，缺图时切主题会自动补齐。
由 `make-bg.js` 生成（手写 PNG 编码，无第三方依赖），1920×1080，每主题两张，放在 `backgrounds/`。
PNG 的读写由 `pngwrite.js` / `pngread.js` 提供。

**亮度是按合成后的显示值定的，不是按图本身。** Windows Terminal 的实际显示值为

```
显示值 = 图 × backgroundImageOpacity + profile 背景色 × (1 − opacity)
```

注意混的是**主题底色**而不是纯黑 —— 早期按纯黑建模，导致生成的图在真实终端里几乎看不见。
`make-bg.js` 以 `SHOWN_CAP = 40` 反推每张图的上限，保证最暗的 dim 灰字仍有 4.5:1（WCAG AA）。

用 `bgpreview.js` 在终端里直接验证，不必重启：

```bash
node bgpreview.js            # 当前背景 + 真实文字 + 对比度报告
node bgpreview.js --levels   # 0.4 / 0.55 / 0.7 / 0.85 / 1.0 五档横向对比
node bgpreview.js --all      # 三种背景并排
```

报告里除对比度外还有**跨度**（显示 luma 的 max − min）—— 它独立于对比度，用来判断背景是否真的看得见（≥25 为可见）。

新增主题后重新生成：

```bash
node ~/.claude/cyberline/make-bg.js all
```

背景图与亚克力互斥 —— 用图时自动关掉 `useAcrylic`，选 `none` 时才启用透明。

## 状态栏显示内容

```
模型 Opus 5 │ 模式 high·快速 │ 目录 ~/projects/api │ 分支 main ● │ 上下文 ███░░░░░ 42% 84k
└ 花费 $1.28 │ 用时 1h15m API占40% │ 改动 +247 -63 │ 5时额度 32% │ 7天额度 88%
```

第一行 — 模型、推理强度/快速模式、目录、git 分支（`●` = 有未提交改动）、上下文占用条。
第二行 — 成本、会话时长（含 API 耗时占比）、代码增删行数、5 小时/7 天限额、输出风格。

每项前有中文标签说明含义，嫌啰嗦可用 `/cyber labels` 隐藏。

按需着色：上下文与限额占用 <40% 绿、40–70% 青、70–90% 黄、≥90% 红。

超窗时显示 `⚠ 超1M`（标签跟着**当前模型的真实容量**变：200k 模型显示 `⚠ 超200k`，挂 `[1m]` 的显示 `⚠ 超1M`）。
判据取 payload 的 `context_window.context_window_size`，不是 `exceeds_200k_tokens` —— 后者是字面意义的 200k 标志，
与窗口容量无关，用 1M 模型时一过 20 万 token 就会为真，会在还剩 80% 余量时一直误报。

存在时才显示的分段：Vim 模式、子代理名、worktree 名。值为 0 或默认的分段会自动隐藏，避免噪音。

**自动收窄**：终端太窄会逐级降级 —— 宽间距 → 窄间距 → 标签换简称（`5h` / `⑂` / `◈`）→ 去标签。
标签是先简写再删，不会直接留下看不懂的裸数字。

## 配置

`~/.claude/cyberline/config.json`：

```json
{
  "theme": "neon",
  "twoLine": true,
  "labels": true,
  "background": "gradient",
  "backgroundOpacity": 0.7,
  "bannerStyle": "auto",
  "bannerEnv": true,
  "barWidth": 8,
  "segments": { "model": true, "git": true, "cost": true, ... }
}
```

窄终端建议 `"twoLine": false` 压成单行，或关掉不需要的分段。

可开关的分段：`model` `flags` `dir` `git` `context` `cost` `duration` `lines` `rateLimits` `outputStyle` `vim` `agent` `worktree`

`bannerEnv` 控制横幅是否显示代理端点与模型。为了截图安全，代理**只显示主机名**
（`https://proxy.example.com/v1` → `proxy.example.com`）；设为 `false` 则完全不显示这两行。

## 启动横幅

Windows Terminal 的「Claude Code」profile 走 `cc.cmd`，会自动显示横幅后进入 Claude Code。

手动运行也可以：

```cmd
~/.claude/cyberline/cc.cmd [claude 的任意参数]
```

显示渐变 logo、目录、分支、代理主机名、模型后进入 Claude Code，参数原样透传（`cc.cmd --resume` 等）。

想在别处也用，把 `~/.claude/cyberline` 加进 PATH，之后用 `cc` 代替 `claude`。
退出后不停留：设 `CYBERLINE_NO_PAUSE=1`。

### 高度是自适应的，这一点很关键

```bash
node cyberline.js banner auto      # 按视口高度自选（默认）
node cyberline.js banner compact   # 始终不显示 LOGO
node cyberline.js banner minimal   # 只留目录行 + 提示行
```

横幅会先量 `process.stdout.rows`，减去 `RESERVE_ROWS = 20`（Claude Code 首帧要占的行数）得到预算，
再按预算决定显示到哪一档：满配 10 行（3 行 LOGO + 上下分隔线 + 最多 4 行信息 + 提示行），
预算不足 9 行先丢 LOGO，不足 5 行只留两行；信息行也会按剩余空间从后往前截断。

**为什么要这么做。** Claude Code 的 TUI 是 Ink 的差分渲染 —— 欢迎图、输入框、状态栏是一帧整体重绘，
Ink 按写入时的光标坐标回改各行。横幅把光标推低后，如果这一帧放不进视口，终端会向上滚动，
而 Ink 仍按滚动前的坐标去擦改，擦不到的位置就留成空白，表现为**欢迎图和输入框之间一大块空缺**。

修法不是猜 Ink 怎么擦，而是不让首屏溢出。这也解释了为什么这个问题会时有时无：
有没有 git 分支行、有没有代理行都会让横幅高度浮动，正好卡在临界点上下摆动。

`cc.cmd` 调 banner 时带 `--clear`（`\x1b[2J\x1b[3J\x1b[H` 清屏 + 清回滚），把视口余量拉到最大。
另可用 `CYBERLINE_BANNER_ARGS` 追加参数，如 `--compact`。

窗口默认 30 行（Windows Terminal 未设 `initialRows` 时的默认值），此时预算恰好 10 行、LOGO 保留。
如果把窗口调得更矮又想留住 LOGO，只能减少信息行 —— 或者接受 compact。

## 卸载

```bash
node ~/.claude/cyberline/cyberline.js uninstall
```

还原 `statusLine` 到安装前的状态（若此前用的是别的状态栏，会恢复成它），并从
`settings.json.cyberline-bak` 还原 Windows Terminal 配置（含 `defaultProfile`，会退回你原来的 profile）。
已验证往返不会丢失 `model` / `env` / `mcpServers` 等其它设置。

## 实现说明

- **字段来源**：状态栏字段取自 claude-code 2.1.220 的 statusLine payload 构造函数，非推测。`context_window.used_percentage` 由官方直接提供，无需自行计算 token 占比。
- **不依赖 Nerd Font**：本机未安装 Nerd Font，因此全部使用通用 Unicode（`│ ◆ ⑂ █ ░`），不会出现豆腐块。想换 Powerline 箭头需先装 Nerd Font 并改 `statusline.js` 里的 `SEP`。
- **专用 WT profile**：用固定 GUID 新建一条 profile，而不是改 `profiles.defaults` —— 你原有的 PowerShell 配置完全不动，反复切主题也只更新同一条。
- **容错**：任何字段缺失都降级而非抛错；渲染异常时输出错误提示而非空状态栏。git 查询限 700ms 超时，大仓库不会卡住状态栏。
- **性能**：单次渲染约 265ms，主要是 Node 冷启动，在 Claude Code 的 300ms 防抖内。想再快就 `toggle git`（那是唯一会起子进程的分段）。
- **调试**：`CYBERLINE_DEBUG=1` 会把最近一次 payload 存到系统临时目录的 `cyberline-last-payload.json`（不在仓库内 —— payload 含工作路径与成本）。

## 文件

```
statusline.js   状态栏渲染（Claude Code 调用入口）
themes.js       四套主题的色板定义
cyberline.js    控制器：切换 / 开关 / 背景 / 横幅 / 安装 / 卸载
preview.js      测试台：全场景渲染预览
banner.js       启动横幅（含首屏高度自适应）
cc.cmd          启动器（WT profile 调用它，必须保持纯 ASCII）

make-bg.js      渐变 / 网格背景图生成
bgpreview.js    在终端里预览背景 + 对比度/跨度报告
pngwrite.js     PNG 编码（手写，无第三方依赖）
pngread.js      PNG 解码 —— 供预览取真实像素
backgrounds/    8 张背景图（4 主题 × 2 风格）

commands/       slash 命令定义，复制到 ~/.claude/commands/ 启用
config.example.json  配置模板；install 会据此生成 config.json
```

`config.json` 是个人偏好，不入库，见 `.gitignore`。

## 贡献

欢迎 PR。加主题只要在 `themes.js` 里补一份色板：

```js
mytheme: {
  label: '主题名',
  ui: { magenta: [r,g,b], cyan: [...], green: [...], yellow: [...],
        red: [...], blue: [...], text: [...], dim: [...] },
  terminal: { background: '#0a0a12', foreground: '#c0caf5', /* ...16 色 */ },
}
```

`ui` 给状态栏，`terminal` 给 Windows Terminal 配色方案。加完跑 `node make-bg.js all`
生成配套背景图，再 `node preview.js mytheme` 看效果。

两条硬约束，改代码时注意：

- **`cc.cmd` 必须保持纯 ASCII。** cmd.exe 用 OEM 代码页解析每一行（早于 `chcp 65001` 生效），
  UTF-8 中文会被误码成 `&`/`|` 破坏解析 —— 连注释里都不行，曾导致 profile 秒退。
- **状态栏任何字段缺失都要降级而非抛错。** 状态栏挂掉比难看更糟。

## 致谢

分段间隙与排版风格参考了 [ccline](https://github.com/Haleclipse/CCometixLine)。

## License

[MIT](LICENSE)
