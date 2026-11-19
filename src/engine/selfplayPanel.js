// src/ui/selfplayPanel.js
'use strict';
import './selfplayPanel.css';
import * as A from '../engine/ecitAdapter.js';
import * as P from '../engine/selfplay.js';
import * as X from '../engine/experience.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => Math.round(v * 100);

const I = {
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>',
  dice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1.3" fill="currentColor"/><circle cx="15" cy="15" r="1.3" fill="currentColor"/><circle cx="15" cy="9" r="1.3" fill="currentColor"/><circle cx="9" cy="15" r="1.3" fill="currentColor"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M12 4v12M6 12l6 6 6-6M4 21h16"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 5H6a2 2 0 0 0-2 2v9"/></svg>',
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 3v6M15 3v6M6 9h12v3a6 6 0 0 1-12 0zM12 18v3"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>'
};

let host, sheet, launcher;
let open = false, tab = 'control';
let showWiring = false, msg = '';
let openDrop = null;

function mount() {
  if (document.getElementById('sp-launcher')) return;
  launcher = document.createElement('button');
  launcher.id = 'sp-launcher';
  launcher.type = 'button';
  launcher.className = 'sp-launch';
  launcher.setAttribute('aria-label', 'Obre el generador d’autopartides');
  document.body.appendChild(launcher);

  host = document.createElement('div');
  host.className = 'sp-host';
  host.hidden = true;
  host.innerHTML = '<div class="sp-scrim" data-close="1"></div><section class="sp-sheet" role="dialog" aria-modal="true" aria-label="Generador d’autopartides"></section>';
  document.body.appendChild(host);
  sheet = host.querySelector('.sp-sheet');

  sheet.addEventListener('click', onDropSheetClick);
  document.addEventListener('click', onDropDocClick);

  launcher.addEventListener('click', () => setOpen(true));
  host.addEventListener('click', e => { if (e.target.dataset.close) setOpen(false); });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !open) return;
    if (showWiring) { showWiring = false; return render(); }
    setOpen(false);
  });
  A.subscribe(render);
  P.subscribe(render);
  X.subscribe(render);
  render();
}

function setOpen(v) {
  if (!v) openDrop = null;
  open = v; host.hidden = !v;
  document.body.classList.toggle('sp-locked', v);
  render();
}

