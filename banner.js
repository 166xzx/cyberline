#!/usr/bin/env node
/**
 * Cyberline 启动横幅 —— 进入 Claude Code 前的赛博朋克开场。
 * 由 launch.cmd 调用；也可单独运行预览。
 *
 * 用法: node banner.js [--compact] [--clear]
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { THEMES, DEFAULT_THEME } = require('./themes.js');

const CONFIG = path.join(__dirname, 'config.json');

function readCfg() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (_) {
    return {};
  }
}

function cfgTheme() {
  const k = readCfg().theme;
  if (THEMES[k]) return THEMES[k];
  return THEMES[DEFAULT_THEME];
}

const T = cfgTheme();
const U = T.ui;
const R = '\x1b[0m';
const fg = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;

/** 在两色之间线性插值，用于渐变标题 */
function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** 逐字符横向渐变 */
function gradient(text, from, to) {
  const chars = [...text];
  return chars
    .map((ch, i) => {
      if (ch === ' ') return ch;
      const t = chars.length > 1 ? i / (chars.length - 1) : 0;
      return fg(lerp(from, to, t)) + ch;
    })
    .join('') + R;
}

// 块状字形 "CYBERLINE"，等宽块字符拼接，不依赖 Nerd Font
const LOGO = [
  '█▀▀ █ █ █▀▄ █▀▀ █▀▄ █   █ █▄ █ █▀▀',
  '█   ▀█▀ █▀▄ █▀▀ █▀▄ █   █ █ ▀█ █▀▀',
  '▀▀▀  ▀  ▀▀  ▀▀▀ ▀ ▀ ▀▀▀ ▀ ▀  ▀ ▀▀▀',
];

function sh(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, {
      cwd, encoding: 'utf8', timeout: 900,
      stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
    }).trim();
  } catch (_) { return null; }
}

/**
 * Claude Code 首帧要占的行数（欢迎图 + 提示 + 输入框 + 两行状态栏）。
 *
 * 这个预留是整个文件的重点。Claude Code 的 TUI 是 Ink 的差分渲染：
 * 欢迎图、输入框、状态栏是**一帧整体重绘**，Ink 按写入时的光标坐标
 * 回改各行。横幅把光标推低之后，如果这一帧放不进视口，终端会向上滚，
 * 而 Ink 仍按滚动前的坐标去擦改 —— 擦不到的位置就留成空白，
 * 表现为「欢迎图和输入框之间一大块空缺」。
 *
 * 所以修法不是猜 Ink 怎么擦，而是不让首屏溢出：横幅先量视口高度，
 * 放不下就自己降级。这也解释了这个问题为什么会「又出现」——
 * 有没有 git 分支行、有没有代理行都会让横幅高度浮动，正好卡在临界点。
 */
const RESERVE_ROWS = 20;

function main() {
  const argv = process.argv;
  const cfg = readCfg();
  const cwd = process.cwd();
  const W = Math.min(process.stdout.columns || 80, 78);
  const line = (ch) => fg(U.dim) + ch.repeat(W) + R;

  // 视口高度。管道下 rows 为 undefined，按 WT 默认视口 30 行估。
  const rowsAvail = process.stdout.rows || parseInt(process.env.LINES, 10) || 30;
  const budget = rowsAvail - RESERVE_ROWS;

  // 三档布局的固定开销（不含信息行）：
  //   full    3 行 LOGO + 上下分隔线 + 提示行 = 6
  //   compact 上下分隔线 + 提示行             = 3
  //   minimal 提示行                          = 1
  //
  // 一律不加装饰性空行。Claude Code 的欢迎帧自带上下留白，终端 padding
  // 也给了视觉呼吸；满配原本的两行空行只是白占视口，正是它让 30 行窗口
  // 装不下 LOGO。去掉之后满配刚好 10 行 = 默认视口的 budget。
  const minimal = cfg.bannerStyle === 'minimal' || budget < 5;
  const compact =
    !minimal && (
      argv.includes('--compact') ||
      cfg.bannerStyle === 'compact' ||
      budget < 9  // 放不下 LOGO + 至少 3 行信息，就先牺牲 LOGO
    );

  if (argv.includes('--clear')) {
    // 清屏 + 清回滚，让横幅从第一行开始 —— 视口余量最大化，
    // 也避免上一次会话的残留内容提前把画面顶上去。
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
  }

  const out = [];
  if (!compact && !minimal) {
    for (const row of LOGO) out.push(gradient(row, U.magenta, U.cyan));
  }
  if (!minimal) out.push(line('─'));

  // 上下文行：目录 / 分支 / 环境
  const rows = [];
  const short = cwd.replace(/\\/g, '/').replace(os.homedir().replace(/\\/g, '/'), '~');
  rows.push([`${fg(U.blue)}▸${R} 目录`, `${fg(U.text)}${short}${R}`]);

  const branch = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (branch) {
    const dirty = sh('git', ['status', '--porcelain', '--untracked-files=no'], cwd);
    const isDirty = dirty && dirty.length > 0;
    rows.push([
      `${fg(U.green)}⑂${R} 分支`,
      `${fg(isDirty ? U.yellow : U.green)}${branch}${isDirty ? ' ●未提交' : ''}${R}`,
    ]);
  }

  // 代理状态：确认是否走了自定义端点。
  //
  // 只显示主机名，不显示完整 URL —— 横幅是最容易被截图分享的一屏，
  // 而 BASE_URL 可能带路径、端口甚至查询串形式的凭据。
  // 完全不想显示就把 config.json 的 bannerEnv 设为 false。
  if (cfg.bannerEnv !== false) {
    try {
      const s = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8'));
      const base = s?.env?.ANTHROPIC_BASE_URL;
      if (base) {
        let host = base;
        try { host = new URL(base).host; } catch (_) { /* 不是合法 URL 就原样显示 */ }
        rows.push([`${fg(U.magenta)}◆${R} 代理`, `${fg(U.dim)}${host}${R}`]);
      }
      if (s?.model) rows.push([`${fg(U.cyan)}◈${R} 模型`, `${fg(U.cyan)}${s.model}${R}`]);
    } catch (_) {}
  }

  const node = sh('node', ['--version']);
  if (node) rows.push([`${fg(U.dim)}◇${R} Node`, `${fg(U.dim)}${node}${R}`]);

  const hint = `  ${fg(U.dim)}主题${R} ${fg(U.cyan)}${T.label}${R}`
    + `   ${fg(U.dim)}切换${R} ${fg(U.text)}/cyber${R}`
    + `   ${fg(U.dim)}退出${R} ${fg(U.text)}Ctrl+C ×2${R}`;

  // 尾部固定开销：分隔线（minimal 下没有）+ 提示行
  const tail = minimal ? 1 : 2;
  // 信息行按剩余空间截断。目录行最重要且排在最前，因此总能留住。
  const room = Math.max(1, budget - out.length - tail);
  for (const [k, v] of rows.slice(0, room)) out.push(`  ${k}  ${v}`);

  if (!minimal) out.push(line('─'));
  out.push(hint);

  // 结尾不补空行：Claude Code 自己会打前导空白，多一行只是白占视口，
  // 把首帧往溢出的方向推。
  process.stdout.write(out.join('\n') + '\n');
}

main();
