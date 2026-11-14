/* Easy LUT — criado por Allan */
(function () {
  'use strict';
  const cs = window.__adobe_cep__;
  const fs = require('fs');
  const path = require('path');
  const os = require('os');

  const $ = (id) => document.getElementById(id);
  const els = {
    grid: $('grid'), folderPath: $('folderPath'), search: $('search'), cat: $('cat'),
    status: $('status'), selName: $('selName'),
    seqName: $('seqName'), intensity: $('intensity'), intVal: $('intVal'),
    thumbSize: $('thumbSize'), sizeVal: $('sizeVal'),
    tabAll: $('tabAll'), tabFav: $('tabFav'), tabCol: $('tabCol'), favCount: $('favCount'), allCount: $('allCount'), colCount: $('colCount'),
    colBar: $('colBar'), colSel: $('colSel'), colFolderPath: $('colFolderPath'), btnColFolderClear: $('btnColFolderClear'),
    modal: $('modal'), mTitle: $('mTitle'), mMsg: $('mMsg'), mInput: $('mInput'), mErr: $('mErr'), mOk: $('mOk'), mCancel: $('mCancel'),
    cmp: $('cmp'), cmpWrap: $('cmpWrap'), cvBefore: $('cvBefore'), cvAfter: $('cvAfter'),
    divider: $('divider'), chipBefore: $('chipBefore'), chipAfter: $('chipAfter'), clickMode: $('clickMode')
  };

  let luts = [];            // {name, cat, file}
  let selected = null;
  let tab = 'all';          // 'all' | 'fav' | 'col'

  /* ---------- favoritos (guardados por caminho do arquivo, valem para qualquer pasta) ---------- */
  function loadFavs() {
    try {
      const a = JSON.parse(localStorage.getItem('easyFavs') || '[]');
      return Array.isArray(a) ? a.filter((f) => f && f.file) : [];
    } catch (e) { return []; }
  }
  let favs = loadFavs();
  const starSvg = (on) => '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.7l-5.9 3.1 1.2-6.5L2.5 9.7l6.6-.9z" fill="' + (on ? 'currentColor' : 'none') + '" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  const favKey = (f) => String(f).replace(/\\/g, '/').toLowerCase();
  const isFav = (file) => favs.some((f) => favKey(f.file) === favKey(file));
  function toggleFav(l) {
    if (isFav(l.file)) favs = favs.filter((f) => favKey(f.file) !== favKey(l.file));
    else favs.push({ file: l.file, name: l.name, cat: l.cat || '' });
    try { localStorage.setItem('easyFavs', JSON.stringify(favs)); } catch (e) { /* ok */ }
    updateCounts();
  }
  function updateCounts() {
    els.favCount.textContent = favs.length;
    els.allCount.textContent = luts.length;
    els.colCount.textContent = cols.length;
  }
  const TW = 320, TH = 180;   // resolução das miniaturas (nítidas até o tamanho máximo do slider)
  let baseThumb = null;     // canvas 16:9 do frame (miniaturas)
  let baseFull = null;      // frame inteiro (preview antes/depois)
  let gradedFull = null, gradedKey = '';
  let activeFile = null;    // LUT que está aplicada no clipe agora
  let frameId = 0;
  const thumbCache = new Map();
  const lutCache = new Map();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- ponte com o ExtendScript ---------- */
  function jsx(fn, ...args) {
    return new Promise((resolve) => {
      const code = fn + '(' + args.map((a) => JSON.stringify(a)).join(',') + ')';
      cs.evalScript(code, (r) => {
        try { resolve(JSON.parse(r)); }
        catch (e) { resolve({ ok: false, err: 'Resposta inválida do Premiere: ' + r }); }
      });
    });
  }
  function setStatus(msg, isErr) {
    els.status.textContent = msg || '';
    els.status.className = isErr ? 'err' : '';
  }
  /* ---------- parser .cube + aplicação 3D (trilinear) ---------- */
  function parseCube(txt) {
    let size = 0, dmin = [0, 0, 0], dmax = [1, 1, 1];
    const vals = [];
    for (const raw of txt.split(/\r?\n/)) {
      const l = raw.trim();
      if (!l || l[0] === '#') continue;
      const c = l.charCodeAt(0);
      if ((c >= 48 && c <= 57) || c === 45 || c === 43 || c === 46) {
        const p = l.split(/\s+/);
        if (p.length >= 3) vals.push(+p[0], +p[1], +p[2]);
      } else if (l.startsWith('LUT_3D_SIZE')) size = parseInt(l.split(/\s+/)[1], 10);
      else if (l.startsWith('DOMAIN_MIN')) dmin = l.split(/\s+/).slice(1, 4).map(Number);
      else if (l.startsWith('DOMAIN_MAX')) dmax = l.split(/\s+/).slice(1, 4).map(Number);
      else if (l.startsWith('LUT_1D_SIZE')) throw new Error('LUT 1D sem preview');
    }
    if (!size || vals.length !== size * size * size * 3) throw new Error('.cube inválido');
    return { size, dmin, dmax, data: Float32Array.from(vals) };
  }

  function getLut(file) {
    if (lutCache.has(file)) {
      const v = lutCache.get(file); lutCache.delete(file); lutCache.set(file, v); return v;
    }
    const lut = parseCube(fs.readFileSync(file, 'utf8'));
    lutCache.set(file, lut);
    if (lutCache.size > 12) lutCache.delete(lutCache.keys().next().value);
    return lut;
  }

  function renderWithLut(src, lut, dst) {
    const w = src.width, h = src.height;
    dst.width = w; dst.height = h;
    const img = src.getContext('2d').getImageData(0, 0, w, h);
    const d = img.data, N = lut.size, n1 = N - 1, t = lut.data;
    const mn = lut.dmin, rg = [lut.dmax[0] - mn[0], lut.dmax[1] - mn[1], lut.dmax[2] - mn[2]];
    const N2 = N * N;
    for (let i = 0; i < d.length; i += 4) {
      let r = ((d[i] / 255 - mn[0]) / rg[0]) * n1;
      let g = ((d[i + 1] / 255 - mn[1]) / rg[1]) * n1;
      let b = ((d[i + 2] / 255 - mn[2]) / rg[2]) * n1;
      r = r < 0 ? 0 : r > n1 ? n1 : r;
      g = g < 0 ? 0 : g > n1 ? n1 : g;
      b = b < 0 ? 0 : b > n1 ? n1 : b;
      const r0 = r | 0, g0 = g | 0, b0 = b | 0;
      const r1 = r0 < n1 ? r0 + 1 : n1, g1 = g0 < n1 ? g0 + 1 : n1, b1 = b0 < n1 ? b0 + 1 : n1;
      const fr = r - r0, fg = g - g0, fb = b - b0;
      const i000 = (r0 + g0 * N + b0 * N2) * 3, i100 = (r1 + g0 * N + b0 * N2) * 3;
      const i010 = (r0 + g1 * N + b0 * N2) * 3, i110 = (r1 + g1 * N + b0 * N2) * 3;
      const i001 = (r0 + g0 * N + b1 * N2) * 3, i101 = (r1 + g0 * N + b1 * N2) * 3;
      const i011 = (r0 + g1 * N + b1 * N2) * 3, i111 = (r1 + g1 * N + b1 * N2) * 3;
      for (let k = 0; k < 3; k++) {
        const c00 = t[i000 + k] + (t[i100 + k] - t[i000 + k]) * fr;
        const c10 = t[i010 + k] + (t[i110 + k] - t[i010 + k]) * fr;
        const c01 = t[i001 + k] + (t[i101 + k] - t[i001 + k]) * fr;
        const c11 = t[i011 + k] + (t[i111 + k] - t[i011 + k]) * fr;
        const c0 = c00 + (c10 - c00) * fg;
        const c1 = c01 + (c11 - c01) * fg;
        const v = (c0 + (c1 - c0) * fb) * 255;
        d[i + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
    dst.getContext('2d').putImageData(img, 0, 0);
  }

  /* ---------- fila de miniaturas (não trava a UI) ---------- */
  const queue = []; let running = false;
  function enqueue(job) { queue.push(job); if (!running) run(); }
  function run() {
    running = true;
    const job = queue.shift();
    if (!job) { running = false; return; }
    try { job(); } catch (e) { /* LUT ruim: ignora */ }
    setTimeout(run, 0);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      observer.unobserve(en.target);
      drawThumb(en.target);
    });
  }, { root: els.grid, rootMargin: '200px' });

  function drawThumb(card) {
    const lut = card._lut;
    const cv = card.querySelector('canvas');
    const fid = frameId;
    enqueue(() => {
      if (!baseThumb || fid !== frameId) return;
      const key = lut.file + '|' + frameId;
      let out = thumbCache.get(key);
      if (!out) {
        out = document.createElement('canvas');
        try {
          renderWithLut(baseThumb, getLut(lut.file), out);
        } catch (e) {
          out.width = baseThumb.width; out.height = baseThumb.height;
          const x = out.getContext('2d');
          x.drawImage(baseThumb, 0, 0);
          x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, 0, out.width, out.height);
          x.fillStyle = '#e88'; x.font = '12px sans-serif'; x.textAlign = 'center';
          x.fillText('sem preview', out.width / 2, out.height / 2);
        }
        thumbCache.set(key, out);
        if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value);
      }
      cv.width = out.width; cv.height = out.height;
      cv.getContext('2d').drawImage(out, 0, 0);
    });
  }

  /* ---------- tamanho das miniaturas ---------- */
  const THUMB_MIN = 130, THUMB_MAX = 320, THUMB_DEF = 140;
  const SCROLL_W = 10, GRID_PAD = 4;      // iguais ao CSS (barra de rolagem e padding da grade)
  let thumbSize = (function () {
    try {
      const n = +localStorage.getItem('easyThumbSize');
      return n >= THUMB_MIN && n <= THUMB_MAX ? n : THUMB_DEF;
    } catch (e) { return THUMB_DEF; }
  })();
  function applyThumbSize() {
    // nunca maior que a largura útil do painel: em painel estreito vira 1 coluna, sem estourar
    const avail = Math.max(60, els.grid.offsetWidth - SCROLL_W - GRID_PAD);
    els.grid.style.setProperty('--thumb', Math.min(thumbSize, avail) + 'px');
    els.thumbSize.value = thumbSize;
    els.sizeVal.textContent = thumbSize + ' px';
  }

  /* ---------- seletor moderno (no lugar do <select> nativo do Windows) ---------- */
  // O <select> original continua existindo (escondido) e guarda valor/opções/evento "change";
  // o componente só desenha o botão e a lista no estilo da aplicação.
  let ddPop = null, ddOwner = null;
  function closeDD(focusBtn) {
    if (!ddPop) return;
    const o = ddOwner;
    ddPop.remove(); ddPop = null; ddOwner = null;
    document.removeEventListener('mousedown', onDDDown, true);
    document.removeEventListener('keydown', onDDKey, true);
    window.removeEventListener('scroll', onDDScroll, true);
    o.wrap.classList.remove('open');
    o.btn.setAttribute('aria-expanded', 'false');
    if (focusBtn) o.btn.focus();
  }
  function onDDDown(e) { if (ddPop && !ddPop.contains(e.target) && !ddOwner.wrap.contains(e.target)) closeDD(false); }
  function onDDScroll(e) { if (ddPop && !ddPop.contains(e.target)) closeDD(false); }
  function onDDKey(e) {
    if (!ddPop) return;
    if (e.key === 'Escape') { e.preventDefault(); closeDD(true); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [].slice.call(ddPop.querySelectorAll('.ddi'));
      if (!items.length) return;
      let i = items.indexOf(document.activeElement);
      i = e.key === 'ArrowDown' ? (i + 1) % items.length : (i <= 0 ? items.length - 1 : i - 1);
      items[i].focus();
    }
  }
  function enhanceSelect(sel, opt) {
    const placeholder = (opt && opt.placeholder) || '';
    sel.classList.add('dd-native');
    const wrap = document.createElement('div');
    wrap.className = 'dd';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dd-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="dd-label"></span><svg class="dd-caret" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
    const label = btn.querySelector('.dd-label');
    wrap.appendChild(btn);
    sel.parentNode.insertBefore(wrap, sel);
    const o = { sel: sel, wrap: wrap, btn: btn };
    const opts = () => { const a = []; for (let i = 0; i < sel.options.length; i++) a.push(sel.options[i]); return a; };
    o.sync = () => {
      const cur = opts().find((x) => x.value === sel.value);
      label.textContent = cur ? cur.textContent : placeholder;
      label.classList.toggle('ph', !cur);
      btn.title = label.textContent;
      btn.disabled = !!sel.disabled || !opts().length;
    };
    o.show = (on) => { wrap.style.display = on ? '' : 'none'; };
    btn.addEventListener('click', () => {
      closeMenu();
      if (ddPop && ddOwner === o) { closeDD(false); return; }
      closeDD(false);
      const pop = document.createElement('div');
      pop.className = 'ddlist';
      pop.setAttribute('role', 'listbox');
      opts().forEach((x) => {
        const on = x.value === sel.value;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ddi' + (on ? ' on' : '');
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.innerHTML = '<span class="ck">' + (on ? CHECK_SVG : '') + '</span><span class="mn"></span>';
        b.querySelector('.mn').textContent = x.textContent;
        b.title = x.textContent;
        b.onclick = () => {
          closeDD(true);
          if (sel.value !== x.value) { sel.value = x.value; sel.dispatchEvent(new Event('change')); }
          o.sync();
        };
        pop.appendChild(b);
      });
      document.body.appendChild(pop);
      ddPop = pop; ddOwner = o;
      wrap.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
      const r = btn.getBoundingClientRect();
      const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
      pop.style.minWidth = r.width + 'px';
      pop.style.maxWidth = Math.max(120, vw - 12) + 'px';
      pop.style.maxHeight = '240px';
      let ph = pop.offsetHeight;
      const below = vh - r.bottom - 10, above = r.top - 10;
      const down = ph <= below || below >= above;
      pop.style.maxHeight = Math.min(240, Math.max(80, down ? below : above)) + 'px';
      ph = pop.offsetHeight;
      const pw = pop.offsetWidth;
      pop.style.left = Math.min(Math.max(6, r.left), Math.max(6, vw - pw - 6)) + 'px';
      pop.style.top = Math.max(6, down ? r.bottom + 4 : r.top - ph - 4) + 'px';
      document.addEventListener('mousedown', onDDDown, true);
      document.addEventListener('keydown', onDDKey, true);
      window.addEventListener('scroll', onDDScroll, true);
      const cur = pop.querySelector('.ddi.on') || pop.querySelector('.ddi');
      if (cur) cur.focus();
    });
    o.sync();
    return o;
  }
  const catDD = enhanceSelect(els.cat, { placeholder: 'Todas' });
  const colDD = enhanceSelect(els.colSel, { placeholder: 'Nenhuma coleção' });

  /* ---------- coleções ---------- */
  // coleção = { id, name, folder (pasta própria, opcional), files: [{file,name,cat}] (LUTs adicionadas à mão) }
  function loadCols() {
    try {
      const a = JSON.parse(localStorage.getItem('easyCollections') || '[]');
      return Array.isArray(a) ? a.filter((c) => c && c.id && c.name).map((c) => ({
        id: String(c.id), name: String(c.name), folder: c.folder ? String(c.folder) : '',
        files: Array.isArray(c.files) ? c.files.filter((f) => f && f.file) : []
      })) : [];
    } catch (e) { return []; }
  }
  let cols = loadCols();
  let curColId = '';
  try { curColId = localStorage.getItem('easyCurCol') || ''; } catch (e) { /* ok */ }
  const colFolderCache = {};      // id -> LUTs encontradas na pasta da coleção
  const colFolderMissing = {};    // id -> true se a pasta salva não existe mais
  const catByTab = { all: 'Todas', col: 'Todas' };
  const uid = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const curCol = () => cols.find((c) => c.id === curColId) || null;
  function saveCols() {
    try { localStorage.setItem('easyCollections', JSON.stringify(cols)); } catch (e) { /* ok */ }
  }
  function scanCol(c) {
    let ok = false;
    try { ok = !!c.folder && fs.existsSync(c.folder); } catch (e) { ok = false; }
    colFolderMissing[c.id] = !!c.folder && !ok;
    colFolderCache[c.id] = ok ? scan(c.folder) : [];
  }
  function colFolderItems(c) {
    if (!(c.id in colFolderCache)) scanCol(c);
    return colFolderCache[c.id];
  }
  function colItems(c) {
    const out = colFolderItems(c).slice();
    const seen = new Set(out.map((l) => favKey(l.file)));
    c.files.forEach((f) => { if (!seen.has(favKey(f.file))) { seen.add(favKey(f.file)); out.push(f); } });
    return out.sort((a, b) => String(a.cat || '').localeCompare(String(b.cat || '')) || a.name.localeCompare(b.name));
  }
  const inColFolder = (c, file) => colFolderItems(c).some((l) => favKey(l.file) === favKey(file));
  const inColManual = (c, file) => c.files.some((f) => favKey(f.file) === favKey(file));
  function toggleInCol(c, l) {
    if (inColManual(c, l.file)) {
      c.files = c.files.filter((f) => favKey(f.file) !== favKey(l.file));
      saveCols();
      return false;
    }
    c.files.push({ file: l.file, name: l.name, cat: l.cat || '' });
    saveCols();
    return true;
  }
  function nameError(name, selfId) {
    if (!name) return 'Digite um nome.';
    if (cols.some((c) => c.id !== selfId && c.name.toLowerCase() === name.toLowerCase())) return 'Já existe uma coleção com esse nome.';
    return '';
  }
  function createCol(name) {
    const c = { id: uid(), name: name, folder: '', files: [] };
    cols.push(c);
    curColId = c.id;
    saveCols();
    return c;
  }
  function refreshColUi() {
    if (!cols.some((c) => c.id === curColId)) curColId = cols.length ? cols[0].id : '';
    els.colSel.innerHTML = '';
    cols.forEach((c) => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; els.colSel.appendChild(o); });
    els.colSel.value = curColId;
    els.colSel.disabled = !cols.length;
    colDD.sync();
    const c = curCol();
    if (c && tab === 'col') colFolderItems(c);
    els.colFolderPath.className = '';
    if (!c) els.colFolderPath.textContent = 'Crie uma coleção para começar.';
    else if (!c.folder) els.colFolderPath.textContent = 'Nenhuma pasta carregada nesta coleção.';
    else if (colFolderMissing[c.id]) { els.colFolderPath.textContent = c.folder + ' (pasta não encontrada)'; els.colFolderPath.className = 'err'; }
    else els.colFolderPath.textContent = c.folder;
    ['btnColFolder', 'btnColRename', 'btnColDelete'].forEach((id) => { $(id).disabled = !c; });
    els.btnColFolderClear.style.display = c && c.folder ? '' : 'none';
    els.colCount.textContent = cols.length;
    try { localStorage.setItem('easyCurCol', curColId); } catch (e) { /* ok */ }
  }

  /* ---------- janela de nome / confirmação (prompt() não funciona em painéis CEP) ---------- */
  function openModal(o) {
    return new Promise((resolve) => {
      els.mTitle.textContent = o.title || '';
      els.mMsg.textContent = o.msg || '';
      els.mMsg.style.display = o.msg ? '' : 'none';
      els.mInput.style.display = o.input ? '' : 'none';
      els.mInput.value = o.initial || '';
      els.mErr.textContent = '';
      els.mOk.textContent = o.okText || 'OK';
      els.modal.classList.add('on');
      function cleanup() {
        els.modal.classList.remove('on');
        els.mOk.onclick = null; els.mCancel.onclick = null; els.modal.onclick = null;
        document.removeEventListener('keydown', onKey, true);
      }
      function finish(v) { cleanup(); resolve(v); }
      function ok() {
        if (!o.input) { finish(true); return; }
        const v = els.mInput.value.trim();
        const err = o.validate ? o.validate(v) : '';
        if (err) { els.mErr.textContent = err; return; }
        finish(v);
      }
      function cancel() { finish(o.input ? null : false); }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        else if (e.key === 'Enter' && e.target !== els.mCancel) { e.preventDefault(); ok(); }
      }
      els.mOk.onclick = ok;
      els.mCancel.onclick = cancel;
      els.modal.onclick = (e) => { if (e.target === els.modal) cancel(); };
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => { if (o.input) { els.mInput.focus(); els.mInput.select(); } else els.mOk.focus(); }, 0);
    });
  }
  const askName = (title, initial, okText, selfId) =>
    openModal({ title: title, input: true, initial: initial, okText: okText, validate: (v) => nameError(v, selfId) });
  const askConfirm = (title, msg, okText) => openModal({ title: title, msg: msg, okText: okText });

  /* ---------- menu do botão + (adicionar a uma coleção) ---------- */
  const CHECK_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.2 6.4l2.5 2.5 5-5.4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>';
  const PLUS_SVG = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5v9M1.5 6h9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
  let menuEl = null, menuBtn = null;
  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null; menuBtn = null;
    document.removeEventListener('mousedown', onMenuDown, true);
    document.removeEventListener('keydown', onMenuKey, true);
  }
  function onMenuDown(e) { if (menuEl && !menuEl.contains(e.target) && !(menuBtn && menuBtn.contains(e.target))) closeMenu(); }
  function onMenuKey(e) { if (e.key === 'Escape') closeMenu(); }
  function afterColChange() {
    refreshColUi();
    if (tab === 'col') { applyTabUi(); renderGrid(); }
  }
  async function newColWith(l) {
    const name = await askName('Nova coleção', '', 'Criar', null);
    if (!name) return;
    const c = createCol(name);
    toggleInCol(c, l);
    afterColChange();
    setStatus('Coleção “' + c.name + '” criada com “' + l.name + '”.');
  }
  function openColMenu(btn, l) {
    if (menuEl && menuBtn === btn) { closeMenu(); return; }
    closeMenu();
    closeDD(false);
    const m = document.createElement('div');
    m.id = 'colMenu';
    m.innerHTML = '<div class="mh">Adicionar a uma coleção</div><div class="ml"></div><div class="sep"></div>';
    const list = m.querySelector('.ml');
    if (!cols.length) { const n = document.createElement('div'); n.className = 'none'; n.textContent = 'Nenhuma coleção ainda'; list.appendChild(n); }
    cols.forEach((c) => {
      const inF = inColFolder(c, l.file), inM = inColManual(c, l.file);
      const b = document.createElement('button');
      b.className = 'mi';
      b.innerHTML = '<span class="ck">' + (inF || inM ? CHECK_SVG : '') + '</span><span class="mn"></span>' + (inF ? '<span class="mt">na pasta</span>' : '');
      b.querySelector('.mn').textContent = c.name;
      if (inF) { b.disabled = true; b.title = 'Esta LUT já vem da pasta carregada nesta coleção'; }
      else {
        b.title = inM ? 'Remover desta coleção' : 'Adicionar a esta coleção';
        b.onclick = () => {
          const added = toggleInCol(c, l);
          closeMenu();
          setStatus((added ? 'Adicionada a “' : 'Removida de “') + c.name + '”.');
          if (tab === 'col' && c.id === curColId) { applyTabUi(); renderGrid(); }
        };
      }
      list.appendChild(b);
    });
    const nb = document.createElement('button');
    nb.className = 'mi new';
    nb.innerHTML = '<span class="ck">' + PLUS_SVG + '</span><span class="mn">Nova coleção…</span>';
    nb.onclick = () => { closeMenu(); newColWith(l); };
    m.appendChild(nb);
    document.body.appendChild(m);
    menuEl = m; menuBtn = btn;
    const r = btn.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
    const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
    let left = Math.min(Math.max(6, r.right - mw), Math.max(6, vw - mw - 6));
    let top = r.bottom + 4;
    if (top + mh > vh - 6) top = Math.max(6, r.top - mh - 4);
    m.style.left = left + 'px'; m.style.top = top + 'px';
    document.addEventListener('mousedown', onMenuDown, true);
    document.addEventListener('keydown', onMenuKey, true);
  }

  /* ---------- lista / grade ---------- */
  function scan(dir) {
    const found = [];
    (function walk(d) {
      let items = [];
      try { items = fs.readdirSync(d, { withFileTypes: true }); } catch (e) { return; }
      for (const it of items) {
        const full = path.join(d, it.name);
        if (it.isDirectory()) walk(full);
        else if (/\.cube$/i.test(it.name)) {
          const rel = path.relative(dir, d);
          found.push({ name: it.name.replace(/\.cube$/i, ''), cat: rel || 'Raiz', file: full });
        }
      }
    })(dir);
    return found.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));
  }

  function loadFolder(dir) {
    localStorage.setItem('lutFolder', dir);
    els.folderPath.textContent = dir;
    luts = scan(dir);
    selected = null;
    els.selName.textContent = 'Selecione uma LUT';
    catByTab.all = 'Todas';
    updateCounts();
    applyTabUi();
    setStatus(luts.length ? '' : 'Nenhum arquivo .cube encontrado nessa pasta', !luts.length);
    renderGrid();
  }

  // categorias (subpastas) da lista que está na tela; lembra a escolha de cada aba
  function refreshCats() {
    let list = [];
    if (tab === 'all') list = luts;
    else if (tab === 'col') { const c = curCol(); list = c ? colItems(c) : []; }
    const cats = ['Todas', ...Array.from(new Set(list.map((l) => l.cat || 'Raiz')))];
    els.cat.innerHTML = '';
    cats.forEach((c) => { const o = document.createElement('option'); o.value = c; o.textContent = c; els.cat.appendChild(o); });
    const want = catByTab[tab] || 'Todas';
    els.cat.value = cats.indexOf(want) >= 0 ? want : 'Todas';
    catDD.sync();
  }

  function applyTabUi() {
    [['all', els.tabAll], ['fav', els.tabFav], ['col', els.tabCol]].forEach((p) => {
      p[1].classList.toggle('on', tab === p[0]);
      p[1].setAttribute('aria-selected', tab === p[0]);
    });
    els.colBar.style.display = tab === 'col' ? 'flex' : 'none';
    refreshCats();
    catDD.show(tab !== 'fav' && els.cat.options.length > 2);
  }

  function renderGrid() {
    queue.length = 0;
    els.grid.innerHTML = '';
    const q = els.search.value.trim().toLowerCase();
    const cat = els.cat.value || 'Todas';
    const cc = tab === 'col' ? curCol() : null;
    const source = tab === 'fav' ? favs : (tab === 'col' ? (cc ? colItems(cc) : []) : luts);
    const frag = document.createDocumentFragment();
    let shown = 0;
    source.forEach((l) => {
      if (tab !== 'fav' && cat !== 'Todas' && (l.cat || 'Raiz') !== cat) return;
      if (q && l.name.toLowerCase().indexOf(q) < 0) return;
      shown++;
      const fav = isFav(l.file);
      let missing = false;
      if (tab === 'fav' || tab === 'col') { try { missing = !fs.existsSync(l.file); } catch (e) { missing = true; } }
      const card = document.createElement('div');
      card.className = 'card' + (selected && favKey(selected.file) === favKey(l.file) ? ' sel' : '') + (isActive(l.file) ? ' active' : '') + (missing ? ' missing' : '');
      card._lut = l;
      card.innerHTML = '<div class="thumb"><canvas width="' + TW + '" height="' + TH + '"></canvas>' +
        '<button class="fav' + (fav ? ' on' : '') + '" aria-label="Favoritar">' + starSvg(fav) + '</button></div>' +
        '<div class="cap"><span class="name"></span><button class="colbtn" title="Adicionar a uma coleção" aria-label="Adicionar a uma coleção">' + PLUS_SVG + '</button><button class="add" title="Aplicar no clipe" aria-label="Aplicar no clipe">' + CHECK_SVG + '</button></div>';
      card.querySelector('.name').textContent = l.name;
      card.title = missing ? 'Arquivo não encontrado: ' + l.file : (l.cat ? l.cat + ' / ' : '') + l.name;
      if (isActive(l.file)) card.title = 'Aplicada no clipe — ' + card.title;
      card.querySelector('.fav').title = fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
      card.addEventListener('click', () => select(l, card));
      card.querySelector('.add').addEventListener('click', (ev) => { ev.stopPropagation(); select(l, card); applyToPremiere(); });
      card.querySelector('.colbtn').addEventListener('click', (ev) => { ev.stopPropagation(); openColMenu(ev.currentTarget, l); });
      card.querySelector('.fav').addEventListener('click', (ev) => {
        ev.stopPropagation();
        toggleFav(l);
        if (tab === 'fav') { renderGrid(); return; }       // some da aba Favoritos ao desfavoritar
        const b = ev.currentTarget, on = isFav(l.file);
        b.classList.toggle('on', on);
        b.innerHTML = starSvg(on);
        b.title = on ? 'Remover dos favoritos' : 'Adicionar aos favoritos';
      });
      frag.appendChild(card);
    });
    if (!shown) {
      const e = document.createElement('div');
      e.className = 'empty';
      if (tab === 'fav') e.textContent = favs.length ? 'Nenhum favorito com esse nome.' : 'Nenhum favorito ainda. Toque na estrela de uma LUT para guardá-la aqui.';
      else if (tab === 'col') {
        if (!cc) e.textContent = 'Nenhuma coleção ainda. Toque em “Nova” para criar a primeira.';
        else if (!colItems(cc).length) e.textContent = 'Esta coleção está vazia. Use o + de uma LUT ou carregue uma pasta.';
        else e.textContent = 'Nenhuma LUT com esse filtro.';
      } else e.textContent = luts.length ? 'Nenhuma LUT com esse filtro.' : 'Escolha uma pasta com arquivos .cube.';
      frag.appendChild(e);
    }
    els.grid.appendChild(frag);
    els.grid.querySelectorAll('.card').forEach((c) => observer.observe(c));
  }

  function setTab(t) {
    closeMenu();
    closeDD(false);
    tab = t;
    if (t === 'col') refreshColUi();
    applyTabUi();
    updateCounts();
    renderGrid();
  }

  function select(l, card) {
    selected = l;
    document.querySelectorAll('.card.sel').forEach((c) => c.classList.remove('sel'));
    if (card) card.classList.add('sel');
    els.selName.textContent = l.name;
    renderPreview();
  }

  /* ---------- LUT ativa no clipe ---------- */
  const isActive = (file) => !!activeFile && favKey(file) === favKey(activeFile);
  function updateActiveUi() {
    els.grid.querySelectorAll('.card').forEach((c) => {
      const on = isActive(c._lut.file);
      if (on !== c.classList.contains('active')) c.classList.toggle('active', on);
    });
  }
  function stagedMap() {
    try { return JSON.parse(localStorage.getItem('easyStaged') || '{}') || {}; } catch (e) { return {}; }
  }
  function rememberStaged(name, file) {
    if (!name) return;
    const m = stagedMap();
    m[String(name).toLowerCase()] = file;
    try { localStorage.setItem('easyStaged', JSON.stringify(m)); } catch (e) { /* ok */ }
  }
  let polling = false;
  async function pollState() {
    if (polling || applying) return;
    polling = true;
    try {
      const r = await jsx('getState');
      els.seqName.textContent = (r && r.name) || '—';
      let f = null;
      if (r && r.ok && r.path) {
        const base = String(r.path).replace(/[\\/]+$/, '').split(/[\\/]/).pop().toLowerCase();
        f = stagedMap()[base] || null;
      }
      if (f !== activeFile) { activeFile = f; updateActiveUi(); }
    } finally { polling = false; }
  }

  /* ---------- preview antes / depois ---------- */
  let cmpPos = 50, dragging = false;
  function setPos(p) {
    cmpPos = Math.max(0, Math.min(100, p));
    els.cvBefore.style.clipPath = 'inset(0 ' + (100 - cmpPos) + '% 0 0)';
    els.cvBefore.style.webkitClipPath = els.cvBefore.style.clipPath;
    els.divider.style.left = cmpPos + '%';
    const hold = els.clickMode.checked;
    if (hold) {
      els.chipBefore.style.display = cmpPos >= 50 ? '' : 'none';
      els.chipAfter.style.display = cmpPos >= 50 ? 'none' : '';
      els.chipAfter.className = 'chip left';
    } else {
      els.chipAfter.className = 'chip right';
      els.chipBefore.style.display = cmpPos < 14 ? 'none' : '';
      els.chipAfter.style.display = cmpPos > 86 ? 'none' : '';
    }
  }
  function renderPreview() {
    if (!baseFull) return;
    const w = baseFull.width, h = baseFull.height;
    [els.cvBefore, els.cvAfter].forEach((c) => { if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } });
    els.cvBefore.getContext('2d').drawImage(baseFull, 0, 0);
    const ctx = els.cvAfter.getContext('2d');
    ctx.globalAlpha = 1;
    ctx.drawImage(baseFull, 0, 0);
    if (selected) {
      try {
        const key = selected.file + '|' + frameId;
        if (gradedKey !== key) {
          gradedFull = document.createElement('canvas');
          renderWithLut(baseFull, getLut(selected.file), gradedFull);
          gradedKey = key;
        }
        ctx.globalAlpha = Math.min(1, +els.intensity.value / 100);   // a intensidade também vale no preview
        ctx.drawImage(gradedFull, 0, 0);
        ctx.globalAlpha = 1;
      } catch (e) { setStatus('Não consegui pré-visualizar essa LUT: ' + e.message, true); }
    }
    setPos(cmpPos);
  }
  function posFromEvent(e) {
    const r = els.cmp.getBoundingClientRect();
    return ((e.clientX - r.left) / r.width) * 100;
  }
  els.cmp.addEventListener('pointerdown', (e) => {
    dragging = true;
    try { els.cmp.setPointerCapture(e.pointerId); } catch (x) { /* ok */ }
    if (els.clickMode.checked) setPos(100);        // segurando: mostra o original
    else setPos(posFromEvent(e));
  });
  els.cmp.addEventListener('pointermove', (e) => {
    if (dragging && !els.clickMode.checked) setPos(posFromEvent(e));
  });
  ['pointerup', 'pointercancel'].forEach((ev) => els.cmp.addEventListener(ev, () => {
    dragging = false;
    if (els.clickMode.checked) setPos(0);           // soltou: volta para a LUT
  }));
  function applyClickMode() {
    const on = els.clickMode.checked;
    els.cmp.classList.toggle('hold', on);
    try { localStorage.setItem('easyClickMode', on ? '1' : '0'); } catch (e) { /* ok */ }
    setPos(on ? 0 : 50);
  }
  els.clickMode.addEventListener('change', applyClickMode);

  /* ---------- frame da timeline ---------- */
  function thumbFrom(img, w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const r = w / h;
    let sw = iw, sh = iw / r;
    if (sh > ih) { sh = ih; sw = ih * r; }
    c.getContext('2d').drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, w, h);
    return c;
  }

  function defaultFrame() {
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    const x = c.getContext('2d');
    x.scale(TW / 224, TH / 126);   // desenho feito em 224x126, escalado para a resolução das miniaturas
    const g = x.createLinearGradient(0, 0, 224, 0);
    ['#d33', '#e93', '#ee4', '#3b5', '#3bd', '#46e', '#a4d'].forEach((col, i, a) => g.addColorStop(i / (a.length - 1), col));
    x.fillStyle = g; x.fillRect(0, 0, 224, 84);
    const v = x.createLinearGradient(0, 0, 0, 84);
    v.addColorStop(0, 'rgba(255,255,255,.55)'); v.addColorStop(0.5, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)');
    x.fillStyle = v; x.fillRect(0, 0, 224, 84);
    const h = x.createLinearGradient(0, 0, 224, 0);
    h.addColorStop(0, '#000'); h.addColorStop(1, '#fff');
    x.fillStyle = h; x.fillRect(0, 84, 224, 18);
    ['#f1c7a8', '#d9a07c', '#b07a58', '#7d5036', '#4a2f20', '#8aa0b0', '#6b8f5a', '#a05a8a'].forEach((col, i) => {
      x.fillStyle = col; x.fillRect(i * 28, 102, 28, 24);
    });
    return c;
  }

  let grabN = 0;

  /* exporta o frame atual da timeline (com os efeitos que o clipe tiver) */
  function grabFrame() {
    return new Promise((resolve, reject) => {
      const out = path.join(os.tmpdir(), 'easylut_frame_' + (++grabN));
      const cands = [out, out + '.png', out + '.png.png'];
      jsx('getFrame', out).then((r) => {
        if (!r.ok) { reject(new Error(r.err)); return; }
        let tries = 0;
        (function wait() {
          const f = cands.find((c) => { try { return fs.statSync(c).size > 0; } catch (e) { return false; } });
          if (f) {
            setTimeout(() => {
              const img = new Image();
              img.onload = () => {
                resolve(img);
                setTimeout(() => cands.forEach((c) => { try { fs.unlinkSync(c); } catch (e) { /* ok */ } }), 3000);
              };
              img.onerror = () => reject(new Error('Não consegui ler o frame exportado'));
              img.src = 'file:///' + f.replace(/\\/g, '/') + '?t=' + Date.now();
            }, 120);
            return;
          }
          if (++tries > 40) { reject(new Error('O Premiere não gerou o arquivo do frame')); return; }
          setTimeout(wait, 100);
        })();
      });
    });
  }

  function fullFrom(img, w) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const c = document.createElement('canvas');
    c.width = w; c.height = Math.max(1, Math.round(ih * w / iw));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function setBase(img) {
    baseThumb = thumbFrom(img, TW, TH);
    baseFull = fullFrom(img, 640);
    frameId++;
    thumbCache.clear();
    renderPreview();
    renderGrid();       // só redesenha miniaturas; a pasta NÃO é lida de novo
  }

  function captureFrame() {
    setStatus('Capturando frame…');
    pollState();
    grabFrame().then((img) => { setBase(img); setStatus('Frame capturado'); })
      .catch((e) => { setStatus('Não deu para capturar o frame: ' + e.message, true); });
  }

  /* ---------- aplicar no Premiere (direto do caminho do .cube) ---------- */
  let applying = false;
  async function applyToPremiere() {
    if (applying) return;
    if (!selected) { setStatus('Escolha uma LUT primeiro', true); return; }
    if (!fs.existsSync(selected.file)) { setStatus('O arquivo dessa LUT não foi encontrado: ' + selected.file, true); return; }
    applying = true;
    try {
      setStatus('Aplicando "' + selected.name + '"…');
      const file = selected.file.replace(/\\/g, '/');
      const intensity = +els.intensity.value;

      // Confere o resultado lendo de volta o caminho gravado no Lumetri (não exporta frames,
      // então nada é registrado no painel Events do Premiere).
      let n = +(localStorage.getItem('lutHint') || 0);
      let total = 0, tried = 0, firstClean = -1, lastErr = '';
      for (;;) {
        const r = await jsx('applyLut', n, file, intensity, 'apply');
        if (r.fatal) { setStatus(r.err, true); return; }
        if (r.total) total = r.total;
        if (r.staged) rememberStaged(r.staged, selected.file);
        if (!r.ok) lastErr = (r.errs && r.errs[0]) || r.err || lastErr;
        if (r.ok) {
          const rb = String(r.readback || '');
          if (firstClean < 0) firstClean = n;
          if (/\.cube/i.test(rb) || rb === '?') {      // o Premiere guardou o caminho (ou não dá para conferir)
            localStorage.setItem('lutHint', String(n));
            markApplied();
            setStatus('LUT "' + selected.name + '" aplicada.');
            return;
          }
        }
        tried++;
        if (!total) total = 1;
        n = (n + 1) % total;
        if (tried >= total) break;
      }

      if (firstClean >= 0) {
        // nenhuma variação devolveu o caminho na leitura; mantém a primeira que não deu erro
        await jsx('applyLut', firstClean, file, intensity, 'apply');
        markApplied();
        setStatus('LUT enviada ao Premiere.');
      } else {
        setStatus('O Premiere não aceitou a LUT' + (lastErr ? ': ' + lastErr : '.'), true);
      }
    } catch (e) {
      setStatus('Erro ao aplicar: ' + ((e && e.message) || e), true);
    } finally {
      applying = false;
    }
  }

  function markApplied() {
    activeFile = selected.file;
    updateActiveUi();
  }

  async function clearLut() {
    const r = await jsx('applyLut', 0, '', null, 'clear');
    if (r.ok) { activeFile = null; updateActiveUi(); }
    setStatus(r.ok ? 'LUT removida do clipe.' : (r.err || (r.errs || []).join('; ') || 'Não consegui remover'), !r.ok);
  }

  let intTimer = null;
  function onIntensity() {
    els.intVal.textContent = els.intensity.value + '%';
    clearTimeout(intTimer);
    renderPreview();
    intTimer = setTimeout(() => { jsx('setIntensityOnly', +els.intensity.value); }, 120);
  }

  /* ---------- eventos ---------- */
  $('btnFolder').onclick = () => {
    const res = window.cep.fs.showOpenDialogEx(false, true, 'Escolha a pasta das LUTs', localStorage.getItem('lutFolder') || '');
    if (res && res.data && res.data.length) loadFolder(res.data[0]);
  };
  $('btnFrame').onclick = captureFrame;
  $('btnApply').onclick = applyToPremiere;
  $('btnClear').onclick = clearLut;
  els.intensity.addEventListener('input', onIntensity);
  els.thumbSize.addEventListener('input', () => {
    thumbSize = +els.thumbSize.value;
    applyThumbSize();
    try { localStorage.setItem('easyThumbSize', String(thumbSize)); } catch (e) { /* ok */ }
  });
  window.addEventListener('resize', applyThumbSize);
  if (window.ResizeObserver) new ResizeObserver(applyThumbSize).observe(els.grid);
  els.tabAll.addEventListener('click', () => setTab('all'));
  els.tabFav.addEventListener('click', () => setTab('fav'));
  els.search.addEventListener('input', renderGrid);
  els.cat.addEventListener('change', () => { catByTab[tab] = els.cat.value; renderGrid(); });
  els.tabCol.addEventListener('click', () => setTab('col'));
  els.grid.addEventListener('scroll', closeMenu);
  window.addEventListener('resize', () => { closeMenu(); closeDD(false); });

  els.colSel.addEventListener('change', () => {
    curColId = els.colSel.value;
    catByTab.col = 'Todas';
    const c = curCol();
    if (c) scanCol(c);          // relê a pasta da coleção ao trocar
    refreshColUi(); applyTabUi(); renderGrid();
  });
  $('btnColNew').onclick = async () => {
    const name = await askName('Nova coleção', '', 'Criar', null);
    if (!name) return;
    createCol(name);
    catByTab.col = 'Todas';
    afterColChange();
    setStatus('Coleção “' + name + '” criada. Carregue uma pasta ou adicione LUTs pelo +.');
  };
  $('btnColRename').onclick = async () => {
    const c = curCol(); if (!c) return;
    const name = await askName('Renomear coleção', c.name, 'Salvar', c.id);
    if (!name) return;
    c.name = name; saveCols(); afterColChange();
  };
  $('btnColDelete').onclick = async () => {
    const c = curCol(); if (!c) return;
    const yes = await askConfirm('Excluir coleção', 'Excluir “' + c.name + '”? As LUTs e as pastas não são apagadas, só a coleção.', 'Excluir');
    if (!yes) return;
    cols = cols.filter((x) => x.id !== c.id);
    delete colFolderCache[c.id]; delete colFolderMissing[c.id];
    saveCols(); curColId = '';
    afterColChange();
    setStatus('Coleção “' + c.name + '” excluída.');
  };
  $('btnColFolder').onclick = () => {
    const c = curCol(); if (!c) return;
    const res = window.cep.fs.showOpenDialogEx(false, true, 'Escolha a pasta de LUTs desta coleção', c.folder || '');
    if (!(res && res.data && res.data.length)) return;
    c.folder = res.data[0];
    saveCols(); scanCol(c); catByTab.col = 'Todas';
    const n = colFolderCache[c.id].length;
    refreshColUi(); applyTabUi(); renderGrid();
    setStatus(n ? n + ' LUTs carregadas em “' + c.name + '”.' : 'Nenhum arquivo .cube encontrado nessa pasta.', !n);
  };
  els.btnColFolderClear.onclick = () => {
    const c = curCol(); if (!c || !c.folder) return;
    c.folder = ''; saveCols(); scanCol(c); catByTab.col = 'Todas';
    refreshColUi(); applyTabUi(); renderGrid();
    setStatus('Pasta removida de “' + c.name + '”.');
  };

  /* ---------- início ---------- */
  baseThumb = defaultFrame();
  baseFull = fullFrom(baseThumb, 640);
  els.clickMode.checked = localStorage.getItem('easyClickMode') === '1';
  applyClickMode();
  renderPreview();
  cs.evalScript('typeof applyLut', (r) => {
    if (r !== 'function') setStatus('O script do Premiere (host.jsx) não carregou. Reinstale e reinicie o Premiere.', true);
  });
  updateCounts();
  refreshColUi();
  applyTabUi();
  applyThumbSize();
  renderGrid();
  const saved = localStorage.getItem('lutFolder');
  if (saved && fs.existsSync(saved)) loadFolder(saved);
  captureFrame();
  setInterval(pollState, 2500);
  window.addEventListener('focus', pollState);
})();
