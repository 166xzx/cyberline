#!/usr/bin/env node
/**
 * Cyberline 控制器 —— 主题切换 / 分段开关 / 安装卸载。
 *
 * 用法:
 *   node cyberline.js list                 列出主题
 *   node cyberline.js use <主题> [--no-terminal]
 *   node cyberline.js toggle <分段>        开关某分段
 *   node cyberline.js layout one|two       单行/双行
 *   node cyberline.js status               当前配置
 *   node cyberline.js install              写入 settings.json
 *   node cyberline.js uninstall            还原 statusLine 与终端配色
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { THEMES, DEFAULT_THEME } = require('./themes.js');

const HOME = os.homedir();
const DIR = __dirname;
const CONFIG = path.join(DIR, 'config.json');
const SETTINGS = path.join(HOME, '.claude', 'settings.json');
const WT = path.join(
  process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local'),
  'Packages', 'Microsoft.WindowsTerminal_8wekyb3d8bbwe', 'LocalState', 'settings.json'
);

const c = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  d: (s) => `\x1b[2m${s}\x1b[0m`,
  g: (s) => `\x1b[38;2;0;255;159m${s}\x1b[0m`,
  y: (s) => `\x1b[38;2;255;214;0m${s}\x1b[0m`,
  r: (s) => `\x1b[38;2;255;56;96m${s}\x1b[0m`,
  cy: (s) => `\x1b[38;2;0;240;255m${s}\x1b[0m`,
};

/* ── 配置读写 ─────────────────────────────────────────── */

