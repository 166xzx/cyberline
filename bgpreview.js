#!/usr/bin/env node
/**
 * 背景预览 —— 在终端里直接画出背景图，并叠上真实文字看可读性。
 *
 * 用半块字 ▀ 把上下两行像素塞进一个字符格（前景=上、背景=下），
 * 纵向分辨率翻倍，比整块 █ 更接近真实观感。
 *
 * 用法:
 *   node bgpreview.js                    预览当前主题+背景+不透明度
 *   node bgpreview.js grid               预览指定风格
 *   node bgpreview.js grid 0.9           预览指定风格与不透明度
 *   node bgpreview.js --all              当前主题下三种背景对比
 *   node bgpreview.js --levels           当前背景在多档不透明度下的对比
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { THEMES } = require('./themes.js');
const { readPng, luma, contrast, composite, hexRgb } = require('./pngread.js');

const DIR = __dirname;
const CONFIG = path.join(DIR, 'config.json');
const RESET = '\x1b[0m';
const fg = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;
const bg = ([r, g, b]) => `\x1b[48;2;${r};${g};${b}m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const bold = (s) => `\x1b[1m${s}\x1b[0m`;

/** 风格显示名。背景图都由 make-bg.js 生成 */
const STYLE_NAMES = {
  gradient: '霓虹渐变',
  grid: '网格 HUD',
  none: '无背景图（亚克力透明）',
};

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (_) {
    return { theme: 'neon', background: 'gradient', backgroundOpacity: 0.7 };
  }
}

/**
 * 采样出 cols×(rows*2) 的像素网格，已按 opacity 合成到主题底色。
 *
 * base 必须传主题的终端背景色 —— WT 是把图混到底色上，不是纯黑。
 * 早期这里按纯黑算，于是预览和生成用同一个错模型互相印证，
 * 报告说「对比度充足」而实际背景看不见。
 */
function sample(img, cols, rows, opacity, base) {
  const grid = [];
  const ph = rows * 2;
  for (let ry = 0; ry < ph; ry++) {
    const row = [];
    // 用格子中心采样而不是左上角，避免正好压在网格线上导致整屏都是线
    const sy = Math.min(img.h - 1, Math.floor((ry + 0.5) * img.h / ph));
    for (let cx = 0; cx < cols; cx++) {
      const sx = Math.min(img.w - 1, Math.floor((cx + 0.5) * img.w / cols));
      row.push(composite(img.at(sx, sy), opacity, base));
    }
    grid.push(row);
  }
  return grid;
}

/**
 * 叠加在预览上的示例文字，模拟真实使用时的可读性。
 * 返回 rows 长度的数组，每项 { col, text, color } 或 null。
 */
function overlayLines(theme, rows, cols) {
  const C = theme.ui;
  const lines = new Array(rows).fill(null);
  const put = (r, col, text, color) => {
    if (r >= 0 && r < rows) lines[r] = { col, text, color };
  };
  put(1, 2, '$ claude', C.green);
  put(2, 2, '◆ 赛博朋克霓虹 — 前景文字在此背景上的实际观感', C.text);
  put(3, 2, 'const theme = { neon: true }   // 代码可读性', C.cyan);
  put(4, 2, '模型 Opus 5 │ 上下文 ███░░░░░ 42%', C.magenta);
  put(5, 2, dim('这一行是 dim 灰字 —— 最容易被背景吃掉的情况'), C.dim);
  return lines;
}

/** 渲染一屏预览 */
function renderPreview(themeKey, style, opacity, cols, rows) {
  const theme = THEMES[themeKey];
  const file = path.join(DIR, 'backgrounds', `${themeKey}-${style}.png`);
  const base = hexRgb(theme.terminal.background);

  if (style === 'none') {
    // 无背景图时 WT 用亚克力，这里用主题底色近似示意
    const grid = [];
    for (let r = 0; r < rows * 2; r++) grid.push(new Array(cols).fill(base));
    return { grid, file: null, theme, base };
  }

  if (!fs.existsSync(file)) {
    throw new Error(`背景图不存在: ${path.basename(file)}\n  先运行: node make-bg.js ${themeKey}`);
  }
  const img = readPng(file);
  return { grid: sample(img, cols, rows, opacity, base), file, theme, base };
}

