#!/usr/bin/env node
/**
 * Cyberline 测试台 —— 用真实结构的 payload 渲染各种场景。
 * 直接在 Node 内构造对象，规避 shell 转义问题。
 *
 * 用法: node preview.js [主题名|all]
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');
const { THEMES } = require('./themes.js');

const HOME = os.homedir();
const SL = path.join(__dirname, 'statusline.js');

// 场景库：覆盖正常、极端与缺字段三类
const SCENES = [
  {
    name: '典型工作中（含 git / 全字段）',
    payload: {
      cwd: HOME,
      session_id: 'demo',
      model: { id: 'claude-opus-5', display_name: 'Opus 5' },
      workspace: { current_dir: HOME, project_dir: HOME, added_dirs: [] },
      version: '2.1.220',
      output_style: { name: 'Explanatory' },
      cost: {
        total_cost_usd: 1.2847, total_duration_ms: 4530000,
        total_api_duration_ms: 1810000, total_lines_added: 247, total_lines_removed: 63,
      },
      context_window: {
        total_input_tokens: 84213, total_output_tokens: 5120,
        context_window_size: 200000, used_percentage: 42.1, remaining_percentage: 57.9,
      },
      exceeds_200k_tokens: false,
      fast_mode: true,
      effort: { level: 'high' },
      thinking: { enabled: true },
      rate_limits: {
        five_hour: { used_percentage: 31.5 },
        seven_day: { used_percentage: 88.2 },
      },
    },
  },
  {
    name: '上下文告急 93% + 超 200k',
    payload: {
      model: { display_name: 'Sonnet 5' },
      workspace: { current_dir: path.join(HOME, 'projects', 'deep', 'nested', 'service-api') },
      cost: { total_cost_usd: 12.4, total_duration_ms: 95000, total_lines_added: 12, total_lines_removed: 0 },
      context_window: { used_percentage: 93.4, total_input_tokens: 1250000 },
      exceeds_200k_tokens: true,
      effort: { level: 'max' },
      thinking: { enabled: false },
      vim: { mode: 'NORMAL' },
      agent: { name: 'Explore' },
    },
  },
  {
    name: '会话刚开始（无成本 / 无变更）',
    payload: {
      model: { display_name: 'Haiku 4.5' },
      workspace: { current_dir: path.join(HOME, 'w') },
      cost: { total_cost_usd: 0, total_duration_ms: 800, total_lines_added: 0, total_lines_removed: 0 },
      context_window: { used_percentage: 3, total_input_tokens: 6100 },
      effort: { level: 'medium' },
      thinking: { enabled: true },
    },
  },
  {
    name: 'worktree + PR 场景',
    payload: {
      model: { display_name: 'Opus 5' },
      workspace: { current_dir: path.join(HOME, 'repo') },
      cost: { total_cost_usd: 0.87, total_duration_ms: 640000, total_api_duration_ms: 300000,
              total_lines_added: 89, total_lines_removed: 140 },
      context_window: { used_percentage: 67, total_input_tokens: 134000 },
      worktree: { name: 'feat-auth', path: '/w', branch: 'feat/auth',
                  original_cwd: '/r', original_branch: 'main' },
      rate_limits: { five_hour: { used_percentage: 72 } },
    },
  },
  { name: '空输入（降级）', raw: '' },
  { name: '畸形 JSON（降级）', raw: '{not json' },
];

function runScene(scene, themeKey) {
  const input = scene.raw !== undefined ? scene.raw : JSON.stringify(scene.payload);
  try {
    return execFileSync('node', [SL], {
      input,
      encoding: 'utf8',
      timeout: 5000,
      env: { ...process.env, CYBERLINE_THEME: themeKey },
    });
  } catch (e) {
    return `\x1b[31m渲染失败: ${e.message}\x1b[0m`;
  }
}

function main() {
  const arg = process.argv[2] || 'neon';
  const keys = arg === 'all' ? Object.keys(THEMES) : [arg];

  for (const k of keys) {
    if (!THEMES[k]) {
      console.error(`未知主题: ${k}（可用: ${Object.keys(THEMES).join(', ')}）`);
      process.exit(1);
    }
    console.log(`\n\x1b[1m━━━ 主题: ${k} — ${THEMES[k].label} ━━━\x1b[0m\n`);
    // 主题通过 CYBERLINE_THEME 传给子进程，不碰用户的 config.json
    for (const s of SCENES) {
      console.log(`\x1b[2m▸ ${s.name}\x1b[0m`);
      console.log(runScene(s, k));
      console.log('');
    }
  }
}

main();
