/**
 * Cyberline 配色主题定义。
 * 每个主题需提供全部语义色位；statusline.js 只依赖这些键。
 * terminal 段用于同步 Windows Terminal 配色方案（apply-terminal.js 读取）。
 */
'use strict';

const THEMES = {
  // 赛博朋克：纯黑 + 青/洋红霓虹
  neon: {
    label: '赛博朋克霓虹',
    ui: {
      cyan: [0, 240, 255],
      magenta: [255, 46, 151],
      yellow: [255, 214, 0],
      green: [0, 255, 159],
      red: [255, 56, 96],
      blue: [45, 125, 255],
      dim: [140, 140, 178],  // 提亮 1.55×：neon 是纯黑底，dim 最吃亏；此值在背景图上仍有 4.9:1
      text: [240, 240, 240],
    },
    terminal: {
      name: 'Cyberline Neon',
      background: '#000000', foreground: '#F0F0F0',
      cursorColor: '#00F0FF', selectionBackground: '#FF2E97',
      black: '#12121A', red: '#FF3860', green: '#00FF9F', yellow: '#FFD600',
      blue: '#2D7DFF', purple: '#FF2E97', cyan: '#00F0FF', white: '#D8D8E0',
      brightBlack: '#5A5A72', brightRed: '#FF6B8A', brightGreen: '#6BFFC4',
      brightYellow: '#FFE566', brightBlue: '#6BA5FF', brightPurple: '#FF6BBA',
      brightCyan: '#6FF9FF', brightWhite: '#FFFFFF',
    },
  },

  // Outrun：80 年代合成波，紫底橙粉
  outrun: {
    label: '合成波 Outrun',
    ui: {
      cyan: [46, 226, 255],
      magenta: [255, 46, 170],
      yellow: [255, 149, 46],
      green: [107, 255, 181],
      red: [255, 62, 106],
      blue: [138, 108, 255],
      dim: [151, 126, 200],  // 同上，保证背景图上仍有 4.5:1
      text: [243, 232, 255],
    },
    terminal: {
      name: 'Cyberline Outrun',
      background: '#14082B', foreground: '#F3E8FF',
      cursorColor: '#FF2EAA', selectionBackground: '#8A6CFF',
      black: '#241145', red: '#FF3E6A', green: '#6BFFB5', yellow: '#FF952E',
      blue: '#8A6CFF', purple: '#FF2EAA', cyan: '#2EE2FF', white: '#D8CCF0',
      brightBlack: '#68578A', brightRed: '#FF7093', brightGreen: '#9BFFD0',
      brightYellow: '#FFB870', brightBlue: '#AE99FF', brightPurple: '#FF70C4',
      brightCyan: '#7FEEFF', brightWhite: '#FFFFFF',
    },
  },

  // Matrix：单色绿，终端感最强
  matrix: {
    label: '矩阵绿',
    ui: {
      cyan: [0, 255, 170],
      magenta: [120, 255, 120],
      yellow: [190, 255, 90],
      green: [0, 255, 90],
      red: [255, 100, 80],
      blue: [0, 210, 160],
      dim: [87, 165, 111],   // 同上
      text: [200, 255, 210],
    },
    terminal: {
      name: 'Cyberline Matrix',
      background: '#000A05', foreground: '#C8FFD2',
      cursorColor: '#00FF5A', selectionBackground: '#00994D',
      black: '#04160C', red: '#FF6450', green: '#00FF5A', yellow: '#BEFF5A',
      blue: '#00D2A0', purple: '#78FF78', cyan: '#00FFAA', white: '#A8E6B8',
      brightBlack: '#3A6E4A', brightRed: '#FF8F80', brightGreen: '#6BFF95',
      brightYellow: '#D9FF8F', brightBlue: '#5AE8C4', brightPurple: '#A8FFA8',
      brightCyan: '#7FFFD0', brightWhite: '#FFFFFF',
    },
  },

  // Tokyo Night：低刺激深蓝紫，长时间使用最舒适
  tokyo: {
    label: '东京夜',
    ui: {
      cyan: [125, 207, 255],
      magenta: [187, 154, 247],
      yellow: [224, 175, 104],
      green: [158, 206, 106],
      red: [247, 118, 142],
      blue: [122, 162, 247],
      dim: [125, 138, 199],  // 同上
      text: [192, 202, 245],
    },
    terminal: {
      name: 'Cyberline Tokyo',
      background: '#1A1B26', foreground: '#C0CAF5',
      cursorColor: '#7DCFFF', selectionBackground: '#364A82',
      black: '#15161E', red: '#F7768E', green: '#9ECE6A', yellow: '#E0AF68',
      blue: '#7AA2F7', purple: '#BB9AF7', cyan: '#7DCFFF', white: '#A9B1D6',
      brightBlack: '#565F89', brightRed: '#FF899D', brightGreen: '#B9F27C',
      brightYellow: '#FFC777', brightBlue: '#8DB0FF', brightPurple: '#C7A9FF',
      brightCyan: '#A4DAFF', brightWhite: '#FFFFFF',
    },
  },
};

const DEFAULT_THEME = 'neon';

/** 读取当前生效主题名；配置缺失或非法时回落到默认。 */
function activeThemeName(configPath) {
  try {
    const cfg = JSON.parse(require('fs').readFileSync(configPath, 'utf8'));
    if (cfg && typeof cfg.theme === 'string' && THEMES[cfg.theme]) return cfg.theme;
  } catch (_) { /* 无配置即用默认 */ }
  return DEFAULT_THEME;
}

module.exports = { THEMES, DEFAULT_THEME, activeThemeName };
