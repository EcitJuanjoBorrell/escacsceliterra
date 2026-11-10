'use strict';
import { ENV_ASSETS, ENV_LIST } from '../env/envassets.js';
/* ============================================================
   SISTEMA DE TEMES — personalització de colors, materials,
   il·luminació i vista. Presets, persistència (localStorage),
   exportació i importació JSON.
   El tema només toca CSS i crida Theme.apply3D (registrada
   per l'escena 3D). Cap dependència directa de THREE aquí.
   ============================================================ */

const THEME_KEY = 'ectThemeV1';
const ENV_CUSTOM_KEY = 'ectEnvCustomV1';
const ENV_IDS = ['cap', 'galaxia', 'mar', 'muntanyes', 'estrellat', 'custom'];
let ENV_CUSTOM = null; // dataURL de la imatge de fons pujada per l'usuari

const DEFAULT_THEME = {
  // fons i ambient (per defecte: cel estrellat tranquil, no saturat)
  bg1: '#0d1424', bg2: '#1d2b45', bgStyle: 'grad', accent: '#4fc3f7',
  env: 'estrellat',
  // taulell de Terra
  eLight: '#d8c49c', eDark: '#77533a', eRim: '#46311f',
  // taulell del Cel
  sLight: '#bcd9ff', sDark: '#6f9fd8', sRim: '#6fb6e8',
  sOpacity: 0.16, sGrid: 0.33, gap: 2.5,
  // peces
  pWhite: '#efe6d2', pBlack: '#333d4b', pRough: 0.35, pMetal: 0.15,
  gOpacity: 0.8,
  // marques
  mSel: '#4fc3f7', mMove: '#4fc3f7', mCap: '#ff7043',
  mVert: '#4fc3f7', mLast: '#ffd54f', mCheck: '#ff3b30',
  // il·luminació
  lDir: 1.05, lAmb: 0.55, shadows: true,
  // vista i animació
  coords: true, levelLabels: true, autoRotate: false, animSpeed: 1.0,
  // interfície fosca? (cada preset el defineix)
  uiDark: true
};

const COLOR_KEYS = ['bg1', 'bg2', 'accent', 'eLight', 'eDark', 'eRim',
  'sLight', 'sDark', 'sRim', 'pWhite', 'pBlack',
  'mSel', 'mMove', 'mCap', 'mVert', 'mLast', 'mCheck'];
const NUM_RANGE = {
  sOpacity: [0.05, 0.6], sGrid: [0, 1], gap: [2.5, 9],
  pRough: [0.05, 0.9], pMetal: [0, 0.9], gOpacity: [0.25, 1],
  lDir: [0.2, 2.2], lAmb: [0, 1.5], animSpeed: [0.4, 2.5]
};
const CHECK_KEYS = ['shadows', 'coords', 'levelLabels', 'autoRotate'];

