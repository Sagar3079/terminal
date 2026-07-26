/* WebTerm themes + settings (plain script, attaches globals to window). */
(function () {
  'use strict';

  window.THEMES = {
    'dark': {
      background: '#0d1117',
      foreground: '#c9d1d9',
      cursor: '#58a6ff',
      selectionBackground: '#264f78',
      black: '#484f58',
      red: '#ff7b72',
      green: '#3fb950',
      yellow: '#d29922',
      blue: '#58a6ff',
      magenta: '#bc8cff',
      cyan: '#39c5cf',
      white: '#b1bac4',
      brightBlack: '#6e7681',
      brightRed: '#ffa198',
      brightGreen: '#56d364',
      brightYellow: '#e3b341',
      brightBlue: '#79c0ff',
      brightMagenta: '#d2a8ff',
      brightCyan: '#56d4dd',
      brightWhite: '#f0f6fc'
    },
    'light': {
      background: '#ffffff',
      foreground: '#24292f',
      cursor: '#0969da',
      selectionBackground: '#b6d7ff',
      black: '#24292f',
      red: '#cf222e',
      green: '#116329',
      yellow: '#4d2d00',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#6e7781',
      brightBlack: '#57606a',
      brightRed: '#a40e26',
      brightGreen: '#1a7f37',
      brightYellow: '#633c01',
      brightBlue: '#218bff',
      brightMagenta: '#a475f9',
      brightCyan: '#3192aa',
      brightWhite: '#8c959f'
    },
    'dracula': {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff'
    },
    'solarized-dark': {
      background: '#002b36',
      foreground: '#839496',
      cursor: '#93a1a1',
      selectionBackground: '#073642',
      black: '#073642',
      red: '#dc322f',
      green: '#859900',
      yellow: '#b58900',
      blue: '#268bd2',
      magenta: '#d33682',
      cyan: '#2aa198',
      white: '#eee8d5',
      brightBlack: '#586e75',
      brightRed: '#cb4b16',
      brightGreen: '#586e75',
      brightYellow: '#657b83',
      brightBlue: '#839496',
      brightMagenta: '#6c71c4',
      brightCyan: '#93a1a1',
      brightWhite: '#fdf6e3'
    },
    'monokai': {
      background: '#272822',
      foreground: '#f8f8f2',
      cursor: '#f8f8f0',
      selectionBackground: '#49483e',
      black: '#272822',
      red: '#f92672',
      green: '#a6e22e',
      yellow: '#f4bf75',
      blue: '#66d9ef',
      magenta: '#ae81ff',
      cyan: '#a1efe4',
      white: '#f8f8f2',
      brightBlack: '#75715e',
      brightRed: '#f92672',
      brightGreen: '#a6e22e',
      brightYellow: '#f4bf75',
      brightBlue: '#66d9ef',
      brightMagenta: '#ae81ff',
      brightCyan: '#a1efe4',
      brightWhite: '#f9f8f5'
    }
  };

  var STORAGE_KEY = 'webterm-settings';
  var DEFAULTS = { theme: 'dark', fontSize: 14 };

  window.loadSettings = function loadSettings() {
    var saved = {};
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) || {};
    } catch (e) {
      saved = {};
    }
    var s = Object.assign({}, DEFAULTS, saved);
    if (!window.THEMES[s.theme]) s.theme = DEFAULTS.theme;
    s.fontSize = clampFontSize(s.fontSize);
    return s;
  };

  window.saveSettings = function saveSettings(s) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch (e) {
      // localStorage unavailable (private mode etc.) — settings just won't persist
    }
  };

  function clampFontSize(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) n = DEFAULTS.fontSize;
    return Math.min(24, Math.max(10, n));
  }

  function applyChrome(themeName) {
    var t = window.THEMES[themeName] || window.THEMES[DEFAULTS.theme];
    document.body.style.setProperty('--bg', t.background);
    document.body.style.setProperty('--fg', t.foreground);
  }

  window.initSettingsPanel = function initSettingsPanel(panelEl, onChange) {
    var settings = window.loadSettings();

    panelEl.innerHTML = '';

    var title = document.createElement('h3');
    title.textContent = 'Settings';
    panelEl.appendChild(title);

    // Theme select
    var themeRow = document.createElement('label');
    themeRow.className = 'settings-row';
    themeRow.appendChild(document.createTextNode('Theme '));
    var themeSelect = document.createElement('select');
    Object.keys(window.THEMES).forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      themeSelect.appendChild(opt);
    });
    themeSelect.value = settings.theme;
    themeRow.appendChild(themeSelect);
    panelEl.appendChild(themeRow);

    // Font size input
    var sizeRow = document.createElement('label');
    sizeRow.className = 'settings-row';
    sizeRow.appendChild(document.createTextNode('Font size '));
    var sizeInput = document.createElement('input');
    sizeInput.type = 'number';
    sizeInput.min = '10';
    sizeInput.max = '24';
    sizeInput.value = String(settings.fontSize);
    sizeRow.appendChild(sizeInput);
    panelEl.appendChild(sizeRow);

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function () {
      panelEl.classList.add('hidden');
    });
    panelEl.appendChild(closeBtn);

    function commit() {
      settings.theme = window.THEMES[themeSelect.value] ? themeSelect.value : DEFAULTS.theme;
      settings.fontSize = clampFontSize(sizeInput.value);
      window.saveSettings(settings);
      applyChrome(settings.theme);
      if (typeof onChange === 'function') onChange(settings);
    }

    themeSelect.addEventListener('change', commit);
    sizeInput.addEventListener('change', commit);
    sizeInput.addEventListener('input', commit);

    applyChrome(settings.theme);
  };
})();
