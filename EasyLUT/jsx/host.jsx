/* Easy LUT — criado por Allan */
/* ExtendScript (Premiere) – sem JSON nativo; tudo que não é ASCII vira \uXXXX */
function _q(s) {
  s = String(s);
  var o = '"', i, c, h;
  for (i = 0; i < s.length; i++) {
    c = s.charCodeAt(i);
    if (c === 34) o += '\\"';
    else if (c === 92) o += '\\\\';
    else if (c < 32 || c > 126) {
      h = c.toString(16);
      while (h.length < 4) h = '0' + h;
      o += '\\u' + h;
    } else o += s.charAt(i);
  }
  return o + '"';
}
function _ser(o) {
  var t = typeof o;
  if (o === null || o === undefined) return 'null';
  if (t === 'string') return _q(o);
  if (t === 'number' || t === 'boolean') return String(o);
  var p, i;
  if (o instanceof Array) {
    p = [];
    for (i = 0; i < o.length; i++) p.push(_ser(o[i]));
    return '[' + p.join(',') + ']';
  }
  p = [];
  for (var k in o) p.push(_q(k) + ':' + _ser(o[k]));
  return '{' + p.join(',') + '}';
}

function _z(v) { return (v < 10 ? '0' : '') + v; }

function _timecodes(seq) {
  var out = [];
  try { out.push(String(qe.project.getActiveSequence().CTI.timecode)); } catch (e) {}
  try { out.push(String(seq.CTI.timecode)); } catch (e) {}
  try {
    var pos = seq.getPlayerPosition();
    var fps = 254016000000 / Number(seq.timebase);
    var n = Math.round(pos.seconds * fps), fr = Math.round(fps);
    var s = Math.floor(n / fr);
    out.push(_z(Math.floor(s / 3600)) + ':' + _z(Math.floor(s / 60) % 60) + ':' + _z(s % 60) + ':' + _z(n % fr));
  } catch (e) {}
  try { out.push(String(seq.getPlayerPosition().ticks)); } catch (e) {}
  return out;
}

function getFrame(outBase) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return _ser({ ok: false, err: 'Abra uma sequência no Premiere.' });
    app.enableQE();
    var q = qe.project.getActiveSequence();
    if (!q || typeof q.exportFramePNG !== 'function') {
      return _ser({ ok: false, err: 'QE sem exportFramePNG nesta versão (' + app.version + ').' });
    }
    var tcs = _timecodes(seq);
    var paths = [new File(outBase + '.png').fsName, new File(outBase).fsName, new File(outBase + '.png').fsName.replace(/\\/g, '/')];
    var errs = [], noThrow = 0, i, j;
    for (i = 0; i < tcs.length; i++) {
      for (j = 0; j < paths.length; j++) {
        try {
          q.exportFramePNG(tcs[i], paths[j]);
          noThrow++;
          if (new File(paths[j]).exists || new File(paths[j] + '.png').exists) {
            return _ser({ ok: true, tc: tcs[i], path: paths[j] });
          }
        } catch (e) { errs.push('tc=' + tcs[i] + ' path=' + paths[j] + ' -> ' + e); }
      }
    }
    if (noThrow) return _ser({ ok: true, note: 'chamadas sem erro, aguardando arquivo' });
    return _ser({ ok: false, err: 'exportFramePNG falhou em todas as combinações:\n' + errs.join('\n') });
  } catch (e) {
    return _ser({ ok: false, err: 'getFrame: ' + e });
  }
}

/* clipes alvo: seleção de vídeo; se vazia, clipe sob o cursor na track mais alta */
function _targets(seq) {
  var out = [], i, sel = seq.getSelection();
  if (sel && sel.length) {
    for (i = 0; i < sel.length; i++) {
      if (String(sel[i].mediaType) === 'Video') out.push(sel[i]);
    }
  }
  if (out.length) return out;
  var pos = seq.getPlayerPosition().seconds;
  for (var ti = seq.videoTracks.numTracks - 1; ti >= 0; ti--) {
    var tr = seq.videoTracks[ti];
    for (var ci = 0; ci < tr.clips.numItems; ci++) {
      var c = tr.clips[ci];
      if (c.start.seconds <= pos && c.end.seconds > pos) return [c];
    }
  }
  return out;
}

function _findLumetri(clip) {
  for (var i = 0; i < clip.components.numItems; i++) {
    var c = clip.components[i];
    if (String(c.matchName) === 'AE.ADBE Lumetri') return c;
  }
  return null;
}