const PRESETS = {
  'Nit estrellada': DEFAULT_THEME,
  'Fusta clàssica': {
    bg1: '#e9dcc3', bg2: '#f7efdf', bgStyle: 'grad', accent: '#a05a1e',
    env: 'cap',
    eLight: '#ecdcb4', eDark: '#9c6b3c', eRim: '#59402a',
    sLight: '#d8e9ff', sDark: '#8fb0d8', sRim: '#4a7fb5',
    sOpacity: 0.22, sGrid: 0.4, gap: 2.5,
    pWhite: '#f7f2e6', pBlack: '#33291f', pRough: 0.4, pMetal: 0.1,
    gOpacity: 0.8,
    mSel: '#ff9800', mMove: '#2e7d32', mCap: '#c62828',
    mVert: '#00838f', mLast: '#f59f00', mCheck: '#d32f2f',
    lDir: 1.15, lAmb: 0.7, shadows: true,
    coords: true, levelLabels: true, autoRotate: false, animSpeed: 1.0,
    uiDark: false
  },
  'Albada': {
    bg1: '#f6e7e0', bg2: '#fdf3ee', bgStyle: 'grad', accent: '#c2557a',
    env: 'mar',
    eLight: '#f2e0cf', eDark: '#b98a72', eRim: '#7a5442',
    sLight: '#ffe4ef', sDark: '#d9a8c0', sRim: '#c98aa8',
    sOpacity: 0.25, sGrid: 0.4, gap: 2.5,
    pWhite: '#fffdf7', pBlack: '#4a3a45', pRough: 0.38, pMetal: 0.12,
    gOpacity: 0.8,
    mSel: '#e91e63', mMove: '#43a047', mCap: '#d81b60',
    mVert: '#7b1fa2', mLast: '#ffb300', mCheck: '#b71c1c',
    lDir: 1.1, lAmb: 0.75, shadows: true,
    coords: true, levelLabels: true, autoRotate: false, animSpeed: 1.0,
    uiDark: false
  },
  'Esmeralda': {
    bg1: '#07130d', bg2: '#143524', bgStyle: 'grad', accent: '#52e0a0',
    env: 'muntanyes',
    eLight: '#cfe3c8', eDark: '#3f7a52', eRim: '#1d4a30',
    sLight: '#bfead8', sDark: '#4fae85', sRim: '#52e0a0',
    sOpacity: 0.18, sGrid: 0.35, gap: 2.5,
    pWhite: '#f3efe2', pBlack: '#1e2a22', pRough: 0.35, pMetal: 0.18,
    gOpacity: 0.8,
    mSel: '#ffd54f', mMove: '#52e0a0', mCap: '#ff7043',
    mVert: '#52e0a0', mLast: '#ffd54f', mCheck: '#ff3b30',
    lDir: 1.05, lAmb: 0.55, shadows: true,
    coords: true, levelLabels: true, autoRotate: false, animSpeed: 1.0,
    uiDark: true
  },
  'Neó': {
    bg1: '#05060a', bg2: '#0d1626', bgStyle: 'grad', accent: '#00e5ff',
    env: 'galaxia',
    eLight: '#1d3a55', eDark: '#0d1f33', eRim: '#00e5ff',
    sLight: '#3a1554', sDark: '#1a0b2e', sRim: '#ff2d95',
    sOpacity: 0.2, sGrid: 0.5, gap: 2.5,
    pWhite: '#e8f6ff', pBlack: '#14181f', pRough: 0.25, pMetal: 0.6,
    gOpacity: 0.8,
    mSel: '#00e5ff', mMove: '#00e5ff', mCap: '#ff2d95',
    mVert: '#ffe600', mLast: '#ffe600', mCheck: '#ff1744',
    lDir: 0.9, lAmb: 0.45, shadows: true,
    coords: true, levelLabels: true, autoRotate: false, animSpeed: 1.0,
    uiDark: true
  },
  'Papir': {
    bg1: '#e8dcc0', bg2: '#f6efdd', bgStyle: 'grad', accent: '#7a5c1e',
    env: 'cap',
    eLight: '#efe3c0', eDark: '#a98a52', eRim: '#6e5628',
    sLight: '#f7f0da', sDark: '#d4c48e', sRim: '#a08a4e',
    sOpacity: 0.28, sGrid: 0.4, gap: 2.5,
    pWhite: '#fbf6e8', pBlack: '#3d3020', pRough: 0.45, pMetal: 0.05,
    gOpacity: 0.8,
    mSel: '#b8860b', mMove: '#556b2f', mCap: '#a63a1e',
    mVert: '#556b2f', mLast: '#d4a017', mCheck: '#8b0000',
    lDir: 1.2, lAmb: 0.8, shadows: true,
    coords: true, levelLabels: true, autoRotate: false, animSpeed: 1.0,
    uiDark: false
  },
  'Contrast alt': {
    bg1: '#000000', bg2: '#101010', bgStyle: 'grad', accent: '#ffffff',
    env: 'cap',
    eLight: '#ffffff', eDark: '#000000', eRim: '#ffffff',
    sLight: '#ffffff', sDark: '#000000', sRim: '#00ffff',
    sOpacity: 0.12, sGrid: 0.8, gap: 2.5,
    pWhite: '#ffffff', pBlack: '#000000', pRough: 0.5, pMetal: 0,
    gOpacity: 0.8,
    mSel: '#ffff00', mMove: '#00ff00', mCap: '#ff0000',
    mVert: '#00ffff', mLast: '#ff00ff', mCheck: '#ff0000',
    lDir: 1.3, lAmb: 0.9, shadows: true,
    coords: true, levelLabels: true, autoRotate: false, animSpeed: 1.0,
    uiDark: true
  }
};

