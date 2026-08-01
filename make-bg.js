#!/usr/bin/env node
/**
 * 生成终端背景图（无第三方依赖，手写 PNG 编码）。
 *
 * 两种风格:
 *   gradient — 左上深黑 → 右下深紫的霓虹渐变
 *   grid     — 深色底 + 稀疏细网格线，赛博 HUD 感
 *
 * 用法: node make-bg.js [主题名]
 *       node make-bg.js all
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { THEMES } = require('./themes.js');
const { writePng } = require('./pngwrite.js');
const { hexRgb: hex, luma, imgCapFor } = require('./pngread.js');

const W = 1920;
const H = 1080;
const OUT = path.join(__dirname, 'backgrounds');

/* ── 两种背景风格 ─────────────────────────────────────── */

/**
 * 亮度约束 —— 本文件最关键的部分，且曾经错过两次。
 *
 * Windows Terminal 的合成是
 *     显示值 = 图 × backgroundImageOpacity + 主题底色 × (1 - opacity)
 * 注意是混到**主题底色**上，不是纯黑。早期版本按纯黑建模，
 * 于是 tokyo（底色 luma 28）的背景被整体垫高，动态范围只剩 15 级，
 * 屏幕上就是一块纯色 —— 而报告里对比度全绿，因为预览用了同一个错模型。
 *
 * 两条约束:
 *   1. 上限 —— 显示亮度 40 时 dim 灰字对比 4.51:1，刚好守住 WCAG AA。
 *      图本身的上限由 imgCapFor() 按底色反推，底色越亮余量越小。
 *   2. 下限 —— 图的暗部必须接近 0，而不是停在底色。
 *      图为 0 时显示值是 底色×(1-op)，比底色更暗；暗部沉下去、
 *      亮部升上来，跨度才够看得见（目标 ≥25 级）。
 *
 * 历史教训：最早设 4%/9%（图最亮 16/255），用户完全看不出背景；
 * 随后一口气提到 96/255，又把灰字压到 2.4:1。两头都要可控。
 */
const SHOWN_CAP = 40;        // 最终显示的最亮值（/255）
const REF_OPACITY = 0.7;     // 默认不透明度，用于反推图本身亮度

/** 按主题底色反推该主题的图亮度上限 */
function capFor(theme) {
  return imgCapFor(SHOWN_CAP, REF_OPACITY, hex(theme.terminal.background));
}

/**
 * 把 0–1 的强度映射成像素，并收敛到 cap。
 *
 * 关键是入参 k 从 0 起 —— 不要从底色起插值，那样暗部等于底色，
 * 混合后不存在「比底色更暗」的区域，可见度白丢一半。
 */
function shade(colorRgb, k, cap) {
  const l = luma(colorRgb);
  if (l < 0.5) return [0, 0, 0];
  const s = (k * cap) / l;
  return colorRgb.map((v) => Math.round(Math.max(0, Math.min(255, v * s))));
}

/**
 * 渐变背景：对角线插值 + 轻微暗角。
 * 强度从 0（左上）到 1（右下），不从底色起 —— 见 shade() 的说明。
 *
 * 暗角用减法而非乘法：`k * vig` 会把右下角的峰值一起压掉，
 * 结果整幅达不到 cap、跨度不够；减法只削边缘，保住对角线的落差。
 */
function gradientFn(theme) {
  const far = hex(theme.terminal.purple);
  const cap = capFor(theme);
  const diag = W + H;
  return (x, y) => {
    const k = (x + y) / diag;              // 0(左上) → 1(右下)
    const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
    const vig = 0.18 * Math.min(1, dx * dx + dy * dy);
    return shade(far, Math.max(0, k - vig), cap);
  };
}

/**
 * 网格 HUD：深色底 + 每 48px 一条细线，每 240px 一条稍亮的主线。
 * 线条之间垫一层极淡的对角渐变，否则线间是大片纯黑，整体显不出图案。
 *
 * 主线取 0.8 而非满值：网格线是全屏均匀分布的，占满 cap 会让
 * 任何位置的灰字都可能压在最亮线上，实测灰字对比掉到 3.9:1。
 */
function gridFn(theme) {
  const t = theme.terminal;
  const line = hex(t.cyan);
  const tint = hex(t.purple);
  const cap = capFor(theme);
  const MINOR = 48, MAJOR = 240;
  const diag = W + H;
  return (x, y) => {
    const onMinor = x % MINOR === 0 || y % MINOR === 0;
    const onMajor = x % MAJOR === 0 || y % MAJOR === 0;
    const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
    const vig = 0.2 * Math.min(1, dx * dx + dy * dy);

    if (onMajor || onMinor) {
      return shade(line, Math.max(0, (onMajor ? 0.8 : 0.45) - vig), cap);
    }
    const k = ((x + y) / diag) * 0.42;
    return shade(tint, Math.max(0, k - vig), cap);
  };
}

const STYLES = { gradient: gradientFn, grid: gridFn };

/* ── 入口 ─────────────────────────────────────────────── */

function main() {
  const arg = process.argv[2] || 'all';
  const keys = arg === 'all' ? Object.keys(THEMES) : [arg];

  fs.mkdirSync(OUT, { recursive: true });

  for (const k of keys) {
    const theme = THEMES[k];
    if (!theme) {
      console.error(`未知主题: ${k}`);
      process.exit(1);
    }
    for (const [styleName, fn] of Object.entries(STYLES)) {
      const file = path.join(OUT, `${k}-${styleName}.png`);
      const size = writePng(file, W, H, fn(theme));
      console.log(`✓ ${path.basename(file).padEnd(24)} ${(size / 1024).toFixed(0)} KB`);
    }
  }
  console.log(`\n背景图目录: ${OUT}`);
}

main();
