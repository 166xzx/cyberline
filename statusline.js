#!/usr/bin/env node
/**
 * Cyberline — Claude Code 赛博朋克状态栏
 *
 * 字段依据 claude-code 2.1.220 的 statusLine payload 构造函数确认，非推测。
 * 输入: stdin JSON  /  输出: 两行 ANSI 文本（Claude Code 按 \n 分行渲染）
 *
 * 设计约束:
 *   - 不依赖 Nerd Font，只用通用 Unicode，避免豆腐块
 *   - 任何字段缺失都必须降级而非抛错（状态栏挂掉比难看更糟）
 *   - 不执行慢命令；git 状态走短超时
 */
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { THEMES } = require('./themes.js');

const CONFIG_PATH = path.join(__dirname, 'config.json');

/** 用户配置：主题 + 分段开关。缺失时用内置默认。 */
function loadConfig() {
  const defaults = {
    theme: 'neon',
    twoLine: true,      // false 则压成单行（窄终端友好）
    labels: true,       // 每项前显示中文标签（模型/目录/上下文…）
    barWidth: 8,
    segments: {
      model: true, flags: true, dir: true, git: true, context: true,
      cost: true, duration: true, lines: true, rateLimits: true,
      outputStyle: true, vim: true, agent: true, worktree: true,
    },
  };
  let cfg;
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    cfg = {
      ...defaults, ...raw,
      segments: { ...defaults.segments, ...(raw.segments || {}) },
    };
  } catch (_) {
    cfg = defaults;
  }
  // CYBERLINE_THEME 覆盖配置文件，供 preview.js 之类的工具试渲染用 ——
  // 这样预览就不必临时改写用户的 config.json（中途被打断会留下脏配置）。
  if (process.env.CYBERLINE_THEME && THEMES[process.env.CYBERLINE_THEME]) {
    cfg.theme = process.env.CYBERLINE_THEME;
  }
  return cfg;
}

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const fg = ([r, g, b]) => `\x1b[38;2;${r};${g};${b}m`;

/* ── 工具函数 ─────────────────────────────────────────── */

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

/** token 数紧凑显示: 8200 → 8.2k, 1250000 → 1.25M */
function compact(n) {
  if (n === null) return null;
  if (n < 1000) return String(n);
  if (n < 1e6) {
    const k = n / 1000;
    return (k < 10 ? k.toFixed(1) : Math.round(k)) + 'k';
  }
  return (n / 1e6).toFixed(2) + 'M';
}

/** 毫秒 → 人类可读时长: 4530000 → 1h15m, 95000 → 1m35s */
function dur(ms) {
  if (ms === null || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  return `${h}h${String(m % 60).padStart(2, '0')}m`;
}

/** 路径缩短：家目录→ ~，超长时只保留末两段 */
function shortPath(p) {
  if (!p) return '?';
  let s = p.replace(/\\/g, '/');
  const home = os.homedir().replace(/\\/g, '/');
  if (s.toLowerCase().startsWith(home.toLowerCase())) s = '~' + s.slice(home.length);
  const parts = s.split('/').filter(Boolean);
  if (s.length > 28 && parts.length > 2) {
    return (s.startsWith('~') ? '~/…/' : '…/') + parts.slice(-2).join('/');
  }
  return s;
}

/** 占用率分色：越满越告警 */
function pctColor(p, C) {
  if (p >= 90) return C.red;
  if (p >= 70) return C.yellow;
  if (p >= 40) return C.cyan;
  return C.green;
}

/** 显示宽度：CJK 全角字符占两列，用于判断是否会折行 */
function dispWidth(s) {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, '');
  let w = 0;
  for (const ch of plain) {
    const c = ch.codePointAt(0);
    const wide =
      c >= 0x1100 &&
      (c <= 0x115f || c === 0x2329 || c === 0x232a ||
        (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) ||
        (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
        (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6));
    w += wide ? 2 : 1;
  }
  return w;
}

/** 迷你进度条，用块字符渲染 */
function bar(pct, width, color, C) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return fg(color) + '█'.repeat(filled) + fg(C.dim) + '░'.repeat(width - filled) + RESET;
}

/** git 分支 + 是否有未提交改动。失败静默返回 null。 */
function gitInfo(cwd) {
  const run = (args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: 700,
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    }).trim();
  try {
    const branch = run(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (!branch) return null;
    let dirty = false;
    try {
      dirty = run(['status', '--porcelain', '--untracked-files=no']).length > 0;
    } catch (_) { /* 大仓库可能超时，分支照样显示 */ }
    return { branch, dirty };
  } catch (_) {
    return null;
  }
}

/* ── 主渲染 ───────────────────────────────────────────── */