const DEFAULTS = {
  theme: DEFAULT_THEME,
  twoLine: true,
  labels: true,
  background: 'gradient',   // gradient | grid | none
  backgroundOpacity: 0.7,   // 0.1–1.0，背景图混到主题底色上的强度
  bannerStyle: 'auto',      // auto | compact | minimal（auto 按视口高度自选）
  barWidth: 8,
  segments: {
    model: true, flags: true, dir: true, git: true, context: true,
    cost: true, duration: true, lines: true, rateLimits: true,
    outputStyle: true, vim: true, agent: true, worktree: true,
  },
};

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
    return { ...DEFAULTS, ...raw, segments: { ...DEFAULTS.segments, ...(raw.segments || {}) } };
  } catch (_) {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

/** 读 JSON，容忍 BOM 与 // 注释（Windows Terminal 允许注释） */
function readJsonLoose(file) {
  let t = fs.readFileSync(file, 'utf8');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return JSON.parse(t.replace(/^\s*\/\/.*$/gm, ''));
}

/* ── 终端配色同步 ─────────────────────────────────────── */

// 专用 profile 的固定 GUID，便于反复更新同一条而不重复创建。
// 注意：GUID 只允许十六进制字符，不能为了拼出单词塞入 y/r/n 之类。
const PROFILE_GUID = '{c9be21ce-c0de-4ace-b0de-cbe411ce0001}';
// 曾经写入过的非法 GUID，加载时需要顺手清掉
const BAD_GUIDS = ['{c9be21ce-cy8e-4ace-b0de-cyber11ne0001}'];
const LAUNCHER = path.join(DIR, 'cc.cmd');

/**
 * 按 Windows Terminal 的官方算法，从 profile 名推出 GUID。
 *
 * UUIDv5，命名空间 2bde4a90-d05f-401c-9492-e40884ead1d8，名字取 UTF-16LE。
 * 用途是给第三方安装器留下的、缺 GUID 的 profile 补齐 —— 缺失会让 WT
 * 拒绝加载整份配置。因为算法与 WT 自身一致，补出来的值不会和它后续
 * 自动生成的冲突。
 */
function wtProfileGuid(name) {
  const ns = Buffer.from('2bde4a90d05f401c9492e40884ead1d8', 'hex');
  const nb = Buffer.from(name, 'utf16le');
  const h = crypto.createHash('sha1').update(Buffer.concat([ns, nb])).digest();
  const b = Buffer.from(h.slice(0, 16));
  b[6] = (b[6] & 0x0f) | 0x50;  // 版本 5
  b[8] = (b[8] & 0x3f) | 0x80;  // RFC 4122 变体
  const x = b.toString('hex');
  return `{${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}}`;
}

/**
 * 写入 Windows Terminal：注册配色方案 + 建/更新 Claude Code 专用 profile。
 * 专用 profile 的好处是不动你原有的 PowerShell 配置，且能带背景图与横幅。
 */
function applyTerminal(themeKey, cfg) {
  const t = THEMES[themeKey];
  const scheme = t && t.terminal;
  if (!scheme) return { ok: false, msg: '主题无终端配色' };
  if (!fs.existsSync(WT)) return { ok: false, msg: '未找到 Windows Terminal 配置' };

  const bak = WT + '.cyberline-bak';
  if (!fs.existsSync(bak)) fs.copyFileSync(WT, bak);

  const wt = readJsonLoose(WT);

  // 1) 注册/更新配色方案
  wt.schemes = Array.isArray(wt.schemes) ? wt.schemes : [];
  const si = wt.schemes.findIndex((s) => s && s.name === scheme.name);
  if (si >= 0) wt.schemes[si] = scheme; else wt.schemes.push(scheme);

  // 2) 建/更新专用 profile
  wt.profiles = wt.profiles || {};
  wt.profiles.list = Array.isArray(wt.profiles.list) ? wt.profiles.list : [];

  // 清掉历史上写入过的非法 GUID —— 它会让 WT 拒绝加载整份配置
  wt.profiles.list = wt.profiles.list.filter((p) => !p || !BAD_GUIDS.includes(p.guid));
  if (BAD_GUIDS.includes(wt.defaultProfile)) delete wt.defaultProfile;

  const bgStyle = cfg.background || 'gradient';
  const bgFile = path.join(DIR, 'backgrounds', `${themeKey}-${bgStyle}.png`);
  const hasBg = bgStyle !== 'none' && fs.existsSync(bgFile);
  // 选了背景风格但图不存在 —— 此时会静默退回亚克力，调用方需要把这件事说出来
  const missingBg = bgStyle !== 'none' && !hasBg ? path.basename(bgFile) : null;

  const profile = {
    guid: PROFILE_GUID,
    name: 'Claude Code',
    commandline: `cmd.exe /c "${LAUNCHER}"`,
    startingDirectory: '%USERPROFILE%',
    colorScheme: scheme.name,
    font: { face: 'Cascadia Mono', size: 11 },
    useAcrylic: !hasBg,          // 背景图与亚克力互斥，有图时关闭亚克力
    opacity: hasBg ? 100 : 88,
    padding: '12, 10, 12, 10',
    cursorShape: 'filledBox',
    scrollbarState: 'hidden',
    intenseTextStyle: 'bright',
    antialiasingMode: 'grayscale',
    historySize: 20000,
    hidden: false,
  };
  if (hasBg) {
    profile.backgroundImage = bgFile;
    // 由 config.json 的 backgroundOpacity 控制，可用 `opacity` 命令调
    profile.backgroundImageOpacity = cfg.backgroundOpacity ?? 0.7;
    profile.backgroundImageStretchMode = 'uniformToFill';
  }

  const pi = wt.profiles.list.findIndex((p) => p && p.guid === PROFILE_GUID);
  if (pi >= 0) wt.profiles.list[pi] = profile;
  else wt.profiles.list.push(profile);

  // 3) 设为默认，这样打开 WT 直接进 Claude Code
  wt.defaultProfile = PROFILE_GUID;

  // 3.5) 清掉 profiles.defaults 里会压过本 profile 的键。
  // 关键：defaults 的 useAcrylic:true 会让背景图完全不显示 ——
  // WT 里亚克力与背景图互斥，且 defaults 的优先级高于单个 profile。
  if (wt.profiles.defaults) {
    for (const k of ['useAcrylic', 'opacity', 'colorScheme',
                     'backgroundImage', 'backgroundImageOpacity']) {
      delete wt.profiles.defaults[k];
    }
  }

  // 4) 全局外观
  wt.useAcrylicInTabRow = true;
  wt.showTabsInTitlebar = true;
  wt.tabWidthMode = 'compact';
  wt.theme = 'dark';

  // 5) 写入前自检：GUID 有问题会让 WT 拒绝加载整份配置、退回默认设置，
  //    表现为「打开 WT 却是默认 CMD，我们的 profile 像没生效一样」。
  //
  //    两种情况分开处理：
  //    - 缺失 GUID：常见于第三方安装器（如 Anaconda）追加的 profile。
  //      不能只是跳过 —— 缺失同样会让 WT 报错。按官方算法补一个，
  //      与 WT 自己生成的值一致，因此不会造成重复条目。
  //    - 格式非法：多半是我们自己写坏了，宁可中止也不要毁掉用户配置。
  const guidRe = /^\{[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\}$/;
  for (const p of wt.profiles.list) {
    if (!p) continue;
    if (!p.guid && p.name) {
      p.guid = wtProfileGuid(p.name);
      continue;
    }
    if (p.guid && !guidRe.test(p.guid)) {
      return { ok: false, msg: `GUID 非法，已中止写入：${p.guid}` };
    }
  }

  fs.writeFileSync(WT, JSON.stringify(wt, null, 4) + '\n', 'utf8');
  return { ok: true, msg: scheme.name, bg: hasBg ? `${bgStyle}` : '无', missingBg };
}

/* ── 命令实现 ─────────────────────────────────────────── */

/**
 * 确保 <主题>-<风格>.png 存在，缺了就补。
 *
 * 背景图由 make-bg.js 纯计算生成，没有外部依赖，所以缺图总能补上。
 * 万一生成失败也不阻断切换流程 —— applyTerminal 会退回亚克力透明并提示。
 */
function ensureBg(cfg, themeKey) {
  const style = cfg.background || 'gradient';
  if (style === 'none') return;

  const file = path.join(DIR, 'backgrounds', `${themeKey}-${style}.png`);
  if (fs.existsSync(file)) return;

  console.log(c.d(`  缺 ${path.basename(file)}，正在生成...`));
  try {
    execFileSync('node', [path.join(DIR, 'make-bg.js'), 'all'], { stdio: 'inherit' });
  } catch (_) {
    // 生成不出来不阻断切换流程，后面会提示退回亚克力
  }
}

function cmdList() {
  const cur = readConfig().theme;
  console.log(c.b('\n  可用主题\n'));
  for (const [k, t] of Object.entries(THEMES)) {
    const mark = k === cur ? c.g(' ● 当前') : '';
    console.log(`  ${c.cy(k.padEnd(10))} ${t.label}${mark}`);
    // 用该主题自身的色板渲染一条色条，直观预览
    const u = t.ui;
    const sw = ['magenta', 'cyan', 'green', 'yellow', 'red', 'blue']
      .map((n) => `\x1b[38;2;${u[n][0]};${u[n][1]};${u[n][2]}m███\x1b[0m`).join('');
    console.log(`  ${' '.repeat(10)} ${sw}\n`);
  }
  console.log(c.d(`  切换: node cyberline.js use <主题>\n`));
}

function cmdUse(themeKey, opts) {
  if (!THEMES[themeKey]) {
    console.error(c.r(`未知主题「${themeKey}」`));
    console.error(c.d(`可用: ${Object.keys(THEMES).join(', ')}`));
    process.exit(1);
  }
  const cfg = readConfig();
  cfg.theme = themeKey;
  writeConfig(cfg);
  console.log(c.g(`✓ 状态栏主题 → ${THEMES[themeKey].label}`));

  if (!opts.noTerminal) {
    // 切主题时背景图按 <主题>-<风格>.png 找，缺了就地补生成
    ensureBg(cfg, themeKey);

    const r = applyTerminal(themeKey, cfg);
    if (r.ok) {
      console.log(c.g(`✓ 终端配色 → ${r.msg}`) + c.d(`（背景 ${r.bg}）`));
      if (r.missingBg) {
        console.log(c.y(`⚠ 缺 ${r.missingBg}，已退回亚克力透明`));
        console.log(c.d(`  生成: node make-bg.js all`));
      }
      console.log(c.y('  重启 Windows Terminal 生效'));
    } else {
      console.log(c.y(`⚠ 终端配色跳过：${r.msg}`));
    }
  }
  console.log(c.d('\n  预览: node preview.js ' + themeKey));
}

/** 切换背景风格：渐变 / 网格 / 无 */
function cmdBg(style) {
  const valid = ['gradient', 'grid', 'none'];
  const alias = { 渐变: 'gradient', 网格: 'grid', 无: 'none', off: 'none' };
  const s = alias[style] || style;

  if (!valid.includes(s)) {
    console.error(c.r(`未知背景「${style}」`));
    console.error(c.d(`可用: gradient(渐变) / grid(网格) / none(无，改用亚克力透明)`));
    process.exit(1);
  }

  const cfg = readConfig();
  cfg.background = s;
  writeConfig(cfg);

  const names = { gradient: '霓虹渐变', grid: '网格 HUD', none: '无背景图（亚克力透明）' };
  console.log(c.g(`✓ 背景 → ${names[s]}`));

  // 图缺了就地补，背景图是纯计算生成的，很快
  ensureBg(cfg, cfg.theme);

  // 背景变了要重写 WT 配置才生效
  const r = applyTerminal(cfg.theme, cfg);
  if (r.ok) console.log(c.y('  重启 Windows Terminal 生效'));
  else console.log(c.y(`⚠ 未能写入终端配置：${r.msg}`));
  console.log(c.d(`\n  看效果: node bgpreview.js ${s}`));
}

/** 调背景不透明度：数值越大背景越明显 */
function cmdOpacity(val) {
  const v = parseFloat(val);
  if (!isFinite(v) || v < 0.1 || v > 1) {
    console.error(c.r(`不透明度需在 0.1 – 1.0 之间，收到「${val}」`));
    console.error(c.d('  0.4 很淡  0.7 默认  1.0 最明显'));
    process.exit(1);
  }
  const cfg = readConfig();
  cfg.backgroundOpacity = Math.round(v * 100) / 100;
  writeConfig(cfg);
  console.log(c.g(`✓ 背景不透明度 → ${cfg.backgroundOpacity}`));

  // 背景图按 0.7 为基准做过亮度收敛，调更高会挤压灰字可读性
  if (cfg.backgroundOpacity > 0.75) {
    console.log(c.y('  注意：高于 0.75 时状态栏灰字对比度会降到 4.5:1 以下'));
    console.log(c.d('        用 node bgpreview.js 看实测值'));
  }

  if ((cfg.background || 'gradient') === 'none') {
    console.log(c.y('  当前是「无背景图」模式，此值暂不起作用'));
    return;
  }
  const r = applyTerminal(cfg.theme, cfg);
  if (r.ok) console.log(c.y('  重启 Windows Terminal 生效'));
  else console.log(c.y(`⚠ 未能写入终端配置：${r.msg}`));
  console.log(c.d(`\n  看效果: node bgpreview.js`));
}

function cmdToggle(seg) {
  const cfg = readConfig();
  if (!(seg in cfg.segments)) {
    console.error(c.r(`未知分段「${seg}」`));
    console.error(c.d(`可用: ${Object.keys(cfg.segments).join(', ')}`));
    process.exit(1);
  }
  cfg.segments[seg] = !cfg.segments[seg];
  writeConfig(cfg);
  console.log(cfg.segments[seg] ? c.g(`✓ 已开启 ${seg}`) : c.y(`○ 已关闭 ${seg}`));
}

function cmdLayout(mode) {
  if (!['one', 'two'].includes(mode)) {
    console.error(c.r('用法: layout one|two'));
    process.exit(1);
  }
  const cfg = readConfig();
  cfg.twoLine = mode === 'two';
  writeConfig(cfg);
  console.log(c.g(`✓ 布局 → ${mode === 'two' ? '双行' : '单行'}`));
}

function cmdLabels() {
  const cfg = readConfig();
  cfg.labels = cfg.labels === false;
  writeConfig(cfg);
  console.log(cfg.labels
    ? c.g('✓ 已显示中文标签（模型 / 目录 / 上下文…）')
    : c.y('○ 已隐藏中文标签（更紧凑）'));
}

function cmdBanner(style) {
  if (!['auto', 'compact', 'minimal'].includes(style)) {
    console.error(c.r('用法: banner auto|compact|minimal'));
    process.exit(1);
  }
  const cfg = readConfig();
  cfg.bannerStyle = style;
  writeConfig(cfg);
  const label = { auto: '自适应（按视口高度选）', compact: '紧凑（无 LOGO）', minimal: '极简（仅两行）' }[style];
  console.log(c.g(`✓ 启动横幅 → ${label}`));
  if (style === 'auto') {
    console.log(c.d('  窗口太矮时会自动收起 LOGO，避免首屏溢出后留下空白。'));
  }
}

function cmdStatus() {
  const cfg = readConfig();
  const t = THEMES[cfg.theme] || THEMES[DEFAULT_THEME];
  console.log(c.b('\n  Cyberline 状态\n'));
  console.log(`  主题      ${c.cy(cfg.theme)} ${c.d('(' + t.label + ')')}`);
  console.log(`  布局      ${cfg.twoLine ? '双行' : '单行'}`);
  console.log(`  中文标签  ${cfg.labels === false ? c.d('隐藏') : c.g('显示')}`);
  console.log(`  背景      ${c.cy({gradient:'霓虹渐变',grid:'网格 HUD',none:'无（亚克力透明）'}[cfg.background||'gradient'])}` +
    ((cfg.background || 'gradient') === 'none' ? '' : c.d(`  浓淡 ${cfg.backgroundOpacity ?? 0.7}`)));
  console.log(`  进度条宽  ${cfg.barWidth}`);
  console.log(`  启动横幅  ${c.cy({auto:'自适应',compact:'紧凑（无 LOGO）',minimal:'极简'}[cfg.bannerStyle || 'auto'])}`);

  const on = [], off = [];
  for (const [k, v] of Object.entries(cfg.segments)) (v ? on : off).push(k);
  console.log(`  已启用    ${c.g(on.join(' '))}`);
  if (off.length) console.log(`  已关闭    ${c.d(off.join(' '))}`);

  // 是否已接入 Claude Code
  let hooked = false;
  try {
    const s = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
    hooked = !!(s.statusLine && String(s.statusLine.command || '').includes('cyberline'));
  } catch (_) {}
  console.log(`  已安装    ${hooked ? c.g('是') : c.y('否 — 运行 install')}`);
  console.log('');
}

function cmdInstall() {
  const s = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : {};

  // 首次安装时保存原 statusLine，供 uninstall 还原
  const prevFile = path.join(DIR, 'previous-statusline.json');
  if (s.statusLine && !String(s.statusLine.command || '').includes('cyberline')) {
    if (!fs.existsSync(prevFile)) {
      fs.writeFileSync(prevFile, JSON.stringify(s.statusLine, null, 2), 'utf8');
    }
  }

  s.statusLine = {
    type: 'command',
    padding: 0,
    command: `node "${path.join(DIR, 'statusline.js')}"`,
  };
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n', 'utf8');

  if (!fs.existsSync(CONFIG)) writeConfig(readConfig());

  console.log(c.g('✓ 已接入 Claude Code statusLine'));
  console.log(c.d(`  ${s.statusLine.command}`));

  // 同时建好 Windows Terminal 专用 profile（含背景与自动横幅）
  const cfg = readConfig();
  const r = applyTerminal(cfg.theme, cfg);
  if (r.ok) {
    console.log(c.g(`✓ 已建 Windows Terminal 配置「Claude Code」`) + c.d(`（背景 ${r.bg}）`));
    console.log(c.d('  已设为默认 profile，打开 WT 即进入 Claude Code'));
    console.log(c.y('  重启 Windows Terminal 生效'));
  } else {
    console.log(c.y(`⚠ Windows Terminal 配置跳过：${r.msg}`));
  }
}

function cmdUninstall() {
  const s = fs.existsSync(SETTINGS) ? JSON.parse(fs.readFileSync(SETTINGS, 'utf8')) : {};
  const prevFile = path.join(DIR, 'previous-statusline.json');

  if (fs.existsSync(prevFile)) {
    s.statusLine = JSON.parse(fs.readFileSync(prevFile, 'utf8'));
    console.log(c.g('✓ 已还原此前的 statusLine'));
  } else {
    delete s.statusLine;
    console.log(c.g('✓ 已移除 statusLine'));
  }
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2) + '\n', 'utf8');

  const bak = WT + '.cyberline-bak';
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, WT);
    console.log(c.g('✓ 已还原 Windows Terminal 配置'));
  }
}

