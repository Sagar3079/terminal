/* WebTerm themes + fonts + settings (plain script, attaches globals to window). */
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
    },
    'nord': {
      background: '#2e3440',
      foreground: '#d8dee9',
      cursor: '#d8dee9',
      selectionBackground: '#434c5e',
      black: '#3b4252',
      red: '#bf616a',
      green: '#a3be8c',
      yellow: '#ebcb8b',
      blue: '#81a1c1',
      magenta: '#b48ead',
      cyan: '#88c0d0',
      white: '#e5e9f0',
      brightBlack: '#4c566a',
      brightRed: '#bf616a',
      brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b',
      brightBlue: '#81a1c1',
      brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb',
      brightWhite: '#eceff4'
    },
    'gruvbox-dark': {
      background: '#282828',
      foreground: '#ebdbb2',
      cursor: '#ebdbb2',
      selectionBackground: '#504945',
      black: '#282828',
      red: '#cc241d',
      green: '#98971a',
      yellow: '#d79921',
      blue: '#458588',
      magenta: '#b16286',
      cyan: '#689d6a',
      white: '#a89984',
      brightBlack: '#928374',
      brightRed: '#fb4934',
      brightGreen: '#b8bb26',
      brightYellow: '#fabd2f',
      brightBlue: '#83a598',
      brightMagenta: '#d3869b',
      brightCyan: '#8ec07c',
      brightWhite: '#ebdbb2'
    },
    'one-dark': {
      background: '#282c34',
      foreground: '#abb2bf',
      cursor: '#528bff',
      selectionBackground: '#3e4451',
      black: '#282c34',
      red: '#e06c75',
      green: '#98c379',
      yellow: '#d19a66',
      blue: '#61afef',
      magenta: '#c678dd',
      cyan: '#56b6c2',
      white: '#abb2bf',
      brightBlack: '#5c6370',
      brightRed: '#e06c75',
      brightGreen: '#98c379',
      brightYellow: '#e5c07b',
      brightBlue: '#61afef',
      brightMagenta: '#c678dd',
      brightCyan: '#56b6c2',
      brightWhite: '#ffffff'
    },
    'tokyo-night': {
      background: '#1a1b26',
      foreground: '#c0caf5',
      cursor: '#c0caf5',
      selectionBackground: '#33467c',
      black: '#15161e',
      red: '#f7768e',
      green: '#9ece6a',
      yellow: '#e0af68',
      blue: '#7aa2f7',
      magenta: '#bb9af7',
      cyan: '#7dcfff',
      white: '#a9b1d6',
      brightBlack: '#414868',
      brightRed: '#f7768e',
      brightGreen: '#9ece6a',
      brightYellow: '#e0af68',
      brightBlue: '#7aa2f7',
      brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff',
      brightWhite: '#c0caf5'
    },
    'catppuccin-mocha': {
      background: '#1e1e2e',
      foreground: '#cdd6f4',
      cursor: '#f5e0dc',
      selectionBackground: '#585b70',
      black: '#45475a',
      red: '#f38ba8',
      green: '#a6e3a1',
      yellow: '#f9e2af',
      blue: '#89b4fa',
      magenta: '#f5c2e7',
      cyan: '#94e2d5',
      white: '#bac2de',
      brightBlack: '#585b70',
      brightRed: '#f38ba8',
      brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af',
      brightBlue: '#89b4fa',
      brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5',
      brightWhite: '#a6adc8'
    }
  };

  window.FONTS = {
    system: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    'jetbrains-mono': "'JetBrains Mono', ui-monospace, monospace",
    'fira-code': "'Fira Code', ui-monospace, monospace"
  };

  var FONT_LABELS = {
    system: 'System',
    'jetbrains-mono': 'JetBrains Mono',
    'fira-code': 'Fira Code'
  };

  // Keys of a full ITheme, in the order shown by the custom theme editor.
  var THEME_KEYS = [
    'background', 'foreground', 'cursor',
    'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
    'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
    'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'
  ];

  var STORAGE_KEY = 'webterm-settings';
  var DEFAULTS = { theme: 'dark', fontSize: 14, fontFamily: 'system' };

  function isHexColor(v) {
    return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
  }

  function isCustomTheme(t) {
    return !!t && typeof t === 'object' &&
      typeof t.background === 'string' && typeof t.foreground === 'string';
  }

  window.loadSettings = function loadSettings() {
    var saved = {};
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) saved = JSON.parse(raw) || {};
    } catch (e) {
      saved = {};
    }
    var s = Object.assign({}, DEFAULTS, saved);
    if (s.theme !== 'custom' && !window.THEMES[s.theme]) s.theme = DEFAULTS.theme;
    if (!window.FONTS[s.fontFamily]) s.fontFamily = DEFAULTS.fontFamily;
    if (s.customTheme !== undefined && !isCustomTheme(s.customTheme)) delete s.customTheme;
    if (s.theme === 'custom' && !isCustomTheme(s.customTheme)) s.theme = DEFAULTS.theme;
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

  // Resolve settings → concrete ITheme (custom theme, named theme, or dark fallback).
  window.getTheme = function getTheme(settings) {
    settings = settings || {};
    if (settings.theme === 'custom' && isCustomTheme(settings.customTheme)) {
      return settings.customTheme;
    }
    return window.THEMES[settings.theme] || window.THEMES[DEFAULTS.theme];
  };

  function clampFontSize(n) {
    n = parseInt(n, 10);
    if (isNaN(n)) n = DEFAULTS.fontSize;
    return Math.min(24, Math.max(10, n));
  }

  function applyChrome(settings) {
    var t = window.getTheme(settings);
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
    var customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = 'Custom…';
    themeSelect.appendChild(customOpt);
    themeSelect.value = settings.theme;
    themeRow.appendChild(themeSelect);
    panelEl.appendChild(themeRow);

    // Font family select
    var fontRow = document.createElement('label');
    fontRow.className = 'settings-row';
    fontRow.appendChild(document.createTextNode('Font '));
    var fontSelect = document.createElement('select');
    Object.keys(window.FONTS).forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      opt.textContent = FONT_LABELS[name] || name;
      fontSelect.appendChild(opt);
    });
    fontSelect.value = settings.fontFamily;
    fontRow.appendChild(fontSelect);
    panelEl.appendChild(fontRow);

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

    // Custom theme editor
    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'custom-theme-btn';
    editBtn.textContent = 'Edit custom theme';
    panelEl.appendChild(editBtn);

    var editor = document.createElement('div');
    editor.className = 'custom-theme-editor';
    editor.style.display = 'none';
    editor.style.margin = '8px 0';
    panelEl.appendChild(editor);

    var colorInputs = {};

    function buildEditor() {
      editor.innerHTML = '';
      colorInputs = {};
      var base = window.getTheme(settings);
      var grid = document.createElement('div');
      grid.className = 'custom-theme-grid';
      grid.style.display = 'grid';
      grid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(130px, 1fr))';
      grid.style.gap = '4px 10px';
      THEME_KEYS.forEach(function (key) {
        var row = document.createElement('label');
        row.className = 'custom-color-row';
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '6px';
        row.style.fontSize = '12px';
        var input = document.createElement('input');
        input.type = 'color';
        input.value = isHexColor(base[key]) ? base[key] : '#000000';
        colorInputs[key] = input;
        row.appendChild(input);
        row.appendChild(document.createTextNode(key));
        grid.appendChild(row);
      });
      editor.appendChild(grid);

      var saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'custom-theme-save';
      saveBtn.textContent = 'Save custom theme';
      saveBtn.style.marginTop = '8px';
      saveBtn.addEventListener('click', function () {
        var base2 = window.getTheme(settings);
        var t = {};
        THEME_KEYS.forEach(function (key) {
          t[key] = colorInputs[key].value;
        });
        // Not editable individually; derive a sane selection color from the base.
        t.selectionBackground = isHexColor(base2.selectionBackground)
          ? base2.selectionBackground
          : '#264f78';
        settings.customTheme = t;
        settings.theme = 'custom';
        themeSelect.value = 'custom';
        window.saveSettings(settings);
        applyChrome(settings);
        if (typeof onChange === 'function') onChange(settings);
      });
      editor.appendChild(saveBtn);
    }

    function toggleEditor(show) {
      var visible = editor.style.display !== 'none';
      if (show === undefined) show = !visible;
      if (show) {
        buildEditor();
        editor.style.display = 'block';
      } else {
        editor.style.display = 'none';
      }
    }

    editBtn.addEventListener('click', function () {
      toggleEditor();
    });

    // Close button
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', function () {
      panelEl.classList.add('hidden');
    });
    panelEl.appendChild(closeBtn);

    function commit() {
      var chosen = themeSelect.value;
      if (chosen === 'custom') {
        settings.theme = 'custom';
        // Selecting Custom… without a saved custom theme opens the editor.
        if (!isCustomTheme(settings.customTheme)) toggleEditor(true);
      } else {
        settings.theme = window.THEMES[chosen] ? chosen : DEFAULTS.theme;
      }
      settings.fontFamily = window.FONTS[fontSelect.value] ? fontSelect.value : DEFAULTS.fontFamily;
      settings.fontSize = clampFontSize(sizeInput.value);
      window.saveSettings(settings);
      applyChrome(settings);
      if (typeof onChange === 'function') onChange(settings);
    }

    themeSelect.addEventListener('change', commit);
    fontSelect.addEventListener('change', commit);
    sizeInput.addEventListener('change', commit);
    sizeInput.addEventListener('input', commit);

    applyChrome(settings);
  };
})();