function render(d, cfg, opts) {
  const o = opts || {};
  const theme = THEMES[cfg.theme] || THEMES.neon;
  const C = theme.ui;
  const S = cfg.segments;
  // 标签与间距可被自动收窄逻辑覆盖
  const L = o.labels !== undefined ? o.labels : cfg.labels !== false;
  const gap = o.gap !== undefined ? o.gap : 2;

  // 分隔符：两侧留空隙，参照 ccline 的 " │ " 风格
  const pad = ' '.repeat(gap);
  const SEP = `${fg(C.dim)}${pad}│${pad}${RESET}`;

  /**
   * 带标签的分段：「标签 值」。
   * short 为窄终端下的简称，收窄时用它替代全称而非直接删掉标签，
   * 避免出现看不懂含义的裸数字。
   */
  const seg = (label, value, short) => {
    if (L === 'short') return `${fg(C.dim)}${short || label}${RESET} ${value}`;
    if (!L) return value;
    return `${fg(C.dim)}${label}${RESET} ${value}`;
  };

  /* —— 第一行：身份 · 位置 · 上下文 —— */
  const L1 = [];

  // 模型名（品牌色洋红，加粗）
  if (S.model) {
    const model = d?.model?.display_name || d?.model?.id || 'claude';
    L1.push(seg('模型', `${fg(C.magenta)}${BOLD}${model}${RESET}`, ''));
  }

  // 推理强度 / 快速模式 / 思考开关，仅在非默认时显示，避免噪音
  if (S.flags) {
    const flags = [];
    const effort = d?.effort?.level;
    if (effort && effort !== 'medium') flags.push(effort);
    if (d?.fast_mode) flags.push('快速');
    if (d?.thinking && d.thinking.enabled === false) flags.push('无思考');
    if (flags.length) L1.push(seg('模式', `${fg(C.cyan)}${flags.join('·')}${RESET}`, ''));
  }

  // 当前目录
  const cwd = d?.workspace?.current_dir || d?.cwd || process.cwd();
  if (S.dir) {
    L1.push(seg('目录', `${fg(C.text)}${shortPath(cwd)}${RESET}`, ''));
  }

  // git 分支：脏工作区标 ● 并转黄
  if (S.git) {
    const g = gitInfo(cwd);
    if (g) {
      const col = g.dirty ? C.yellow : C.green;
      L1.push(seg('分支', `${fg(col)}${g.branch}${g.dirty ? ' ●' : ''}${RESET}`, '⑂'));
    }
  }

  // 上下文占用：官方直接给 used_percentage，无需自行计算
  if (S.context) {
    const ctx = d?.context_window || {};
    const used = num(ctx.used_percentage);
    if (used !== null) {
      const p = Math.round(used);
      const col = pctColor(p, C);
      const tin = compact(num(ctx.total_input_tokens));
      L1.push(seg('上下文',
        `${bar(p, cfg.barWidth, col, C)} ${fg(col)}${p}%${RESET}` +
        (tin ? ` ${fg(C.dim)}${tin}${RESET}` : '')
      ));
    }
    // 超窗警告按当前模型的真实容量来判断。
    //
    // 不能用 payload 的 exceeds_200k_tokens：那是个字面意义的 200k 标志，
    // 与窗口容量无关 —— 挂 [1m] 跑 1M 模型时，过了 200k 它照样为真，
    // 于是状态栏在还剩 80% 余量时就一直红着报警。
    // context_window_size 才是「当前模型的窗口大小」，会随模型变（200000 / 1000000）。
    const size = num(ctx.context_window_size);
    const tin = num(ctx.total_input_tokens);
    if (size && tin && tin > size) {
      // 容量是整数，去掉 compact 的小数尾巴：1000000 → 1M 而不是 1.00M
      const cap = size % 1e6 === 0 ? `${size / 1e6}M` : compact(size);
      L1.push(`${fg(C.red)}${BOLD}⚠ 超${cap}${RESET}`);
    } else if (!size && d?.exceeds_200k_tokens) {
      // 老版本 payload 没有 context_window_size，退回原标志
      L1.push(`${fg(C.red)}${BOLD}⚠ 超200k${RESET}`);
    }
  }

  /* —— 第二行：成本 · 耗时 · 变更 · 限额 —— */
  const L2 = [];
  const cost = d?.cost || {};

  if (S.cost) {
    const usd = num(cost.total_cost_usd);
    // 0 成本不占位；<0.01 用三位小数，否则两位
    if (usd !== null && usd > 0) {
      L2.push(seg('花费', `${fg(C.yellow)}$${usd < 0.01 ? usd.toFixed(3) : usd.toFixed(2)}${RESET}`, ''));
    }
  }

  // 会话总时长，以及其中 API 实际耗时占比
  if (S.duration) {
    const total = num(cost.total_duration_ms);
    const api = num(cost.total_api_duration_ms);
    if (total !== null) {
      let t = `${fg(C.cyan)}${dur(total)}${RESET}`;
      if (api !== null && total > 0) {
        t += ` ${fg(C.dim)}API占${Math.round((api / total) * 100)}%${RESET}`;
      }
      L2.push(seg('用时', t, ''));
    }
  }

  // 代码变更行数：全为 0 时不占位
  if (S.lines) {
    const add = num(cost.total_lines_added);
    const del = num(cost.total_lines_removed);
    if ((add || 0) > 0 || (del || 0) > 0) {
      L2.push(seg('改动',
        `${fg(C.green)}+${add || 0}${RESET} ${fg(C.red)}-${del || 0}${RESET}`, ''));
    }
  }

  // 速率限额：5 小时窗口 / 7 天窗口
  if (S.rateLimits) {
    const rl = d?.rate_limits || {};
    for (const [key, label, sh] of [['five_hour', '5时额度', '5h'], ['seven_day', '7天额度', '7d']]) {
      const w = rl[key];
      const p = num(w?.used_percentage);
      if (p !== null) {
        const col = pctColor(p, C);
        L2.push(seg(label, `${fg(col)}${Math.round(p)}%${RESET}`, sh));
      }
    }
  }

  // 输出风格（非默认时才显示）
  if (S.outputStyle) {
    const style = d?.output_style?.name;
    if (style && !/^default$/i.test(style)) {
      L2.push(seg('风格', `${fg(C.text)}${style}${RESET}`, '◈'));
    }
  }

  // Vim 模式 / 子代理名 / 工作树，存在即显示
  if (S.vim && d?.vim?.mode) L2.push(seg('Vim', `${fg(C.magenta)}${d.vim.mode}${RESET}`, ''));
  if (S.agent && d?.agent?.name) L2.push(seg('代理', `${fg(C.cyan)}${d.agent.name}${RESET}`, '⚙'));
  if (S.worktree && d?.worktree?.name) L2.push(seg('工作树', `${fg(C.blue)}${d.worktree.name}${RESET}`, '⑂⑂'));

  if (!L2.length) return L1.join(SEP);
  if (!cfg.twoLine) return L1.join(SEP) + SEP + L2.join(SEP);
  return L1.join(SEP) + '\n' + `${fg(C.dim)}└ ${RESET}` + L2.join(SEP);
}