function _addLumetri(seq, clip) {
  app.enableQE();
  var qs = qe.project.getActiveSequence();
  var names = ['Lumetri Color', 'Cor Lumetri'];
  for (var ti = 0; ti < seq.videoTracks.numTracks; ti++) {
    var tr = seq.videoTracks[ti], found = false;
    for (var ci = 0; ci < tr.clips.numItems; ci++) {
      if (tr.clips[ci].nodeId === clip.nodeId) { found = true; break; }
    }
    if (!found) continue;
    var qt = qs.getVideoTrackAt(ti);
    for (var k = 0; k < qt.numItems; k++) {
      var it = qt.getItemAt(k);
      if (!it || String(it.type) === 'Empty') continue;
      if (Math.abs(it.start.secs - clip.start.seconds) < 0.02) {
        for (var n = 0; n < names.length; n++) {
          var fx = qe.project.getVideoEffectByName(names[n]);
          if (fx) { it.addVideoEffect(fx); return true; }
        }
      }
    }
  }
  return false;
}

/* =====================================================================
   APLICAÇÃO DIRETA DO .cube NO LUMETRI (grupo Creative)
   Layout das propriedades do Lumetri: cabeçalho do grupo = G
     G+1 = liga o LUT | G+2 = caminho do .cube | G+4 = flag
   ===================================================================== */
function _norm(n) {
  return String(n || '').toLowerCase()
    .replace(/[\u00e1\u00e0\u00e2\u00e3\u00e4]/g, 'a').replace(/[\u00e9\u00e8\u00ea\u00eb]/g, 'e')
    .replace(/[\u00ed\u00ec\u00ee\u00ef]/g, 'i').replace(/[\u00f3\u00f2\u00f4\u00f5\u00f6]/g, 'o')
    .replace(/[\u00fa\u00f9\u00fb\u00fc]/g, 'u').replace(/\u00e7/g, 'c').replace(/\u00f1/g, 'n')
    .replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
}
function _nameIn(name, keys) {
  var n = _norm(name), i, k;
  for (i = 0; i < keys.length; i++) {
    k = keys[i];
    if (n === k || n.indexOf(k + ' (') === 0 || n.indexOf('(' + k + ')') !== -1) return true;
  }
  return false;
}
var _CREATIVE = ['creative', 'criacao', 'criativo', 'creativo', 'creatif', 'kreativ', 'creativa'];

function _lumProps(lum) {
  var out = [], p;
  for (p = 0; p < lum.properties.numItems; p++) {
    var pr = lum.properties[p], dn = '', mn = '';
    try { dn = String(pr.displayName); } catch (e) {}
    try { mn = String(pr.matchName); } catch (e) {}
    out.push({ i: p, pr: pr, dn: dn, mn: mn });
  }
  return out;
}
function _creativeGroup(props) {
  for (var i = 0; i < props.length; i++) { if (_nameIn(props[i].dn, _CREATIVE)) return i; }
  return -1;
}
function _setv(pr, v) {
  try { pr.setValue(v, 1); return true; } catch (e1) {}
  try { pr.setValue(v, true); return true; } catch (e2) {}
  try { pr.setValue(v); return true; } catch (e3) {}
  return false;
}
function _hash(s) {
  var h = 5381, i;
  for (i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) & 0x7fffffff;
  return h.toString(16);
}
/* copia o .cube para uma pasta fixa com nome ASCII seguro (o clipe passa a apontar para ela) */
var _lastStaged = '';
function _stage(lutPath) {
  var src = new File(lutPath);
  var dir = new Folder(Folder.userData.fsName + '/EasyLUT/staged');
  if (!dir.exists) dir.create();
  var nm = String(src.name || 'LUT.cube');
  try { nm = decodeURI(nm); } catch (e) {}
  nm = nm.replace(/\.cube$/i, '').replace(/[^A-Za-z0-9_\-]+/g, '_').substr(0, 60);
  var dest = new File(dir.fsName + '/' + nm + '_' + _hash(String(src.fsName)) + '.cube');
  try {
    if (!dest.exists || dest.length !== src.length) { if (dest.exists) dest.remove(); src.copy(dest); }
  } catch (e) {}
  _lastStaged = (dest.exists && dest.length > 0) ? String(dest.name) : '';
  return (dest.exists && dest.length > 0) ? dest : src;
}
function _variants(lutPath) {
  var f = _stage(lutPath), o = new File(lutPath);
  var sep = ($.os && String($.os).indexOf('Windows') !== -1) ? '\\' : '/';
  var raw = [
    f.fsName + sep, String(f.fsName).replace(/\\/g, '/') + '/',
    f.fsName, String(f.fsName).replace(/\\/g, '/'),
    o.fsName + sep, o.fsName, String(lutPath)
  ];
  var out = [], seen = {}, i;
  for (i = 0; i < raw.length; i++) {
    if (!raw[i] || seen[raw[i]]) continue;
    seen[raw[i]] = true; out.push(raw[i]);
  }
  return out;
}
/* "Intensity" do Creative: logo depois do caminho (até 12 posições) */
function _creativeIntensity(props, g) {
  for (var i = g + 3; i < props.length && i <= g + 14; i++) {
    if (_norm(props[i].dn).indexOf('intens') === 0) return props[i].pr;
  }
  return null;
}