/* ── 入口 ─────────────────────────────────────────────── */

/**
 * 统一入口：把任意参数路由到对应子命令，自己判断类型。
 *
 * 存在的意义是把「该跑哪条命令」的判断从 slash 命令的说明书里挪进代码。
 * /cyber 原本要把上百行规则塞进模型上下文，由模型读完再决定调用什么，
 * 既慢又可能选错；现在模型只需固定转发一次 `apply <参数...>`。
 *
 * 用法：apply neon / apply bg grid / apply opacity 0.55 / apply banner compact
 */
function cmdApply(args) {
  const [a, b] = args;

  if (!a) { cmdList(); cmdStatus(); return; }

  const THEME_ALIAS = { 霓虹: 'neon', 合成波: 'outrun', 矩阵: 'matrix', 东京: 'tokyo' };
  const key = THEME_ALIAS[a] || a;

  // 主题名可以直接写，不必加 use
  if (THEMES[key]) {
    cmdUse(key, {});
    reloadHint();
    return;
  }

  switch (a) {
    case 'use':      return THEMES[b] ? (cmdUse(b, {}), reloadHint()) : cmdApply([b]);
    case 'bg':       cmdBg(b); return reloadHint();
    case 'opacity':  cmdOpacity(b); return reloadHint();
    case 'banner':   return cmdBanner(b);
    case 'toggle':   return cmdToggle(b);
    case 'labels':   return cmdLabels();
    case 'layout':
    case 'one':
    case 'two':      return cmdLayout(a === 'layout' ? b : a);
    case 'status':   return cmdStatus();
    case 'list':     return cmdList();
    case 'install':  return cmdInstall();
    case 'uninstall': return cmdUninstall();
    case 'reload':   return openNewTab(true);
    default:
      console.error(c.r(`无法识别「${args.join(' ')}」`));
      console.error(c.d('  主题: neon / outrun / matrix / tokyo'));
      console.error(c.d('  其它: bg <风格> / opacity <值> / banner <风格> / toggle <分段> / labels / one|two'));
      process.exit(1);
  }
}