/* Esquema del panell: [clau, etiqueta, tipus, extra] */
const THEME_SECTIONS = [
  ['Fons i ambient', [
    ['bg1', 'Fons (base)', 'color'],
    ['bg2', 'Fons (llum)', 'color'],
    ['bgStyle', 'Estil del fons', 'select', [['grad', 'Degradat'], ['solid', 'Sòlid']]],
    ['accent', "Color d'accent", 'color'],
    ['env', 'Paisatge de fons', 'env']
  ]],
  ['Taulell de Terra', [
    ['eLight', 'Casella clara', 'color'],
    ['eDark', 'Casella fosca', 'color'],
    ['eRim', 'Vora del taulell', 'color']
  ]],
  ['Taulell del Cel', [
    ['sLight', 'Casella clara', 'color'],
    ['sDark', 'Casella fosca', 'color'],
    ['sRim', 'Vora i graella', 'color'],
    ['sOpacity', 'Opacitat del vidre', 'range', [0.05, 0.6, 0.01]],
    ['sGrid', 'Intensitat de la graella', 'range', [0, 1, 0.01]],
    ['gap', 'Distància entre nivells', 'range', [2.5, 9, 0.1]]
  ]],
  ['Peces', [
    ['pWhite', 'Peces blanques', 'color'],
    ['pBlack', 'Peces negres', 'color'],
    ['pRough', 'Rugositat (mat lluent)', 'range', [0.05, 0.9, 0.01]],
    ['pMetal', 'Metal·licitat', 'range', [0, 0.9, 0.01]],
    ['gOpacity', 'Opacitat dels fantasmes', 'range', [0.25, 1, 0.01]]
  ]],
  ['Marques de joc', [
    ['mSel', 'Casella seleccionada', 'color'],
    ['mMove', 'Moviments legals', 'color'],
    ['mCap', 'Captures', 'color'],
    ['mVert', 'Moviments verticals', 'color'],
    ['mLast', 'Última jugada', 'color'],
    ['mCheck', 'Escac', 'color']
  ]],
  ['Il·luminació', [
    ['lDir', 'Llum principal', 'range', [0.2, 2.2, 0.05]],
    ['lAmb', 'Llum ambient', 'range', [0, 1.5, 0.05]],
    ['shadows', 'Ombres', 'check']
  ]],
  ['Vista i animació', [
    ['coords', 'Coordenades (a-h, 1-8)', 'check'],
    ['levelLabels', 'Etiquetes TERRA / CEL', 'check'],
    ['autoRotate', 'Rotació automàtica', 'check'],
    ['animSpeed', 'Velocitat de les animacions', 'range', [0.4, 2.5, 0.1]]
  ]]
];

function cloneTheme(t) { return JSON.parse(JSON.stringify(t)); }

function sanitizeTheme(raw) {
  const out = cloneTheme(DEFAULT_THEME);
  if (!raw || typeof raw !== 'object') return out;
  for (const k of COLOR_KEYS) {
    if (typeof raw[k] === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw[k])) out[k] = raw[k];
  }
  for (const k in NUM_RANGE) {
    if (typeof raw[k] === 'number' && isFinite(raw[k])) {
      const [a, b] = NUM_RANGE[k];
      out[k] = Math.max(a, Math.min(b, raw[k]));
    }
  }
  for (const k of CHECK_KEYS) if (typeof raw[k] === 'boolean') out[k] = raw[k];
  if (raw.bgStyle === 'grad' || raw.bgStyle === 'solid') out.bgStyle = raw.bgStyle;
  if (typeof raw.env === 'string' && ENV_IDS.indexOf(raw.env) >= 0) out.env = raw.env;
  if (typeof raw.uiDark === 'boolean') out.uiDark = raw.uiDark;
  return out;
}