/** 把像素网格 + 叠加文字打印出来 */
function paint(grid, theme, rows, cols, withText) {
  const overlay = withText ? overlayLines(theme, rows, cols) : new Array(rows).fill(null);
  const out = [];

  for (let r = 0; r < rows; r++) {
    const top = grid[r * 2], bot = grid[r * 2 + 1];
    const ov = overlay[r];
    let line = '';
    let c = 0;

    while (c < cols) {
      // 该位置是否被叠加文字覆盖
      if (ov && c === ov.col) {
        // 文字用下半格的底色作背景，整段一次性输出
        line += bg(bot[Math.min(cols - 1, c)]) + (ov.color ? fg(ov.color) : '') + ov.text + RESET;
        // 估算文字占用的显示宽度（CJK 算 2）
        let w = 0;
        for (const ch of ov.text.replace(/\x1b\[[0-9;]*m/g, '')) {
          const cp = ch.codePointAt(0);
          w += (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xff00 && cp <= 0xff60) ? 2 : 1;
        }
        c += w;
        continue;
      }
      line += bg(bot[c]) + fg(top[c]) + '▀';
      c++;
    }
    out.push(line + RESET);
  }
  return out.join('\n');
}

/* ── 各种预览模式 ─────────────────────────────────────── */

const COLS = Math.min(78, (process.stdout.columns || 80) - 2);

function previewOne(themeKey, style, opacity) {
  const rows = 8;
  const { grid, file, theme, base } = renderPreview(themeKey, style, opacity, COLS, rows);

  const names = STYLE_NAMES;
  console.log('');
  console.log('  ' + bold(`${theme.label} · ${names[style] || style}`) +
    (style === 'none' ? '' : dim(`  不透明度 ${opacity}`)));
  console.log('');
  console.log(paint(grid, theme, rows, COLS, true));
  console.log('');

  // 亮度与对比度报告
  if (file) {
    const img = readPng(file);
    const baseL = luma(base);
    let max = 0, min = 999, sum = 0, cnt = 0, maxRgb = [0, 0, 0], darker = 0;
    for (let y = 0; y < img.h; y += 7) {
      for (let x = 0; x < img.w; x += 7) {
        const px = composite(img.at(x, y), opacity, base);
        const l = luma(px);
        if (l > max) { max = l; maxRgb = px; }
        if (l < min) min = l;
        if (l < baseL) darker++;
        sum += l; cnt++;
      }
    }

    // 终端里文字集中在上半屏偏左，那里背景明显更暗；
    // 只报右下角最亮点会低估实际可读性，因此两者都给。
    let tMax = 0, tRgb = [0, 0, 0];
    const yEnd = Math.floor(img.h * 0.5), xEnd = Math.floor(img.w * 0.7);
    for (let y = 0; y < yEnd; y += 7) {
      for (let x = 0; x < xEnd; x += 7) {
        const px = composite(img.at(x, y), opacity, base);
        const l = luma(px);
        if (l > tMax) { tMax = l; tRgb = px; }
      }
    }

    const rate = (r) => r >= 4.5 ? '\x1b[38;2;0;255;159m✓ 充足\x1b[0m'
      : r >= 3 ? '\x1b[38;2;255;214;0m⚠ 偏低\x1b[0m'
      : '\x1b[38;2;255;56;96m✗ 不足\x1b[0m';

    const textDim = contrast(theme.ui.dim, tRgb);
    const worstDim = contrast(theme.ui.dim, maxRgb);

    // 「能不能看见」看的是与底色的跨度，不是绝对亮度 ——
    // 图整体贴近底色时对比度报告全绿，但屏幕上就是一块纯色。
    const span = max - min;
    const vis = span >= 25 ? '\x1b[38;2;0;255;159m✓ 明显\x1b[0m'
      : span >= 12 ? '\x1b[38;2;255;214;0m⚠ 偏弱\x1b[0m'
      : '\x1b[38;2;255;56;96m✗ 几乎看不见\x1b[0m';

    console.log(dim(`  实际显示亮度   ${min.toFixed(0)} – ${max.toFixed(0)}   平均 ${(sum / cnt).toFixed(0)}   底色 ${baseL.toFixed(0)}`));
    console.log(dim(`  可见度         跨度 ${span.toFixed(0)} 级   暗于底色 ${(darker / cnt * 100).toFixed(0)}%   `) + vis);
    console.log(dim(`  正文区（上半屏）正文 ${contrast(theme.ui.text, tRgb).toFixed(1)}:1  灰字 ${textDim.toFixed(1)}:1  `) + rate(textDim));
    console.log(dim(`  最亮处（右下角）灰字 ${worstDim.toFixed(1)}:1  `) + rate(worstDim));
    console.log('');
  }
}

function previewAll(themeKey, opacity) {
  const styles = ['gradient', 'grid', 'none'];
  for (const s of styles) previewOne(themeKey, s, opacity);
  console.log(dim(`  切换: node cyberline.js bg <${styles.join('|')}>\n`));
}

/** 同一背景在多档不透明度下横向对比，方便挑数值 */
function previewLevels(themeKey, style) {
  if (style === 'none') {
    console.log('\n  「无背景图」模式不涉及不透明度。\n');
    return;
  }
  const rows = 4;
  const theme = THEMES[themeKey];
  const names = STYLE_NAMES;
  console.log('');
  console.log('  ' + bold(`${theme.label} · ${names[style]} — 不透明度对比`));

  const file = path.join(DIR, 'backgrounds', `${themeKey}-${style}.png`);
  if (!fs.existsSync(file)) {
    console.error(`\x1b[38;2;255;56;96m背景图不存在: ${path.basename(file)}\x1b[0m`);
    console.error(dim(`  先运行: node make-bg.js ${themeKey}`));
    process.exit(1);
  }
  const img = readPng(file);
  const cur = readConfig().backgroundOpacity ?? 0.7;
  const base = hexRgb(theme.terminal.background);
  const baseL = luma(base);

  for (const op of [0.4, 0.55, 0.7, 0.85, 1.0]) {
    let max = 0, min = 999, maxRgb = [0, 0, 0];
    for (let y = 0; y < img.h; y += 11) {
      for (let x = 0; x < img.w; x += 11) {
        const px = composite(img.at(x, y), op, base);
        const l = luma(px);
        if (l > max) { max = l; maxRgb = px; }
        if (l < min) min = l;
      }
    }
    const dimRatio = contrast(theme.ui.dim, maxRgb);
    const tag = Math.abs(op - cur) < 0.001 ? '\x1b[38;2;0;255;159m ← 当前\x1b[0m' : '';
    console.log('');
    console.log(`  ${bold(String(op).padEnd(5))}` +
      dim(`亮度 ${String(min.toFixed(0)).padStart(2)}–${String(max.toFixed(0)).padStart(3)}  跨度 ${String((max - min).toFixed(0)).padStart(2)}  灰字 ${dimRatio.toFixed(1)}:1  `) +
      (dimRatio >= 4.5 ? '\x1b[38;2;0;255;159m✓\x1b[0m' : dimRatio >= 3 ? '\x1b[38;2;255;214;0m⚠\x1b[0m' : '\x1b[38;2;255;56;96m✗\x1b[0m') +
      tag);
    console.log(paint(sample(img, COLS, rows, op, base), theme, rows, COLS, false));
  }
  console.log('');
  console.log(dim(`  设定: node cyberline.js opacity <0.1-1.0>`));
  console.log(dim(`  底色 luma ${baseL.toFixed(0)}；跨度 ≥25 级才明显可见`));
  console.log(dim(`  灰字对比度 ≥4.5:1 才算舒适（WCAG AA 正文标准）\n`));
}

/* ── 入口 ─────────────────────────────────────────────── */

function main() {
  const cfg = readConfig();
  const args = process.argv.slice(2);
  const themeKey = cfg.theme && THEMES[cfg.theme] ? cfg.theme : 'neon';
  const opacity = cfg.backgroundOpacity ?? 0.7;

  try {
    if (args[0] === '--all') return previewAll(themeKey, opacity);
    if (args[0] === '--levels') return previewLevels(themeKey, args[1] || cfg.background || 'gradient');

    const style = args[0] || cfg.background || 'gradient';
    const op = args[1] ? parseFloat(args[1]) : opacity;
    previewOne(themeKey, style, op);
    console.log(dim(`  多档对比: node bgpreview.js --levels ${style}`));
    console.log(dim(`  三种背景: node bgpreview.js --all\n`));
  } catch (e) {
    console.error(`\x1b[38;2;255;56;96m${e.message}\x1b[0m`);
    process.exit(1);
  }
}

main();