/**
 * 在 Windows Terminal 里开一个新标签页，让改动立刻可见。
 *
 * WT 的 profile 属性（配色、背景图）只在标签页创建时读取，正在跑的
 * 会话不会热加载 —— 这正是「改了却看不到」的常见原因。开个新标签页
 * 比要求用户重启整个终端轻得多。
 *
 * 只在确实处于 WT 内部时才做（靠 WT_SESSION 判断）；在经典 conhost
 * 或 SSH 里 wt.exe 可能不存在，静默跳过并给出文字提示。
 */
function openNewTab(explicit) {
  const inWT = !!process.env.WT_SESSION;
  if (!inWT) {
    if (explicit) {
      console.log(c.y('⚠ 当前不在 Windows Terminal 里（没有 WT_SESSION）'));
      console.log(c.d('  终端配色与背景图由 WT 的 profile 提供，'));
      console.log(c.d('  在经典 PowerShell / conhost 窗口里看不到效果。'));
      console.log(c.d('  请按 Win 键搜索「Terminal」打开 Windows Terminal。'));
    }
    return false;
  }
  try {
    execFileSync('wt.exe', ['-w', '0', 'nt'], { windowsHide: true, timeout: 3000 });
    console.log(c.g('✓ 已开新标签页，改动在那里生效'));
    return true;
  } catch (_) {
    console.log(c.d('  按 Ctrl+Shift+T 开新标签页即可看到'));
    return false;
  }
}