/**
 * 渲染并在过宽时逐级收窄，避免终端折行导致排版散掉。
 * 收窄顺序：宽间距 → 窄间距 → 去标签，保证信息不丢。
 */
function renderFit(data, cfg) {
  // stdout 是管道时 columns 为 undefined（Claude Code 正是这样调用），
  // 因此回退到 COLUMNS 环境变量，再回退到配置的 maxWidth。
  const cols =
    process.stdout.columns ||
    parseInt(process.env.COLUMNS, 10) ||
    cfg.maxWidth || 0;
  const attempts = [
    { gap: 2 },                  // 首选：宽松间距 + 全中文标签
    { gap: 1 },                  // 收窄间距
    { gap: 1, labels: 'short' },  // 标签换简称（5h / ⑂ / ◈），仍可辨义
    { gap: 1, labels: false },    // 末选：去标签保信息
  ];
  let last = '';
  for (const a of attempts) {
    last = render(data, cfg, a);
    if (!cols) return last;  // 拿不到终端宽度就用首选方案
    const over = last.split('\n').some((l) => dispWidth(l) > cols);
    if (!over) return last;
  }
  return last;
}

/* ── 入口 ─────────────────────────────────────────────── */

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let data = {};
  try { data = JSON.parse(raw); } catch (_) { /* 空输入时走全降级渲染 */ }

  // 调试用：CYBERLINE_DEBUG=1 时留存最近一次 payload。
  //
  // 写到系统临时目录而不是 __dirname —— payload 里有工作路径、成本、git 分支，
  // 落在仓库目录里迟早会被误提交（.gitignore 挡得住的前提是没人 `git add -f`）。
  if (process.env.CYBERLINE_DEBUG === '1') {
    try {
      const f = path.join(os.tmpdir(), 'cyberline-last-payload.json');
      fs.writeFileSync(f, raw || '{}', 'utf8');
    } catch (_) {}
  }

  let out;
  try {
    out = renderFit(data, loadConfig());
  } catch (e) {
    // 渲染出错也要给出可用状态栏，并提示去看日志
    out = `\x1b[38;2;255;56;96m◆ cyberline error\x1b[0m \x1b[38;2;90;90;114m${String(e.message).slice(0, 60)}\x1b[0m`;
  }
  process.stdout.write(out);
});
