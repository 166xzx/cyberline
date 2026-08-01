#!/usr/bin/env node
/**
 * 极简 PNG 读取 —— 只为采样背景图的像素，配合终端预览。
 *
 * 只支持本项目 make-bg.js 生成的格式：24-bit truecolor、filter 全 0。
 * 不做通用解码器，遇到其它格式直接报错而不是猜。
 */
'use strict';

const fs = require('fs');
const zlib = require('zlib');

/**
 * 读 PNG，返回 { w, h, at(x, y) => [r,g,b] }。
 * 整图一次性解压到内存（1920×1080×3 ≈ 6MB，可接受）。
 */
function readPng(file) {
  const b = fs.readFileSync(file);

  // 校验签名，避免把别的文件当 PNG 解
  const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) {
    if (b[i] !== SIG[i]) throw new Error('不是 PNG 文件');
  }

  let off = 8, w = 0, h = 0, depth = 0, colorType = -1;
  const idat = [];

  while (off < b.length) {
    const len = b.readUInt32BE(off);
    const type = b.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      w = b.readUInt32BE(off + 8);
      h = b.readUInt32BE(off + 12);
      depth = b[off + 16];
      colorType = b[off + 17];
    } else if (type === 'IDAT') {
      idat.push(b.slice(off + 8, off + 8 + len));
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }

  if (depth !== 8 || colorType !== 2) {
    throw new Error(`只支持 8-bit truecolor，实际 depth=${depth} colorType=${colorType}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * 3 + 1;   // 每行前置 1 字节 filter

  // 本项目生成的图 filter 恒为 0；若不是则解出来会错位，宁可报错
  for (let y = 0; y < h; y++) {
    if (raw[y * stride] !== 0) throw new Error(`第 ${y} 行 filter=${raw[y * stride]}，本模块只支持 0`);
  }

  return {
    w, h,
    at(x, y) {
      const p = y * stride + 1 + x * 3;
      return [raw[p], raw[p + 1], raw[p + 2]];
    },
  };
}

/** 感知亮度（ITU-R BT.601），用于亮度报告 */
function luma([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** sRGB 相对亮度，用于 WCAG 对比度 */
function relLum([r, g, b]) {
  const f = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 对比度比值，前景固定用主题的 text 色 */
function contrast(fgRgb, bgRgb) {
  const a = relLum(fgRgb), b = relLum(bgRgb);
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 按 Windows Terminal 的合成方式算最终显示色。
 *
 * 关键：WT 把背景图以 backgroundImageOpacity 混到 profile 的**背景色**上，
 * 不是混到纯黑。早期版本误按纯黑建模，导致底色的贡献被完全忽略 ——
 * tokyo 底色 #1A1B26 的 luma 已是 28，图被整体垫高后动态范围只剩 15 级，
 * 于是「算出来对比度充足、看上去却是一块纯色」。
 *
 * base 省略时退化为纯黑，仅供不涉及具体主题的场合使用。
 */
function composite(rgb, opacity, base = [0, 0, 0]) {
  return rgb.map((v, i) => Math.round(v * opacity + base[i] * (1 - opacity)));
}

/** 十六进制颜色 → [r,g,b]，各处都要用，收在这里 */
function hexRgb(s) {
  return [
    parseInt(s.slice(1, 3), 16),
    parseInt(s.slice(3, 5), 16),
    parseInt(s.slice(5, 7), 16),
  ];
}

/**
 * 反推「图本身」的亮度上限。
 *
 * 给定最终显示上限 shownMax、不透明度 op、主题底色，解出图的 luma 上限：
 *   shownMax = imgCap × op + baseLuma × (1 - op)
 * 底色贡献是白送的，图只需负责剩下那部分。
 */
function imgCapFor(shownMax, opacity, baseRgb) {
  const contributed = luma(baseRgb) * (1 - opacity);
  return Math.max(1, (shownMax - contributed) / opacity);
}

module.exports = { readPng, luma, relLum, contrast, composite, hexRgb, imgCapFor };