function render() {
  const st = P.state(), c = P.config(), ad = A.status(), lib = X.query();
  const save = X.persistenceStatus();
  const saveLabel = save.state === 'saving' ? 'Desant…' : save.state === 'error' ? 'Error' : 'Desat';
  const saveSize = save.bytes < 1024 ? `${save.bytes} B` : `${(save.bytes / 1024).toFixed(1)} KB`;
  launcher.innerHTML = `${I.bolt}<span>Autopartides</span><b data-on="${ad.ok}">${ad.ok ? lib.games : '!'}</b><small class="sp-launch-save" data-state="${esc(save.state)}">${saveLabel} · ${save.games} · ~${saveSize}</small>`;
  launcher.title = save.state === 'error' ? 'Error desant la biblioteca: ' + save.message : 'Estat del desat: ' + save.state;
  launcher.dataset.running = st.running ? '1' : '0';
  if (!open) return;

  const rate = st.elapsed > 0 ? (st.done / (st.elapsed / 1000)) : 0;
  const total = st.results.w + st.results.b + st.results.d || 1;
  const prevScroll = sheet.querySelector('.sp-body')?.scrollTop || 0;

  sheet.innerHTML = `
    <header class="sp-head">
      <div class="sp-head-l">
        <span class="sp-mark">${I.bolt}</span>
        <div>
          <h2>Generador d’autopartides</h2>
          <p>Escacs Cel i Terra · el motor juga contra ell mateix per fabricar l’experiència que no existeix enlloc</p>
        </div>
      </div>
      <div class="sp-head-r">
        <span class="sp-conn" data-ok="${ad.ok}">${I.plug}<span>${ad.ok ? 'motor connectat' : 'motor sense connectar'}</span></span>
        <button type="button" class="sp-x" data-close="1" aria-label="Tanca">${I.x}</button>
      </div>
    </header>

    ${saveIndicator(save)}

    <div class="sp-strip">
      ${cell('Partides a la biblioteca', lib.games, 'earth')}
      ${cell('Posicions apreses', lib.positions, 'sky')}
      ${cell('Amb dades', lib.withData, 'leaf')}
      ${cell('Observacions', lib.totalObs, 'violet')}
      ${cell('Jugades sòlides', lib.eligible, 'amber')}
      <div class="sp-meter">
        <div class="sp-meter-top"><span>Tanda</span><b>${st.done}/${st.total}</b></div>
        <div class="sp-bar"><i style="--w:${pct(st.progress)}%"></i></div>
        <div class="sp-meter-foot">${st.running ? rate.toFixed(1) + ' partides/s' : st.lastMessage ? esc(st.lastMessage) : 'a l’espera'}</div>
      </div>
    </div>

    <nav class="sp-tabs">
      <button type="button" data-tab="control" aria-selected="${tab === 'control'}">Control</button>
      <button type="button" data-tab="feed" aria-selected="${tab === 'feed'}">Partides <b>${st.feed.length}</b></button>
      <button type="button" data-tab="diag" aria-selected="${tab === 'diag'}">Connexió</button>
    </nav>

    ${msg ? `<div class="sp-msg" role="alert">${esc(msg)}</div>` : ''}
    ${st.done && !st.running && st.ingested === 0 && st.lastMessage ? `<div class="sp-msg" role="alert">${esc(st.lastMessage)}</div>` : ''}

    <div class="sp-body" data-tab="${tab}">
      ${tab === 'control' ? controlView(c, st, ad) : tab === 'feed' ? feedView(st) : diagView(ad)}
    </div>
  `;
  const nb = sheet.querySelector('.sp-body'); if (nb) nb.scrollTop = prevScroll;
  wire();
}

function cell(t, v, tone) { return `<div class="sp-cell" data-tone="${tone}"><span>${esc(t)}</span><b>${esc(v)}</b></div>`; }

function saveIndicator(save) {
  const state = save.state === 'saving' ? 'Desant…' : save.state === 'error' ? 'Error de desat' : 'Desat';
  const size = save.bytes < 1024 ? `${save.bytes} B` : `${(save.bytes / 1024).toFixed(1)} KB`;
  return `<div class="sp-save" data-state="${esc(save.state)}" role="status" aria-live="polite">
    <b>${state}</b><span>${save.games} partides · ~${size}</span>
    ${save.message ? `<span class="sp-save-message">${esc(save.message)}</span>` : ''}
    ${save.state === 'error' ? '<button type="button" class="sp-ghost" data-save-export="1">Exporta la biblioteca ara</button>' : ''}
  </div>`;
}