/* estado leve (chamado a cada poucos segundos): nome da sequência + LUT gravada no clipe alvo */
function getState() {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return _ser({ ok: false, name: '', path: '' });
    var out = { ok: true, name: String(seq.name), path: '' };
    var clips = _targets(seq);
    if (clips.length) {
      var lum = _findLumetri(clips[0]);
      if (lum) {
        var n = lum.properties.numItems, g = -1, i, dn;
        for (i = 0; i < n; i++) {
          dn = '';
          try { dn = String(lum.properties[i].displayName); } catch (e) {}
          if (_nameIn(dn, _CREATIVE)) { g = i; break; }
        }
        if (g >= 0 && g + 2 < n) { try { out.path = String(lum.properties[g + 2].getValue()); } catch (e) {} }
      }
    }
    return _ser(out);
  } catch (e) { return _ser({ ok: false, name: '', path: '', err: String(e) }); }
}

/* n = variante de caminho a tentar | mode = 'apply' ou 'clear' */
function applyLut(n, lutPath, intensity, mode) {
  var errs = [];
  try {
    var seq = app.project.activeSequence;
    if (!seq) return _ser({ ok: false, fatal: true, err: 'Abra uma sequência no Premiere.' });
    var clips = _targets(seq);
    if (!clips.length) return _ser({ ok: false, fatal: true, err: 'Selecione um clipe de vídeo (ou deixe o cursor sobre ele).' });
    var total = 0, desc = '', done = 0, rb = '', i;
    var vars = (mode === 'clear') ? [] : _variants(lutPath);
    for (i = 0; i < clips.length; i++) {
      var clip = clips[i];
      var lum = _findLumetri(clip);
      if (!lum) { _addLumetri(seq, clip); lum = _findLumetri(clip); }
      if (!lum) { errs.push(clip.name + ': sem Lumetri'); continue; }
      var props = _lumProps(lum), g = _creativeGroup(props);
      if (g < 0 || g + 2 >= props.length) { errs.push(clip.name + ': grupo Creative não encontrado'); continue; }
      var enable = props[g + 1].pr, pathP = props[g + 2].pr, flag = (g + 4 < props.length) ? props[g + 4].pr : null;
      if (mode === 'clear') {
        _setv(pathP, ''); _setv(enable, 0); if (flag) _setv(flag, 0);
        done++; desc = 'LUT removida'; continue;
      }
      total = vars.length;
      var v = vars[Number(n) % vars.length];
      desc = 'Creative[' + g + '] caminho <- ' + v;
      _setv(enable, 1);
      if (!_setv(pathP, v)) { errs.push(desc + ' -> recusado'); continue; }
      try { rb = String(pathP.getValue()).substr(0, 90); } catch (e) { rb = '?'; }
      if (flag) _setv(flag, 1);
      if (intensity !== null && intensity !== undefined) {
        var ip = _creativeIntensity(props, g);
        if (ip) _setv(ip, Number(intensity));
      }
      done++;
    }
    return _ser({ ok: done > 0, total: total, desc: desc, readback: rb, staged: _lastStaged, errs: errs });
  } catch (e) {
    return _ser({ ok: false, err: 'applyLut: ' + e, errs: errs });
  }
}

function setIntensityOnly(v) {
  try {
    var seq = app.project.activeSequence;
    if (!seq) return _ser({ ok: false, err: 'Sem sequência' });
    var clips = _targets(seq), n = 0;
    for (var i = 0; i < clips.length; i++) {
      var lum = _findLumetri(clips[i]);
      if (!lum) continue;
      var props = _lumProps(lum), g = _creativeGroup(props);
      if (g < 0) continue;
      var ip = _creativeIntensity(props, g);
      if (ip && _setv(ip, Number(v))) n++;
    }
    return _ser({ ok: n > 0, n: n });
  } catch (e) { return _ser({ ok: false, err: String(e) }); }
}