// Les dreceres de lletra/número no s'han de disparar amb Ctrl/Cmd/Alt (p. ex.
// Ctrl+C = copiar obria el calaix de temes) ni mentre s'escriu en un camp de text.
function shortcutBlocked(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return true;
  const t = e.target;
  if (!t || !t.tagName) return false;
  if (t.isContentEditable || t.tagName === 'TEXTAREA') return true;
  if (t.tagName === 'INPUT') return !['range', 'checkbox', 'radio', 'color', 'button', 'file'].includes(t.type);
  return false;
}

const Theme = {
  cur: cloneTheme(DEFAULT_THEME),
  apply3D: null,        // registrada per l'escena 3D
  _saveTimer: null,
  _presetRow: null,

  init() {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw) this.cur = sanitizeTheme(JSON.parse(raw));
      ENV_CUSTOM = localStorage.getItem(ENV_CUSTOM_KEY);
    } catch (e) { /* tema per defecte */ }
    if (this.cur.env === 'custom' && !ENV_CUSTOM) this.cur.env = 'cap';
    this.apply();
    this.buildPanel();
    this.wire();
  },

  set(t, skipSave) {
    this.cur = sanitizeTheme(t);
    this.apply();
    if (!skipSave) this.saveNow();
    this.refreshInputs();
  },

  saveNow() {
    clearTimeout(this._saveTimer);
    try { localStorage.setItem(THEME_KEY, JSON.stringify(this.cur)); } catch (e) { /* sense emmagatzematge */ }
  },

  apply() {
    this.applyCSS(this.cur);
    if (this.apply3D) this.apply3D(this.cur);
  },

  applyCSS(t) {
    const rs = document.documentElement.style;
    document.body.style.background = t.bgStyle === 'solid' ? t.bg1 :
      'radial-gradient(1300px 800px at 30% 18%, ' + t.bg2 + ' 0%, ' + t.bg1 + ' 62%)';
    rs.setProperty('--accent', t.accent);
    rs.setProperty('--accent-fade', t.accent + '3d');
    if (t.uiDark === false) {
      rs.setProperty('--text', '#252b36');
      rs.setProperty('--muted', '#5d6774');
      rs.setProperty('--panel', 'rgba(255,255,255,0.82)');
      rs.setProperty('--panel-border', 'rgba(20,30,50,0.2)');
      rs.setProperty('--modal-bg', 'linear-gradient(160deg,#fdf8ef,#f1e8d6)');
      rs.setProperty('--v2d-back', 'rgba(240,235,220,0.8)');
      rs.setProperty('--row-odd', 'rgba(0,0,0,0.055)');
      rs.setProperty('--seg-active-bg', 'linear-gradient(135deg, rgba(255,152,0,0.3), rgba(194,85,122,0.3))');
    } else {
      rs.setProperty('--text', '#e8edf5');
      rs.setProperty('--muted', '#93a1b5');
      rs.setProperty('--panel', 'rgba(22, 28, 40, 0.82)');
      rs.setProperty('--panel-border', 'rgba(255,255,255,0.09)');
      rs.setProperty('--modal-bg', 'linear-gradient(160deg, #1a2233, #121826)');
      rs.setProperty('--v2d-back', 'rgba(8, 11, 17, 0.72)');
      rs.setProperty('--row-odd', 'rgba(255,255,255,0.045)');
      rs.setProperty('--seg-active-bg', 'linear-gradient(135deg, rgba(79,195,247,0.25), rgba(126,87,194,0.3))');
    }
    // taulells de la vista 2D
    rs.setProperty('--sq-light', t.eLight);
    rs.setProperty('--sq-dark', t.eDark);
    rs.setProperty('--sky-light', t.sLight);
    rs.setProperty('--sky-dark', t.sDark);
    rs.setProperty('--m-cap', t.mCap);
  },

  save() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      try { localStorage.setItem(THEME_KEY, JSON.stringify(this.cur)); } catch (e) { /* sense emmagatzematge */ }
    }, 250);
  },

  /* ---------- Panell ---------- */
  buildPanel() {
    const body = document.getElementById('theme-controls');
    if (!body || body.childElementCount) return;
    for (const [title, controls] of /** @type {any[]} */ (THEME_SECTIONS)) {
      const sec = document.createElement('div');
      sec.className = 'theme-section';
      const h = document.createElement('div');
      h.className = 'card-label';
      h.textContent = title;
      sec.appendChild(h);
      for (const spec of controls) sec.appendChild(this.makeControl(spec));
      body.appendChild(sec);
    }
    // presets
    const row = document.getElementById('preset-row');
    for (const name in PRESETS) {
      const b = document.createElement('button');
      b.className = 'preset-chip';
      b.textContent = name;
      b.addEventListener('click', () => this.set(PRESETS[name]));
      row.appendChild(b);
    }
    this.refreshInputs();
  },

  makeControl([key, label, type, extra]) {
    const row = document.createElement('div');
    row.className = 'theme-row';
    const lab = document.createElement('label');
    lab.textContent = label;
    row.appendChild(lab);
    const val = document.createElement('span');
    val.className = 'theme-val';
    if (type === 'color') {
      const inp = document.createElement('input');
      inp.type = 'color'; inp.dataset.key = key; inp.dataset.type = 'color';
      inp.addEventListener('input', () => {
        this.cur[key] = inp.value;
        this.onThemeChanged(key);
        val.textContent = inp.value;
      });
      row.appendChild(inp);
    } else if (type === 'range') {
      const [min, max, step] = extra;
      const inp = document.createElement('input');
      inp.type = 'range'; inp.min = min; inp.max = max; inp.step = step;
      inp.dataset.key = key; inp.dataset.type = 'range';
      inp.addEventListener('input', () => {
        this.cur[key] = parseFloat(inp.value);
        this.onThemeChanged(key);
        val.textContent = inp.value;
      });
      row.appendChild(inp);
    } else if (type === 'check') {
      row.classList.add('theme-row-check');
      const inp = document.createElement('input');
      inp.type = 'checkbox'; inp.dataset.key = key; inp.dataset.type = 'check';
      inp.addEventListener('change', () => {
        this.cur[key] = inp.checked;
        this.onThemeChanged(key);
      });
      row.appendChild(inp);
    } else if (type === 'env') {
      row.classList.add('theme-row-env');
      const picker = document.createElement('div');
      picker.className = 'env-picker';
      const mkBtn = (id, label, imgSrc) => {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'env-btn'; b.dataset.env = id;
        b.title = label;
        if (imgSrc) {
          const im = document.createElement('img');
          im.src = imgSrc; im.alt = label; im.draggable = false;
          b.appendChild(im);
        } else {
          const none = document.createElement('span');
          none.className = 'env-none'; none.textContent = '\u00b7';
          b.appendChild(none);
        }
        const nm = document.createElement('span');
        nm.className = 'env-name'; nm.textContent = label;
        b.appendChild(nm);
        b.addEventListener('click', () => {
          this.cur.env = id;
          this.onThemeChanged(key);
          this.refreshEnvButtons();
        });
        picker.appendChild(b);
      };
      mkBtn('cap', 'Cap', null);
      if (typeof ENV_LIST !== 'undefined') {
        for (const e of ENV_LIST) mkBtn(e.id, e.nom, ENV_ASSETS[e.id]);
      }
      const up = document.createElement('button');
      up.type = 'button'; up.className = 'env-btn env-upload'; up.title = 'Puja una imatge pròpia';
      const upIco = document.createElement('span');
      upIco.className = 'env-none'; upIco.textContent = '\u2b06';
      const upNm = document.createElement('span');
      upNm.className = 'env-name'; upNm.textContent = 'Puja\u2026';
      up.appendChild(upIco); up.appendChild(upNm);
      up.addEventListener('click', () => {
        const f = document.getElementById('env-file');
        if (f) f.click();
      });
      picker.appendChild(up);
      row.appendChild(picker);
    } else if (type === 'select') {
      const inp = document.createElement('select');
      inp.dataset.key = key; inp.dataset.type = 'select';
      for (const [v, txt] of extra) {
        const o = document.createElement('option');
        o.value = v; o.textContent = txt;
        inp.appendChild(o);
      }
      inp.addEventListener('change', () => {
        this.cur[key] = inp.value;
        this.onThemeChanged(key);
      });
      row.appendChild(inp);
    }
    if (type === 'color' || type === 'range') row.appendChild(val);
    return row;
  },

  onThemeChanged(key) {
    // canvis estructurals (distància entre nivells) passen per apply3D
    this.apply();
    this.save();
  },

  refreshEnvButtons() {
    document.querySelectorAll('.env-btn[data-env]').forEach(b => {
      const bb = /** @type {HTMLElement} */ (b);
      bb.classList.toggle('active', bb.dataset.env === this.cur.env);
    });
  },

  refreshInputs() {
    const body = document.getElementById('theme-controls');
    if (!body) return;
    this.refreshEnvButtons();
    body.querySelectorAll('input[data-key],select[data-key]').forEach(inp => {
      const el = /** @type {any} */ (inp);
      const k = el.dataset.key, t = this.cur[k];
      if (el.dataset.type === 'check') el.checked = !!t;
      else el.value = t;
      const row = el.closest('.theme-row');
      if (row) {
        const v = row.querySelector('.theme-val');
        if (v && (el.dataset.type === 'color' || el.dataset.type === 'range')) {
          v.textContent = el.dataset.type === 'range' ? String(t) : t;
        }
      }
    });
  },

  wire() {
    const $ = id => document.getElementById(id);
    const toggle = () => {
      const d = $('theme-drawer');
      d.classList.toggle('hidden');
      document.getElementById('btn-theme').classList.toggle('active', !d.classList.contains('hidden'));
    };
    $('btn-theme').addEventListener('click', toggle);
    $('btn-theme-menu').addEventListener('click', toggle);
    $('btn-theme-close').addEventListener('click', toggle);
    $('btn-theme-reset').addEventListener('click', () => this.set(DEFAULT_THEME));
    $('btn-theme-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(this.cur, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tema-escac-cel-i-terra.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    $('btn-theme-import').addEventListener('click', () => $('theme-file').click());
    $('env-file').addEventListener('change', e => {
      const tgt = /** @type {HTMLInputElement} */ (e.target);
      const f = tgt.files && tgt.files[0];
      if (!f) return;
      const url = URL.createObjectURL(f);
      const img = new Image();
      img.onload = () => {
        // reducteix la imatge perquè li passi al localStorage
        const k = Math.min(1, 1400 / img.width, 800 / img.height);
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * k));
        cv.height = Math.max(1, Math.round(img.height * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        let data;
        try { data = cv.toDataURL('image/jpeg', 0.8); }
        catch (err) { URL.revokeObjectURL(url); alert('No he pogut processar la imatge.'); return; }
        URL.revokeObjectURL(url);
        ENV_CUSTOM = data;
        // refresc immediat del fons i del PMREM amb la imatge nova
        if (typeof this.refreshEnvironment === 'function') this.refreshEnvironment();
        try { localStorage.setItem(ENV_CUSTOM_KEY, data); } catch (err2) { /* massa gran: només aquesta sessió */ }
        this.cur.env = 'custom';
        this.onThemeChanged('env');
        this.refreshEnvButtons();
      };
      img.onerror = () => { URL.revokeObjectURL(url); alert('El fitxer no és una imatge vàlida.'); };
      img.src = url;
      tgt.value = '';
    });
    $('theme-file').addEventListener('change', e => {
      const tgt = /** @type {HTMLInputElement} */ (e.target);
      const f = tgt.files && tgt.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { this.set(sanitizeTheme(JSON.parse(/** @type {string} */ (r.result)))); }
        catch (err) { alert("El fitxer no és un tema vàlid."); }
      };
      r.readAsText(f);
      tgt.value = '';
    });
    document.addEventListener('keydown', e => {
      if (shortcutBlocked(e)) return;
      if (e.key === 'c' || e.key === 'C') toggle();
    });
  }
};

export { Theme, ENV_CUSTOM, shortcutBlocked };
