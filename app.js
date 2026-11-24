// Mapa de los Reinos · Matías & Monserrat
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, reduced ? 0 : ms));
  // duración de la cámara (ms) al ir a un reino desde el mapa libre o "Volver a mi reino", y a la vista general
  const VUELO = 3200;
  const LLEGADA = Math.round(VUELO * .75);   // cuándo se marca el reino / aparece el cartel, casi al terminar el vuelo
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
  const MW = 1448, MH = 1086;               // tamaño natural de mapa.webp (mapa_mini.webp tiene la misma proporción)
  // en la bienvenida basta la versión liviana (va desenfocada); la grande (1,7 MB) se pide
  // cuando el invitado empieza a escribir, al iniciar el viaje o unos segundos después de cargar
  let mapaGrande = null;
  function cargarMapaGrande() {
    if (!mapaGrande) {
      const im = new Image(); im.src = './assets/mapa.webp';
      const usar = () => { img.src = im.src; };
      mapaGrande = im.decode().then(usar, usar);
    }
    return mapaGrande;
  }
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

  // vista final de un reino (sin aplicarla): la misma de focusOn
  function vistaReino(id) {
    const r = REINOS[id], resultW = desktop() ? Math.min(W() * .44, 520) : 0, izq = panelIzq(id);
    const fx = desktop() ? (izq ? resultW + (W() - resultW) / 2 : (W() - resultW) / 2) : W() / 2, fy = H() * (desktop() ? .5 : .4);
    let s = desktop() ? (H() / (MH * .62)) : (W() / (MW * .3)); s = Math.max(s, W() / MW, H() / MH);
    return { s, x: clamp(fx - r.foco[0] / 100 * MW * s, W() - MW * s, 0), y: clamp(fy - r.foco[1] / 100 * MH * s, H() - MH * s, 0) };
  }
  // acercamiento anclado: el punto P (px del mapa) no sale de la vista. Mientras el mapa es más chico que la pantalla
  // queda centrado en ese eje y después la foto hace de tope (no se ve el corte)
  function acercarA(P, destino, ms, token) {
    const a = { ...view }, pa = [a.x + P[0] * a.s, a.y + P[1] * a.s], pb = [destino.x + P[0] * destino.s, destino.y + P[1] * destino.s], t0 = performance.now();
    const ease = t => -(Math.cos(Math.PI * t) - 1) / 2;
    return new Promise(fin => (function paso(now) {
      if (token !== enCurso) return fin();
      const t = clamp((now - t0) / ms, 0, 1), e = ease(t);
      view.s = a.s * Math.pow(destino.s / a.s, e);
      view.x = pa[0] + (pb[0] - pa[0]) * e - P[0] * view.s; view.y = pa[1] + (pb[1] - pa[1]) * e - P[1] * view.s;
      limitView(); apply(false); ViajeLuz.redibujar();
      t < 1 ? requestAnimationFrame(paso) : fin();
    })(t0));
  }
  function marcarReino(id) {   // posición del foco (oscurecimiento alrededor) y de la marca brillante sobre el letrero
    const r = REINOS[id], sx = view.x + r.foco[0] / 100 * MW * view.s, sy = view.y + r.foco[1] / 100 * MH * view.s;
    spot.style.setProperty('--sx', (sx / W() * 100) + '%'); spot.style.setProperty('--sy', (sy / H() * 100) + '%');
    pin.style.left = r.cartel[0] + '%'; pin.style.top = (r.cartel[1] - 1) + '%';
  }

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
  let estado = 'intro', elegido = null, enCurso = 0, faseViaje = '';   // faseViaje: 'luz' (mapa completo quieto) | 'acercamiento'
  function setEstado(e) {
    estado = e; document.body.className = 'state-' + e;
    ViajeLuz.luciernagas(e === 'intro' ? 'intro' : e === 'libre' ? 'libre' : null);   // luciérnagas de ambiente
    if (e !== 'libre') $('#halo').hidden = true;
  }
  function banner(t) { if (!t) { $('#banner').hidden = true; return; } $('#bannerText').textContent = t; $('#banner').hidden = false; $('#banner').style.animation = 'none'; void $('#banner').offsetWidth; $('#banner').style.animation = ''; }

  let cartelActual = null;
  function pintarCartel(id) {
    cartelActual = id;
    const nombre = REINOS[id].nombre.replace('|', ' ');
    $('#cartel').src = `./assets/carteles/${id}.webp`;
    $('#cartel').alt = 'Cartel de ' + nombre;
    $('#cartelWrap').style.setProperty('--m', `url("./assets/carteles/${id}.webp")`);   // el brillo toma la forma del cartel
  }

  async function viaje(g) {
    const token = ++enCurso;
    elegido = g;
    cargarMapaGrande();
    setEstado('viaje');
    $('#intro').classList.remove('visible');
    clearTimeout(viaje.t); viaje.t = setTimeout(() => { if (estado !== 'intro') $('#intro').hidden = true; }, reduced ? 0 : 850);
    $('#result').hidden = true; $('#mapHud').hidden = true;
    stage.classList.remove('blurred', 'soft');
    spot.classList.remove('on'); pin.hidden = true;
    // 1) mapa completo y quieto · 2) la luciérnaga viaja desde la Finca por el camino (viaje.js)
    // 3) acercamiento directo al punto donde llegó · 4) cartel
    overview(false); faseViaje = 'luz';
    await ViajeLuz.recorrer(g.reino, g.nombre); if (token !== enCurso) return;
    faseViaje = 'acercamiento';
    const destino = vistaReino(g.reino);
    marcarReino(g.reino); pin.hidden = false;   // la marca se ubica en su letrero antes de mostrarse
    if (reduced) { Object.assign(view, destino); apply(false); }
    else await acercarA(ViajeLuz.llegada(g.reino), destino, 1400, token);
    if (token !== enCurso) return;
    marcarReino(g.reino); spot.classList.add('on');
    ViajeLuz.apagarCamino(900);
    await wait(500); if (token !== enCurso) return;
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
    // celebración: el brillo cruza el vitral una vez y caen chispas cuando el cartel termina de aparecer
    const w = $('#cartelWrap'); w.classList.remove('brilla'); void w.offsetWidth; w.classList.add('brilla');
    const token = enCurso; setTimeout(() => { if (token === enCurso && estado === 'resultado') ViajeLuz.celebrar($('#cartel').getBoundingClientRect()); }, 750);
  }

  function mapaLibre() {
    setEstado('libre');
    $('#result').hidden = true; spot.classList.remove('on'); stage.classList.remove('soft');
    cargarMapaGrande();
    // en celular vertical el mapa completo queda muy chico: se abre con zoom, centrado en el reino del invitado
    const s = desktop() ? fitScale() : Math.min(coverScale(), fitScale() * 2.2);
    const c = elegido ? REINOS[elegido.reino].foco : [50, 50];
    view.s = s; view.x = W() / 2 - c[0] / 100 * MW * s; view.y = H() / 2 - c[1] / 100 * MH * s;
    limitView(); apply(true);
    setTimeout(() => map.classList.remove('anim'), VUELO + 100);
    $('#mapHud').hidden = false;
  }
  // alternativa a pellizcar / rueda: botones + − y teclado (+, −, flechas)
  function moverLibre(fn) {
    if (estado !== 'libre') return;
    map.classList.remove('anim'); map.classList.toggle('quick', !reduced);
    fn(); limitView(); apply(false);
  }
  const zoomCentro = f => moverLibre(() => zoomAt(W() / 2, H() / 2, f));
  $('#zoomIn').addEventListener('click', () => zoomCentro(1.4));
  $('#zoomOut').addEventListener('click', () => zoomCentro(1 / 1.4));
  document.addEventListener('keydown', e => {
    if (estado !== 'libre' || e.target instanceof HTMLInputElement) return;
    const paso = 90, k = e.key;
    if (k === '+' || k === '=') zoomCentro(1.4);
    else if (k === '-' || k === '_') zoomCentro(1 / 1.4);
    else if (k === 'ArrowLeft') moverLibre(() => { view.x += paso; });
    else if (k === 'ArrowRight') moverLibre(() => { view.x -= paso; });
    else if (k === 'ArrowUp') moverLibre(() => { view.y += paso; });
    else if (k === 'ArrowDown') moverLibre(() => { view.y -= paso; });
    else return;
    e.preventDefault();
  });

  function volverIntro() {
    ++enCurso; elegido = null; map.style.transitionDuration = '';
    ViajeLuz.detener();
    setEstado('intro');
    $('#result').hidden = true; $('#mapHud').hidden = true; banner('');
    spot.classList.remove('on'); pin.hidden = true;
    stage.classList.remove('soft'); stage.classList.add('blurred'); overview(false, true);
    $('#guest').value = ''; $('#nohit').hidden = true;
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
  function mostrarCoincidencias(q, alEnviar) {
    const res = buscar(q), box = $('#matches'), nohit = $('#nohit');
    box.innerHTML = '';
    // al enviar siempre se responde algo: el botón nunca queda "muerto"
    let aviso = '';
    if (!res.length && alEnviar && !norm(q)) aviso = 'Escribe tu nombre para buscar tu reino.';
    else if (!res.length && (alEnviar || norm(q).length >= 3)) aviso = 'No encontramos ese nombre. Prueba solo con tu nombre o tu apellido.';
    nohit.textContent = aviso; nohit.hidden = !aviso;
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
    $('#guest').setAttribute('aria-expanded', 'false'); $('#go').focus();
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
    else { mostrarCoincidencias($('#guest').value, true); $('#guest').focus(); }
  }
  $('#guest').addEventListener('input', e => { seleccion = null; cargarMapaGrande(); mostrarCoincidencias(e.target.value); });
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
  $('#mine').addEventListener('click', () => { if (!elegido) return volverIntro(); $('#mapHud').hidden = true; focusOn(elegido.reino, true); spot.classList.add('on'); pin.hidden = false; setTimeout(() => mostrarResultado(elegido.reino, true), reduced ? 0 : LLEGADA); });

  // ---------------------------------------------------------- mapa libre: arrastrar, pellizcar, tocar reinos
  const ptrs = new Map(); let moved = 0, pinch0 = null;
  stage.addEventListener('pointerdown', e => { if (estado !== 'libre') return; try { stage.setPointerCapture(e.pointerId); } catch (err) { /* sin captura igual funciona */ } ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; map.classList.remove('anim', 'quick'); });
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
  // reino cuyo letrero está bajo un punto de la pantalla (o null)
  function reinoEn(cx, cy) {
    const mx = (cx - view.x) / (MW * view.s) * 100, my = (cy - view.y) / (MH * view.s) * 100;
    let best = null, bd = 1e9;
    Object.entries(REINOS).forEach(([id, r]) => { const d = Math.hypot((mx - r.cartel[0]) * 1.33, my - r.cartel[1]); if (d < bd) { bd = d; best = id; } });
    return bd < 11 ? best : null;
  }
  function halo(id) {
    const h = $('#halo'); if (!id) { h.hidden = true; return; }
    if (h.hidden || h.dataset.id !== id) { h.dataset.id = id; h.style.left = REINOS[id].cartel[0] + '%'; h.style.top = REINOS[id].cartel[1] + '%'; h.hidden = false; }
  }
  // letreros vivos: con mouse, el letrero bajo el puntero brilla
  stage.addEventListener('pointermove', e => { if (estado === 'libre' && e.pointerType === 'mouse' && !ptrs.size) halo(reinoEn(e.clientX, e.clientY)); });
  stage.addEventListener('pointerleave', () => { if (estado === 'libre') halo(null); });
  function tocarMapa(cx, cy) {
    const best = reinoEn(cx, cy);
    if (best) {
      halo(best); $('#mapHud').hidden = true; focusOn(best, true); spot.classList.add('on'); pin.hidden = false; setTimeout(() => mostrarResultado(best, elegido && elegido.reino === best), reduced ? 0 : LLEGADA); }
  }

  // ---------------------------------------------------------- tamaño
  addEventListener('resize', () => {
    if (estado === 'resultado' && cartelActual) focusOn(cartelActual, false);
    else if (estado === 'libre') { limitView(); apply(false); }
    else if (estado === 'viaje') {   // el viaje sigue alineado (barra del navegador, giro del teléfono)
      if (faseViaje === 'luz') overview(false); else { limitView(); apply(false); }
      ViajeLuz.redibujar();
    }
    else overview(false, true);
  });

  // ---------------------------------------------------------- inicio
  map.style.setProperty('--vuelo', VUELO + 'ms');
  ViajeLuz.iniciar({ MW, MH, getView: () => view, banner });
  setEstado('intro');
  overview(false, true);
  cargarInvitados();
  // precarga de carteles cuando la página ya cargó
  addEventListener('load', () => {
    setTimeout(() => Object.keys(REINOS).forEach(id => { new Image().src = `./assets/carteles/${id}.webp`; }), 1500);
    setTimeout(cargarMapaGrande, 4000);
  });
  $('#guest').addEventListener('focus', cargarMapaGrande);
  window.__MAPA__ = { viaje, get invitados() { return INVITADOS; }, focusOn, mapaLibre, mostrarResultado, volverIntro };
})();