/** 终端类改动后的统一提示：能自动开标签页就开，不能就说清楚为什么 */
function reloadHint() {
  if (process.env.WT_SESSION) {
    openNewTab(false);
  } else {
    console.log(c.y('⚠ 你当前不在 Windows Terminal 里，看不到终端配色/背景'));
    console.log(c.d('  按 Win 键搜索「Terminal」打开 Windows Terminal 即可'));
  }
}

function main() {
  const [cmd, arg] = process.argv.slice(2);
  const opts = { noTerminal: process.argv.includes('--no-terminal') };

  switch (cmd) {
    case 'apply': return cmdApply(process.argv.slice(3));
    case 'reload': return openNewTab(true);
    case 'list': return cmdList();
    case 'use':
      if (!arg) { console.error(c.r('用法: use <主题>')); process.exit(1); }
      return cmdUse(arg, opts);
    case 'toggle':
      if (!arg) { console.error(c.r('用法: toggle <分段>')); process.exit(1); }
      return cmdToggle(arg);
    case 'layout': return cmdLayout(arg);
    case 'labels': return cmdLabels();
    case 'bg':
      if (!arg) { console.error(c.r('用法: bg gradient|grid|none')); process.exit(1); }
      return cmdBg(arg);
    case 'opacity':
      if (!arg) { console.error(c.r('用法: opacity 0.1-1.0')); process.exit(1); }
      return cmdOpacity(arg);
    case 'banner':
      if (!arg) { console.error(c.r('用法: banner auto|compact|minimal')); process.exit(1); }
      return cmdBanner(arg);
    case 'status': return cmdStatus();
    case 'install': return cmdInstall();
    case 'uninstall': return cmdUninstall();
    default:
      console.log(c.b('\n  Cyberline — Claude Code 界面美化\n'));
      console.log('  apply <任意参数>     统一入口，自动判断类型');
      console.log('    apply neon           = use neon');
      console.log('    apply bg grid        = bg grid');
      console.log('  reload               开新 WT 标签页，让终端改动生效');
      console.log('  list                 列出主题并预览色板');
      console.log('  use <主题>           切换主题（状态栏 + 终端）');
      console.log('    --no-terminal      仅改状态栏，不动终端');
      console.log('  toggle <分段>        开关某个信息分段');
      console.log('  labels               中文标签 显示/隐藏');
      console.log('  bg <风格>            切换终端背景');
      console.log('    gradient|grid|none    渐变/网格/无');
      console.log('  opacity <0.1-1.0>    背景浓淡（0.4 淡 / 0.7 默认 / 1.0 浓）');
      console.log('  banner <风格>        启动横幅高度');
      console.log('    auto|compact|minimal  自适应 / 无 LOGO / 仅两行');
      console.log('  layout one|two       单行 / 双行布局');
      console.log('  status               查看当前配置');
      console.log('  install              接入 Claude Code');
      console.log('  uninstall            还原所有改动');
      console.log('');
      console.log(c.d('  想先看效果再定: node bgpreview.js --levels'));
      console.log('');
  }
}

main();
