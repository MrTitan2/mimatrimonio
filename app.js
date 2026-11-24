// Mapa de los Reinos · Matías & Monserrat
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
  const REINOS = window.REINOS;

  // ---------------------------------------------------------- invitados
  let INVITADOS = [];
  const reinoPorNombre = {};
  Object.entries(REINOS).forEach(([id, r]) => { reinoPorNombre[norm(id)] = id; reinoPorNombre[norm(r.nombre.replace('|', ' '))] = id; });
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lines.length) return [];
    const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
    const head = split(lines[0]).map(norm);
    const iN = Math.max(0, head.findIndex(h => h.startsWith('nombre')));
    const iR = head.findIndex(h => h.startsWith('reino') || h.startsWith('mesa'));
    const rows = (iR >= 0 ? lines.slice(1) : lines).map(split);
    return rows.map(r => ({ nombre: r[iN], reino: reinoPorNombre[norm(r[iR >= 0 ? iR : 1])] })).filter(g => g.nombre && g.reino);
  }
  async function cargarInvitados() {
    try {
      const res = await fetch(window.CONFIG.listaInvitados, { cache: 'no-store' });
      const buf = await res.arrayBuffer();
      let text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);   // Excel guardó en ANSI
      INVITADOS = parseCSV(text);
    } catch (e) { console.warn('No se pudo leer la lista de invitados', e); }
  }

  // ---------------------------------------------------------- mapa
  const stage = $('#stage'), map = $('#map'), img = $('#mapImg'), spot = $('#spot'), pin = $('#pin');
  let MW = 2896, MH = 2172;                 // tamaño natural del mapa
  const view = { s: 1, x: 0, y: 0 };
  function apply(animate) {
    map.classList.toggle('anim', !!animate && !reduced);
    map.style.width = MW + 'px'; map.style.height = MH + 'px';
    map.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.s})`;
  }
  const W = () => innerWidth, H = () => innerHeight;
  const desktop = () => W() / H() >= 1 && W() >= 760;
  function fitScale() { return Math.min(W() / MW, H() / MH); }
  function coverScale() { return Math.max(W() / MW, H() / MH); }
  function overview(animate, cover) {
    // en la bienvenida el mapa llena la pantalla; en la vista general se ve completo
    const s = cover ? coverScale() : fitScale();
    view.s = s; view.x = (W() - MW * s) / 2; view.y = (H() - MH * s) / 2; apply(animate);
  }
  function panelIzq(id) { return desktop() && REINOS[id].foco[0] > 50; }

  function focusOn(id, animate) {
    const r = REINOS[id];
    const resultW = desktop() ? Math.min(W() * .44, 520) : 0;
    // zona de pantalla que el mapa debe cubrir siempre (lo demás queda bajo el panel del cartel)
    const zx1 = W();
    const zy1 = H();               // el mapa siempre cubre toda la pantalla
    // en escritorio el panel va al lado contrario del reino para no taparlo
    const izq = panelIzq(id);
    const fx = desktop() ? (izq ? resultW + (W() - resultW) / 2 : (W() - resultW) / 2) : W() / 2;
    const fy = H() * (desktop() ? .5 : .4);
    let sc = desktop() ? (H() / (MH * .62)) : (W() / (MW * .3));
    sc = Math.max(sc, zx1 / MW, zy1 / MH);
    const mw = MW * sc, mh = MH * sc;
    let x = fx - r.foco[0] / 100 * mw, y = fy - r.foco[1] / 100 * mh;
    x = clamp(x, zx1 - mw, 0);            // nunca mostrar el borde del mapa
    y = clamp(y, zy1 - mh, 0);
    view.s = sc; view.x = x; view.y = y;
    apply(animate);
    const sx = x + r.foco[0] / 100 * mw, sy = y + r.foco[1] / 100 * mh;
    spot.style.setProperty('--sx', (sx / W() * 100) + '%'); spot.style.setProperty('--sy', (sy / H() * 100) + '%');
    pin.style.left = r.cartel[0] + '%'; pin.style.top = (r.cartel[1] - 1) + '%';
  }
  function limitView() {
    const s = view.s, mw = MW * s, mh = MH * s;
    view.x = mw <= W() ? (W() - mw) / 2 : clamp(view.x, W() - mw, 0);
    view.y = mh <= H() ? (H() - mh) / 2 : clamp(view.y, H() - mh, 0);
  }

  // ---------------------------------------------------------- estado / flujo
  let estado = 'intro', elegido = null, enCurso = 0;
  function setEstado(e) { estado = e; document.body.className = 'state-' + e; }
  function banner(t) { if (!t) { $('#banner').hidden = true; return; } $('#bannerText').textContent = t; $('#banner').hidden = false; $('#banner').style.animation = 'none'; void $('#banner').offsetWidth; $('#banner').style.animation = ''; }

  let cartelActual = null;
  function pintarCartel(id) {
    cartelActual = id;
    const nombre = REINOS[id].nombre.replace('|', ' ');
    $('#cartel').src = `./assets/carteles/${id}.webp`;
    $('#cartel').alt = 'Cartel de ' + nombre;
  }

  async function viaje(g) {
    const token = ++enCurso;
    elegido = g;
    setEstado('viaje');
    $('#intro').classList.remove('visible');
    clearTimeout(viaje.t); viaje.t = setTimeout(() => { if (estado !== 'intro') $('#intro').hidden = true; }, reduced ? 0 : 850);
    $('#result').hidden = true; $('#mapHud').hidden = true;
    stage.classList.remove('blurred', 'soft');
    spot.classList.remove('on'); pin.hidden = true;
    overview(false);
    banner('Abriendo el Mapa de los Reinos…');
    await wait(1700); if (token !== enCurso) return;
    banner('Buscando el reino de ' + g.nombre.split(' ')[0] + '…');
    await wait(900); if (token !== enCurso) return;
    focusOn(g.reino, true);
    await wait(1500); if (token !== enCurso) return;
    spot.classList.add('on'); pin.hidden = false;
    banner('¡Aquí está tu reino!');
    await wait(desktop() ? 1100 : 1900); if (token !== enCurso) return;
    banner('');
    mostrarResultado(g.reino, true);
  }

  function mostrarResultado(id, esSuyo) {
    setEstado('resultado');
    pintarCartel(id);
    $('#greet').textContent = esSuyo ? elegido.nombre.split(' ')[0] + ',' : REINOS[id].nombre.replace('|', ' ');
    $('#sub').textContent = esSuyo ? 'tu lugar en nuestra historia es…' : 'uno de los reinos de nuestra historia';
    $('#result').classList.toggle('left', panelIzq(id));
    $('#result').hidden = false;
    stage.classList.toggle('soft', !desktop());   // en celular el mapa queda de fondo, suave
    const r = $('#result'); r.style.animation = 'none'; void r.offsetWidth; r.style.animation = '';
  }

  function mapaLibre() {
    setEstado('libre');
    $('#result').hidden = true; spot.classList.remove('on'); stage.classList.remove('soft');
    overview(true);
    setTimeout(() => map.classList.remove('anim'), 2300);
    $('#mapHud').hidden = false;
  }

  function volverIntro() {
    ++enCurso; elegido = null;
    setEstado('intro');
    $('#result').hidden = true; $('#mapHud').hidden = true; banner('');
    spot.classList.remove('on'); pin.hidden = true;
    stage.classList.remove('soft'); stage.classList.add('blurred'); overview(false, true);
    $('#guest').value = ''; $('#go').disabled = true; $('#nohit').hidden = true;
    $('#intro').hidden = false; void $('#intro').offsetWidth;
    $('#intro').classList.add('visible');
  }

  // ---------------------------------------------------------- búsqueda
  let seleccion = null;
  function buscar(q) {
    const t = norm(q).split(' ').filter(Boolean);
    if (!t.length) return [];
    return INVITADOS.filter(g => { const n = norm(g.nombre); return t.every(w => n.split(' ').some(p => p.startsWith(w)) || n.includes(w)); }).slice(0, 6);
  }
  function mostrarCoincidencias(q) {
    const res = buscar(q), box = $('#matches');
    box.innerHTML = '';
    $('#nohit').hidden = !(norm(q).length >= 3 && !res.length);
    if (!res.length) { box.hidden = true; $('#guest').setAttribute('aria-expanded', 'false'); return; }
    res.forEach(g => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'match'; b.setAttribute('role', 'option'); b.textContent = g.nombre;
      b.addEventListener('pointerdown', e => e.preventDefault());
      b.addEventListener('click', () => elegir(g));
      b.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown' && b.nextElementSibling) { e.preventDefault(); b.nextElementSibling.focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); (b.previousElementSibling || $('#guest')).focus(); }
        if (e.key === 'Escape') { box.hidden = true; $('#guest').focus(); }
      });
      box.appendChild(b);
    });
    box.hidden = false; $('#guest').setAttribute('aria-expanded', 'true');
  }
  function elegir(g) {
    seleccion = g; $('#guest').value = g.nombre; $('#matches').hidden = true; $('#nohit').hidden = true;
    $('#guest').setAttribute('aria-expanded', 'false'); $('#go').disabled = false; $('#go').focus();
    new Image().src = `./assets/carteles/${g.reino}.webp`;
  }
  // un único invitado posible (o nombre exacto) aunque no se toque la sugerencia
  function resolver(q) {
    const r = buscar(q); if (r.length === 1) return r[0];
    return r.find(g => norm(g.nombre) === norm(q)) || null;
  }
  function intentarViaje() {
    if (!seleccion) { const g = resolver($('#guest').value); if (g) elegir(g); }
    if (seleccion) { $('#guest').blur(); viaje(seleccion); }
    else mostrarCoincidencias($('#guest').value);
  }
  $('#guest').addEventListener('input', e => { seleccion = null; $('#go').disabled = !resolver(e.target.value); mostrarCoincidencias(e.target.value); });
  $('#guest').addEventListener('keydown', e => {
    if (e.key === 'Escape') $('#matches').hidden = true;
    if (e.key === 'Enter') { e.preventDefault(); intentarViaje(); }
    if (e.key === 'ArrowDown') { const f = $('#matches .match'); if (f) { e.preventDefault(); f.focus(); } }
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) $('#matches').hidden = true; });
  $('#welcomeForm').addEventListener('submit', e => {
    e.preventDefault();
    intentarViaje();
  });
  $('#seeMap').addEventListener('click', mapaLibre);
  $('#again').addEventListener('click', volverIntro);
  $('#again2').addEventListener('click', volverIntro);
  $('#mine').addEventListener('click', () => { if (!elegido) return volverIntro(); $('#mapHud').hidden = true; focusOn(elegido.reino, true); spot.classList.add('on'); pin.hidden = false; setTimeout(() => mostrarResultado(elegido.reino, true), reduced ? 0 : 1600); });

  // ---------------------------------------------------------- mapa libre: arrastrar, pellizcar, tocar reinos
  const ptrs = new Map(); let moved = 0, pinch0 = null;
  stage.addEventListener('pointerdown', e => { if (estado !== 'libre') return; stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; map.classList.remove('anim'); });
  stage.addEventListener('pointermove', e => {
    if (estado !== 'libre' || !ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 1) { view.x += e.clientX - prev[0]; view.y += e.clientY - prev[1]; moved += Math.abs(e.clientX - prev[0]) + Math.abs(e.clientY - prev[1]); }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (pinch0) zoomAt(c[0], c[1], d / pinch0); pinch0 = d; moved += 10;
    }
    limitView(); apply(false);
  });
  const endPtr = e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = null;
    if (estado === 'libre' && moved < 8 && e.type === 'pointerup') tocarMapa(e.clientX, e.clientY);
  };
  ['pointerup', 'pointercancel'].forEach(t => stage.addEventListener(t, endPtr));
  stage.addEventListener('wheel', e => { if (estado !== 'libre') return; e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); limitView(); apply(false); }, { passive: false });
  function zoomAt(cx, cy, f) {
    const s2 = clamp(view.s * f, fitScale(), fitScale() * 4.5); f = s2 / view.s;
    view.x = cx - (cx - view.x) * f; view.y = cy - (cy - view.y) * f; view.s = s2;
  }
  function tocarMapa(cx, cy) {
    const mx = (cx - view.x) / (MW * view.s) * 100, my = (cy - view.y) / (MH * view.s) * 100;
    let best = null, bd = 1e9;
    Object.entries(REINOS).forEach(([id, r]) => { const d = Math.hypot((mx - r.cartel[0]) * 1.33, my - r.cartel[1]); if (d < bd) { bd = d; best = id; } });
    if (best && bd < 11) { $('#mapHud').hidden = true; focusOn(best, true); spot.classList.add('on'); pin.hidden = false; setTimeout(() => mostrarResultado(best, elegido && elegido.reino === best), reduced ? 0 : 1500); }
  }

  // ---------------------------------------------------------- tamaño
  addEventListener('resize', () => {
    if (estado === 'resultado' && cartelActual) focusOn(cartelActual, false);
    else if (estado === 'libre') { limitView(); apply(false); } else overview(false, estado === 'intro');
  });

  // ---------------------------------------------------------- inicio
  setEstado('intro');
  img.addEventListener('load', () => { MW = img.naturalWidth; MH = img.naturalHeight; if (estado === 'intro') overview(false, true); });
  if (img.complete && img.naturalWidth) { MW = img.naturalWidth; MH = img.naturalHeight; }
  overview(false, true);
  cargarInvitados();
  // precarga de carteles cuando la página ya cargó
  addEventListener('load', () => setTimeout(() => Object.keys(REINOS).forEach(id => { new Image().src = `./assets/carteles/${id}.webp`; }), 1500));
  window.__MAPA__ = { viaje, get invitados() { return INVITADOS; }, focusOn, mapaLibre, mostrarResultado, volverIntro };
})();