function controlView(c, st, ad) {
  const total = st.results.w + st.results.b + st.results.d || 1;
  const hasChoose = Boolean(A.get()?.choose);
  return `
    <div class="sp-controls">
      <div class="sp-run">
        ${st.running
          ? `<button type="button" class="sp-danger sp-big" data-stop="1">${I.stop}<span>Atura la tanda</span></button>`
          : `<button type="button" class="sp-solid sp-big" data-start="1" ${ad.ok ? '' : 'disabled'}>${I.play}<span>Genera ${c.count} partides</span></button>`}
        <button type="button" class="sp-ghost" data-reset="1">Restableix paràmetres</button>
        <button type="button" class="sp-ghost" data-export="1" ${st.feed.length ? '' : 'disabled'}>${I.down}<span>Exporta notació</span></button>
      </div>

      ${slider('count', 'Partides per tanda', c.count, 1, 400, 1)}
      ${select('policy', 'Política de joc', [['aleatori', 'Aleatòria · explora sense prejudicis'], ['material', 'Materialista · un pas de vista'], ['motor', 'Motor · cerca real']], c.policy, !hasChoose ? ['motor'] : [])}
      ${select('level', 'Nivell del motor', [['1', 'Novell'], ['2', 'Fàcil'], ['3', 'Mitjà'], ['4', 'Difícil'], ['5', 'Expert']], String(c.level), hasChoose ? [] : ['1', '2', '3', '4', '5'])}
      ${slider('maxPlies', 'Mitges jugades màximes', c.maxPlies, 20, 300, 10)}
      ${slider('explore', 'Exploració inicial (jugades lliures)', c.explore, 0, 20, 1)}
      ${slider('temperature', 'Temperatura · variació de tria', c.temperature, 0, 1, 0.05)}
      <div class="sp-seed"><span>Llavor reproduïble<b>${c.seed}</b></span>
        <div><input type="number" data-c="seed" value="${c.seed}" min="1" step="1"><button type="button" class="sp-ghost" data-dice="1" aria-label="Llavor a l’atzar">${I.dice}</button></div>
      </div>
      ${select('cutoff', 'Si s’arriba al límit de jugades', [['draw', 'Compta com a taules'], ['discard', 'Descarta la partida']], c.cutoff)}
      <button type="button" class="sp-toggle" data-t="stopOnMate" data-on="${c.stopOnMate}">Atura en mat o ofegat</button>
      <button type="button" class="sp-toggle" data-t="dedupe" data-on="${c.dedupe}">Descarta partides repetides</button>
    </div>

    <aside class="sp-read">
      <h3>Resultats de la tanda</h3>
      <div class="sp-chart">
        ${bar('Blanques', st.results.w, total, 'w')}
        ${bar('Taules', st.results.d, total, 'd')}
        ${bar('Negres', st.results.b, total, 'b')}
      </div>
      <dl class="sp-dl">
        <div><dt>Incorporades</dt><dd data-tone="leaf">${st.ingested}</dd></div>
        <div><dt>Duplicades</dt><dd data-tone="cool">${st.duplicates}</dd></div>
        <div><dt>Altres descartades</dt><dd data-tone="cool">${st.skipped - st.duplicates}</dd></div>
        <div><dt>Temps</dt><dd>${(st.elapsed / 1000).toFixed(1)} s</dd></div>
        <div><dt>Cobertura</dt><dd data-tone="sky">${X.query().coverage}%</dd></div>
      </dl>
      ${st.errors.length ? `<div class="sp-errors"><b>${st.errors.length} avisos del motor</b><ul>${st.errors.map(e => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      <p class="sp-note">La política aleatòria és el punt de partida honest per a un joc sense teoria: no imposa cap prejudici i deixa que els resultats decideixin quines obertures sobreviuen. La materialista ja captura i defensa; la del motor fa servir la cerca real del joc.</p>
      <p class="sp-note">Mateixa llavor i mateixos paràmetres reproduiran exactament la mateixa tanda. Canvia la llavor per explorarterritori nou.</p>
    </aside>`;
}

function bar(labelTxt, n, total, tone) {
  const p = Math.round(n / total * 100);
  return `<div class="sp-b" data-tone="${tone}">
    <div class="sp-b-l"><span>${esc(labelTxt)}</span><b>${n}</b></div>
    <div class="sp-b-track"><i style="--w:${p}%"></i></div>
    <em>${p}%</em>
  </div>`;
}

function slider(k, l, v, min, max, step) {
  return `<div class="sp-slider"><span>${esc(l)}<b>${step < 1 ? Number(v).toFixed(2) : v}</b></span>
    <input type="range" data-c="${k}" min="${min}" max="${max}" step="${step}" value="${v}"></div>`;
}
function select(k, l, opts, v) {
  const cur = opts.find(([a]) => String(a) === String(v)) || opts[0];
  const isOpen = openDrop === k;
  return `<div class="sp-sel">
    <span>${esc(l)}</span>
    <button type="button" class="sp-sel-trigger" data-drop="${esc(k)}" aria-haspopup="listbox" aria-expanded="${isOpen}">
      <span class="sp-sel-value">${esc(cur ? cur[1] : '')}</span>
      <i class="sp-sel-arrow" aria-hidden="true"></i>
    </button>
    <div class="sp-sel-options${isOpen ? ' open' : ''}" role="listbox" style="display:${isOpen ? 'flex' : 'none'}">
      ${opts.map(([a, b]) => `<button type="button" role="option" class="sp-sel-option${String(a) === String(v) ? ' is-active' : ''}" data-drop="${esc(k)}" data-value="${esc(a)}" aria-selected="${String(a) === String(v)}">${esc(b)}</button>`).join('')}
    </div>
  </div>`;
}

function onDropSheetClick(e) {
  const trig = e.target.closest('.sp-sel-trigger');
  if (trig) {
    e.preventDefault(); e.stopPropagation();
    const k = trig.dataset.drop;
    openDrop = openDrop === k ? null : k;
    render();
    return;
  }
  const opt = e.target.closest('.sp-sel-option');
  if (opt) {
    e.preventDefault(); e.stopPropagation();
    const k = opt.dataset.drop;
    const raw = opt.dataset.value;
    openDrop = null;
    P.setConfig({ [k]: k === 'level' ? Number(raw) : raw });
    return;
  }
}

function onDropDocClick(e) {
  if (!openDrop) return;
  if (e.target.closest('.sp-sel')) return;
  openDrop = null;
  render();
}

function feedView(st) {
  if (!st.feed.length) return `<div class="sp-empty"><b>Encara no s’ha generat cap partida.</b><span>Connecta el motor i engega una tanda. Cada partida acabada apareixerà aquí i s’incorporarà a la biblioteca al moment.</span></div>`;
  return `<div class="sp-feed">
    <div class="sp-feed-head"><b>${st.feed.length} partides recents</b>
      <button type="button" class="sp-ghost" data-clearfeed="1">${I.trash}<span>Neteja la llista</span></button></div>
    ${st.feed.map(f => `<article class="sp-game">
      <span class="sp-res" data-s="${f.result}">${f.result === 'w' ? '1-0' : f.result === 'b' ? '0-1' : '½-½'}</span>
      <div class="sp-game-b"><b>${esc(f.label)}</b>
        <span>${f.plies} mitges jugades${f.mate ? ' · mat' : ''}</span>
        <code>${esc(f.opening)}${f.plies > 4 ? ' …' : ''}</code></div>
      <button type="button" class="sp-mini" data-copygame="${esc(f.id)}" aria-label="Copia la notació">${I.copy}</button>
    </article>`).join('')}
  </div>`;
}

function diagView(ad) {
  const found = Object.entries(ad.found || {});
  return `<div class="sp-diag">
    <div class="sp-diag-top" data-ok="${ad.ok}">
      <b>${ad.ok ? 'El motor respon correctament' : 'El motor no està connectat'}</b>
      <span>${esc(ad.detail || '')}</span>
      <div class="sp-diag-act">
        <button type="button" class="sp-solid" data-probe="1">${I.plug}<span>Torna a detectar</span></button>
        <button type="button" class="sp-ghost" data-wiring="1">${showWiring ? 'Amaga la plantilla' : 'Mostra la plantilla de connexió'}</button>
        ${ad.ok ? '<button type="button" class="sp-ghost" data-disc="1">Desconnecta</button>' : ''}
      </div>
    </div>

    ${found.length ? `<div class="sp-found"><b>Funcions trobades</b>
      ${found.map(([src, list]) => `<div><code>${esc(src)}</code><ul>${list.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`).join('')}
    </div>` : ''}

    ${ad.tried?.length ? `<div class="sp-tried"><b>Proves fetes</b><ul>${ad.tried.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}

    ${ad.missing?.length ? `<div class="sp-missing"><b>Falta per connectar</b>
      <p>El generador necessita quatre funcions del motor: <code>initial</code> (estat de sortida), <code>legal</code> (jugades legals), <code>apply</code> (aplicar-ne una) i <code>status</code> (si la partida ha acabat i qui guanya). Les opcionals <code>score</code> i <code>choose</code> milloren la qualitat de les partides.</p>
      <ul>${ad.missing.map(m => `<li>${esc(m)}</li>`).join('')}</ul></div>` : ''}

    ${showWiring ? `<div class="sp-wire">
      <div><b>Plantilla de connexió</b><button type="button" class="sp-mini" data-copywire="1" aria-label="Copia">${I.copy}</button></div>
      <textarea readonly spellcheck="false" id="sp-wire-ta">${esc(A.wiringTemplate())}</textarea>
      <p>Desa-ho com a <code>src/engine/ecitWire.js</code>, ajusta la ruta i els noms al teu motor, i importa’l des de <code>src/main.js</code>. El generador es connectarà sol en carregar la pàgina.</p>
    </div>` : ''}
  </div>`;
}

function wire() {
  sheet.querySelector('[data-close]').addEventListener('click', () => setOpen(false));
  sheet.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));

  sheet.querySelectorAll('[data-c]').forEach(el => {
    const key = el.dataset.c;
    if (el.type === 'range') {
      el.addEventListener('input', () => {
        const b = el.closest('.sp-slider')?.querySelector('b');
        if (b) b.textContent = Number(el.step) < 1 ? Number(el.value).toFixed(2) : el.value;
      });
      el.addEventListener('change', () => {
        P.setConfig({ [key]: Number(el.value) });
      });
    } else {
      el.addEventListener('change', () => {
        const v = el.type === 'number' ? Number(el.value) : el.value;
        P.setConfig({ [key]: key === 'level' ? Number(v) : v });
      });
    }
  });
  sheet.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => P.setConfig({ [b.dataset.t]: b.dataset.on !== 'true' })));
  sheet.querySelector('[data-dice]')?.addEventListener('click', () => P.randomizeSeed());
  sheet.querySelector('[data-reset]')?.addEventListener('click', () => { P.resetConfig(); msg = ''; });

  sheet.querySelector('[data-start]')?.addEventListener('click', async () => {
    msg = ''; tab = 'control'; render();
    const r = await P.start();
    if (!r.ok) { msg = r.message; render(); }
  });
  sheet.querySelector('[data-stop]')?.addEventListener('click', () => P.cancel());
  sheet.querySelector('[data-export]')?.addEventListener('click', () => {
    const text = P.exportNotation();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = 'ecit-autopartides.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  });
  sheet.querySelector('[data-save-export]')?.addEventListener('click', exportLibrary);
  sheet.querySelector('[data-clearfeed]')?.addEventListener('click', () => P.clearFeed());
  sheet.querySelectorAll('[data-copygame]').forEach(b => b.addEventListener('click', () => {
    const f = P.state().feed.find(x => x.id === b.dataset.copygame);
    if (f) navigator.clipboard?.writeText(f.text).catch(() => { /* sense permís */ });
  }));

  sheet.querySelector('[data-probe]')?.addEventListener('click', () => { const r = A.autoDetect(); msg = r.ok ? '' : r.detail; render(); });
  sheet.querySelector('[data-wiring]')?.addEventListener('click', () => { showWiring = !showWiring; render(); });
  sheet.querySelector('[data-disc]')?.addEventListener('click', () => A.disconnect());
  sheet.querySelector('[data-copywire]')?.addEventListener('click', () => {
    navigator.clipboard?.writeText(A.wiringTemplate()).catch(() => { /* sense permís */ });
  });
}

function exportLibrary() {
  const text = X.exportText();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = 'ecit-experience.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();